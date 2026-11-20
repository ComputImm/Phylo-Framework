# The large suite is a build environment only; none of its layers ship.
ARG DEPENDENCY_IMAGE=dependency-build
FROM immcantation/suite:4.6.0@sha256:81b5124bde572a97aec3924842621877072ac60804cde79dc3b14ab31b65cbd8 AS dependency-build

ENV DEBIAN_FRONTEND=noninteractive \
    CONTRACTS_DIR=/contracts \
    DNAPARS_PATH=/usr/local/bin/dnapars \
    DNAML_PATH=/usr/local/bin/dnaml \
    RAXML_BIN=/usr/local/bin/raxml-ng \
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
      wget \
      tar \
      gzip \
      texlive-scheme-basic \
      texlive-collection-latex \
      texlive-collection-latexrecommended \
      texlive-collection-latexextra \
      texlive-collection-fontsrecommended \
      texlive-latexmk || true; \
    for tool in dnapars dnaml; do \
      bin_path="$(command -v $tool || true)"; \
      if [ -n "$bin_path" ] && [ "$bin_path" != "/usr/local/bin/$tool" ]; then \
        ln -sf "$bin_path" "/usr/local/bin/$tool"; \
      fi; \
    done; \
    if ! command -v raxml-ng >/dev/null 2>&1; then \
      mkdir -p /tmp/raxml-ng && cd /tmp/raxml-ng; \
      wget -q https://github.com/amkozlov/raxml-ng/releases/download/1.2.2/raxml-ng_v1.2.2_linux_x86_64.zip; \
      unzip -q raxml-ng_*.zip || true; \
      if [ -f raxml-ng ]; then install -m 0755 raxml-ng /usr/local/bin/raxml-ng; fi; \
      cd / && rm -rf /tmp/raxml-ng; \
    fi; \
    if ! command -v pdflatex >/dev/null 2>&1; then \
      R -q -e "install.packages('tinytex', repos='https://packagemanager.posit.co/cran/2026-07-20'); tinytex::install_tinytex()" || true; \
    fi; \
    dnf clean all; \
    rm -rf /var/cache/dnf

RUN DOWNLOAD_STATIC_LIBV8=1 R -q -e "install.packages( \
    c('promises', 'later', 'webutils', 'sodium', 'plumber', 'jsonlite', 'httpuv', 'swagger', 'jsonvalidate', 'httr', 'ape', 'phangorn', 'remotes'), \
    repos = 'https://packagemanager.posit.co/cran/2026-07-20' \
    ); \
    install.packages('BiocManager', repos = 'https://packagemanager.posit.co/cran/2026-07-20'); \
    options(repos = c(CRAN = 'https://packagemanager.posit.co/cran/2026-07-20')); \
    BiocManager::install(c('Biostrings', 'ggtree'), ask = FALSE, update = FALSE); \
    stopifnot(all(c('promises', 'plumber', 'jsonvalidate') %in% rownames(installed.packages())))"

RUN R -q -e "install.packages(c('paws.storage', 'digest'), repos = 'https://packagemanager.posit.co/cran/2026-07-20'); \
    stopifnot(all(c('paws.storage', 'digest') %in% rownames(installed.packages())))"

# R packages at the versions of the image that produced the v3.0.0 runs
# (Dowser 2.4.1, alakazam 1.4.3, shazam 1.3.2). That image was built with
# BiocManager's default `update = TRUE`, which upgraded every outdated package
# of the base image from the CRAN of the build day, so later rebuilds drifted
# (Dowser 2.5.2 on 2026-10-25). `update = FALSE` above now keeps the base
# image's versions, and this layer installs the archived version of every
# package in the dependency tree of the packages the service loads whose
# version differs from the base image: CRAN packages from the 2026-07-27
# snapshot, the first that holds all of these versions, and BiocParallel and
# pwalign from Bioconductor 3.20. The build fails if any version differs.
RUN R -q -e "options(repos = c(CRAN = 'https://packagemanager.posit.co/cran/2026-07-27')); \
    pins <- c( \
      BH = '1.90.0-1', BiocParallel = '1.40.2', MASS = '7.3-66', Matrix = '1.7-6', \
      Rcpp = '1.1.2', RcppArmadillo = '15.4.2-1', S7 = '0.2.2', V8 = '8.2.0', \
      ade4 = '1.7-24', airr = '2.0.0', alakazam = '1.4.3', aplot = '0.3.1', \
      base64enc = '0.1-6', bit64 = '4.8.2', cli = '3.6.6', clipr = '0.8.1', \
      commonmark = '2.0.0', cpp11 = '0.5.5', curl = '7.1.0', digest = '0.6.39', \
      diptest = '0.77-2', dowser = '2.4.1', dplyr = '1.2.1', fastmatch = '1.1-8', \
      futile.logger = '1.4.9', generics = '0.1.4', ggfun = '0.2.1', ggplot2 = '4.0.3', \
      ggplotify = '0.1.3', glue = '1.8.1', gridExtra = '2.3.1', hms = '1.1.4', \
      httpuv = '1.6.17', httr = '1.4.8', httr2 = '1.3.0', igraph = '2.3.3', \
      isoband = '0.3.0', jsonvalidate = '1.5.0', later = '1.4.8', lattice = '0.22-9', \
      lazyeval = '0.2.3', lifecycle = '1.0.5', litedown = '0.10', magrittr = '2.0.5', \
      nlme = '3.1-170', openssl = '2.4.2', otel = '0.2.0', patchwork = '1.3.2', \
      paws.common = '0.8.10', paws.storage = '0.10.0', pillar = '1.11.1', \
      pixmap = '0.4-14', plumber = '1.3.3', promises = '1.5.0', purrr = '1.2.2', \
      pwalign = '1.2.0', rappdirs = '0.3.4', readr = '2.2.0', rlang = '1.3.0', \
      scales = '1.4.0', segmented = '2.2-1', seqinr = '4.2-44', shazam = '1.3.2', \
      sp = '2.2-3', stringr = '1.6.0', swagger = '5.32.1', tibble = '3.3.1', \
      tidyr = '1.3.2', tidytree = '0.4.8', utf8 = '1.2.6', vctrs = '0.7.3', \
      viridisLite = '0.4.3', vroom = '1.7.1', webutils = '1.2.3', withr = '3.0.3', \
      xfun = '0.60', xml2 = '1.6.0', yaml = '2.3.12', yulab.utils = '0.2.4'); \
    installed <- function() vapply(names(pins), function(p) \
      as.character(suppressWarnings(packageDescription(p, fields = 'Version'))), ''); \
    current <- installed(); \
    install.packages(names(pins)[is.na(current) | current != pins], repos = BiocManager::repositories()); \
    current <- installed(); \
    differ <- is.na(current) | current != pins; \
    print(cbind(pinned = pins, installed = current)[differ, , drop = FALSE]); \
    stopifnot(!any(differ))"

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

WORKDIR /srv
COPY services/dowser/validators.R services/dowser/data_io.R services/dowser/format_clones.R services/dowser/tree_build.R services/dowser/dta.R services/dowser/time_evolution.R services/dowser/internal_seqs.R services/dowser/exports.R services/dowser/handlers.R services/dowser/plumber.R services/dowser/resource_limits.R services/dowser/job_manager.R services/dowser/job_runner.R services/dowser/artifact_manifest.R services/dowser/object_storage.R /srv/

EXPOSE 8001

CMD ["R", "-q", "-e", "pr <- plumber::plumb('/srv/plumber.R'); pr$run(host='0.0.0.0', port=8001)"]

# A verified existing dependency image may be supplied for offline assembly.
# The default builds the original pinned environment above from source.
FROM ${DEPENDENCY_IMAGE} AS assemble
COPY services/r-runtime/assemble.py services/r-runtime/select-packages.R /build/runtime/
COPY services/dowser/runtime-packages* /build/
RUN Rscript /build/runtime/select-packages.R /build/runtime-packages.txt /build/packages.tsv /build/runtime-packages.lock.tsv \
    && python3 /build/runtime/assemble.py dowser /build/packages.tsv /runtime-root

FROM scratch AS runtime
COPY --from=assemble /runtime-root/ /
ENV DEBIAN_FRONTEND=noninteractive \
    CONTRACTS_DIR=/contracts \
    DNAPARS_PATH=/usr/local/bin/dnapars \
    DNAML_PATH=/usr/local/bin/dnaml \
    RAXML_BIN=/usr/local/bin/raxml-ng \
    IGPHYML_BIN=/usr/local/share/igphyml/src/igphyml \
    IGPHYML_MOTIFS=/usr/local/share/igphyml/src/motifs \
    IGPHYML_PATH=/usr/local/share/igphyml/src/motifs \
    STRICT_CONTRACT_ROUTES=true
ENV PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/usr/local/share/igphyml/src \
    LD_LIBRARY_PATH=/usr/lib64/R/lib:/usr/lib64/atlas
WORKDIR /srv
COPY services/dowser/*.R /srv/
# Check the actual final filesystem, not just the dependency builder.
RUN Rscript -e 'p <- read.delim("/usr/share/phylo-runtime/r-packages.tsv"); stopifnot(getRversion() == "4.4.3"); for (n in p$Package) { message("Loading ", n); loadNamespace(n) }; actual <- vapply(p$Package, function(n) packageDescription(n, fields="Version"), ""); print(data.frame(package=p$Package, expected=p$Version, actual=actual)[actual != p$Version,]); stopifnot(all(actual == p$Version))'
EXPOSE 8001
CMD ["R", "-q", "-e", "pr <- plumber::plumb('/srv/plumber.R'); pr$run(host='0.0.0.0', port=8001)"]

FROM ${DEPENDENCY_IMAGE} AS test-dependencies
COPY services/r-runtime /build/runtime
RUN Rscript /build/runtime/test-packages.R \
    && python3 /build/runtime/test-library.py

FROM runtime AS test
COPY --from=test-dependencies /test-root/ /

# The default target contains no testing packages or build tools.
FROM runtime AS production
