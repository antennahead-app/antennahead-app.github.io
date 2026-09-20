#!/usr/bin/env bash
#
# build-demo.sh — refresh demo/ from a local AntennaHead checkout.
#
# The demo/ folder is a copy of AntennaHead/Web/ with two files replaced by
# pre-rendered, backend-free versions (demo/index.html, demo/index2.html) and
# one file added (demo/js/mock.js). This script re-copies everything else so
# the preview tracks the real UI, then restores those three files from
# demo-overrides/.
#
# Usage:
#   scripts/build-demo.sh [path-to-AntennaHead-repo]
#
# Default source: ../antennahead-umbrella/AntennaHead

set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
src="${1:-$here/../antennahead-umbrella/AntennaHead}"
web="$src/Web"

if [[ ! -d "$web" ]]; then
  echo "AntennaHead Web/ not found at: $web" >&2
  echo "Pass the path to your AntennaHead checkout as arg 1." >&2
  exit 1
fi

overrides="$here/demo-overrides"
mkdir -p "$overrides"

# On first run, capture the current pre-rendered overrides so a later re-copy
# can restore them.
for f in index.html index2.html js/mock.js; do
  if [[ -f "$here/demo/$f" && ! -f "$overrides/$f" ]]; then
    mkdir -p "$overrides/$(dirname "$f")"
    cp "$here/demo/$f" "$overrides/$f"
  fi
done

# DEMO.md is hand-written documentation that lives only in demo/; keep it across the re-copy.
keep_doc=""
if [[ -f "$here/demo/DEMO.md" ]]; then
  keep_doc="$(mktemp)"; cp "$here/demo/DEMO.md" "$keep_doc"
fi

echo "Copying $web -> $here/demo"
rm -rf "$here/demo"
mkdir -p "$here/demo"
cp -R "$web/." "$here/demo/"
# Upstream scratch/junk files that must not be published.
rm -f "$here/demo/default.profraw" "$here/demo/index.html.original"
find "$here/demo" -name .DS_Store -delete
if [[ -n "$keep_doc" ]]; then mv "$keep_doc" "$here/demo/DEMO.md"; fi

echo "Restoring pre-rendered overrides"
for f in index.html index2.html js/mock.js; do
  if [[ -f "$overrides/$f" ]]; then
    mkdir -p "$here/demo/$(dirname "$f")"
    cp "$overrides/$f" "$here/demo/$f"
  else
    echo "  WARNING: $overrides/$f missing — demo/$f is the raw app template" >&2
  fi
done

echo "Done. Preview locally with:  (cd '$here' && python3 -m http.server 8777)"
echo "then open http://localhost:8777/  and  /demo/index.html"
