#!/usr/bin/env python3
"""Atomically publish an Astro build to the nginx webroot."""

from __future__ import annotations

import argparse
import os
import shutil
from pathlib import Path


def set_publish_permissions(root: Path) -> None:
    root.chmod(0o755)
    for path in root.rglob("*"):
        path.chmod(0o755 if path.is_dir() else 0o644)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, default=Path("dist"))
    parser.add_argument("--destination", type=Path, default=Path("/var/www/map-app"))
    args = parser.parse_args()

    source = args.source.resolve()
    destination = args.destination.resolve()
    if not source.is_dir() or not (source / "index.html").is_file():
        raise SystemExit(f"Refusing to deploy invalid build directory: {source}")
    if destination == Path("/"):
        raise SystemExit("Refusing to deploy over the filesystem root")

    destination.parent.mkdir(parents=True, exist_ok=True)
    staging = destination.with_name(f".{destination.name}.new")
    backup = destination.with_name(f".{destination.name}.old")
    shutil.rmtree(staging, ignore_errors=True)
    shutil.rmtree(backup, ignore_errors=True)
    shutil.copytree(source, staging)
    previous_assets = destination / "_astro"
    if previous_assets.is_dir():
        shutil.copytree(
            previous_assets,
            staging / "_astro",
            dirs_exist_ok=True,
            copy_function=lambda src, dst: dst
            if Path(dst).exists()
            else shutil.copy2(src, dst),
        )
    set_publish_permissions(staging)

    if destination.exists():
        os.replace(destination, backup)
    try:
        os.replace(staging, destination)
    except Exception:
        if backup.exists() and not destination.exists():
            os.replace(backup, destination)
        raise
    shutil.rmtree(backup, ignore_errors=True)
    print(f"Published {source} to {destination}")


if __name__ == "__main__":
    main()
