# The large suite is a build environment only; none of its layers ship.
ARG DEPENDENCY_IMAGE=dependency-build
FROM immcantation/suite:4.6.0@sha256:81b5124bde572a97aec3924842621877072ac60804cde79dc3b14ab31b65cbd8 AS dependency-build

ENV DEBIAN_FRONTEND=noninteractive \
    CONTRACTS_DIR=/contracts \
    DNAPARS_PATH=/usr/local/bin/dnapars \
    IGPHYML_BIN=/usr/local/share/igphyml/src/igphyml \
    IGPHYML_MOTIFS=/usr/local/share/igphyml/src/motifs \
    IGPHYML_PATH=/usr/local/share/igphyml/src/motifs \
    STRICT_CONTRACT_ROUTES=true

RUN set -eux; \
    dnf -y install --setopt=install_weak_deps=False \
      libcurl-devel \
      openssl-devel \
      libxml2-devel \
      libgit2-devel \
      libpng-devel \
      libjpeg-turbo-devel \
      libtiff-devel \
      fontconfig-devel \
      freetype-devel \
      libuv-devel \
      fribidi-devel \
      harfbuzz-devel; \
    dnapars_bin="$(command -v dnapars || true)"; \
    if [ -n "$dnapars_bin" ]; then \
      if [ "$dnapars_bin" != "/usr/local/bin/dnapars" ]; then \
        ln -sf "$dnapars_bin" /usr/local/bin/dnapars; \
      else \
        echo "INFO: dnapars already at /usr/local/bin/dnapars"; \
      fi; \
    else \
      echo 'WARN: dnapars not found in base image'; \
    fi; \
    dnf clean all; \
    rm -rf /var/cache/dnf

RUN DOWNLOAD_STATIC_LIBV8=1 R -q -e "install.packages( \
    c('plumber', 'jsonlite', 'httpuv', 'swagger', 'jsonvalidate', 'httr', 'ape', 'igraph', 'remotes'), \
    repos = 'https://packagemanager.posit.co/cran/2026-07-20' \
    )" \
    && R -q -e "install.packages('BiocManager', repos = 'https://packagemanager.posit.co/cran/2026-07-20'); \
    options(repos = c(CRAN = 'https://packagemanager.posit.co/cran/2026-07-20')); \
    bioc_deps <- c('Biostrings','msa','GenomicRanges','GenomicAlignments'); \
    BiocManager::install(bioc_deps, ask = FALSE, update = FALSE); \
    stopifnot(all(bioc_deps %in% rownames(installed.packages())))"

# Keep native package compilation and BLAS backends within the builder's
# process/thread budget. This also prevents GCC's make integration from
# selecting every visible host CPU during dependency builds.
ENV MAKEFLAGS=-j1 \
    OMP_NUM_THREADS=1 \
    OMP_THREAD_LIMIT=1 \
    OPENBLAS_NUM_THREADS=1 \
    FLEXIBLAS_NUM_THREADS=1 \
    MKL_NUM_THREADS=1 \
    BLIS_NUM_THREADS=1 \
    RCPP_PARALLEL_NUM_THREADS=1

# Install BrepPhylo via a codeload tarball, NOT install_github.
# install_github goes through api.github.com which is rate-limited to 60 req/hr
# for unauthenticated users — Docker build retries silently exhausted the quota.
# codeload.github.com serves the raw tarball via CDN, no rate limit. stopifnot
# at the end fails the build loudly if BrepPhylo somehow didn't install.
# BrepPhylo's dependencies that the base image lacks come from the same dated
# CRAN snapshot as everything else, not from the CRAN of the build day (which
# had moved five of them by 2026-10-26); the version check covers those five.
# Install the dependencies and BrepPhylo in separate R processes. Keeping both
# in one remotes::install_local call retains the dependency-build heap until
# remotes forks R CMD build and can fail with ENOMEM on constrained builders.
ARG BREPPHYLO_COMMIT=7c52fb66e28ee3839a32633bf809f320f060c876
RUN curl -fsSL -o /tmp/brepphylo.tar.gz \
      "https://codeload.github.com/Fraternalilab/BrepPhylo/tar.gz/${BREPPHYLO_COMMIT}" \
    && mkdir /tmp/brepphylo-src \
    && tar -xzf /tmp/brepphylo.tar.gz --strip-components=1 -C /tmp/brepphylo-src \
    && rm -f /tmp/brepphylo.tar.gz

RUN R -q -e "options(Ncpus = 1L); \
             stopifnot('msa' %in% rownames(installed.packages())); \
             remotes::install_deps('/tmp/brepphylo-src', dependencies = TRUE, upgrade = 'never', \
                                   repos = 'https://packagemanager.posit.co/cran/2026-07-20')"

RUN R CMD INSTALL --no-multiarch /tmp/brepphylo-src \
    && R -q -e "stopifnot('BrepPhylo' %in% rownames(installed.packages())); \
                pins <- c(combinat = '0.0-8', expm = '1.0-0', optimParallel = '1.0-2', rncl = '0.8.9', vegan = '2.7-5'); \
                stopifnot(identical(vapply(names(pins), function(p) packageDescription(p, fields = 'Version'), ''), pins))" \
    && rm -rf /tmp/brepphylo-src

# paws.storage + digest installed AFTER BrepPhylo so they don't interfere with the
# upstream install chain. Required by services/brepphylo/object_storage.R to
# upload artifact files directly to MinIO.
RUN R -q -e "install.packages(c('paws.storage', 'digest'), repos = 'https://packagemanager.posit.co/cran/2026-07-20'); \
    stopifnot(all(c('paws.storage', 'digest') %in% rownames(installed.packages())))"

# msa 1.38.0's embedded ClustalW aborts inside its native FileParser on this
# toolchain. Install the official standalone 2.1 binary and its licence notices;
# the service adapter preserves msa's R return contract for BrepPhylo.
ARG CLUSTALW_BINARY_URL=https://ftp.ebi.ac.uk/pub/software/clustalw2/2.1/clustalw-2.1-linux-x86_64-libcppstatic.tar.gz
ARG CLUSTALW_BINARY_SHA256=e8d488db819789642b44945d238a50847f2505a1a0dd43d374fa7f29f9defcac
ARG CLUSTALW_SOURCE_URL=https://ftp.ebi.ac.uk/pub/software/clustalw2/2.1/clustalw-2.1.tar.gz
ARG CLUSTALW_SOURCE_SHA256=e052059b87abfd8c9e695c280bfba86a65899138c82abccd5b00478a80f49486
RUN curl -fsSL --retry 5 --retry-all-errors --connect-timeout 30 \
      -o /tmp/clustalw-bin.tar.gz "$CLUSTALW_BINARY_URL" \
    && echo "$CLUSTALW_BINARY_SHA256  /tmp/clustalw-bin.tar.gz" | sha256sum --check --strict \
    && curl -fsSL --retry 5 --retry-all-errors --connect-timeout 30 \
      -o /tmp/clustalw-src.tar.gz "$CLUSTALW_SOURCE_URL" \
    && echo "$CLUSTALW_SOURCE_SHA256  /tmp/clustalw-src.tar.gz" | sha256sum --check --strict \
    && tar -xzf /tmp/clustalw-bin.tar.gz -C /tmp \
    && tar -xzf /tmp/clustalw-src.tar.gz -C /tmp \
    && install -m 0755 /tmp/clustalw-2.1-linux-x86_64-libcppstatic/clustalw2 /usr/local/bin/clustalw2 \
    && ln -sf /usr/local/bin/clustalw2 /usr/local/bin/clustalw \
    && install -d /usr/share/licenses/clustalw \
    && install -m 0644 /tmp/clustalw-2.1/COPYING /tmp/clustalw-2.1/COPYING.LESSER /usr/share/licenses/clustalw/ \
    && { /usr/local/bin/clustalw2 -HELP >/tmp/clustalw-help.txt 2>&1 || [ "$?" -eq 1 ]; } \
    && grep -qi clustal /tmp/clustalw-help.txt \
    && rm -rf /tmp/clustalw-2.1 /tmp/clustalw-2.1-linux-x86_64-libcppstatic \
      /tmp/clustalw-bin.tar.gz /tmp/clustalw-src.tar.gz /tmp/clustalw-help.txt

# Security updates published for the base image's distribution since the base
# image was built. `--security` limits this to packages with a security
# advisory, so R and the scientific tools keep the versions the base image
# ships. Kept as the last system layer so the expensive layers above stay
# cached.
RUN dnf -y upgrade --security --setopt=install_weak_deps=False \
    && dnf clean all \
    && rm -rf /var/cache/dnf

# The base image's Python ships pyarrow 19.0.1 (CVE-2026-25087). Nothing here
# depends on it; raise it to the first fixed release, touching nothing else.
RUN python3 -m pip install --no-cache-dir --no-deps pyarrow==23.0.1

# BrepPhylo's class-switch analysis (cloneArborescence -> getArborescence) runs a
# bundled Python script through reticulate, and that script needs networkx.
# reticulate 1.42 does not pick up the system Python on its own: without
# RETICULATE_PYTHON it tries to download a managed Python at run time and the
# analysis fails with "Installation of Python not found".
ENV RETICULATE_PYTHON=/usr/bin/python3
RUN python3 -m pip install --no-cache-dir networkx==3.4.2

WORKDIR /srv
COPY services/brepphylo/validators.R /srv/validators.R
COPY services/brepphylo/clustalw_compat.R /srv/clustalw_compat.R
COPY services/brepphylo/plumber.R /srv/plumber.R
COPY services/brepphylo/resource_limits.R /srv/resource_limits.R
COPY services/brepphylo/job_manager.R /srv/job_manager.R
COPY services/brepphylo/job_runner.R /srv/job_runner.R
COPY services/brepphylo/artifact_manifest.R /srv/artifact_manifest.R
COPY services/brepphylo/object_storage.R /srv/object_storage.R

EXPOSE 8003

CMD ["R", "-q", "-e", "pr <- plumber::plumb('/srv/plumber.R'); pr$run(host='0.0.0.0', port=8003)"]

# A verified existing dependency image may be supplied for offline assembly.
# The default builds the original pinned environment above from source.
FROM ${DEPENDENCY_IMAGE} AS assemble
COPY services/r-runtime/assemble.py services/r-runtime/select-packages.R /build/runtime/
COPY services/brepphylo/runtime-packages* /build/
RUN Rscript /build/runtime/select-packages.R /build/runtime-packages.txt /build/packages.tsv /build/runtime-packages.lock.tsv \
    && python3 /build/runtime/assemble.py brepphylo /build/packages.tsv /runtime-root

FROM scratch AS runtime
COPY --from=assemble /runtime-root/ /
ENV DEBIAN_FRONTEND=noninteractive \
    CONTRACTS_DIR=/contracts \
    CLUSTALW_BIN=/usr/local/bin/clustalw2 \
    DNAPARS_PATH=/usr/local/bin/dnapars \
    IGPHYML_BIN=/usr/local/share/igphyml/src/igphyml \
    IGPHYML_MOTIFS=/usr/local/share/igphyml/src/motifs \
    IGPHYML_PATH=/usr/local/share/igphyml/src/motifs \
    STRICT_CONTRACT_ROUTES=true
ENV MAKEFLAGS=-j1 OMP_NUM_THREADS=1 OMP_THREAD_LIMIT=1 OPENBLAS_NUM_THREADS=1 FLEXIBLAS_NUM_THREADS=1 MKL_NUM_THREADS=1 BLIS_NUM_THREADS=1 RCPP_PARALLEL_NUM_THREADS=1 RETICULATE_PYTHON=/usr/bin/python3
ENV PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/usr/local/share/igphyml/src \
    LD_LIBRARY_PATH=/usr/lib64/R/lib:/usr/lib64/atlas
WORKDIR /srv
COPY services/brepphylo/*.R /srv/
# Check the actual final filesystem, not just the dependency builder.
RUN Rscript -e 'p <- read.delim("/usr/share/phylo-runtime/r-packages.tsv"); stopifnot(getRversion() == "4.4.3"); for (n in p$Package) { message("Loading ", n); loadNamespace(n) }; actual <- vapply(p$Package, function(n) packageDescription(n, fields="Version"), ""); print(data.frame(package=p$Package, expected=p$Version, actual=actual)[actual != p$Version,]); stopifnot(all(actual == p$Version))'
EXPOSE 8003
CMD ["R", "-q", "-e", "pr <- plumber::plumb('/srv/plumber.R'); pr$run(host='0.0.0.0', port=8003)"]

FROM ${DEPENDENCY_IMAGE} AS test-dependencies
COPY services/r-runtime /build/runtime
RUN Rscript /build/runtime/test-packages.R \
    && python3 /build/runtime/test-library.py

FROM runtime AS test
COPY --from=test-dependencies /test-root/ /

# The default target contains no testing packages or build tools.
FROM runtime AS production
