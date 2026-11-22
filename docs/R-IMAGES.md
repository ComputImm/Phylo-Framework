# R service images

Dowser and BrepPhylo use separate selective linux/amd64 runtime images. Build
them from the repository root; Docker Compose and the development tooling use
the same Dockerfiles and build context.

## Image layout

Each Dockerfile has four responsibilities:

1. dependency-build installs the pinned scientific environment from the
   digest-pinned immcantation/suite:4.6.0 image.
2. assemble selects the service's R dependency closure and copies its runtime
   executables, shared libraries and resources.
3. production is the default final image. It is based on scratch and contains
   no compiler, package manager or test tooling.
4. test adds the R coverage dependencies used by npm run test:r.

The shared assembler is in
[services/r-runtime](../services/r-runtime/assemble.py). It copies complete
installed R package directories, resolves recursive ELF dependencies with ldd,
and retains resources loaded dynamically at runtime. Missing required files
fail the build. The final image loads and version-checks every selected R
package before the build succeeds.

Each runtime contains:

- /usr/share/phylo-runtime/r-packages.tsv: the selected package versions;
- /usr/share/phylo-runtime/files.sha256: checksums for assembled runtime files.

The checked-in service locks are authoritative:

- [Dowser package roots](../services/dowser/runtime-packages.txt) and
  [complete lock](../services/dowser/runtime-packages.lock.tsv)
- [BrepPhylo package roots](../services/brepphylo/runtime-packages.txt) and
  [complete lock](../services/brepphylo/runtime-packages.lock.tsv)

## Dowser runtime

The Dowser image provides:

- R 4.4.3, Dowser 2.4.1, alakazam 1.4.3, shazam 1.3.2 and the locked
  Bioconductor/graphics/API dependency closure;
- PHYLIP dnapars/dnaml, RAxML-NG and IgPhyML with its motif tables;
- the pratchet, pml, dnapars, dnaml, raxml and igphyml tree backends;
- internal-sequence reconstruction, discrete-trait analysis, time evolution,
  paired heavy/light processing, plots, exports and ZIP generation;
- native R PNG and PDF devices. Dowser does not require TeX or Python.

## BrepPhylo runtime

The BrepPhylo image provides:

- R 4.4.3 and BrepPhylo 0.4.2 at the commit pinned in its Dockerfile, with its
  independent locked R/Bioconductor dependency closure;
- dnapars, IgPhyML and its motif tables;
- Python, numpy, scipy and networkx for the upstream CSR/arborescence bridge;
- TeX, Perl helpers and fonts required for optional alignment PDFs;
- simple, DNAPARS and IgPhyML trees, ClustalOmega alignment, plotting,
  CSR/arborescence analysis, exports and ZIP generation.

RETICULATE_PYTHON=/usr/bin/python3 keeps the service on the Python runtime
inside the image and prevents runtime downloads.

The pinned msa 1.38.0 ClustalW implementation aborts on the project raw-sequence
fixture. Jobs run in child processes, so the failure is reported without
stopping the service. ClustalOmega is the supported positive raw-alignment and
alignment-PDF path.

## Build and run

```bash
docker compose --profile dev build dowser brepphylo
docker compose --profile dev up -d dowser brepphylo
```

Direct builds use the repository root as context:

```bash
docker build --platform linux/amd64 \
  -f services/dowser/Dockerfile -t phylo-dowser:latest .
docker build --platform linux/amd64 \
  -f services/brepphylo/Dockerfile -t phylo-brepphylo:latest .
```

For a standalone service, mount contracts and provide the same object-storage
settings and read-only staged-input mount as Compose:

```bash
docker run --rm --init --platform linux/amd64 -p 8001:8001 \
  -v "$PWD/packages/contracts:/contracts:ro" phylo-dowser:latest
```

/spec is the readiness endpoint. Actual jobs also require the documented S3_*
settings. Ports, mounts and environment variables are listed in
[CONFIGURATION.md](./CONFIGURATION.md).

The optional DEPENDENCY_IMAGE build argument may point to a trusted
dependency-build image for offline assembly. Package versions are checked, but
operators must still control the provenance of native tools and libraries.

## Validation

The full test command builds the current images and runs their scientific
runtime suite as part of CI:

```bash
npm run test:all -- --build
```

For targeted execution, provision the isolated dependencies first:

```bash
docker compose -f docker-compose.test.yml up -d --wait postgres minio
.venv/bin/python scripts/init-test-services.py
.venv/bin/python -m pytest tests/docker/test_r_images.py -v
```

The image suite creates its own current-checkout tags. It does not require a
historical image. It checks:

- package locks, namespace loading, graphics devices and runtime checksums;
- absence of compilers, package managers, BLAST/IgBLAST and other build-only
  tools;
- a size ceiling that prevents the dependency image from becoming the final
  image;
- all six Dowser tree backends, internal sequences, discrete-trait analysis,
  time evolution and paired heavy/light processing;
- all three BrepPhylo tree types, ClustalOmega, alignment PDF and
  CSR/arborescence paths;
- real asynchronous jobs, object-storage downloads/checksums, invalid input,
  clean build contexts and the optional dependency-image build path;
- containment of the known ClustalW child-process abort.

## Platform and security constraints

Both images require linux/amd64. The selected binaries and compiled R packages
cannot be relabelled as native ARM artifacts.

The scientific builder is Fedora 41 and remains end of life. The final scratch
images retain only selected runtime files, but selective packaging is not an
operating-system upgrade. They intentionally have no RPM database or package
manager, so OS vulnerability scanners cannot reconstruct complete Fedora
package provenance from the runtime filesystem.

The dependency builder is still large and a cache-free first build needs
network access and substantial disk space. Final runtime size does not equal the
builder/cache space required on the Docker host.
