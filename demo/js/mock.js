/* =========================================================================
   mock.js  —  static-preview backend for the AntennaHead web UI
   =========================================================================
   The real AntennaHead UI is served by the macOS app's embedded HTTP server,
   which fills in %%TEMPLATE%% tokens and answers a handful of XHR endpoints
   (status polling, "Listen" actions, the AAC recorder, captions, ...).

   On GitHub Pages there is no app and no radio, so this file:
     1. neutralises antennahead.js's polling loops and the blocking audio-start
        routine (which busy-waits for 3 s and would freeze the tab),
     2. answers the known XHR endpoints with canned fixtures,
     3. hydrates the leftover %%TOKENS%% in each fragment after it loads,
     4. shows a "preview" ribbon and a small toast for actions that need a
        real radio.

   It is NOT part of the shipping app. Loaded only by demo/index.html.
   ========================================================================= */
(function () {
  "use strict";

  /* ---------- 1. de-fang the live-server plumbing ------------------------ */

  function noop() {}

  // Polling loops (all declared as globals in antennahead.js).
  [
    "intervalID",
    "aacRecorderPollIntervalID",
    "controlBoothPollIntervalID",
    "captionsPollIntervalID",
    "aacRecorderTickIntervalID"
  ].forEach(function (id) {
    try { clearInterval(window[id]); } catch (e) {}
  });

  // Replace the pollers themselves so anything that re-arms them is inert.
  window.periodicUpdate = noop;
  window.aacRecorderPoll = noop;
  window.aacRecorderTick = noop;
  window.controlBoothPoll = noop;
  window.captionsPoll = noop;
  window.startNowPlayingUpdates = noop;
  window.stopNowPlayingUpdates = noop;
  window.populateUSBDeviceDatalist = noop;

  // Audio: the real startAudioPlayerAfterDelay() blocks the main thread for
  // 3 seconds ("iOS rejects delayed audio play" hack). Kill it dead.
  window.startAudioPlayer = function () { toast("Preview only — no live stream"); };
  window.startAudioPlayerAfterDelay = noop;
  window.startDownloadAudioPlayer = function () { toast("Preview only — no recordings server"); };
  window.emptyBufferDataForAudioPlayer = noop;
  window.handleAudioPlayerMessage = noop;

  /* ---------- 2. canned fixtures --------------------------------------- */

  var NOW_PLAYING_STATUS = {
    rtlsdr_task_mode: "RtlSdrTaskModeFMStereo",
    modulation: "fm",
    oversampling: 4,
    signal_level: 21,
    options: "",
    frequency_scan_interval: 0,
    tuner_gain: 49.6,
    atan_math: "std",
    sampling_mode: 0,
    sample_rate: 170000,
    frequency_mode: 0,
    squelch_level: 0,
    id: 4,
    tuner_agc: 1,
    frequency_scan_end: 0,
    fir_size: 9,
    audio_output_filter: "vol 1",
    station_name: "KUAR-NPR Little Rock 89.1",
    frequency: 89100000
  };

  var CATEGORIES_TABLE =
    '<table class="u-full-width"><thead><tr><th>Category</th><th>Stations</th><th></th></tr></thead><tbody>' +
    row3("Little Rock FM", "6", "categories.html") +
    row3("NOAA Weather", "3", "categories.html") +
    row3("Airband — KLIT", "5", "categories.html") +
    row3("Ham 2 m", "4", "categories.html") +
    "</tbody></table>";

  var FAVORITES_TABLE =
    '<table class="u-full-width"><thead><tr><th>Station</th><th>Frequency</th><th></th></tr></thead><tbody>' +
    fav("KUAR-NPR Little Rock", "89.1 MHz") +
    fav("KABF Community Radio", "88.3 MHz") +
    fav("KLRE Classical", "90.5 MHz") +
    fav("NOAA Weather LZK", "162.550 MHz") +
    "</tbody></table>";

  var SCANNER_CATEGORIES_TABLE =
    '<table class="u-full-width"><thead><tr><th>Category</th><th>Channels</th><th></th></tr></thead><tbody>' +
    row3("NOAA Weather", "7", "scannercategories.html") +
    row3("Airband Approach", "5", "scannercategories.html") +
    row3("Little Rock FM", "6", "scannercategories.html") +
    "</tbody></table>";

  var RECORDINGS_LIST =
    '<table class="u-full-width" id="recordings_table"><thead><tr><th>File</th><th>Size</th><th></th></tr></thead><tbody>' +
    rec("KUAR-89.1-2026-09-05-1830.aac", "8.4 MB") +
    rec("NOAA-LZK-2026-09-04-0912.aac", "2.1 MB") +
    rec("Airband-KLIT-2026-09-02-1440.aac", "5.7 MB") +
    "</tbody></table>";

  var NOW_PLAYING_DETAILS =
    '<p><strong>89.1 MHz</strong> &nbsp; FM stereo &nbsp; gain 49.6 dB &nbsp; sample rate 170000</p>' +
    '<p>Signal level 21 &nbsp; squelch 0 &nbsp; oversampling 4&times;</p>' +
    '<p style="opacity:.7">Live values are updated by the app once every second.</p>';

  var SPATIAL_AUDIO_CONTROLS =
    '<div style="max-width:420px;margin:0 auto;text-align:left">' +
    slider("Azimuth", "spatial_azimuth", -180, 180, 0, "&deg;") +
    slider("Distance", "spatial_distance", 0, 100, 25, "%") +
    slider("Reverb", "spatial_reverb", 0, 100, 12, "%") +
    "</div>";

  var AAC_BITRATE_SELECT = [32, 48, 64, 96, 128, 160, 192, 256, 320]
    .map(function (k) {
      return '<option value="' + k * 1000 + '"' + (k === 128 ? " selected" : "") +
        ">" + k + " kbps</option>";
    }).join("");

  var WEB_UI_THEME_SELECT =
    '<option value="auto" selected>Auto (follow device)</option>' +
    '<option value="light">Light</option>' +
    '<option value="dark">Dark</option>';

  var CATEGORY_SELECT =
    '<label for="category_select">Add to category:</label>' +
    '<select class="twelve columns value-prop" id="category_select" name="category_select">' +
    '<option value="0">— none —</option>' +
    '<option value="1">Little Rock FM</option>' +
    '<option value="2">NOAA Weather</option>' +
    '<option value="3">Airband — KLIT</option></select>';

  var NOT_IN_PREVIEW =
    '<div style="max-width:520px;margin:1.5rem auto;padding:1rem 1.25rem;border:1px solid #d9b7b2;' +
    'border-radius:8px;background:#faf1f0;color:#7a2c22;text-align:left">' +
    '<strong>Not available in the static preview.</strong><br>' +
    'This screen needs the AntennaHead app running with a radio or audio device. ' +
    'The layout and navigation are still representative of the real UI.</div>';

  function icon(name) {
    return '<embed class="value-img" type="image/svg+xml" src="images/' + name + '.svg" />';
  }

  var CONTROLBOOTH_TILE =
    '<div class="six columns value-prop">' + icon("redphone") +
    '<div class="value-prop"><a class="button button-primary" ' +
    'onclick="window.__ahPreviewToast(\'Preview only — pair with ControlBooth in the app\')">' +
    "ControlBooth</a></div>Receive a live mix pushed from ControlBooth.</div>";

  // token -> replacement string (or function(name) -> string)
  var TOKENS = {
    THEME: "light",
    ASSET_VERSION: "preview",
    ERROR_MESSAGE: "",
    NAV_BAR: "",
    AUDIO_PLAYER: "",
    MENU_ROWS: "",

    FAVORITES_ICON: icon("favorites"),
    CATEGORIES_ICON: icon("categories"),
    TUNER_ICON: icon("tuner"),
    AUDIO_INPUT_ICON: icon("audioinput"),
    GQRX_ICON: icon("gqrx"),
    TEXT_TO_SPEECH_ICON: icon("texttospeech"),
    LOCALRADIO_ANIMATION: icon("AntennaHead-animation"),
    CONTROLBOOTH_TILE: CONTROLBOOTH_TILE,

    CATEGORIES_TABLE: CATEGORIES_TABLE,
    CATEGORY_TABLE: CATEGORIES_TABLE,
    EDIT_CATEGORY_TABLE: CATEGORIES_TABLE,
    FAVORITES_TABLE: FAVORITES_TABLE,
    SCANNER_CATEGORIES_TABLE: SCANNER_CATEGORIES_TABLE,
    RECORDINGS_LIST: RECORDINGS_LIST,

    NOW_PLAYING_NAME: "KUAR-NPR Little Rock 89.1",
    NOW_PLAYING_DETAILS: NOW_PLAYING_DETAILS,
    NOW_PLAYING_STATUS_RESULT: "",
    SPATIAL_AUDIO_CONTROLS: SPATIAL_AUDIO_CONTROLS,
    OPEN_AUDIO_PLAYER_PAGE_BUTTON: "",

    AAC_BITRATE_SELECT: AAC_BITRATE_SELECT,
    WEB_UI_THEME_SELECT: WEB_UI_THEME_SELECT,
    CATEGORY_SELECT: CATEGORY_SELECT,

    TUNER_FORM: NOT_IN_PREVIEW,
    DEVICES_FORM: NOT_IN_PREVIEW,
    GQRX_FORM: NOT_IN_PREVIEW,
    TEXT_TO_SPEECH_FORM: NOT_IN_PREVIEW,
    EDIT_FAVORITE: NOT_IN_PREVIEW,
    EDIT_CATEGORY_SETTINGS: NOT_IN_PREVIEW,
    VIEW_FAVORITE_ITEM: NOT_IN_PREVIEW,
    VIEW_LISTEN: NOT_IN_PREVIEW,
    SCAN_CATEGORY: NOT_IN_PREVIEW,
    SCAN_CATEGORY_LISTEN: NOT_IN_PREVIEW,

    CATEGORY_NAME: "Little Rock FM",
    EDIT_CATEGORY_NAME: "Little Rock FM",
    SCAN_CATEGORY_NAME: "Little Rock FM",
    VIEW_FAVORITE_NAME: "KUAR-NPR Little Rock 89.1",
    EDIT_FAVORITE_NAME: "KUAR-NPR Little Rock 89.1",
    LISTEN_NAME: "KUAR-NPR Little Rock 89.1",
    COMPUTER_NAME: "Mac-mini.local"
  };

  // Anything not listed above collapses to empty (covers the tiny POST-response
  // stub fragments: %%QUACK%%, %%STORY%%, %%ALPHABET%%, %%TIME%%, the various
  // %%*_RESULT%% tokens, etc.).
  function tokenValue(name) {
    if (Object.prototype.hasOwnProperty.call(TOKENS, name)) {
      var v = TOKENS[name];
      return typeof v === "function" ? v(name) : v;
    }
    return "";
  }

  /* ---------- helpers for the fixture markup ------------------------------ */

  function row3(a, b, target) {
    return '<tr><td>' + a + '</td><td>' + b + '</td><td>' +
      '<a class="button" onclick="loadContent(\'' + target + '\')">Open</a></td></tr>';
  }
  function fav(name, freq) {
    return '<tr><td>' + name + '</td><td>' + freq + '</td><td>' +
      '<a class="button button-primary" onclick="window.__ahPreviewToast(\'Preview only — press Listen in the app\')">Listen</a></td></tr>';
  }
  function rec(file, size) {
    return '<tr><td style="word-break:break-all">' + file + '</td><td>' + size + '</td><td>' +
      '<a class="button" onclick="window.__ahPreviewToast(\'Preview only — no recordings server\')">Play</a></td></tr>';
  }
  function slider(label, id, min, max, val, unit) {
    return '<label for="' + id + '">' + label + ': <span id="' + id + '_out">' + val + unit + '</span></label>' +
      '<input type="range" id="' + id + '" min="' + min + '" max="' + max + '" value="' + val +
      '" style="width:100%" oninput="document.getElementById(\'' + id + '_out\').textContent=this.value+\'' + unit + '\'">';
  }

  /* ---------- 3. XHR interception ------------------------------------- */

  var RealOpen = XMLHttpRequest.prototype.open;
  var RealSend = XMLHttpRequest.prototype.send;

  function mockFor(method, url) {
    var u = String(url);
    method = String(method || "GET").toUpperCase();

    if (/nowplayingstatus\.html$/.test(u)) return { body: JSON.stringify(NOW_PLAYING_STATUS) };
    if (/rtlsdrdevices\.html$/.test(u)) return { body: JSON.stringify(["RTL2838 (00000001)"]) };
    if (/api\/aac-recorder\/status$/.test(u)) return { body: JSON.stringify({ recording: false, elapsed: 0 }) };
    if (/api\/aac-recorder\/(start|stop)$/.test(u)) return { body: JSON.stringify({ recording: false, elapsed: 0 }), toast: "Preview only — recorder needs the app" };
    if (/api\/v1\/controlbooth\/status$/.test(u)) return { body: JSON.stringify({ running: false }) };
    if (/captions\.json$/.test(u)) return { body: JSON.stringify({ seq: 0, lines: [] }) };
    if (/api\/spatial-audio\/update$/.test(u)) return { body: "{}" };

    if (method === "POST" && /(listenbuttonclicked|insertnewfrequency|storefrequency|deletefrequency|storecategory|addcategory|deletecategory|applyaacsettings|applywebuitheme|texttospeechchoosefolder)\.html$/.test(u)) {
      return { body: "", toast: "Preview only — this action needs the AntennaHead app" };
    }
    return null;
  }

  XMLHttpRequest.prototype.open = function (method, url) {
    this.__m = method;
    this.__u = url;
    return RealOpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function (body) {
    var m = mockFor(this.__m, this.__u);
    if (!m) return RealSend.apply(this, arguments);

    var xhr = this;
    setTimeout(function () {
      try {
        Object.defineProperty(xhr, "readyState", { value: 4, configurable: true });
        Object.defineProperty(xhr, "status", { value: 200, configurable: true });
        Object.defineProperty(xhr, "responseText", { value: m.body, configurable: true });
        Object.defineProperty(xhr, "response", { value: m.body, configurable: true });
      } catch (e) {}
      if (m.toast) toast(m.toast);
      try { if (typeof xhr.onreadystatechange === "function") xhr.onreadystatechange(); } catch (e) {}
      try { if (typeof xhr.onload === "function") xhr.onload(); } catch (e) {}
      try { xhr.dispatchEvent(new Event("load")); } catch (e) {}
    }, m.delay || 90);
  };

  /* ---------- 4. token hydration on every fragment load --------------- */

  var TOKEN_RE = /%%([A-Z_]+)%%/g;

  window.__ahPreviewHydrate = function (root) {
    if (!root) return;
    var html = root.innerHTML;
    if (TOKEN_RE.test(html)) {
      TOKEN_RE.lastIndex = 0;
      root.innerHTML = html.replace(TOKEN_RE, function (_, name) { return tokenValue(name); });
    }
    // Fragments occasionally ship their own <style>/<link> (credits.html
    // restyles bare `body`) or an inert <script> block (the tuner pages —
    // innerHTML never executes it, but its source leaks into textContent).
    // Neither belongs in the shell, so drop them.
    Array.prototype.forEach.call(
      root.querySelectorAll('style, link[rel="stylesheet"], script'),
      function (el) { el.parentNode.removeChild(el); }
    );
    // Neutralise "Listen" submit buttons that would POST to the app.
    Array.prototype.forEach.call(root.querySelectorAll('input[type="submit"], form'), function (el) {
      if (el.tagName === "FORM") {
        el.addEventListener("submit", function (e) {
          e.preventDefault();
          toast("Preview only — form submit needs the AntennaHead app");
        });
      }
    });
  };

  /* ---------- 5. preview ribbon + toast ------------------------------- */

  function addRibbon() {
    if (document.getElementById("preview-ribbon")) return;
    var bar = document.getElementById("navigationbar");
    var frame = document.getElementById("content_frame");
    if (!bar || !frame) return;
    var r = document.createElement("div");
    r.id = "preview-ribbon";
    r.textContent = "Interactive preview — no radio connected. github.com/dsward2/AntennaHead";
    bar.parentNode.insertBefore(r, frame);
  }

  var toastEl = null, toastTimer = null;
  function toast(msg) {
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.style.cssText =
        "position:fixed;left:50%;bottom:64px;transform:translateX(-50%);z-index:10000;" +
        "background:rgba(20,20,20,.92);color:#fff;font:500 13px/1.4 Raleway,Helvetica,Arial,sans-serif;" +
        "padding:8px 14px;border-radius:8px;max-width:80vw;text-align:center;pointer-events:none;" +
        "opacity:0;transition:opacity .18s";
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.style.opacity = "1";
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.style.opacity = "0"; }, 2200);
  }
  window.__ahPreviewToast = toast;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", addRibbon);
  } else {
    addRibbon();
  }
  window.addEventListener("load", addRibbon);
})();
