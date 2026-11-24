#!/usr/bin/env python3
"""Assemble an ABI-compatible runtime, without inheriting builder layers.

Run in the Fedora dependency stage. R selects packages; this script copies their
complete installed directories and the ELF dependency closure. Runtime-loaded
BLAS, graphics, crypto, Python and TeX resources are explicit below. No binary is
stripped or rebuilt. A manifest records every retained file and its SHA-256.
"""
import csv
import glob
import hashlib
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys


class Runtime:
    def __init__(self, root):
        self.root = Path(root)
        self.elf = set()
        self.copied = set()

    def copy(self, source):
        source = Path(os.path.normpath(source))
        if str(source) in self.copied:
            return
        if not source.exists() and not source.is_symlink():
            raise FileNotFoundError(source)
        self.copied.add(str(source))
        target = self.root / source.relative_to("/")
        target.parent.mkdir(parents=True, exist_ok=True)
        if source.is_symlink():
            link = os.readlink(source)
            if not target.is_symlink():
                target.symlink_to(link)
            resolved = source.parent / link if not os.path.isabs(link) else Path(link)
            self.copy(resolved)
        elif source.is_dir():
            target.mkdir(exist_ok=True)
            for child in source.iterdir():
                self.copy(child)
        else:
            shutil.copy2(source, target)
            with source.open("rb") as stream:
                if stream.read(4) == b"\x7fELF":
                    self.elf.add(str(source))

    def patterns(self, *patterns):
        for pattern in patterns:
            matches = glob.glob(pattern)
            if not matches:
                raise FileNotFoundError(pattern)
            for match in matches:
                self.copy(match)

    def libraries(self):
        checked = set()
        while self.elf - checked:
            source = (self.elf - checked).pop()
            checked.add(source)
            done = subprocess.run(["ldd", source], capture_output=True, text=True)
            output = done.stdout + done.stderr
            if "not found" in output:
                raise RuntimeError(f"Unresolved shared library: {source}\n{output}")
            if done.returncode and not any(s in output for s in (
                "not a dynamic executable", "statically linked"
            )):
                raise RuntimeError(f"ldd failed: {source}\n{output}")
            for path in re.findall(r"(?:=>\s+|^\s*)(/\S+)", output, re.MULTILINE):
                self.copy(path)


def main():
    method, packages, destination = sys.argv[1:]
    if method not in ("dowser", "brepphylo"):
        raise ValueError(method)
    runtime = Runtime(destination)
    # Preserve Fedora's merged-/usr layout for scripts, ELF interpreters and
    # absolute paths baked into the original compiled tools.
    runtime.root.mkdir(parents=True, exist_ok=True)
    for name, target in (("bin", "usr/bin"), ("sbin", "usr/sbin"),
                         ("lib", "usr/lib"), ("lib64", "usr/lib64")):
        (runtime.root / target).mkdir(parents=True, exist_ok=True)
        (runtime.root / name).symlink_to(target)

    # R_HOME without the builder's entire package library, headers or manuals.
    for child in Path("/usr/lib64/R").iterdir():
        if child.name not in ("library", "include", "doc", "tests"):
            runtime.copy(child)
    runtime.copy("/usr/share/R")
    with open(packages) as stream:
        for package in csv.DictReader(stream, delimiter="\t"):
            runtime.copy(Path(package["LibPath"]) / package["Package"])

    commands = "R Rscript sh bash env printenv setsid timeout nproc kill sleep ps zip unzip tar gtar gzip bzip2 sed awk grep cut tr cat head tail sort uniq wc dirname basename readlink mkdir rm mv cp ln chmod touch date uname which curl file getconf ldconfig ldd sha256sum".split()
    commands += ["dnapars"]
    if method == "dowser":
        commands += ["dnaml", "raxml-ng"]
    else:
        commands += ["clustalw2"]
    for command in commands:
        path = shutil.which(command)
        if not path:
            raise FileNotFoundError(command)
        runtime.copy(path)
    runtime.copy("/usr/local/share/igphyml/src/igphyml")
    runtime.copy("/usr/local/share/igphyml/src/motifs")
    # dlopen() dependencies do not appear in ldd's dependency tree.
    runtime.patterns("/usr/lib64/flexiblas", "/usr/lib64/atlas",
                     "/usr/lib64/libnss_*.so*", "/usr/lib64/gconv",
                     "/usr/lib64/ossl-modules", "/etc/flexiblas*",
                     "/usr/share/tcl8*", "/usr/share/tk8*",
                     "/etc/fonts", "/usr/share/fonts", "/usr/share/fontconfig",
                     "/usr/lib/locale", "/usr/share/locale", "/usr/share/zoneinfo",
                     "/etc/pki", "/etc/ssl", "/etc/crypto-policies",
                     "/etc/nsswitch.conf", "/etc/passwd", "/etc/group",
                     "/etc/os-release", "/etc/localtime")

    if method == "brepphylo":
        # Alignment PDFs call tools::texi2dvi; retain the installed TeX tree, fonts,
        # generated formats and script helpers, including interpreter dependencies.
        # Do not remove R package extdata, Python helpers, msa/tex or IgPhyML motifs.
        runtime.patterns("/usr/share/texlive", "/var/lib/texmf", "/etc/texlive",
                         "/usr/share/texmf", "/usr/share/ghostscript")
        for command in "pdflatex latex pdftex kpsewhich bibtex makeindex texi2dvi texi2pdf fmtutil mktexlsr mktexfmt mktexpk mktextfm mktexmf perl".split():
            path = shutil.which(command)
            if path:
                runtime.copy(path)
        runtime.patterns("/usr/share/perl5", "/usr/lib64/perl5")

    if method == "brepphylo":
        # Reticulate embeds libpython and runs the upstream networkx script.
        runtime.copy("/usr/bin/python3")
        runtime.patterns("/usr/lib64/libpython3*.so*")
        # Standard library and its native extensions; no unrelated pip tools.
        version = f"python{sys.version_info.major}.{sys.version_info.minor}"
        for prefix in ("/usr/lib", "/usr/lib64"):
            for child in (Path(prefix) / version).iterdir():
                if child.name not in ("site-packages", "__pycache__", "test", "tests"):
                    runtime.copy(child)
        # Both modules are imported through reticulate; scipy and numpy's wheel
        # shared libraries live alongside their package directories.
        for module in ("networkx", "numpy", "scipy"):
            code = f"import {module}; print({module}.__path__[0])"
            directory = subprocess.check_output(["python3", "-c", code], text=True).strip()
            runtime.copy(directory)
            for libs in Path(directory).parent.glob(module + "*.libs"):
                runtime.copy(libs)
            for metadata in Path(directory).parent.glob(module + "-*.dist-info"):
                runtime.copy(metadata)

    runtime.libraries()
    for name in ("tmp", "root", "srv", "runtime", "data", "oasis", "scratch", "software"):
        (runtime.root / name).mkdir(parents=True, exist_ok=True)
    (runtime.root / "tmp").chmod(0o1777)
    metadata = runtime.root / "usr/share/phylo-runtime"
    metadata.mkdir(parents=True, exist_ok=True)
    shutil.copy2(packages, metadata / "r-packages.tsv")
    # Retain licence notices for redistributed native libraries and tools.
    if Path("/usr/share/licenses").exists():
        runtime.copy("/usr/share/licenses")
    with (metadata / "files.sha256").open("w") as stream:
        for path in sorted(runtime.root.rglob("*")):
            if path.is_file() and not path.is_symlink() and path.name != "files.sha256":
                digest = hashlib.sha256(path.read_bytes()).hexdigest()
                stream.write(f"{digest}  /{path.relative_to(runtime.root)}\n")


if __name__ == "__main__":
    main()
