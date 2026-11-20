#!/usr/bin/env python3
"""Record exact, comparable Docker measurements; never substitute estimates."""
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import subprocess


def command(*args):
    return subprocess.check_output(["docker", *args], text=True).strip()


def measure(reference):
    value = json.loads(command("image", "inspect", reference))[0]
    return {"tag": reference, "id": value["Id"], "platform": value["Os"] + "/" + value["Architecture"],
            "inspect_size_bytes": value["Size"],
            "image_ls_display": command("image", "ls", "--format", "{{.Size}}", reference)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--original-tag", default="dev")
    parser.add_argument("--optimized-tag", default="optimized")
    parser.add_argument("--out", type=Path, default=Path("coverage/r-image-optimization/measurements.json"))
    args = parser.parse_args()
    report = {"measured_at": datetime.now(timezone.utc).isoformat(),
              "methodology": "docker image inspect .Size (exact bytes), before/after on the same Docker engine; docker image ls displayed separately",
              "docker_server": command("version", "--format", "{{.Server.Version}}"), "services": {}}
    for service in ("dowser", "brepphylo"):
        original = measure(f"phylo-{service}:{args.original_tag}")
        optimized = measure(f"phylo-{service}:{args.optimized_tag}")
        if original["platform"] != optimized["platform"]:
            raise ValueError("Image platforms differ")
        reduction = original["inspect_size_bytes"] - optimized["inspect_size_bytes"]
        report["services"][service] = {"original": original, "optimized": optimized,
                                       "absolute_reduction_bytes": reduction,
                                       "reduction_percent": reduction / original["inspect_size_bytes"] * 100}
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
