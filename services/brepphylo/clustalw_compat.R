# Run ClustalW through its standalone executable. The ClustalW code embedded in
# msa aborts the R process on this toolchain, so it cannot be caught as an R
# error. This adapter retains msa's return type for BrepPhylo::cloneLineage.

resolve_clustalw_executable <- function(candidate = Sys.getenv("CLUSTALW_BIN", "")) {
  if (!nzchar(candidate)) candidate <- Sys.which("clustalw2")
  if (!nzchar(candidate)) candidate <- Sys.which("clustalw")
  if (!nzchar(candidate)) {
    stop("ClustalW executable not found. Set CLUSTALW_BIN or install clustalw2 on PATH.")
  }

  path <- normalizePath(candidate, mustWork = FALSE)
  if (!file.exists(path) || file.access(path, 1) != 0) {
    stop(sprintf("ClustalW executable is missing or not executable: %s", path))
  }
  path
}

external_msa_clustalw <- function(
    inputSeqs,
    cluster = "default",
    gapOpening = "default",
    gapExtension = "default",
    maxiters = "default",
    substitutionMatrix = "default",
    type = "default",
    order = c("aligned", "input"),
    verbose = FALSE,
    help = FALSE,
    ...,
    executable = resolve_clustalw_executable()) {
  if (isTRUE(help)) {
    cat(system2(executable, "-HELP", stdout = TRUE, stderr = TRUE), sep = "\n")
    return(invisible(NULL))
  }
  if (length(list(...))) {
    stop("Additional ClustalW parameters are not supported by the BrepPhylo adapter.")
  }

  sequence_type <- if (inherits(inputSeqs, "DNAStringSet")) {
    "dna"
  } else if (inherits(inputSeqs, "RNAStringSet")) {
    "rna"
  } else if (inherits(inputSeqs, "AAStringSet")) {
    "protein"
  } else {
    tolower(as.character(type)[1])
  }
  if (!identical(sequence_type, "dna")) {
    stop("The BrepPhylo ClustalW adapter accepts DNAStringSet input only.")
  }
  if (!inherits(inputSeqs, "DNAStringSet")) {
    inputSeqs <- Biostrings::DNAStringSet(inputSeqs)
  }

  order <- match.arg(order)
  cluster <- if (identical(cluster, "default")) "NJ" else toupper(as.character(cluster)[1])
  if (!cluster %in% c("NJ", "UPGMA")) stop("cluster must be 'NJ' or 'UPGMA'.")

  workspace <- tempfile("clustalw-")
  dir.create(workspace, mode = "0700")
  on.exit(unlink(workspace, recursive = TRUE, force = TRUE), add = TRUE)
  input_path <- file.path(workspace, "input.fasta")
  output_path <- file.path(workspace, "output.aln")

  original_names <- names(inputSeqs)
  names(inputSeqs) <- paste0("Seq", seq_along(inputSeqs))
  Biostrings::writeXStringSet(inputSeqs, input_path, format = "fasta")

  args <- c(
    paste0("-INFILE=", input_path),
    paste0("-OUTFILE=", output_path),
    "-ALIGN",
    "-TYPE=DNA",
    "-OUTPUT=CLUSTAL",
    paste0("-OUTORDER=", if (identical(order, "input")) "INPUT" else "ALIGNED"),
    paste0("-CLUSTERING=", cluster)
  )
  if (!isTRUE(verbose)) args <- c(args, "-QUIET")
  if (!identical(gapOpening, "default")) args <- c(args, paste0("-GAPOPEN=", abs(as.numeric(gapOpening))))
  if (!identical(gapExtension, "default")) args <- c(args, paste0("-GAPEXT=", abs(as.numeric(gapExtension))))
  if (!identical(maxiters, "default")) args <- c(args, paste0("-NUMITER=", as.integer(maxiters)))
  if (!identical(substitutionMatrix, "default")) {
    matrix_name <- toupper(as.character(substitutionMatrix)[1])
    if (!matrix_name %in% c("IUB", "CLUSTALW")) {
      stop("DNA substitutionMatrix must be 'IUB' or 'clustalw'.")
    }
    args <- c(args, paste0("-DNAMATRIX=", matrix_name))
  }

  command_output <- system2(executable, args, stdout = TRUE, stderr = TRUE)
  status <- attr(command_output, "status")
  if (!is.null(status) && status != 0L) {
    stop(sprintf("ClustalW failed with exit %d: %s", status, paste(command_output, collapse = "\n")))
  }
  if (!file.exists(output_path) || file.info(output_path)$size == 0) {
    stop(sprintf("ClustalW produced no alignment: %s", paste(command_output, collapse = "\n")))
  }

  convert <- get("convertAlnRows", envir = asNamespace("msa"))
  result <- convert(readLines(output_path, warn = FALSE), "dna")
  permutation <- match(names(result@unmasked), names(inputSeqs))
  if (anyNA(permutation)) stop("ClustalW output sequence names could not be mapped to the input.")
  names(result@unmasked) <- if (length(original_names)) original_names[permutation] else NULL
  result@params <- list(
    cluster = cluster,
    gapOpening = gapOpening,
    gapExtension = gapExtension,
    maxiters = maxiters,
    substitutionMatrix = substitutionMatrix,
    verbose = verbose,
    executable = executable
  )
  result@call <- deparse(sys.call())
  result
}

with_external_clustalw <- function(expr, executable = resolve_clustalw_executable()) {
  namespace <- asNamespace("msa")
  original <- get("msaClustalW", envir = namespace)
  replacement <- function(...) external_msa_clustalw(..., executable = executable)
  environment(replacement) <- environment()

  was_locked <- bindingIsLocked("msaClustalW", namespace)
  if (was_locked) unlockBinding("msaClustalW", namespace)
  assign("msaClustalW", replacement, envir = namespace)
  if (was_locked) lockBinding("msaClustalW", namespace)

  on.exit({
    locked <- bindingIsLocked("msaClustalW", namespace)
    if (locked) unlockBinding("msaClustalW", namespace)
    assign("msaClustalW", original, envir = namespace)
    if (locked) lockBinding("msaClustalW", namespace)
  }, add = TRUE)

  force(expr)
}
