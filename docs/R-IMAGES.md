# R service images: architecture, dependencies and operation

Dowser and BrepPhylo ship separate selective runtime images, built with the
repository root as context. Neither final image inherits layers from the full
Immcantation suite. Scientific code and application R files are unchanged.
The completed validation record is in
[R-IMAGE-OPTIMIZATION-REPORT.md](./R-IMAGE-OPTIMIZATION-REPORT.md).

## Previous architecture and investigation

Previously both single-stage Dockerfiles used `immcantation/suite:4.6.0` and
added development headers, service R dependencies and security updates. Dowser
also installed TeX; BrepPhylo installed its upstream package at commit
`7c52fb66e28ee3839a32633bf809f320f060c876` and networkx. Every suite layer,
compiler, unrelated scientific program and obsolete package copy shipped.

The repository inspection covered root/development/deployment/configuration/
validation/storage/security documentation, every R service module, upstream
installed package metadata and functions, contracts, Compose profiles and test
overlays, method startup helpers, API preprocessing/job clients, worker and
artifact paths, scientific fixtures, R suites and CI. There were no existing
service-specific READMEs. Runtime dependencies were inspected in the original
local images before modifying either Dockerfile.

Both services initialize Plumber in `/srv`, read contracts mounted at
`/contracts`, serve `/spec` and the asynchronous `/jobs` contract, and launch
one child Rscript process per job. Input staging is mounted read-only. Results
are uploaded directly to S3 using `paws.storage` and checked with `digest`;
the worker reads the manifest and verifies storage. Job limits, cancellation,
scratch cleanup and retention are application behavior and were not changed.

## Optimized stages and compatibility

1. `dependency-build`: the existing scientific installation procedure, with
   `immcantation/suite:4.6.0` pinned to OCI digest
   `sha256:81b5124bde572a97aec3924842621877072ac60804cde79dc3b14ab31b65cbd8`.
   CRAN snapshots, Bioconductor installation, Dowser scientific pins and the
   BrepPhylo commit are retained. The large builder is still downloaded/cached.
2. `assemble`: R computes each service's recursive `Depends`/`Imports` closure,
   including base/recommended packages and explicitly selected optional paths.
   Its complete package names and raw DESCRIPTION versions must match that
   service's checked-in lock. Build-only `LinkingTo` packages are not runtime
   roots. Installed package directories retain data, scripts and resources.
3. `runtime` / default `production`: `scratch`, populated by the assembler.
   Required native executables and libraries retain their original bytes and
   paths. `ldd` resolves recursive ELF dependencies; explicit resource rules
   cover BLAS backends, fonts, TLS/NSS/crypto modules, locale/timezone data and
   service-specific Python/TeX requirements. Missing resources fail the build.
   Every retained R package is loaded and version-checked in this filesystem.
4. `test-dependencies` / `test`: covr 3.6.5 is compiled in the scientific
   builder, and its test-library closure is added to the runtime for R tests.
   These packages and build tools are absent from the default production image.

The shared implementation is in [services/r-runtime](../services/r-runtime/assemble.py).
Each image records `/usr/share/phylo-runtime/r-packages.tsv` and
`/usr/share/phylo-runtime/files.sha256`. Licence notices are retained. No
binaries are recompiled, stripped or transplanted onto an incompatible libc.

A Debian/Rocker runtime would require rebuilding Fedora-linked R packages,
R itself and scientific executables against another libc/library set. Selecting
it merely for a smaller advertised size would change the compatibility problem.
The selective Fedora runtime preserves R **4.4.3**, Bioconductor **3.20**, the
BLAS implementation and native tool ABI. **Fedora 41 remains end of life**;
this packaging change does not solve that security issue. There is no runtime
package manager or RPM database, so Fedora OS vulnerability scanning remains
unavailable; the file manifest provides provenance, not vulnerability coverage.

Both images remain **linux/amd64**, including on Apple Silicon via Docker's
emulation. Existing `IMMCANTATION_PLATFORM`, root user, ports **8001/8003**,
working directory, CMD, environment paths, thread limits, contract mounts,
read-only input mounts, `init: true`, networks and object-storage credentials
are preserved. No production deployment was performed.

## Dowser dependencies

The explicit roots are in
[runtime-packages.txt](../services/dowser/runtime-packages.txt); the complete
160-package runtime closure and versions are in
[runtime-packages.lock.tsv](../services/dowser/runtime-packages.lock.tsv).

- Direct/optional roots: plumber, jsonlite, dowser **2.4.1**, alakazam **1.4.3**,
  ape, jsonvalidate, Biostrings, readr, ggtree, ggplot2, phangorn, paws.storage,
  digest and ragg. shazam **1.3.2** is a retained transitive dependency. ragg is
  explicit because ggplot2 selects it when available in the original image.
- Bioconductor dependencies include Biostrings **2.74.1**, ggtree **3.14.0**,
  treeio, pwalign, BiocParallel **1.40.2**, IRanges, S4Vectors, XVector,
  GenomicRanges, GenomicAlignments, Rsamtools, Rhtslib, SummarizedExperiment,
  DelayedArray and their version-locked closure.
- Native scientific executables: PHYLIP `dnapars`/`dnaml`, RAxML-NG and
  IgPhyML, with all hotspot motif tables at the existing paths. These support
  all six exposed builders and the IgPhyML-based trait reconstruction paths.
- Runtime libraries: R/libR, FlexiBLAS/ATLAS/OpenBLAS and Fortran/OpenMP/C++
  libraries; ICU, curl/OpenSSL, compression, libxml2, libsodium, Cairo/Pango,
  fontconfig/freetype/harfbuzz/fribidi, PNG/JPEG/TIFF and their ELF closure.
  Graphics resources support PNG previews and native R PDF output.
- Dowser's `treesToPDF` uses `grDevices::pdf`; no exposed Dowser path invokes
  TeX. Python and TeX are therefore absent from its final image.

Retained functionality includes heavy/light clone formatting, six tree
backends, discrete trait analysis, time evolution, internal sequences,
annotations, FASTA/table/JSON/PNG/PDF exports and ZIP creation.

## BrepPhylo dependencies

The independent roots are in
[runtime-packages.txt](../services/brepphylo/runtime-packages.txt); the complete
181-package closure and versions are in
[runtime-packages.lock.tsv](../services/brepphylo/runtime-packages.lock.tsv).

- Direct/optional roots: plumber, jsonlite, BrepPhylo **0.4.2**, ape, Biostrings,
  igraph, paws.storage, digest, phangorn and ragg. Important upstream imports:
  alakazam **1.3.0**, bio3d, ggmuller, msa, phytools, plyr, reticulate, seqinr,
  adephylo and IRanges. Its scientific dependencies intentionally differ from
  Dowser's; for example BiocParallel is **1.40.1**.
- Bioconductor dependencies include Biostrings **2.74.1**, msa **1.38.0**,
  GenomicRanges **1.58.0**, GenomicAlignments **1.42.0**, IRanges, S4Vectors,
  XVector, Rsamtools, SummarizedExperiment and their locked closure.
  `pwalign` is absent in the original BrepPhylo environment and is not added.
- Native tools: `dnapars`, IgPhyML and motif tables. ClustalW and ClustalOmega
  alignment implementations are compiled into msa; no separate MUSCLE CLI is
  needed by the service's exposed alignment choices.
- Python **3.13**, libpython, its standard library/native extensions, numpy
  **1.26.4**, scipy **1.11.3**, networkx **3.4.2**, and their shared libraries
  are copied from the original environment. `RETICULATE_PYTHON=/usr/bin/python3`
  prevents runtime Python downloads. BrepPhylo imports scipy lazily on load;
  its arborescence script uses networkx.
- The same native R/graphics/TLS/compression families as needed by its own ELF
  closure, plus the installed TeX runtime data/fonts/formats, pdflatex,
  texi2dvi and Perl helpers for alignment PDFs (`msa`'s bundled texshade files
  remain inside its package). Dowser's RAxML/dnaml tools are not copied here.

The existing msa 1.38.0 ClustalW path aborts on the raw ExampleAirr fixture
in both original and optimized images (exit 134, native FileParser assertion).
It is retained unchanged and tested as a child-job failure; a successful
ClustalW workflow is not claimed. ClustalOmega is the positive raw-alignment
and alignment-PDF regression path. See the verification report for evidence.

Retained functionality includes CSV/TSV validation, aligned/raw sequence paths,
reference/custom germlines, three tree types, both alignment algorithms,
PNG/PDF plots, optional alignment PDFs, CSR/arborescence analysis and ZIPs.

## Build-time versus runtime

Compilers (C/C++/Fortran), make, development headers, R installation tools,
remotes/BiocManager, archives, build sources, caches and unrelated suite
packages stay in builder stages. R package directories remain intact, including
runtime data, help/examples where packaged together, msa's Python/TeX helpers
and scientific references; deleting these indiscriminately would be unsafe.
The final images omit BLAST/IgBLAST, Change-O/pRESTO Python pipelines, pyarrow,
Seurat/plotly/gh, unrelated R packages, PHYLIP GUI archives and build tools.
BrepPhylo retains only its required Python modules rather than the full suite's
site-packages. The exact required library files are recorded in each manifest.

The assembly follows Docker's
[multi-stage build model](https://docs.docker.com/build/building/multi-stage/)
and R's documented
[dependency traversal](https://stat.ethz.ch/R-manual/R-devel/library/tools/html/package_dependencies.html).

## Build, run and validate

From the repository root (no additional package manager or host R required):

```bash
docker build --platform linux/amd64 -f services/dowser/Dockerfile -t phylo-dowser:optimized .
docker build --platform linux/amd64 -f services/brepphylo/Dockerfile -t phylo-brepphylo:optimized .
# Compose uses the same root context and Dockerfiles:
docker compose --profile dev build dowser brepphylo
docker compose --profile dev up -d dowser brepphylo
# Full framework startup remains the README's documented command.
```

For an individual service, keep contracts mounted and supply the same S3
settings/read-only staged input mount as Compose:

```bash
docker run --rm --init --platform linux/amd64 -p 8001:8001 \
  -v "$PWD/packages/contracts:/contracts:ro" phylo-dowser:optimized
# Replace image and use -p 8003:8003 for BrepPhylo.
```

This starts the API; actual jobs also require the documented `S3_*` settings
and input staging mounts. `/spec` is the existing readiness probe; no new
application health route was introduced. [CONFIGURATION.md](./CONFIGURATION.md)
remains the environment reference.

The `BREPPHYLO_COMMIT` build argument is retained. Deliberately changing a
scientific dependency requires reviewing the lock and rerunning regressions.
An optional `DEPENDENCY_IMAGE` argument can select an already verified,
immutable dependency image for offline assembly; by default Docker builds the
pinned `dependency-build` stage. Never point it at an unverified mutable tag
for a release. Version mismatches fail; native-tool provenance must also be
checked. Package-only version locks do not prove native ABI compatibility.

```bash
npm run test:r
docker compose -f docker-compose.test.yml up -d --wait postgres minio
.venv/bin/python scripts/init-test-services.py
.venv/bin/python -m pytest tests/docker/test_r_images.py -v
python3 scripts/measure-r-images.py
npm run test:all -- --build
```

The CSR supplement uses the unchanged `BrepPhylo/extdata/clone_188.csv`
example bundled with the pinned upstream package, because the project
ExampleAirr fixture has no isotype annotations. The project fixture itself is
not changed.

The explicit image regression suite expects original `:dev` and optimized
`:optimized` images; `R_BASELINE_TAG`/`R_OPTIMIZED_TAG` can select other tags.
For targeted debugging, `R_IMAGE_VARIANTS=alignment-pdf,clustal-omega` selects
only those optional variants; leave it unset for the complete comparison.
`R_IMAGE_TEST_NETWORK` can select a separate network for tests that do not use S3.
Preserve/tag originals before replacing them. To recreate the previous
architecture from the retained installation stage, build each Dockerfile with
`--target dependency-build` and tag it with your chosen baseline tag. It compares original/optimized
HTTP behavior, scientific outputs, artifact downloads, checksums, package
locks and every copied file's SHA-256, and builds from clean source contexts.
The full framework suite additionally covers API → worker → method → S3.

## Measured sizes

See [r-image-measurements.json](./r-image-measurements.json) for exact image
IDs and byte counts measured before modification and after runtime validation.
The comparison uses `docker image inspect .Size` consistently on Docker 29.6.2.
Docker Desktop's `docker image ls` uses a different display metric: the initial
images display 9.96 GB/9.81 GB and the unpacked optimized images display about
1.41 GB/2.51 GB. Before an image is first run/unpacked, that display is smaller.
Do not mix either rounded display metric with inspect bytes in calculations.
The script records both; neither metric is the marginal space freed while
shared layers and builder caches remain on disk.

Only actual measurements are reported in the validation report. Dependency
builder cache size and first-build downloads remain substantial; no cache,
volume or unrelated image was pruned during this work.
