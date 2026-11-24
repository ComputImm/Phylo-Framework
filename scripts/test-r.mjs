import {spawnSync} from 'node:child_process';
const root = process.cwd();
function run(args) {
  const result = spawnSync('docker', args, {stdio: 'inherit'});
  if (result.error || result.status !== 0) throw new Error('R tests/coverage failed');
}
for (const method of ['dowser', 'brepphylo']) {
  const image = `phylo-${method}:r-tests`;
  run(['build', '--platform', 'linux/amd64', '--target', 'test', '-f', `services/${method}/Dockerfile`, '-t', image, '.']);
  run(['run', '--rm', '--init', '--platform', 'linux/amd64',
    '-v', `${root}/services/${method}:/srv:ro`, '-v', `${root}/tests/r:/tests:ro`,
    '-v', `${root}/coverage:/coverage`, '-v', `${root}/packages/contracts:/contracts:ro`,
    '-e', `TEST_METHOD=${method}`, '--entrypoint', 'Rscript', image, '/tests/coverage.R']);
}
