#!/usr/bin/env python3
"""Fail if README.md's version claims have drifted from what this repo ships.

The README states two numbers by hand: the SDK's own semver and the busbar
OpenAPI `info.version` it was generated against. Both went stale silently once
already (the README claimed SDK `0.2.0` against spec `1.5.0` while the repo was
shipping `0.4.0` against `1.5.3`), because nothing checked them. This does.

Sources of truth:
  SDK version  -> package.json's `version` field (what npm actually publishes)
  spec version -> openapi.json's info.version

Two checks:
  1. The two marker bullets in README.md must name exactly those values.
  2. Outside the `### History` section (where old version numbers are the
     point), no busbar-shaped `1.x.y` token may disagree with the spec version.
     Put `version-check: ignore` on a line to exempt it.
"""

import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]

SDK_MARKER = "- **SDK version:** `{}`"
SPEC_MARKER = "- **Generated from:** busbar OpenAPI `info.version` `{}`"

readme = (ROOT / "README.md").read_text(encoding="utf-8")
spec_version = json.loads((ROOT / "openapi.json").read_text(encoding="utf-8"))["info"]["version"]

sdk_version = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))["version"]

failures = []

for label, line in (
    ("SDK version", SDK_MARKER.format(sdk_version)),
    ("spec version", SPEC_MARKER.format(spec_version)),
):
    if line not in readme:
        failures.append(f"{label}: README.md is missing the exact line: {line}")

# Everything from `### History` to the next same-or-higher heading is allowed to
# name older versions: that is what a history section is for.
body = re.sub(r"^### History\n(?:(?!^#{1,3} )[\s\S])*", "", readme, flags=re.MULTILINE)
for raw_line in body.split("\n"):
    if "version-check: ignore" in raw_line:
        continue
    for found in re.findall(r"\b1\.\d+\.\d+\b", raw_line):
        if found != spec_version:
            failures.append(
                f"README.md names busbar {found} outside the History section, "
                f"but this repo is generated from {spec_version}: {raw_line.strip()}"
            )

if failures:
    print("\n".join(f"::error::{f}" for f in failures), file=sys.stderr)
    sys.exit(1)

print(f"README version claims OK: SDK {sdk_version}, busbar spec {spec_version}")
