#!/usr/bin/env bash
#
# record-demo.sh — record the booted iOS Simulator and compress the result to
# a web-ready MP4 in videos/.
#
# Usage:
#   scripts/record-demo.sh <output-name> [portrait|landscape]
#
#   scripts/record-demo.sh antennahead-tune-and-listen portrait
#   scripts/record-demo.sh controlbooth-build-pipeline landscape
#
# Press Ctrl-C to stop recording; compression runs automatically afterwards.

set -euo pipefail

name="${1:?output name required, e.g. antennahead-scanner}"
mode="${2:-portrait}"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
out="$here/videos/$name.mp4"
raw="$(mktemp -t recdemo).mov"

command -v xcrun  >/dev/null || { echo "xcrun not found (install Xcode)"    >&2; exit 1; }
command -v ffmpeg >/dev/null || { echo "ffmpeg not found (brew install ffmpeg)" >&2; exit 1; }

echo "Recording booted simulator -> $raw"
echo "Drive the UI, then press Ctrl-C to stop."
trap 'echo; echo "stopped recording"' INT
xcrun simctl io booted recordVideo --codec h264 --mask ignored "$raw" || true
trap - INT

[[ -s "$raw" ]] || { echo "no recording captured" >&2; exit 1; }

if [[ "$mode" == "landscape" ]]; then
  echo "Compressing landscape -> $out"
  ffmpeg -y -i "$raw" -vf "scale=1280:-2,fps=30" \
    -c:v libx264 -pix_fmt yuv420p -crf 24 -preset veryslow \
    -c:a aac -b:a 96k -movflags +faststart "$out"
else
  echo "Compressing portrait -> $out"
  ffmpeg -y -i "$raw" -vf "scale=750:-2,fps=28" -an \
    -c:v libx264 -profile:v high -pix_fmt yuv420p -crf 26 -preset veryslow \
    -movflags +faststart "$out"
fi

rm -f "$raw"
ls -lh "$out"
echo "Done. Commit videos/$name.mp4"
