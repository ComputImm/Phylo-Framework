# Export the runtime closure from the installed, scientifically pinned builder.
# LinkingTo headers and Suggests are not runtime dependencies. Optional packages
# exercised by the application are explicitly listed in runtime-packages.txt.
args <- commandArgs(trailingOnly = TRUE)
roots <- scan(args[1], what = character(), comment.char = "#", quiet = TRUE)
p <- installed.packages()
roots <- unique(c(roots, p[p[, "Priority"] %in% c("base", "recommended"), "Package"]))
deps <- sort(unique(c(roots, unlist(tools::package_dependencies(
  roots, db = p, which = c("Depends", "Imports"), recursive = TRUE
)))))
stopifnot(all(deps %in% rownames(p)), getRversion() == "4.4.3")
selected <- p[deps, c("Package", "Version", "LibPath"), drop = FALSE]
if (length(args) > 2L) {
  locked <- read.delim(args[3], stringsAsFactors = FALSE)
  stopifnot(identical(unname(selected[, "Package"]), locked$Package),
            identical(unname(selected[, "Version"]), locked$Version))
}
write.table(selected, args[2], sep = "\t", row.names = FALSE, quote = FALSE)
