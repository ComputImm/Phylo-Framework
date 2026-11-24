# Test tooling stays in a separate image target, with compilers in the builder.
options(repos = c(CRAN = "https://packagemanager.posit.co/cran/2026-07-20"))
if (!requireNamespace("covr", quietly = TRUE)) install.packages("covr")
stopifnot(packageVersion("covr") == "3.6.5")
p <- installed.packages()
roots <- c("covr", "testthat", "withr")
deps <- sort(unique(c(roots, unlist(tools::package_dependencies(
  roots, db = p, which = c("Depends", "Imports"), recursive = TRUE
)))))
stopifnot(all(deps %in% rownames(p)))
write.table(p[deps, c("Package", "Version", "LibPath")], "/build/test-packages.tsv",
            sep = "\t", row.names = FALSE, quote = FALSE)
