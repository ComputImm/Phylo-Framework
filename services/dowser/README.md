# Dowser service runtime

The Plumber API starts from `plumber.R`; asynchronous jobs run through
`job_manager.R` and `job_runner.R`, and upload artifacts directly to S3.
Scientific source and API behavior are unchanged by the image optimization.

Build from the **repository root**, using R 4.4.3 and the service's independent
[runtime package roots](./runtime-packages.txt) and
[complete version lock](./runtime-packages.lock.tsv):

```bash
docker build --platform linux/amd64 -f services/dowser/Dockerfile -t phylo-dowser:optimized .
```

Runtime dependencies, native tools, optional analysis/export paths, build/test
stages, run commands, environment compatibility and exact image measurements
are documented in [R-IMAGES.md](../../docs/R-IMAGES.md). Test setup is in
[TESTING.md](../../docs/TESTING.md).
