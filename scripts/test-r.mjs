import {spawnSync} from 'node:child_process';
const root = process.cwd();
function run(args) {
  const result = spawnSync('docker', args, {stdio: 'inherit'});
  if (result.error || result.status !== 0) throw new Error('R tests/coverage failed');
}
const shared = ['run', '--rm', '--platform', 'linux/amd64', '-v', 'phylo-tests-r-library:/r-library', '-e', 'R_LIBS_USER=/r-library'];
run([...shared, '--entrypoint', 'Rscript', 'phylo-dowser:latest', '-e',
  'if (!requireNamespace("covr", quietly=TRUE) || packageVersion("covr") != "3.6.5") install.packages("covr", repos="https://packagemanager.posit.co/cran/2026-07-20", type="source"); stopifnot(packageVersion("covr") == "3.6.5")']);
for (const method of ['dowser', 'brepphylo']) {
  run([...shared, '-v', `${root}/services/${method}:/srv:ro`, '-v', `${root}/tests/r:/tests:ro`,
    '-v', `${root}/coverage:/coverage`, '-v', `${root}/packages/contracts:/contracts:ro`,
    '-e', `TEST_METHOD=${method}`, '--entrypoint', 'Rscript', `phylo-${method}:latest`, '/tests/coverage.R']);
}
