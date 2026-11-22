"""Production R-image validation against the current checkout.

The suite builds its own images and needs only the isolated test MinIO network.
It has no dependency on historical, baseline, or developer-managed image tags.
"""
from contextlib import contextmanager
import csv
import hashlib
import io
import json
from pathlib import Path
import shutil
import subprocess
import time
from uuid import uuid4
import zipfile

import httpx
from jsonschema import Draft7Validator
from minio import Minio
import pytest

ROOT = Path(__file__).resolve().parents[2]
PARAMS = json.loads((ROOT / "tests/fixtures/scientific-params.json").read_text())
SOURCE_SAMPLE = ROOT / "apps/web/public/samples/ExampleAirr_clone_3128.tsv"
SAMPLE = "/fixtures/ExampleAirr_clone_3128.tsv"
ANALYSIS_SAMPLE = "/fixtures/ExampleAirr_clone_3128_analysis.tsv"
PAIRED_SAMPLE = "/fixtures/ExampleAirr_clone_3128_paired.tsv"
EVIDENCE = ROOT / "coverage/r-images"
IMAGE_TAG = "current-test"
MAX_IMAGE_BYTES = {
    # Generous across compressed/uncompressed Docker stores, but low enough to
    # catch accidentally shipping the multi-gigabyte dependency image again.
    "dowser": 1536 * 1024 * 1024,
    "brepphylo": 2304 * 1024 * 1024,
}
pytestmark = [pytest.mark.integration, pytest.mark.scientific]


def docker(*args):
    done = subprocess.run(["docker", *args], cwd=ROOT, capture_output=True, text=True, timeout=900)
    assert done.returncode == 0, done.stdout + done.stderr
    return done.stdout.strip()


def image(method, suffix=IMAGE_TAG):
    return f"phylo-{method}:{suffix}"


@pytest.fixture(scope="session", autouse=True)
def build_current_images():
    for method in ("dowser", "brepphylo"):
        docker("build", "--platform", "linux/amd64", "-f", f"services/{method}/Dockerfile",
               "-t", image(method), ".")


@pytest.fixture(scope="session")
def fixture_directory():
    # Docker Desktop and sandboxed CI runners may not share the host's /tmp
    # namespace with the daemon. Keep generated inputs in the checked-out tree.
    directory = EVIDENCE / "fixtures"
    shutil.rmtree(directory, ignore_errors=True)
    directory.mkdir(parents=True)
    shutil.copy2(SOURCE_SAMPLE, directory / SOURCE_SAMPLE.name)

    with SOURCE_SAMPLE.open(newline="") as stream:
        reader = csv.DictReader(stream, delimiter="\t")
        fieldnames = [*reader.fieldnames, "test_trait", "test_time"]
        rows = []
        for index, row in enumerate(reader):
            row["test_trait"] = "early" if index % 2 == 0 else "late"
            row["test_time"] = str(index % 4)
            rows.append(row)
    with (directory / "ExampleAirr_clone_3128_analysis.tsv").open("w", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=fieldnames, delimiter="\t", lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)

    paired_fields = list(rows[0])
    paired_rows = []
    for index, row in enumerate(rows):
        cell_id = f"test-cell-{index}"
        heavy = {**row, "sequence_id": f"{row['sequence_id']}_H", "cell_id": cell_id, "locus": "IGH"}
        light = {
            **row,
            "sequence_id": f"{row['sequence_id']}_L",
            "cell_id": cell_id,
            "locus": "IGK",
            "v_call": "IGKV1-5*01",
            "j_call": "IGKJ1*01",
        }
        paired_rows.extend((heavy, light))
    if "cell_id" not in paired_fields:
        paired_fields.append("cell_id")
    with (directory / "ExampleAirr_clone_3128_paired.tsv").open("w", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=paired_fields, delimiter="\t", lineterminator="\n")
        writer.writeheader()
        writer.writerows(paired_rows)
    yield directory
    shutil.rmtree(directory, ignore_errors=True)


@contextmanager
def service(method, fixture_directory):
    name = f"phylo-r-current-{method}-{uuid4().hex[:10]}"
    port = 8001 if method == "dowser" else 8003
    docker("run", "-d", "--init", "--platform", "linux/amd64", "--name", name,
           "--network", "phylo-tests_default", "--cap-drop", "ALL",
           "-p", f"127.0.0.1::{port}",
           "-v", f"{ROOT}/packages/contracts:/contracts:ro",
           "-v", f"{fixture_directory}:/fixtures:ro",
           "-e", "S3_ENDPOINT_URL=http://minio:9000", "-e", "S3_ACCESS_KEY_ID=phylo_test",
           "-e", "S3_SECRET_ACCESS_KEY=phylo_test_secret", "-e", "S3_BUCKET_ARTIFACTS=phylo-test-artifacts",
           "-e", "S3_FORCE_PATH_STYLE=true", "-e", "METHOD_JOB_MEMORY_MB=256",
           image(method))
    try:
        address = docker("port", name, str(port)).strip()
        with httpx.Client(base_url=f"http://{address}", timeout=600, trust_env=False) as client:
            deadline = time.monotonic() + 120
            while True:
                try:
                    response = client.get("/spec")
                    if response.status_code == 200:
                        break
                except httpx.TransportError:
                    pass
                assert time.monotonic() < deadline, docker("logs", name)
                time.sleep(0.5)
            yield client, name
    finally:
        EVIDENCE.mkdir(parents=True, exist_ok=True)
        logs = subprocess.run(["docker", "logs", name], capture_output=True, text=True, timeout=30)
        (EVIDENCE / f"{method}-container.log").write_text(logs.stdout + logs.stderr)
        state = subprocess.run(["docker", "inspect", "--format", "{{json .State}}", name],
                               capture_output=True, text=True, timeout=30)
        (EVIDENCE / f"{method}-container-state.json").write_text(state.stdout + state.stderr)
        docker("rm", "-f", name)


@pytest.fixture(scope="module", params=["dowser", "brepphylo"])
def running_service(request, fixture_directory):
    with service(request.param, fixture_directory) as current:
        yield request.param, current


def test_runtime_and_api(running_service):
    method, (client, container) = running_service
    assert client.get("/spec").status_code == 200
    assert client.get("/capacity").status_code == 200
    commands = "R Rscript dnapars igphyml zip setsid timeout nproc curl".split()
    if method == "dowser":
        commands += ["dnaml", "raxml-ng"]
    for command in commands:
        assert docker("exec", container, "which", command)
    docker("exec", container, "Rscript", "-e",
           'p<-read.delim("/usr/share/phylo-runtime/r-packages.tsv"); '
           'for(n in p$Package) loadNamespace(n); '
           'stopifnot(getRversion()=="4.4.3"); '
           'png(tempfile(fileext=".png")); plot(1); dev.off(); '
           'pdf(tempfile(fileext=".pdf")); plot(1); dev.off()')
    for command in ("gcc", "pip", "dnf", "igblastn", "blastn"):
        assert not docker("exec", container, "sh", "-c", f"command -v {command} || true")
    if method == "brepphylo":
        assert docker("exec", container, "which", "pdflatex")
        docker("exec", container, "Rscript", "-e",
               'n<-reticulate::import("networkx"); s<-reticulate::import("scipy"); '
               'stopifnot(n$`__version__`=="3.4.2", s$`__version__`=="1.11.3")')

    locked = list(csv.DictReader((ROOT / f"services/{method}/runtime-packages.lock.tsv").open(),
                                 delimiter="\t"))
    actual = docker("exec", container, "cat", "/usr/share/phylo-runtime/r-packages.tsv")
    assert list(csv.DictReader(io.StringIO(actual), delimiter="\t")) == locked
    docker("exec", container, "sha256sum", "--check", "--quiet",
           "/usr/share/phylo-runtime/files.sha256")

    size = int(docker("image", "inspect", image(method), "--format", "{{.Size}}"))
    assert size <= MAX_IMAGE_BYTES[method], f"{method} runtime grew to {size} bytes"


def execute(client, params, run_id, file_path=SAMPLE):
    response = client.post("/jobs", json={"file_path": file_path, "params": params,
                                          "run_id": run_id, "timeout_seconds": 600})
    assert response.status_code in (200, 202), response.text
    job_id = response.json()["job_id"]
    deadline = time.monotonic() + 660
    while True:
        status = client.get(f"/jobs/{job_id}/status").json()
        if status["status"] in ("DONE", "ERROR", "CANCELLED"):
            break
        assert time.monotonic() < deadline, status
        time.sleep(0.25)
    result = client.get(f"/jobs/{job_id}/result")
    assert result.status_code == 200, result.text
    return status, result.json()


def downloaded_artifacts(result):
    storage = Minio("127.0.0.1:59000", access_key="phylo_test",
                    secret_key="phylo_test_secret", secure=False)
    outputs = {}
    for artifact in result["artifacts"]:
        response = storage.get_object("phylo-test-artifacts", artifact["object_key"])
        try:
            content = response.read()
        finally:
            response.close()
            response.release_conn()
        assert len(content) == artifact["size_bytes"]
        assert hashlib.sha256(content).hexdigest() == artifact["checksum_sha256"]
        if artifact["filename"].endswith(".zip"):
            with zipfile.ZipFile(io.BytesIO(content)) as archive:
                assert archive.testzip() is None
                outputs[artifact["filename"]] = sorted(archive.namelist())
        else:
            outputs[artifact["filename"]] = artifact.get("content_type")
    assert outputs
    return outputs


def test_current_scientific_workflow_and_s3(running_service):
    method, (client, _) = running_service
    status, result = execute(client, PARAMS[method], uuid4().hex)
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    (EVIDENCE / f"{method}-result.json").write_text(json.dumps(result, indent=2))
    assert status["status"] == "DONE", result
    assert result["ok"] is True
    trees = result["trees"] if isinstance(result["trees"], list) else [result["trees"]]
    assert trees and all(tree.endswith(";") and "(" in tree for tree in trees)
    assert downloaded_artifacts(result)
    assert any(a["filename"].endswith(".png") for a in result["artifacts"])
    assert any(a["filename"].endswith(".zip") for a in result["artifacts"])
    if method == "dowser":
        schema = json.loads((ROOT / "packages/contracts/methods/dowser/result.schema.json").read_text())
        Draft7Validator(schema).validate(result)


def test_invalid_input_is_rejected(running_service):
    _, (client, _) = running_service
    response = client.post("/run", json={"file_path": "/fixtures/missing.tsv", "params": {}})
    assert response.status_code == 400
    assert response.json()["ok"] is False
    assert response.json()["error"]


def run_variant(client, label, params, file_path=SAMPLE):
    response = client.post("/run", json={"file_path": file_path, "params": params})
    result = response.json()
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    (EVIDENCE / f"{label}.json").write_text(json.dumps(result, indent=2))
    assert response.status_code == 200, (label, result)
    assert result["ok"] is True, (label, result)
    trees = result["trees"] if isinstance(result["trees"], list) else [result["trees"]]
    assert trees and all(tree.endswith(";") and "(" in tree for tree in trees)
    return result


def test_optional_scientific_paths(running_service):
    method, (client, container) = running_service
    if method == "dowser":
        variants = [
            (backend, {"tree_build": backend, **({"mod3": True} if backend == "igphyml" else {})}, SAMPLE)
            for backend in ("pratchet", "pml", "dnaml", "raxml", "igphyml")
        ]
        variants += [
            ("discrete-trait", {"analysis_mode": "discrete_trait_analysis", "trait_field": "test_trait",
                                "permutations": 3, "tree_build": "dnapars"}, ANALYSIS_SAMPLE),
            ("time-evolution", {"analysis_mode": "time_evolution", "time_field": "test_time",
                                "time_permutations": 3, "tree_build": "dnapars"}, ANALYSIS_SAMPLE),
            ("paired-heavy-light", {"chain_mode": "HL", "tree_build": "dnapars"}, PAIRED_SAMPLE),
        ]
    else:
        variants = [
            ("simple", {"tree_type": "simple"}, SAMPLE),
            ("igphyml", {"tree_type": "igphyml"}, SAMPLE),
            ("csr", {"enable_csr_analysis": True, "isotype_column": "Subclass",
                     "sequence_column": "VDJ_SORTED", "clone_id_column": "CloneID",
                     "germline_id_column": "V.GENE.and.allele", "label_column": "Seq_ID",
                     "input_sequence_mode": "raw_sequence", "algorithm": "ClustalOmega"},
             "/usr/lib64/R/library/BrepPhylo/extdata/clone_188.csv"),
            ("alignment-pdf", {"input_sequence_mode": "raw_sequence", "sequence_column": "sequence",
                               "algorithm": "ClustalOmega", "make_alignment_pdf": True}, SAMPLE),
            ("clustal-omega", {"input_sequence_mode": "raw_sequence", "sequence_column": "sequence",
                               "algorithm": "ClustalOmega"}, SAMPLE),
        ]

    for label, changes, file_path in variants:
        result = run_variant(client, f"{method}-{label}", {**PARAMS[method], **changes}, file_path)
        if label == "discrete-trait":
            assert result["discrete_trait_analysis"]["switches"]
        elif label == "time-evolution":
            assert result["time_evolution"]["results"]
        elif label == "paired-heavy-light":
            assert result["chain_qc"]["chain_mode"] == "HL"
            assert result["chain_qc"]["n_after_resolve"] > 0
        elif label == "csr":
            summary = result["analysis"]["batch_summary"]
            assert summary["clones_analyzed"] > 0 and summary["csr_total"] > 0
            assert result["analysis"]["arborescence"]
            assert "Installation of Python not found" not in json.dumps(result)
        elif label == "alignment-pdf":
            bundle = next(a for a in result["artifact_files"] if a["filename"].endswith(".zip"))
            assert ".pdf" in docker("exec", container, "unzip", "-Z1", bundle["path"])


@pytest.mark.parametrize("method", ["dowser", "brepphylo"])
def test_build_from_clean_context(method, tmp_path):
    for folder in ("r-runtime", method):
        shutil.copytree(ROOT / "services" / folder, tmp_path / "services" / folder,
                        ignore=shutil.ignore_patterns("__pycache__"))
    reference = image(method, "clean-context-test")
    docker("build", "--platform", "linux/amd64", "-f", f"services/{method}/Dockerfile",
           "-t", reference, str(tmp_path))
    assert docker("image", "inspect", reference, "--format", "{{.Architecture}}") == "amd64"


@pytest.mark.parametrize("method", ["dowser", "brepphylo"])
def test_dependency_image_build_argument_is_self_contained(method):
    dependency = image(method, "dependency-test-builder")
    result = image(method, "dependency-argument-test")
    docker("build", "--platform", "linux/amd64", "--target", "dependency-build",
           "-f", f"services/{method}/Dockerfile", "-t", dependency, ".")
    docker("build", "--platform", "linux/amd64", "--build-arg", f"DEPENDENCY_IMAGE={dependency}",
           "-f", f"services/{method}/Dockerfile", "-t", result, ".")
    packages = docker("run", "--rm", "--platform", "linux/amd64", "--entrypoint", "cat",
                      result, "/usr/share/phylo-runtime/r-packages.tsv")
    assert packages == (ROOT / f"services/{method}/runtime-packages.lock.tsv").read_text().strip()


def test_clustalw_native_abort_is_contained(fixture_directory):
    # msa 1.38.0 currently aborts in clustalw::FileParser for this fixture. The
    # child job must report the error without taking the parent service down.
    with service("brepphylo", fixture_directory) as (client, _):
        params = {**PARAMS["brepphylo"], "input_sequence_mode": "raw_sequence",
                  "sequence_column": "sequence", "algorithm": "ClustalW"}
        response = client.post("/jobs", json={"file_path": SAMPLE, "params": params,
                                              "run_id": uuid4().hex, "timeout_seconds": 120})
        assert response.status_code in (200, 202), response.text
        job_id = response.json()["job_id"]
        deadline = time.monotonic() + 120
        while True:
            status = client.get(f"/jobs/{job_id}/status").json()
            if status["status"] in ("DONE", "ERROR", "CANCELLED"):
                break
            assert time.monotonic() < deadline, status
            time.sleep(0.25)
        assert status["status"] == "ERROR", status
        log = client.get(f"/jobs/{job_id}/log")
        assert log.status_code == 200
        assert "clustalw::FileParser" in log.text and "Assertion" in log.text
        assert client.get("/spec").status_code == 200
