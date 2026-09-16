#!/usr/bin/env bash
#
# record-demo.sh — record the booted iOS Simulator's screen and, for
# AntennaHead clips, its live audio stream, mux them, and compress the result
# to a web-ready MP4 in videos/.
#
# `xcrun simctl io <device> recordVideo` (used below) has NO audio option —
# checked against `xcrun simctl io booted recordVideo` usage: it only takes
# --codec/--display/--mask/--force. The Simulator's screen recorder never
# captures audio, so getting a synced soundtrack means recording the actual
# stream separately and muxing it in afterwards, which is what this script
# does for any output name starting with "antennahead-": it captures
# LiveAudioServer's live stream (default http://localhost:8080/stream.mp3,
# override with a 3rd argument) for the same span as the video.
#
# NOTE: this only works for AntennaHead, because its audio is reachable over
# the network. A ControlBooth clip is a *Mac desktop* recording (no Simulator
# involved) — this script does not record ControlBooth. See videos/README.md.
#
# Usage:
#   scripts/record-demo.sh <output-name> [portrait|landscape] [stream-url]
#
#   scripts/record-demo.sh antennahead-tune-and-listen portrait
#   scripts/record-demo.sh antennahead-scanner portrait
#   scripts/record-demo.sh antennahead-nowplaying portrait
#
# Press Ctrl-C to stop recording; muxing + compression run automatically
# afterwards.

set -euo pipefail

name="${1:?output name required, e.g. antennahead-scanner}"
mode="${2:-portrait}"
stream_url="${3:-http://localhost:8080/stream.mp3}"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
out="$here/videos/$name.mp4"
raw="$(mktemp -t recdemo).mov"
audio_raw="$(mktemp -t recdemo_audio).mp3"

command -v xcrun  >/dev/null || { echo "xcrun not found (install Xcode)"        >&2; exit 1; }
command -v ffmpeg >/dev/null || { echo "ffmpeg not found (brew install ffmpeg)" >&2; exit 1; }
command -v curl   >/dev/null || { echo "curl not found"                        >&2; exit 1; }

want_audio=false
case "$name" in antennahead-*) want_audio=true ;; esac

audio_pid=""
if $want_audio; then
  if curl -s -o /dev/null --max-time 2 "$stream_url"; then
    echo "Capturing live audio from $stream_url -> $audio_raw"
    curl -s --max-time 900 "$stream_url" -o "$audio_raw" &
    audio_pid=$!
    sleep 0.3   # let the audio connection open before video starts, so the two stay roughly aligned
  else
    echo "warning: $stream_url not reachable -- recording video only (is AntennaHead running with a live source?)" >&2
  fi
fi

echo "Recording booted simulator -> $raw"
echo "Drive the UI, then press Ctrl-C to stop."
trap 'echo; echo "stopped recording"' INT
xcrun simctl io booted recordVideo --codec h264 --mask ignored "$raw" || true
trap - INT

if [[ -n "$audio_pid" ]]; then
  kill "$audio_pid" 2>/dev/null || true
  wait "$audio_pid" 2>/dev/null || true
fi

[[ -s "$raw" ]] || { echo "no recording captured" >&2; exit 1; }

have_audio=false
[[ -n "$audio_pid" && -s "$audio_raw" ]] && have_audio=true

if [[ "$mode" == "landscape" ]]; then
  vf="scale=1280:-2,fps=30"; crf=24
else
  vf="scale=750:-2,fps=28"; crf=26
fi

echo "Compressing $mode -> $out  (audio: $have_audio)"
if $have_audio; then
  # -shortest: the audio capture keeps running a beat after Ctrl-C stops the
  # video, so it's always >= the video's length; trim to the video.
  ffmpeg -y -i "$raw" -i "$audio_raw" \
    -vf "$vf" -map 0:v:0 -map 1:a:0 \
    -c:v libx264 -pix_fmt yuv420p -crf "$crf" -preset veryslow \
    -c:a aac -b:a 128k -shortest \
    -movflags +faststart "$out"
else
  ffmpeg -y -i "$raw" -vf "$vf" -an \
    -c:v libx264 -pix_fmt yuv420p -crf "$crf" -preset veryslow \
    -movflags +faststart "$out"
fi

rm -f "$raw" "$audio_raw"
ls -lh "$out"
echo "Done. Commit videos/$name.mp4"
