# Demo videos

The site pages reference `.mp4` files in this folder by fixed names. Until a
file exists, its slot on the page shows a striped placeholder, so you can ship
the site first and add clips later.

## Expected files

| File | Page | Orientation | Suggested length |
|---|---|---|---|
| `antennahead-tuner-wbfm.mp4`      | antennahead.html | portrait 9:16 | 15–30 s |
| `antennahead-gqrx.mp4`            | antennahead.html | portrait 9:16 | 15–30 s |
| `antennahead-audio-delay.mp4`     | antennahead.html | portrait 9:16 | 15–30 s |
| `antennahead-scanner.mp4`         | antennahead.html | portrait 9:16 | 15–30 s |
| `controlbooth-build-pipeline.mp4` | controlbooth.html | landscape 16:9 | 20–40 s |
| `controlbooth-scheduled-recording.mp4` | controlbooth.html | landscape 16:9 | 20–40 s |

Names are matched literally in `antennahead.html` / `controlbooth.html`. To use
different names or add more, edit the `<source src="...">` lines there.

## Keeping the original take

`videos/source/` (gitignored) holds the full-length, 1x-speed, high-quality
master for each clip that's been sped up for the site — e.g.
`antennahead-audio-delay-master.mp4` next to the sped-up
`antennahead-audio-delay.mp4` above. Keep the master around if you might
want to re-cut or re-speed a clip later; it isn't a web asset and doesn't get
committed.

## Recording the iOS Simulator

Boot a simulator and run the AntennaHead web app in Safari inside it, then:

```bash
# start recording (H.264 keeps the file web-friendly and small)
xcrun simctl io booted recordVideo --codec h264 --mask ignored raw.mov
# ... drive the UI ...
# stop with Ctrl-C
```

`xcrun simctl io booted recordVideo` records the whole device screen. If you
want just the web view, crop in the compress step below.

## Compressing for the web

GitHub blocks files over 100 MB (warns at 50 MB) and GitHub Pages has a soft
~1 GB repo / 100 GB-month bandwidth budget. Aim for a few MB per clip.

```bash
# portrait phone clip, scaled to 750px wide, ~28 fps, no audio
ffmpeg -i raw.mov \
  -vf "scale=750:-2,fps=28" -an \
  -c:v libx264 -profile:v high -pix_fmt yuv420p -crf 26 -preset veryslow \
  -movflags +faststart \
  antennahead-tune-and-listen.mp4

# landscape desktop capture, 1280px wide, keep audio
ffmpeg -i raw.mov \
  -vf "scale=1280:-2,fps=30" \
  -c:v libx264 -pix_fmt yuv420p -crf 24 -preset veryslow \
  -c:a aac -b:a 96k -movflags +faststart \
  controlbooth-build-pipeline.mp4
```

`-movflags +faststart` moves the index to the front so the video starts
playing before it fully downloads. `-crf` is the quality knob: lower = better
and bigger (18 near-lossless, 28 noticeably compressed).

If a clip still ends up too large, shorten it, drop the fps to 24, or raise
`-crf` to 30. As a last resort, host it as an unlisted YouTube video and swap
the `<figure class="clip">` block for an `<iframe>` embed. **Do not** use Git
LFS &mdash; LFS-backed files are not served reliably over GitHub Pages.

## Optional poster frames

`antennahead.html` points `poster="assets/img/poster-*.png"` at still frames.
Grab one with:

```bash
ffmpeg -i antennahead-tune-and-listen.mp4 -vframes 1 -q:v 3 ../assets/img/poster-listen.png
```

Posters are optional &mdash; without them the first frame is shown once metadata loads.
