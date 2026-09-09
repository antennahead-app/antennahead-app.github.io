# antennahead-app.github.io

Project site for **[AntennaHead](https://github.com/dsward2/AntennaHead)** and
**[ControlBooth](https://github.com/dsward2/ControlBooth)** — a plain static
site (no Jekyll) served by GitHub Pages at **<https://antennahead-app.github.io>**.

Lives in the `antennahead-app` org (the plain `antennahead` name was already
taken); the app code stays under the personal `dsward2` account.

```
index.html            Overview / landing page
antennahead.html      AntennaHead: features, embedded live UI demo, videos
controlbooth.html     ControlBooth: features, videos
assets/               Shared CSS / JS / images for the three pages above
demo/                 Static copy of the AntennaHead web UI  (see demo/DEMO.md)
demo-overrides/        The 3 pre-rendered files build-demo.sh restores into demo/
videos/               Drop demo .mp4 files here  (see videos/README.md)
scripts/
  build-demo.sh       Re-sync demo/ from a local AntennaHead checkout
  record-demo.sh      Record the iOS Simulator + compress to videos/*.mp4
.nojekyll             Tell Pages to serve files as-is (needed: demo/ has _dirs)
```

## Local preview

```bash
python3 -m http.server 8777
# http://localhost:8777/            -> the site
# http://localhost:8777/demo/       -> the UI preview on its own
```

Opening the files over `file://` will not work — the demo uses `XMLHttpRequest`
to load its fragments.

## Publishing

Already published: pushing to `main` of `antennahead-app/antennahead.github.io`
rebuilds <https://antennahead-app.github.io> automatically (GitHub Pages,
source = branch `main`, path `/`). A build takes ~30 s; check status with:

```bash
gh api /repos/antennahead-app/antennahead-app.github.io/pages/builds/latest \
  --jq '{status, error: .error.message}'
```

All links in the pages are relative, so the site also works unchanged if it is
ever moved to a different repo, an `<org>.github.io` root, or a custom domain
(add a `CNAME` file for the latter).

## Adding the demo videos

`antennahead.html` and `controlbooth.html` reference fixed `.mp4` names in
`videos/`. Each slot shows a placeholder until the file exists. Record and
compress with `scripts/record-demo.sh` (or by hand — see `videos/README.md`),
commit the `.mp4`s, and push. Keep each clip to a few MB; do not use Git LFS
(Pages does not serve LFS files reliably).

## Keeping the demo in sync with the app

`demo/` is a checked-in copy of `AntennaHead/Web/`. After the UI changes
upstream:

```bash
scripts/build-demo.sh /path/to/AntennaHead
```

See `demo/DEMO.md` for what is overridden and why.
