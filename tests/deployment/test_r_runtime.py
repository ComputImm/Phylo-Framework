"""Runtime assembly and build-entrypoint contracts, without Docker or network."""
import csv
import importlib.util
import json
from pathlib import Path
import re

import pytest
import yaml

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("r_runtime", ROOT / "services/r-runtime/assemble.py")
assembler = importlib.util.module_from_spec(spec)
spec.loader.exec_module(assembler)


def test_copy_retains_symlinks_and_their_transitive_targets(tmp_path):
    source = tmp_path / "source"
    source.mkdir()
    data = source / "motifs"
    data.write_bytes(b"scientific resource\x00")
    (source / "alias").symlink_to("motifs")
    runtime = assembler.Runtime(tmp_path / "runtime")
    runtime.copy(source / "alias")
    copied = runtime.root / str(source).lstrip("/")
    assert (copied / "alias").is_symlink()
    assert (copied / "alias").read_bytes() == data.read_bytes()
    runtime.copy(source / "alias")  # Repeated ELF dependencies must be idempotent.
    assert (copied / "motifs").read_bytes() == data.read_bytes()


def test_required_resources_and_broken_links_fail_closed(tmp_path):
    runtime = assembler.Runtime(tmp_path / "runtime")
    with pytest.raises(FileNotFoundError):
        runtime.copy(tmp_path / "missing")
    (tmp_path / "broken").symlink_to("missing")
    with pytest.raises(FileNotFoundError):
        runtime.copy(tmp_path / "broken")
    with pytest.raises(FileNotFoundError):
        runtime.patterns(str(tmp_path / "absent-*.so"))


@pytest.mark.parametrize("method", ["dowser", "brepphylo"])
def test_all_build_entrypoints_use_shared_runtime_context_and_platform(method):
    for filename in ("docker-compose.yml", "docker-compose.test.yml"):
        service = yaml.safe_load((ROOT / filename).read_text())["services"][method]
        assert service["build"] == {"context": ".", "dockerfile": f"services/{method}/Dockerfile"}
        assert "amd64" in service["platform"]
    service = next(s for s in json.loads((ROOT / "config/method-services.json").read_text())["services"]
                   if s["id"] == method)
    assert service["buildContext"] == "."
    assert service["dockerfile"] == f"services/{method}/Dockerfile"


@pytest.mark.parametrize("method", ["dowser", "brepphylo"])
def test_version_lock_covers_direct_and_dynamically_loaded_application_packages(method):
    directory = ROOT / "services" / method
    with (directory / "runtime-packages.lock.tsv").open() as stream:
        lock = {row["Package"]: row["Version"] for row in csv.DictReader(stream, delimiter="\t")}
    source = "\n".join(p.read_text() for p in directory.glob("*.R"))
    packages = set(re.findall(r"\b([A-Za-z][A-Za-z0-9.]*)::", source))
    packages |= set(re.findall(r'(?:library|require|requireNamespace)\(["\']?([A-Za-z][A-Za-z0-9.]*)', source))
    assert packages <= lock.keys(), packages - lock.keys()
    assert lock["ragg"]  # ggplot2 selects it implicitly for runtime graphics.
    assert lock["base"] == "4.4.3"
    assert "BH" not in lock  # LinkingTo headers are a build dependency.
    assert "covr" not in lock and "testthat" not in lock


def test_scientific_versions_are_locked_independently():
    def lock(method):
        with (ROOT / f"services/{method}/runtime-packages.lock.tsv").open() as stream:
            return {r["Package"]: r["Version"] for r in csv.DictReader(stream, delimiter="\t")}
    dowser, brep = lock("dowser"), lock("brepphylo")
    assert dowser["dowser"] == "2.4.1" and dowser["alakazam"] == "1.4.3"
    assert brep["BrepPhylo"] == "0.4.2" and brep["alakazam"] == "1.3.0"
    assert dowser["BiocParallel"] == "1.40.2" and brep["BiocParallel"] == "1.40.1"


def test_full_ci_runs_the_self_contained_production_image_suite():
    runner = (ROOT / "scripts/test.mjs").read_text()
    workflow = (ROOT / ".github/workflows/tests.yml").read_text()
    image_tests = (ROOT / "tests/docker/test_r_images.py").read_text()

    assert "tests/docker/test_r_images.py" in runner
    assert "npm run test:all -- --build" in workflow
    assert 'IMAGE_TAG = "current-test"' in image_tests
    assert '"--target", "dependency-build"' in image_tests
