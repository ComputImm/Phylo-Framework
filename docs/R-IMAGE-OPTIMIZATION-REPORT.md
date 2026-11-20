# Phase 2: R image optimization verification report

Validation date: 2026-11-17 (Asia/Tehran). This records measured results;
limitations are explicit. Implementation and rebuild instructions are in
[R-IMAGES.md](./R-IMAGES.md).

## A. Initial architecture analysis

Both services previously shipped all layers of `immcantation/suite:4.6.0`
(Fedora 41, R 4.4.3) plus service-specific dependency installations. Baselines
were inspected before any Dockerfile modification, using the locally installed
`phylo-dowser:dev` and `phylo-brepphylo:dev` images. The architecture assessment
was presented before implementation.

The source inspection covered both complete R service trees, including
formatting, inference, trait/time analysis, internal sequences, exports,
validation, asynchronous child jobs, resource limits, manifests and direct S3
uploads. Installed upstream package functions exposed BrepPhylo's Python/CSR,
msa and TeX dependencies. Compose, startup scripts, contracts, API preprocessing,
worker clients, CI, existing tests and documentation were reviewed. Dowser and
BrepPhylo's package sets were analyzed independently.

The principal opportunity was eliminating inherited layers and unrelated suite
components. Moving compiled R packages between distributions would add ABI,
BLAS and native-tool compatibility risks. The implementation instead assembles
ABI-compatible runtimes from a digest-pinned scientific build environment.

## B. Dowser optimization

- Original base: `immcantation/suite:4.6.0`. Final base: `scratch`; the pinned
  suite remains only a dependency builder.
- R: 4.4.3; Bioconductor 3.20. Runtime lock: 160 packages, including Dowser
  2.4.1, alakazam 1.4.3, shazam 1.3.2, Biostrings, ggtree, phangorn, plumber,
  jsonvalidate/V8, readr, paws.storage, digest and the graphics closure.
- Native tools: PHYLIP dnapars/dnaml, RAxML-NG 1.2.2 and IgPhyML 2.0.0 092223,
  with its complete motif tables. Original binary/resource bytes are retained.
- Runtime system requirements: libR; C/C++/Fortran/OpenMP libraries,
  FlexiBLAS/ATLAS/OpenBLAS; curl/OpenSSL, ICU, XML/compression, libsodium,
  Cairo/Pango/fontconfig/freetype/harfbuzz/fribidi and image libraries, fonts,
  locale/timezone and TLS/NSS/crypto data. Recursive ELF resolution and explicit
  dlopen resources determine the actual files rather than a broad OS install.
- Build-only: compilers, headers, make, remotes/BiocManager, package archives,
  suite utilities and testing dependencies. Python and TeX do not ship:
  Dowser's PDF exporter calls R's native PDF device.
- Dockerfile: separate dependency, assembly, production and test stages;
  independent closure/version check; actual final-runtime namespace loading;
  unchanged R startup command, port 8001, working directory and app source.

## C. BrepPhylo optimization

- Original base: `immcantation/suite:4.6.0`. Final base: `scratch`; same pinned
  scientific builder strategy, independently selected runtime contents.
- R: 4.4.3; Bioconductor 3.20; BrepPhylo 0.4.2 at commit
  `7c52fb66e28ee3839a32633bf809f320f060c876`. Its 181-package lock retains
  alakazam 1.3.0, msa 1.38.0, Biostrings, GenomicRanges/GenomicAlignments,
  ape, igraph, bio3d, phytools, adephylo, reticulate, plumber, paws.storage,
  digest and its own graphics closure. These versions are intentionally not
  replaced with Dowser's versions.
- Native scientific tools: dnapars, IgPhyML and motif tables; ClustalW/
  ClustalOmega are compiled into msa. RAxML-NG and dnaml are not copied here.
- Runtime system libraries: the ABI/graphics/TLS/compression families needed
  by this service's ELF closure. Retain Python 3.13/libpython/standard library,
  numpy 1.26.4, scipy 1.11.3, networkx 3.4.2 and required shared libraries;
  `RETICULATE_PYTHON` prevents runtime environment downloads. TeX fonts/data/
  prebuilt formats, pdflatex, texi2dvi and Perl helpers preserve alignment PDFs.
- Build-only: scientific compilation tools/headers, installation tooling,
  archives, caches, test tooling and unrelated Python/R suite components.
- Dockerfile: the same stage separation with its own lock and resources;
  unchanged scientific source, port 8003, thread settings and R startup.

## D. Measured comparison

Exact `docker image inspect .Size` bytes, on the same Docker 29.6.2 engine:

| Service | Original Image Size | Optimized Image Size | Absolute Reduction | Percentage Reduction |
|---|---:|---:|---:|---:|
| Dowser | 2,936,472,566 B | 389,717,244 B | 2,546,755,322 B | 86.73% |
| BrepPhylo | 2,910,623,661 B | 694,384,705 B | 2,216,238,956 B | 76.14% |

Formula: `(original - optimized) / original * 100`.
Tags, immutable IDs, platform, exact byte counts, measurement timestamp and
Docker version are recorded in [r-image-measurements.json](./r-image-measurements.json).
Docker Desktop's separate `image ls` display, after running/unpacking, is
9.96 GB → 1.41 GB for Dowser and 9.81 GB → 2.51 GB for BrepPhylo.
These rounded display values are not used in percentage calculations. Build
caches/shared layers remain installed; these numbers do not promise equivalent
free disk space after deleting one tag.

Both final images omit BLAST/IgBLAST, Change-O/pRESTO Python pipelines,
pyarrow, unrelated R packages (including gh/plotly), compilers, headers,
build caches/sources and unused PHYLIP GUIs. Complete installed runtime package
directories, scientific resources and licence notices remain intact.

## E. Documentation changes

- Root README: replace obsolete runtime-size statements and explain build-cache
  space; link the runtime architecture.
- Both service READMEs: root-context build commands, locks and runtime guidance.
- DEVELOPMENT: correct R/Bioconductor requirements and independent package sets.
- DEPLOYMENT / CONFIGURATION: root build context, preserved amd64 ABI, ports,
  mounts and credentials.
- TESTING: separate test targets instead of compiling covr inside production;
  explicit image regression commands.
- SECURITY-AUDIT: selective runtime contents, removed gh/plotly exceptions,
  retained Fedora EOL limitation and absent package-manager/OS scan coverage.
- R-IMAGES: architecture, separate dependencies, build/runtime split,
  repeatability, operation, measurements and regression procedure.
- This report and the machine-readable measurements retain validation evidence.

Historical audit counts and synthetic old-Dockerfile test fixtures are labelled
or remain historical; legitimate builder references to the old suite remain.

## F. Test results

| Command | Actual result |
|---|---|
| `npm run test:all -- --build` | Exit 0: 126 contract tests, 276 web tests, TypeScript checking, 1,317 Python tests, all image builds, 14 scientific/E2E cases, 101 browser tests, both R suites and all coverage gates passed |
| Browser device exclusions in that run | 32 existing tests skipped for nonmatching device profiles; not counted as passed |
| `node scripts/test-r.mjs` | Both separate test targets built; Dowser validators/orchestration and both services' lifecycle/manifest/resource assertions passed |
| R coverage | Dowser modules 51.65738%; BrepPhylo modules 76.78571%; executable entrypoints are exercised by real HTTP E2E, not counted as whole-service line coverage |
| `npm run lint` | Exit 0, existing unused-disable/import warnings |
| `npm run build` | Exit 0 with network access; initial sandbox-only attempt could not fetch existing Google Fonts |
| Deployment/config/version checks | 161 passed in the targeted combined run |
| Documentation/runtime checks | 130 passed in the targeted combined run |
| `.venv/bin/python -m pytest tests/docker/test_r_images.py -v` | 13 passed, 0 skipped; 655.05 seconds in the final complete comparison |
| `npm run test:system -- -k 'memory or kernel or 64_cores'` | 5 passed, 13 deselected: real kernel OOM/job survival, service restart for both R services, and Dowser CPU clamping |
| `git diff --check` | Passed |

The original/default image workflows completed actual reconstruction, preserved
exact trees, annotations and clone metadata, and matched artifact names, ZIP
members and downloaded S3 checksums. Dowser internal-sequence/node details
matched exactly. All copied dependency files were SHA-256-checked against the
original images, and final runtime locks matched. Both final images built from
clean source contexts, using cached scientific dependency layers.

The extended Dowser matrix passed all six supported backends after using the
appropriate `mod3=true` setting for IgPhyML. BrepPhylo's simple and IgPhyML
paths passed, and the existing annotated upstream CSR example produced 12 events
and matching arborescence results in both images. Raw ClustalOmega alignment
and alignment PDFs passed with PDFs verified inside the generated ZIPs. The
complete image harness passed all 13 cases, including clean build contexts,
explicit dependency-image build arguments and the known ClustalW child-abort
error contract. The ClustalW case verifies preserved failure reporting and
parent-service survival; it is not counted as a successful ClustalW alignment.

## G. Modified files by category

- Dockerfiles: `services/dowser/Dockerfile`, `services/brepphylo/Dockerfile`.
- Dependency manifests: each service's `runtime-packages.txt` and
  `runtime-packages.lock.tsv`.
- Build/test scripts: `services/r-runtime/assemble.py`, `select-packages.R`,
  `test-packages.R`, `test-library.py`; `scripts/test-r.mjs`,
  `scripts/method-services.mjs`, `scripts/measure-r-images.py`; scanner
  documentation in `scripts/scan_images.py`.
- Configuration: root/test Compose build contexts,
  `config/method-services.json`; related CI comments and R advisory exceptions.
- Tests: `tests/deployment/test_r_runtime.py`, `tests/docker/test_r_images.py`.
- Documentation: README.md; both service README.md files;
  docs/CONFIGURATION.md, DEPLOYMENT.md, DEVELOPMENT.md, SECURITY-AUDIT.md,
  TESTING.md, R-IMAGES.md, R-IMAGE-OPTIMIZATION-REPORT.md,
  r-image-measurements.json.

No application R source, scientific algorithm, API implementation, dataset,
retention, cleanup, input/output semantics or unrelated frontend code changed.

## H. Remaining risks and limits

- Fedora 41 remains EOL. Selective packaging does not provide a supported OS
  or comprehensive OS vulnerability scanning. No RPM database/package manager
  is copied, so the scanner's distribution-update fallback is unavailable.
- Builders are still large and need network access on a fresh installation;
  dependency caches make normal rebuilds fast. Clean-context builds do not
  prove a cache-free download/recompile of all scientific dependencies.
- Both images require amd64. A native ARM port would need separate builds and
  scientific regression, not a platform-label change.
- The existing raw BrepPhylo single-clone response unboxes array fields such
  as `trees`, contrary to its service schema. Original/optimized behavior is
  identical; application behavior was deliberately preserved. The orchestrator
  normalizes method results and is checked separately by full scientific E2E.
- The ExampleAirr fixture with `mod3=false` is rejected by IgPhyML in both
  images because the aligned length is not a multiple of three. IgPhyML tests
  use the exposed `mod3=true` option; the fixture itself is unchanged.
- Positive CSR testing additionally uses the existing upstream bundled
  `clone_188.csv`, since every `c_call` value in the project fixture is empty.
  Neither input file is modified.
- Existing msa 1.38.0 ClustalW raw-sequence execution aborts in both the
  original and optimized images: exit 134, `OOMKilled=false`, with the same
  `clustalw::FileParser` / `std::auto_ptr` assertion. This is not an image-size
  regression and has not been fixed by changing scientific code. Positive raw
  alignment/PDF validation uses ClustalOmega; ClustalW success is not claimed.
- Optional `DEPENDENCY_IMAGE` overrides must refer to a trusted immutable
  dependency image. Version checks fail on R drift; native file provenance
  must also be validated, as in the baseline checksum tests.
- Sample workflows and binary identity do not exhaust all species, large data,
  seeds, trait models or custom reference combinations. No production deploy.

## I. Final verification checklist

| Requirement | Verified result |
|---|---|
| Dowser optimized and built | Yes; final `scratch` runtime and dependency/test targets built |
| BrepPhylo optimized and built | Yes; separate runtime, Python/TeX resources and test target built |
| Both images smaller | Yes; 86.73% / 76.14% reductions using exact inspect bytes |
| Required R packages available | Yes; all 160 / 181 locked packages loaded in final filesystems |
| Required shared libraries available | Yes; recursive ELF resolution, namespace loading, real workflows and original-file SHA-256 checks |
| Required external executables/resources available | Yes; all configured native backends, motif tables, ZIP/process tools and BrepPhylo PDF/Python paths checked |
| Container/R/API initialization and readiness | Yes; both images, original comparison and full framework startup |
| Representative reconstruction and outputs | Yes; project ExampleAirr fixture in both services; six Dowser backends, three BrepPhylo tree types, raw ClustalOmega, PDF and upstream CSR supplement |
| ClustalW positive execution | No success claimed; existing native abort reproduced in both images; child error reporting and parent survival verified |
| API/output compatibility | Yes at framework contract layer; raw original/optimized behavior matches, including the existing single-tree BrepPhylo schema discrepancy |
| Object-storage integration | Yes; direct uploads, downloads, byte counts and SHA-256 checksums through real S3-compatible storage |
| Existing tests | Full applicable runner passed, including API/backend, scientific, browser, R and coverage gates; 32 existing device-specific browser skips reported separately |
| New tests | All 13 image tests and seven runtime/configuration unit tests passed |
| Resource/orchestration compatibility | Five focused existing kernel/CPU system tests passed; other 13 system scenarios were not selected in that targeted run |
| Clean build context and build argument | Both services passed clean-context default builds and verified-dependency-image argument builds |
| Cache-free scientific recompilation | Not executed; scientific dependency layers were cached |
| Documentation updated | Yes; documentation/link/command validation passed |
| Unrelated functionality changed | No; application R/API/frontend/scientific source, fixture data, retention and cleanup behavior unchanged |
| Production deployed | No; only local images and isolated test stacks were built/run |
