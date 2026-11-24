"""Copy only test tooling and its ELF dependencies onto the production runtime."""
import csv
from pathlib import Path
from assemble import Runtime

runtime = Runtime("/test-root")
runtime.root.mkdir(parents=True, exist_ok=True)
for name, target in (("bin", "usr/bin"), ("sbin", "usr/sbin"),
                     ("lib", "usr/lib"), ("lib64", "usr/lib64")):
    (runtime.root / target).mkdir(parents=True, exist_ok=True)
    (runtime.root / name).symlink_to(target)
with open("/build/test-packages.tsv") as stream:
    for package in csv.DictReader(stream, delimiter="\t"):
        runtime.copy(Path(package["LibPath"]) / package["Package"])
runtime.libraries()
