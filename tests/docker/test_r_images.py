"""Real original/optimized image regression. Requires isolated test MinIO.

Run explicitly (outside the fast suite's testpaths):
  python -m pytest tests/docker/test_r_images.py -v
Baseline/optimized tags can be changed with R_BASELINE_TAG/R_OPTIMIZED_TAG.
No production containers, credentials, volumes or image tags are changed.
"""
from contextlib import contextmanager
from concurrent.futures import ThreadPoolExecutor
import csv
import hashlib
import io
import json
import os
from pathlib import Path
import subprocess
import shutil
import time
from uuid import uuid4
import zipfile

import httpx
from jsonschema import Draft7Validator
from minio import Minio
import pytest

ROOT = Path(__file__).resolve().parents[2]
PARAMS = json.loads((ROOT / "tests/fixtures/scientific-params.json").read_text())
SAMPLE = "/fixtures/ExampleAirr_clone_3128.tsv"
EVIDENCE = ROOT / "coverage/r-image-optimization"
pytestmark = [pytest.mark.integration, pytest.mark.scientific]


def docker(*args):
    done = subprocess.run(["docker", *args], cwd=ROOT, capture_output=True, text=True, timeout=900)
    assert done.returncode == 0, done.stdout + done.stderr
    return done.stdout.strip()


@contextmanager
def service(method, tag):
    name = f"phylo-r-regression-{method}-{uuid4().hex[:10]}"
    port = 8001 if method == "dowser" else 8003
    docker("run", "-d", "--init", "--platform", "linux/amd64", "--name", name,
           "--network", os.environ.get("R_IMAGE_TEST_NETWORK", "phylo-tests_default"), "--cap-drop", "ALL",
           "-p", f"127.0.0.1::{port}",
           "-v", f"{ROOT}/packages/contracts:/contracts:ro",
           "-v", f"{ROOT}/apps/web/public/samples:/fixtures:ro",
           "-e", "S3_ENDPOINT_URL=http://minio:9000", "-e", "S3_ACCESS_KEY_ID=phylo_test",
           "-e", "S3_SECRET_ACCESS_KEY=phylo_test_secret", "-e", "S3_BUCKET_ARTIFACTS=phylo-test-artifacts",
           "-e", "S3_FORCE_PATH_STYLE=true", "-e", "METHOD_JOB_MEMORY_MB=256",
           f"phylo-{method}:{tag}")
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
        try:
            logs = subprocess.run(["docker", "logs", name], capture_output=True, text=True, timeout=30)
            (EVIDENCE / f"{method}-{tag}-container.log").write_text(logs.stdout + logs.stderr)
            state = subprocess.run(["docker", "inspect", "--format", "{{json .State}}", name],
                                   capture_output=True, text=True, timeout=30)
            (EVIDENCE / f"{method}-{tag}-container-state.json").write_text(state.stdout + state.stderr)
        finally:
            docker("rm", "-f", name)


@pytest.fixture(scope="module", params=["dowser", "brepphylo"])
def pair(request):
    method = request.param
    baseline = os.environ.get("R_BASELINE_TAG", "dev")
    optimized = os.environ.get("R_OPTIMIZED_TAG", "optimized")
    with service(method, baseline) as old, service(method, optimized) as new:
        yield method, old, new


def test_runtime_and_api(pair):
    method, (old, _), (new, container) = pair
    assert old.get("/spec").json() == new.get("/spec").json()
    capacity = new.get("/capacity")
    assert capacity.status_code == 200
    commands = "R Rscript dnapars igphyml zip setsid timeout nproc curl".split()
    if method == "dowser":
        commands += ["dnaml", "raxml-ng"]
    for command in commands:
        assert docker("exec", container, "which", command)
    # Verify every declared package, all compiled namespace libraries, graphics
    # devices and optional modules in the actual production image.
    docker("exec", container, "Rscript", "-e",
           'p<-read.delim("/usr/share/phylo-runtime/r-packages.tsv"); '
           'for(n in p$Package) loadNamespace(n); '
           'stopifnot(getRversion()=="4.4.3"); '
           'png(tempfile(fileext=".png")); plot(1); dev.off(); '
           'pdf(tempfile(fileext=".pdf")); plot(1); dev.off()')
    assert not docker("exec", container, "sh", "-c", "command -v gcc || true")
    assert not docker("exec", container, "sh", "-c", "command -v pip || true")
    if method == "brepphylo":
        assert docker("exec", container, "which", "pdflatex")
        docker("exec", container, "Rscript", "-e",
               'n<-reticulate::import("networkx"); s<-reticulate::import("scipy"); '
               'stopifnot(n$`__version__`=="3.4.2", s$`__version__`=="1.11.3")')
    locked = list(csv.DictReader((ROOT / f"services/{method}/runtime-packages.lock.tsv").open(), delimiter="\t"))
    actual = docker("exec", container, "cat", "/usr/share/phylo-runtime/r-packages.tsv")
    assert list(csv.DictReader(io.StringIO(actual), delimiter="\t")) == locked
    # The binary/resource contents must be identical to the original, including
    # scripts and motif tables. This also catches accidental file truncation.
    manifest = docker("exec", container, "cat", "/usr/share/phylo-runtime/files.sha256")
    manifest = "\n".join(line for line in manifest.splitlines()
                          if not line.endswith("/usr/share/phylo-runtime/r-packages.tsv")) + "\n"
    source = "phylo-" + method + ":" + os.environ.get("R_BASELINE_TAG", "dev")
    checked = subprocess.run(["docker", "run", "--rm", "--platform", "linux/amd64", "-i",
                              "--entrypoint", "sha256sum", source, "--check", "--quiet"],
                             input=manifest, capture_output=True, text=True, timeout=180)
    assert checked.returncode == 0, checked.stdout + checked.stderr


def execute(client, params, run_id):
    response = client.post("/jobs", json={"file_path": SAMPLE, "params": params,
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


def artifacts(result):
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


def test_real_workflow_regression_and_s3(pair):
    method, (old, _), (new, _) = pair
    original_status, original = execute(old, PARAMS[method], uuid4().hex)
    optimized_status, optimized = execute(new, PARAMS[method], uuid4().hex)
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    for label, value in (("original", original), ("optimized", optimized)):
        (EVIDENCE / f"{method}-{label}-result.json").write_text(json.dumps(value, indent=2))
    assert original_status["status"] == optimized_status["status"] == "DONE", (original, optimized)
    assert original["ok"] is optimized["ok"] is True
    assert original["trees"] == optimized["trees"]
    assert original["annotations"] == optimized["annotations"]
    assert original["clones"] == optimized["clones"]
    if method == "dowser":
        assert original["trees_detail"] == optimized["trees_detail"]
    else:
        assert original["analysis"] == optimized["analysis"]
    assert set(original) == set(optimized)
    # Job materialization removes artifact_files and adds its manifest. Compare
    # actual downloads and ZIP members; timestamps and scratch paths may differ.
    assert artifacts(original) == artifacts(optimized)
    assert any(a["filename"].endswith(".png") for a in optimized["artifacts"])
    assert any(a["filename"].endswith(".zip") for a in optimized["artifacts"])
    schema = json.loads((ROOT / f"packages/contracts/methods/{method}/result.schema.json").read_text())
    validator = Draft7Validator(schema)
    if method == "dowser":
        validator.validate(optimized)
    else:
        # Existing BrepPhylo single-clone responses are auto-unboxed, although
        # the raw service schema requires arrays. Preserve and expose that
        # discrepancy; the framework normalizes it in its scientific E2E test.
        errors = lambda value: sorted((list(e.absolute_schema_path), e.message)
                                      for e in validator.iter_errors(value))
        assert errors(original) == errors(optimized)
        (EVIDENCE / "brepphylo-existing-schema-errors.json").write_text(
            json.dumps(errors(original), indent=2))


def test_invalid_input_reports_same_error(pair):
    _, (old, _), (new, _) = pair
    request = {"file_path": "/fixtures/missing.tsv", "params": {}}
    before, after = old.post("/run", json=request), new.post("/run", json=request)
    assert before.status_code == after.status_code == 400
    assert before.json()["ok"] is after.json()["ok"] is False
    assert before.json()["error"] == after.json()["error"]


def test_alignment_pdf_and_csr_or_additional_tree_backends(pair):
    method, (old, _), (new, _) = pair
    if method == "dowser":
        variants = [(backend, {"tree_build": backend, **({"mod3": True} if backend == "igphyml" else {})})
                    for backend in ("pratchet", "pml", "dnaml", "raxml", "igphyml")]
    else:
        variants = [
            ("simple", {"tree_type": "simple"}),
            ("igphyml", {"tree_type": "igphyml"}),
            # The project fixture's c_call column is empty. Use the unchanged,
            # pinned upstream example for the positive isotype/CSR path.
            ("csr", {"enable_csr_analysis": True, "isotype_column": "Subclass",
                     "sequence_column": "VDJ_SORTED", "clone_id_column": "CloneID",
                     "germline_id_column": "V.GENE.and.allele", "label_column": "Seq_ID",
                     "input_sequence_mode": "raw_sequence", "algorithm": "ClustalOmega"}),
            ("alignment-pdf", {"input_sequence_mode": "raw_sequence", "sequence_column": "sequence",
                               "algorithm": "ClustalOmega", "make_alignment_pdf": True}),
            ("clustal-omega", {"input_sequence_mode": "raw_sequence", "sequence_column": "sequence",
                               "algorithm": "ClustalOmega"}),
        ]
    selected = os.environ.get("R_IMAGE_VARIANTS", "")
    if selected:
        variants = [(label, changes) for label, changes in variants if label in selected.split(",")]
        assert variants, f"No {method} variant matches {selected}"
    for label, changes in variants:
        params = {**PARAMS[method], **changes}
        file_path = "/usr/lib64/R/library/BrepPhylo/extdata/clone_188.csv" if label == "csr" else SAMPLE
        with ThreadPoolExecutor(max_workers=2) as pool:
            responses = [pool.submit(client.post, "/run", json={"file_path": file_path, "params": params})
                         for client in (old, new)]
            before, after = [response.result() for response in responses]
        original, optimized = before.json(), after.json()
        for name, value in (("original", original), ("optimized", optimized)):
            (EVIDENCE / f"{method}-{label}-{name}.json").write_text(json.dumps(value, indent=2))
        assert before.status_code == after.status_code == 200, (label, original, optimized)
        assert original["ok"] is optimized["ok"] is True, (label, original, optimized)
        # Stochastic inference can order resolutions differently. Keep labels,
        # node/edge information and analysis schema; the deterministic fixture
        # comparison above remains exact.
        tree_list = lambda result: result["trees"] if isinstance(result["trees"], list) else [result["trees"]]
        assert len(tree_list(original)) == len(tree_list(optimized)) > 0
        assert all(tree.endswith(";") and "(" in tree for tree in tree_list(optimized))
        assert original["annotations"] == optimized["annotations"]
        assert set(original) == set(optimized)
        assert sorted(a["filename"] for a in original["artifact_files"]) == sorted(
            a["filename"] for a in optimized["artifact_files"])
        if label == "csr":
            assert original["analysis"] == optimized["analysis"]
            assert optimized["analysis"]["batch_summary"]["clones_analyzed"] > 0
            assert optimized["analysis"]["batch_summary"]["csr_total"] > 0
            assert optimized["analysis"]["arborescence"]
            assert all(clone["analyzed"] for clone in optimized["analysis"]["per_clone_status"])
            assert "Installation of Python not found" not in json.dumps(optimized)
        if label == "alignment-pdf":
            # PDFs are included inside the upstream bundle; inspect the actual
            # container files to ensure an optional failure was not swallowed.
            for client_result, (_, name) in ((original, pair[1]), (optimized, pair[2])):
                bundle = next(a for a in client_result["artifact_files"] if a["filename"].endswith(".zip"))
                listing = docker("exec", name, "unzip", "-Z1", bundle["path"])
                assert ".pdf" in listing, listing


@pytest.mark.parametrize("method", ["dowser", "brepphylo"])
def test_build_from_clean_context(method, tmp_path):
    # Only declared build inputs: no .env, .git, runtime files, node_modules,
    # test libraries or host R installation. Cached dependency layers are OK.
    for folder in ("r-runtime", method):
        shutil.copytree(ROOT / "services" / folder, tmp_path / "services" / folder,
                        ignore=shutil.ignore_patterns("__pycache__"))
    docker("build", "--platform", "linux/amd64", "-f", f"services/{method}/Dockerfile",
           "-t", f"phylo-{method}:clean-context-test", str(tmp_path))
    assert docker("image", "inspect", f"phylo-{method}:clean-context-test", "--format", "{{.Architecture}}") == "amd64"


@pytest.mark.parametrize("method", ["dowser", "brepphylo"])
def test_verified_dependency_image_build_argument(method):
    baseline = os.environ.get("R_BASELINE_TAG", "dev")
    reference = f"phylo-{method}:{baseline}"
    docker("build", "--platform", "linux/amd64", "--build-arg", f"DEPENDENCY_IMAGE={reference}",
           "-f", f"services/{method}/Dockerfile", "-t", f"phylo-{method}:dependency-argument-test", ".")
    packages = docker("run", "--rm", "--platform", "linux/amd64", "--entrypoint", "cat",
                      f"phylo-{method}:dependency-argument-test", "/usr/share/phylo-runtime/r-packages.tsv")
    assert packages == (ROOT / f"services/{method}/runtime-packages.lock.tsv").read_text().strip()


def test_existing_clustalw_native_abort_is_reported_by_child_jobs():
    # msa 1.38.0 aborts in clustalw::FileParser in the ORIGINAL image too.
    # Keep that failure visible, without labelling it a successful alignment
    # or changing the scientific package. The async parent must survive it.
    results = []
    for tag in (os.environ.get("R_BASELINE_TAG", "dev"), os.environ.get("R_OPTIMIZED_TAG", "optimized")):
        with service("brepphylo", tag) as (client, _):
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
            results.append(status["error_code"])
            (EVIDENCE / f"brepphylo-clustalw-{tag}.json").write_text(json.dumps(status, indent=2))
    assert results[0] == results[1]
