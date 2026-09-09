# demo/ — static preview of the AntennaHead web UI

This folder is the front end from **`AntennaHead/Web/`** in the
[AntennaHead repo](https://github.com/dsward2/AntennaHead), copied verbatim
except for three files:

| File | Change |
|---|---|
| `index.html`  | Pre-rendered: the app's `%%THEME%%`, `%%NAV_BAR%%`, `%%AUDIO_PLAYER%%` … tokens are filled with static values, and `js/mock.js` is added to the `<head>`. |
| `index2.html` | Pre-rendered main menu (`%%MENU_ROWS%%` expanded to real tiles). |
| `js/mock.js`  | **New.** The mock backend — not part of the shipping app. |

Everything else (all the fragment `.html` files, `js/antennahead.js`,
`css/custom.css`, `dist/`, `images/`, `fonts/`) is unmodified.

## What `mock.js` does

The real UI is served by AntennaHead's embedded HTTP server, which fills in
`%%TOKEN%%` placeholders and answers a handful of XHR endpoints. On GitHub
Pages there is no server and no radio, so `mock.js`:

1. **Stops the polling loops** (`periodicUpdate`, the AAC-recorder poll, the
   ControlBooth poll, the captions poll) and the blocking `startAudioPlayerAfterDelay()`
   routine, which busy-waits 3 s and would otherwise freeze the tab.
2. **Answers known XHR endpoints** with canned fixtures
   (`nowplayingstatus.html` → a sample FM status object, `rtlsdrdevices.html`
   → one fake dongle, the recorder/ControlBooth/captions JSON, and the various
   `*listenbuttonclicked.html` POSTs → an empty 200 plus a "preview only" toast).
3. **Hydrates leftover `%%TOKEN%%`s** in every fragment as it loads, from a
   fixture table (`categories`, `favorites`, `recordings`, tuner `%%CATEGORY_SELECT%%`,
   AAC bitrate options, theme options …). Unknown tokens collapse to empty.
4. Shows a red **“interactive preview — no radio connected”** ribbon and a
   small toast for actions that need the real app.

## Refreshing this folder

When the AntennaHead UI changes upstream, re-sync with:

```bash
scripts/build-demo.sh /path/to/AntennaHead
```

That re-copies `Web/` and restores the three overrides from
`../demo-overrides/`. If a real template gains a new `%%TOKEN%%`, add it to the
`TOKENS` map in `js/mock.js` (or it will just render blank).
