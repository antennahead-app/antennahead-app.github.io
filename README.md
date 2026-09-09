# antennahead.github.io

Project site for **[AntennaHead](https://github.com/dsward2/AntennaHead)** and
**[ControlBooth](https://github.com/dsward2/ControlBooth)** — a plain static
site (no Jekyll) served by GitHub Pages.

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

## Publishing (one-time)

This repo is named for an **organization** so it publishes at the bare
`https://antennahead.github.io` (a user repo would be `dsward2.github.io`).

1. **Create the org** — <https://github.com/organizations/plan> → *Free* →
   name it `antennahead`.
2. **Create the repo** — new repository in that org named **exactly**
   `antennahead.github.io`, public, empty.
3. **Push this folder:**
   ```bash
   cd antennahead.github.io
   git init -b main
   git add -A
   git commit -m "Initial project site"
   git remote add origin git@github.com:antennahead/antennahead.github.io.git
   git push -u origin main
   ```
4. **Enable Pages** — repo *Settings → Pages →* Source = *Deploy from a branch*,
   Branch = `main` / `/ (root)`, Save. First build takes a minute or two;
   the site then lives at <https://antennahead.github.io>.

For a user site instead, name the repo `dsward2.github.io`, push it to your own
account, and the URL becomes `https://dsward2.github.io`. No content changes
needed — all links here are relative.

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
