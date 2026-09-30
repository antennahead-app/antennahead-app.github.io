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
    "controlBoothDsdNeoPollIntervalID",
    "controlBoothRadioPollIntervalID",
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
  window.controlBoothDsdNeoPoll = noop;
  window.controlBoothRadioPoll = noop;
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
    frequency: 89100000,
    gqrx: null   // set below, once GQRX exists
  };

  /* Listen to Gqrx page. The real app serves gqrxFormHTML() (Gqrx running:
     Quit buttons, the Listen form, and the hidden Remote Control panel from
     gqrxControlPanelHTML()) and antennahead.js fills the panel from the
     `gqrx` object of nowplayingstatus.html. Here the same markup is served
     with Gqrx playing 89.1 MHz WFM (stereo), and the mock keeps GQRX as
     mutable state so the sliders, Tune, Mute and bookmarks respond. */
  var GQRX_BOOKMARK_ROWS = [
    [88300000, "KABF 88.3 Little Rock", "WFM (stereo)", 160000, ["FM Broadcast"]],
    [89100000, "KUAR-NPR Little Rock 89.1", "WFM (stereo)", 160000, ["FM Broadcast"]],
    [90500000, "KLRE Classical Music 90.5", "WFM (stereo)", 160000, ["FM Broadcast"]],
    [91300000, "KUCA 91.3 Conway", "WFM (stereo)", 240000, ["FM Broadcast"]],
    [92300000, "KIPR 92.3 Little Rock", "WFM (stereo)", 170000, ["FM Broadcast"]],
    [94100000, "KKPT 94.1 Little Rock", "WFM (stereo)", 160000, ["FM Broadcast"]],
    [95700000, "KSSN 95.7 Little Rock", "WFM (stereo)", 160000, ["FM Broadcast"]],
    [98500000, "KURB 98.5", "WFM (stereo)", 160000, ["FM Broadcast"]],
    [103700000, "KABZ 103.7 Little Rock", "WFM (stereo)", 160000, ["FM Broadcast"]],
    [107700000, "KLAL 107.7", "WFM (stereo)", 160000, ["FM Broadcast"]],
    [118700000, "Adams ATC Tower", "AM", 10000, ["Aviation"]],
    [118950000, "Adams Field Clearance Delivery", "AM", 10000, ["Aviation"]],
    [119500000, "Adams Field Approach/Dep", "AM", 10000, ["Aviation"]],
    [121500000, "Aviation Emergency", "AM", 10000, ["Aviation"]],
    [121900000, "Adams Field Ground", "AM", 10000, ["Aviation"]],
    [144390000, "CAREN APRS Digipeater", "Narrow FM", 10000, ["Untagged"]],
    [147315000, "Skywarn Russell 147.315", "Narrow FM", 10000, ["NOAA"]],
    [162400000, "NOAA KXI96 Russell 162.4", "Narrow FM", 10000, ["NOAA"]],
    [162475000, "NOAA KXI95 Morrilton 162.475", "Narrow FM", 10000, ["NOAA"]],
    [162525500, "NOAA WWF96 Russellville", "Narrow FM", 10000, ["NOAA"]],
    [162550000, "NOAA WXJ55 Little Rock 162.55", "Narrow FM", 10000, ["NOAA"]]
  ];
  var GQRX_MODE_FOR = { "WFM (stereo)": "WFM_ST", "WFM (mono)": "WFM", "AM": "AM", "Narrow FM": "FM" };
  var GQRX = {
    available: true,
    frequency: 89100000,
    mode: "WFM_ST",
    modes: ["OFF", "RAW", "AM", "AMS", "LSB", "USB", "CWL", "CWU", "FM", "WFM", "WFM_ST", "WFM_ST_OIRT"],
    passband: 160000,
    has_filter_shape: true, filter_shape: 1,
    has_filter_offset: false, filter_offset: 0,
    rf_gain_name: "LNA", rf_gain: 28,
    af_gain: 0,
    squelch: -146,
    signal: -31,
    muted: false,
    udp_audio_running: true,
    dsp_running: true,
    has_device_control: true,
    input_device: "rtl=0",
    input_devices: ["Realtek RTL2838UHIDIR SN: 00000180", "Realtek RTL2838UHIDIR SN: 00000360"],
    output_device: "Mac mini Speakers",
    output_devices: ["Mac mini Speakers", "Default output"],
    bookmarks: GQRX_BOOKMARK_ROWS.map(function (b) {
      return { frequency: b[0], name: b[1], modulation: b[2], bandwidth: b[3], tags: b[4] };
    })
  };

  var GQRX_FORM =
    "<div class='gqrx-app-buttons'>" +
    "<input class='button' type='button' value='Quit Gqrx' onclick='gqrxQuitApp(false);' title='Quit Gqrx, freeing the RTL-SDR it holds.'>" +
    "<input class='button' type='button' value='Quit and Restart Gqrx' onclick='gqrxQuitApp(true);' title='Quit Gqrx and open it again — for when its audio is noise and the waterfall shows vertical streaks.'>" +
    "</div>" +
    "<form class='gqrx_form' id='gqrxForm' onsubmit='event.preventDefault(); return false;' method='POST'>" +
    "<label>Listen to Gqrx</label>" +
    "<p>Receiving on UDP port <strong>7355</strong> — set Gqrx's Audio ▸ UDP output to this port.</p>" +
    "<label>Channels</label>" +
    "<select class='u-full-width' name='gqrx_channels'>" +
    "<option value='2'>2 – Stereo (Gqrx Audio ▸ Stereo checkbox enabled)</option>" +
    "<option value='1'>1 – Mono</option></select>" +
    "<input class='twelve columns button button-primary' type='button' value='Listen' onclick=\"gqrxListenButtonClicked(this.form);\" " +
    "title='Receive Gqrx&#39;s UDP audio output (port 7355), normalize via sox, forward to LiveAudioServer.'>" +
    "</form>" +
    "<div id='gqrxPanel' class='gqrx-panel' hidden><hr><label>Gqrx Remote Control</label>" +
    "<p id='gqrxStatus' class='gqrx-status'>Connecting…</p>" +
    "<div class='gqrx-row'><input type='button' id='gqrxDsp' class='twelve columns button' value='Receiver' onclick='gqrxToggleDsp();'></div>" +
    "<div class='gqrx-row' id='gqrxDevRow' hidden><label for='gqrxInDev'>SDR device</label>" +
    "<select id='gqrxInDev' class='u-full-width' onchange='gqrxSendInDev();'></select>" +
    "<p id='gqrxInDevCur' class='gqrx-status'></p>" +
    "<label for='gqrxOutDev'>Audio output</label>" +
    "<select id='gqrxOutDev' class='u-full-width' onchange='gqrxSendOutDev();'></select></div>" +
    "<div class='gqrx-row'><label for='gqrxFreq'>Frequency (MHz)</label><div class='gqrx-inline'>" +
    "<input type='number' id='gqrxFreq' step='0.001' class='gqrx-freq'>" +
    "<input type='button' class='button' value='Tune' onclick='gqrxSetFreq();'></div></div>" +
    "<div class='gqrx-row' id='gqrxOffsetRow' hidden><label for='gqrxOffset'>Channel offset (Hz)</label><div class='gqrx-inline'>" +
    "<input type='number' id='gqrxOffset' step='100' class='gqrx-freq'>" +
    "<input type='button' class='button' value='Set' onclick='gqrxSetOffset();'></div></div>" +
    "<div class='gqrx-row'><label for='gqrxMode'>Mode</label>" +
    "<select id='gqrxMode' class='u-full-width' onchange='gqrxSendMode();'></select></div>" +
    "<div class='gqrx-row'><label for='gqrxWidth'>Filter width <span id='gqrxWidthVal' class='gqrx-val'></span></label>" +
    "<input type='range' id='gqrxWidth' min='500' max='250000' step='100' class='u-full-width' oninput='gqrxWidthInput();' onchange='gqrxSendMode();'></div>" +
    "<div class='gqrx-row' id='gqrxShapeRow' hidden><label for='gqrxShape'>Filter shape</label>" +
    "<select id='gqrxShape' class='u-full-width' onchange='gqrxSendShape();'>" +
    "<option value='0'>Soft</option><option value='1'>Normal</option><option value='2'>Sharp</option></select></div>" +
    "<div class='gqrx-row' id='gqrxRFRow' hidden><label for='gqrxRF'><span id='gqrxRFName'>RF</span> gain <span id='gqrxRFVal' class='gqrx-val'></span></label>" +
    "<input type='range' id='gqrxRF' min='0' max='50' step='0.1' class='u-full-width' oninput='gqrxRFInput();' onchange='gqrxSendRF();'></div>" +
    "<div class='gqrx-row'><label for='gqrxAF'>Audio gain <span id='gqrxAFVal' class='gqrx-val'></span> dB</label>" +
    "<input type='range' id='gqrxAF' min='-40' max='40' step='1' class='u-full-width' oninput='gqrxAFInput();' onchange='gqrxSendAF();'></div>" +
    "<div class='gqrx-row'><label for='gqrxSql'>Squelch <span id='gqrxSqlVal' class='gqrx-val'></span> dBFS</label>" +
    "<input type='range' id='gqrxSql' min='-150' max='0' step='1' class='u-full-width' oninput='gqrxSqlInput();' onchange='gqrxSendSql();'></div>" +
    "<div class='gqrx-row'><label>Signal <span id='gqrxSig' class='gqrx-val'>–</span> dBFS</label>" +
    "<div class='gqrx-meter'><div id='gqrxSigBar' class='gqrx-meter-fill'></div></div></div>" +
    "<div class='gqrx-row'><label class='gqrx-check'><input type='checkbox' id='gqrxMute' onchange='gqrxToggleMute();'> Mute Gqrx audio</label></div>" +
    "<div class='gqrx-row'><label class='gqrx-check'><input type='checkbox' id='gqrxUdpAudio' onchange='gqrxToggleUdpAudio();'> Start UDP Audio (port 7355)</label></div>" +
    "<div class='gqrx-row' id='gqrxBookmarksRow' hidden><label>Bookmarks</label>" +
    "<input type='text' id='gqrxBmFilter' class='u-full-width' placeholder='filter by name or tag…' oninput='gqrxRenderBookmarks();'>" +
    "<div id='gqrxBookmarks' class='gqrx-bookmarks'></div></div>" +
    "</div><br>&nbsp;<br>";

  /* The /gqrx*.html POSTs mutate GQRX so the panel behaves like the real one. */
  function gqrxMock(u, body) {
    var f = {};
    try { JSON.parse(body || "[]").forEach(function (o) { f[o.name] = o.value; }); } catch (e) {}
    if (/gqrxsetfrequency\.html$/.test(u)) GQRX.frequency = Number(f.freq) || GQRX.frequency;
    else if (/gqrxsetmode\.html$/.test(u)) { GQRX.mode = f.mode || GQRX.mode; GQRX.passband = Number(f.passband) || GQRX.passband; }
    else if (/gqrxsetshape\.html$/.test(u)) GQRX.filter_shape = Number(f.shape);
    else if (/gqrxsetlevel\.html$/.test(u)) {
      if (f.name === "AF") GQRX.af_gain = Number(f.value);
      else if (f.name === "SQL") GQRX.squelch = Number(f.value);
      else GQRX.rf_gain = Number(f.value);
    }
    else if (/gqrxmute\.html$/.test(u)) GQRX.muted = f.on === "1";
    else if (/gqrxsetudpaudio\.html$/.test(u)) GQRX.udp_audio_running = f.on === "1";
    else if (/gqrxsetdsp\.html$/.test(u)) GQRX.dsp_running = f.on === "1";
    else if (/gqrxbookmark\.html$/.test(u)) {
      var hz = Number(f.freq);
      GQRX.bookmarks.forEach(function (b) {
        if (b.frequency === hz) {
          GQRX.frequency = hz; GQRX.passband = b.bandwidth;
          GQRX.mode = GQRX_MODE_FOR[b.modulation] || GQRX.mode;
        }
      });
      NOW_PLAYING_STATUS.frequency = GQRX.frequency;
    }
    else if (/(quitgqrx|restartgqrx|quitgqrxandretry)\.html$/.test(u)) return { body: "", toast: "Preview only — this needs Gqrx on the Mac" };
    else return null;
    return { body: "" };
  }

  NOW_PLAYING_STATUS.gqrx = GQRX;

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

  // Audio-delay controls on the Now Playing page (the real app shows them when the
  // delay is switched on in Configuration). Markup mirrors audioDelayControlsHTML()
  // in AntennaHeadHTTPServer.swift: max 600 s, ~7 s built-in HLS latency.
  var AUDIO_DELAY_CONTROLS =
    '<div id="audio-delay-controls" style="margin-top: 24px;">' +
    "<h4>Audio Delay</h4>" +
    '<label for="audio-delay">Extra delay: <span id="audio-delay-value">0:00</span></label>' +
    '<label id="audio-delay-latency" data-builtin="7">Estimated total from live: <span id="audio-delay-total">0:07</span></label><br>' +
    '<input type="range" id="audio-delay" min="0" max="600" step="1" value="0" style="width: 100%;" ' +
    'oninput="audioDelaySliderChanged(false)" onchange="audioDelaySliderChanged(true)">' +
    '<div style="margin-top: 8px;">' +
    '<input class="button" type="button" value="Delay 1 Second" onclick="audioDelayAdjust(1)"> ' +
    '<input class="button" type="button" value="Skip 1 Second" onclick="audioDelayAdjust(-1)"></div>' +
    '<p style="margin-top: 8px; font-size: 0.85em;">The streaming server itself adds about 7 s to the HLS stream ' +
    "(about 0.1 s for the MP3 and AAC streams), before any buffering in your player.</p>" +
    '<p style="margin-top: 8px; font-size: 0.85em;">A short chirp is mixed into the audio when each change takes effect. ' +
    "Raising the delay pauses briefly; lowering it skips ahead.</p></div>";

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

  /* Advanced Tuner page: the markup of the app's newFrequencyFormHTML() with
     the new-frequency defaults (Frequency.prototype()). The USB Device combo
     box's <datalist> is filled from the app's device list there; here it lists
     the one sample dongle. */
  var TUNER_FORM = (function () {
    function text(label, name, value, type, step, list) {
      return "<label for='" + name + "'>" + label + "</label><input class='twelve columns value-prop' type='" + (type || "text") + "' " +
        "autocomplete='off' autocorrect='off' autocapitalize='none' spellcheck='false' id='" + name + "' name='" + name + "' value='" + value + "'" +
        (step ? " step='" + step + "'" : "") + (list ? " list='" + list + "'" : "") + ">";
    }
    function select(label, name, current, options) {
      var h = "<label for='" + name + "'>" + label + "</label><select class='twelve columns value-prop' name='" + name + "'>";
      options.forEach(function (o) {
        h += "<option value='" + o[0] + "'" + (o[0] === current ? " selected" : "") + ">" + o[1] + "</option>";
      });
      return h + "</select>";
    }
    var onOff = [["0", "Off"], ["1", "On"]];
    var mods = ["fm", "nfm", "wfm", "am", "usb", "lsb", "raw"].map(function (m) { return [m, m.toUpperCase()]; });
    var h = "<form class='wbfm-tuner-form' id='tuner-advanced-form' onsubmit='event.preventDefault(); return insertNewFrequencyRecord(this);' method='POST'>";
    h += text("Station Name:", "station_name", "");
    h += text("Frequency (Hz):", "frequency", "89100000", "number");
    h += select("Modulation:", "modulation", "fm", mods);
    h += select("FM Stereo:", "stereo_flag", "0", onOff);
    h += text("Sample Rate:", "sample_rate", "170000", "number");
    h += text("Tuner Gain:", "tuner_gain", "49.5", "number", "0.1");
    h += select("Tuner AGC:", "tuner_agc", "0", onOff);
    h += select("Sampling Mode:", "sampling_mode", "0", [["0", "Standard"], ["1", "Direct Sampling (I)"], ["2", "Direct Sampling (Q)"]]);
    h += text("Oversampling:", "oversampling", "4", "number");
    h += text("Squelch Level:", "squelch_level", "0.0", "number", "0.1");
    h += text("FIR Size:", "fir_size", "9", "number");
    h += text("atan Math:", "atan_math", "std");
    h += text("Audio Output Filter:", "audio_output_filter", "vol 1");
    h += text("rtl_fm Options:", "options", "");
    h += text("USB Device (serial number or index):", "usb_device_string", "", "text", null, "usb_device_datalist");
    h += "<datalist id='usb_device_datalist'><option value='00000001'>RTL2838 (00000001)</option></datalist>";
    h += select("Bias-T Power:", "bias_t_flag", "0", onOff);
    h += "<label for='categories_select'>Category:</label>" +
      "<select class='twelve columns value-prop' name='categories_select' title='The Category pop-up button can be used when adding a new Favorites frequency record'>" +
      "<option value='' selected></option><option value='1'>Little Rock FM</option><option value='2'>NOAA Weather</option>" +
      "<option value='3'>Airband — KLIT</option></select>";
    h += "<br>&nbsp;<br>&nbsp;<br>";
    h += "<input class='twelve columns button button-primary' type='button' value='Listen' onclick='advancedListenButtonClicked(this.form);' " +
      "title='Tune the RTL-SDR radio to the frequency and settings above.'>";
    h += "<br>&nbsp;<br>&nbsp;<br>";
    h += "<input class='twelve columns button button-primary' type='submit' value='Add New Favorite Frequency'>";
    return h + "</form>";
  })();

  /* ---- Favorites, categories and RSS feeds (Try-it pages) --------------
     Sample records for the pages that show one record by id. The markup
     mirrors the app's generators in AntennaHeadHTTPServer.swift:
     favoritesTableHTML / categoriesTableHTML / viewFavorite / editFavorite /
     categoryFavoritesTableHTML / editCategoryTableHTML /
     editCategorySettingsFormHTML / editRSSFeed / speakRSSHeadlinesFormHTML.
     `cur` holds the id from the fragment URL last requested (mockFor sets
     it), so each page shows the right record. */
  var cur = { fav: 1, cat: 1, feed: 1 };
  var FAVS = [
    { id: 1, name: "KUAR-NPR Little Rock 89.1", hz: 89100000, mod: "fm", stereo: 1, rate: 170000, gain: 49.6, agc: 0 },
    { id: 2, name: "KABF Community Radio 88.3", hz: 88300000, mod: "fm", stereo: 1, rate: 170000, gain: 49.6, agc: 0 },
    { id: 3, name: "KLRE Classical 90.5", hz: 90500000, mod: "fm", stereo: 1, rate: 170000, gain: 49.6, agc: 0 },
    { id: 4, name: "NOAA Weather LZK", hz: 162550000, mod: "fm", stereo: 0, rate: 24000, gain: 49.6, agc: 0 },
    { id: 5, name: "Adams Field Approach", hz: 119500000, mod: "am", stereo: 0, rate: 12000, gain: 49.6, agc: 1 },
    { id: 6, name: "Adams Field Tower", hz: 118700000, mod: "am", stereo: 0, rate: 12000, gain: 49.6, agc: 1 },
    { id: 7, name: "Ham 2 m Simplex", hz: 146520000, mod: "fm", stereo: 0, rate: 24000, gain: 0, agc: 0 },
    { id: 8, name: "Skywarn Russell 147.315", hz: 147315000, mod: "fm", stereo: 0, rate: 24000, gain: 0, agc: 0 }
  ];
  var CATS = [
    { id: 1, name: "Little Rock FM", scan: 1, mod: "fm", rate: 170000, members: [1, 2, 3] },
    { id: 2, name: "NOAA Weather", scan: 1, mod: "fm", rate: 24000, members: [4] },
    { id: 3, name: "Airband — KLIT", scan: 1, mod: "am", rate: 12000, members: [5, 6] },
    { id: 4, name: "Ham 2 m", scan: 0, mod: "fm", rate: 24000, members: [7, 8] }
  ];
  var FEEDS = [
    { id: 1, name: "NPR News", url: "https://feeds.npr.org/1001/rss.xml", voice: "", mode: "title" },
    { id: 2, name: "BBC World Service", url: "https://feeds.bbci.co.uk/news/world/rss.xml", voice: "ava", mode: "title_and_summary" },
    { id: 3, name: "NOAA Weather Alerts", url: "https://alerts.weather.gov/cap/ar.php?x=0", voice: "", mode: "title" }
  ];
  var VOICES = [
    ["", "Default voice"], ["alex", "Alex — en-US"], ["ava", "Ava — en-US (Premium)"],
    ["fred", "Fred — en-US"], ["samantha", "Samantha — en-US (Enhanced)"]
  ];
  var VERBATIM = "autocomplete='off' autocorrect='off' autocapitalize='none' spellcheck='false'";
  var MODS = ["fm", "nfm", "wfm", "am", "usb", "lsb", "raw"];
  var ON_OFF = [["0", "Off"], ["1", "On"]];
  var SAMPLING = [["0", "Standard"], ["1", "Direct Sampling (I)"], ["2", "Direct Sampling (Q)"]];

  function byId(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return list[0];
  }
  function mhz(hz) { return (hz / 1e6).toFixed(3) + " MHz"; }
  function voiceSelect(id, current) {
    var h = "<select id='" + id + "' name='" + id + "' class='u-full-width'>";
    VOICES.forEach(function (v) { h += "<option value='" + v[0] + "'" + (v[0] === current ? " selected" : "") + ">" + v[1] + "</option>"; });
    return h + "</select>";
  }
  function selectOpts(options, current) {
    return options.map(function (o) {
      return "<option value='" + o[0] + "'" + (o[0] === current ? " selected" : "") + ">" + o[1] + "</option>";
    }).join("");
  }
  var MOD_OPTS = MODS.map(function (m) { return [m, m.toUpperCase()]; });
  /* Two label styles, as in the app: the add/tuner form's block labels, and the
     edit forms' wrapping labels. */
  function blockText(label, name, value, type, step, list) {
    return "<label for='" + name + "'>" + label + "</label><input class='twelve columns value-prop' type='" + (type || "text") + "' " + VERBATIM +
      " id='" + name + "' name='" + name + "' value='" + value + "'" + (step ? " step='" + step + "'" : "") + (list ? " list='" + list + "'" : "") + ">";
  }
  function blockSelect(label, name, current, options) {
    return "<label for='" + name + "'>" + label + "</label><select class='twelve columns value-prop' name='" + name + "'>" + selectOpts(options, current) + "</select>";
  }
  function wrapText(label, name, value, elementId, type, step, list) {
    return "<label>" + label + "<input class='u-full-width' type='" + (type || "text") + "'" + (elementId ? " id='" + elementId + "'" : "") + " " + VERBATIM +
      " name='" + name + "' value='" + value + "'" + (step ? " step='" + step + "'" : "") + (list ? " list='" + list + "'" : "") + "></label>";
  }
  function wrapSelect(label, name, current, options) {
    return "<label>" + label + "<select class='u-full-width' name='" + name + "'>" + selectOpts(options, current) + "</select></label>";
  }
  var USB_DATALIST = "<datalist id='usb_device_datalist'><option value='00000001'>RTL2838 (00000001)</option></datalist>";

  var FAVORITES_TABLE_REAL =
    "<table class='u-full-width'><thead><tr><th>Frequency</th><th>Name</th></tr></thead><tbody>" +
    FAVS.map(function (f) {
      return "<tr><td><a class='button button-primary two columns' type='submit' onclick=\"loadContent('viewfavorite.html?id=" + f.id + "');\" " +
        "title='Show " + f.name + " at " + mhz(f.hz) + "'>" + mhz(f.hz) + "</a></td><td>" + f.name + "</td></tr>";
    }).join("") + "</tbody></table>";
  var CATEGORIES_TABLE_REAL =
    "<table class='u-full-width'><thead><tr><th>ID</th><th>Category</th></tr></thead><tbody>" +
    CATS.map(function (c) {
      return "<tr><td><a class='button button-primary' type='submit' onclick=\"loadContent('category.html?id=" + c.id + "');\" " +
        "title='Show category " + c.name + "'>" + c.id + "</a></td><td>" + c.name + "</td></tr>";
    }).join("") + "</tbody></table>" +
    "<br><input class='twelve columns button button-primary' type='button' value='Add New Category' onclick=\"loadContent('addcategoryform.html');\">";

  function catNavButton(page, label) {
    return "<input class='button twelve columns' type='button' value='" + label + "' onclick=\"loadContent('" + page + "?id=" + cur.cat + "');\"><br>&nbsp;<br>\n";
  }
  function categoryFavoritesTable() {
    var c = byId(CATS, cur.cat);
    return "<table class='u-full-width'><thead><tr><th>Frequency</th><th>Name</th></tr></thead><tbody>" +
      c.members.map(function (id) {
        var f = byId(FAVS, id);
        return "<tr><td><a class='button button-primary two columns' type='submit' onclick=\"loadContent('viewfavorite.html?id=" + f.id + "');\">" + mhz(f.hz) +
          "</a></td><td>" + f.name + "</td></tr>";
      }).join("") + "</tbody></table>";
  }
  function editCategoryTable() {
    var c = byId(CATS, cur.cat);
    return "<table class='u-full-width'><thead><tr><th>ID</th><th>Frequency</th><th>Name</th></tr></thead><tbody>" +
      FAVS.map(function (f) {
        var member = c.members.indexOf(f.id) >= 0;
        return "<tr><td><input type='checkbox' class='checkbox' onclick='handleEditCategoryClick(this);' cat_id='" + c.id + "' freq_id='" + f.id + "'" +
          (member ? " checked" : "") + "></td><td>" + mhz(f.hz) + "</td><td>" + f.name + "</td></tr>";
      }).join("") + "</tbody></table>";
  }
  function deleteCategoryButton() {
    var c = byId(CATS, cur.cat), label = c.name.length > 25 ? c.name.slice(0, 25) + "..." : c.name;
    return "<form class='delete-favorite-form' id='delete-favorite-form' onsubmit='event.preventDefault(); return deleteCategoryRecord(this);' method='POST'>\n" +
      "<br>&nbsp;<br>&nbsp;<br>\n<input id='delete-category-button' class='twelve columns button button-primary' type='submit' value='Delete " + label + " Category'>\n" +
      "<input type='hidden' id='category_id' name='category_id' value='" + c.id + "'>\n<input type='hidden' id='category_name' name='category_name' value='" + c.name + "'>\n" +
      "</form>\n<br>&nbsp;<br>\n";
  }
  function scanCategoryButton() {
    var c = byId(CATS, cur.cat);
    if (!c.scan) return "";
    return "<form id='scannerlistenForm' action='#'><input type='hidden' name='id' value='" + c.id + "'>" +
      "<br><input class='twelve columns button button-primary' type='button' value='Scan All Frequencies' onclick=\"scannerListenButtonClicked(scannerlistenForm);\">" +
      "</form><br>&nbsp;<br>\n";
  }
  function editCategorySettingsForm() {
    var c = byId(CATS, cur.cat);
    return "<form class='editcategorysettings' id='editcategorysettings' onsubmit='event.preventDefault(); return storeCategoryRecord(this);' method='POST'>" +
      blockText("Name:", "category_name", c.name) +
      blockSelect("Enable Category Scanning:", "category_scanning_enabled", String(c.scan), [["0", "Disabled"], ["1", "Enabled"]]) +
      blockText("USB Device (serial number or index):", "scan_usb_device_string", "", "text", null, "usb_device_datalist") + USB_DATALIST +
      blockText("Tuner Gain:", "scan_tuner_gain", "49.5", "number", "0.1") +
      blockSelect("Tuner AGC:", "scan_tuner_agc", "0", ON_OFF) +
      blockText("Sample Rate:", "scan_sample_rate", String(c.rate), "number") +
      blockSelect("Sampling Mode:", "scan_sampling_mode", "0", SAMPLING) +
      blockText("Oversampling:", "scan_oversampling", "4", "number") +
      blockSelect("Modulation:", "scan_modulation", c.mod, MOD_OPTS) +
      blockText("Squelch Level:", "scan_squelch_level", "25.0", "number", "0.1") +
      blockText("Squelch Delay:", "scan_squelch_delay", "10.0", "number", "0.1") +
      blockText("RTL-FM Options:", "scan_options", "") +
      blockText("FIR Size:", "scan_fir_size", "9", "number") +
      blockText("atan Math:", "scan_atan_math", "std") +
      blockText("Sox Audio Output Filter:", "scan_audio_output_filter", "vol 1") +
      blockSelect("Bias-T Power:", "scan_bias_t_flag", "0", ON_OFF) +
      "<input type='hidden' name='id' value='" + c.id + "'>" +
      "<br>&nbsp;<br>&nbsp;<br><input class='twelve columns button button-primary' type='submit' value='Save Changes'></form><br>&nbsp;<br>&nbsp;";
  }

  function gainLabel(g, agc) {
    var base = g <= 0 ? "auto" : (g % 1 === 0 ? g + " dB" : g + " dB");
    return agc ? base + ", AGC on" : base;
  }
  function viewFavoriteItem() {
    var f = byId(FAVS, cur.fav), mod = (f.mod === "fm" && f.stereo) ? "fm stereo" : f.mod;
    var ch = ((f.mod === "fm" || f.mod === "wfm") && f.stereo && f.rate > 106000) ? "2 (stereo)" : "1 (mono)";
    return "<form id='listenForm' action='#'><input type='hidden' name='id' value='" + f.id + "'>" +
      "<br><br><input class='twelve columns button button-primary' type='button' value='Listen' " +
      "onclick=\"var listenForm=getElementById('listenForm'); listenButtonClicked(listenForm);\" title='Click Listen to tune the RTL-SDR radio to this frequency.'></form>" +
      "<input class='twelve columns button' type='button' value='Edit' onclick=\"loadContent('editfavorite.html?id=" + f.id + "');\" title='Click Edit to modify this favorite.'>" +
      "<br><br>frequency: " + mhz(f.hz) + "<br>modulation: " + mod + "<br>sample rate: " + f.rate + "<br>device: 0<br>gain: " + gainLabel(f.gain, f.agc) +
      "<br>channels: " + ch + "<br><br>";
  }
  function editFavoriteForm() {
    var f = byId(FAVS, cur.fav);
    return "<form id='editFrequencyForm' onsubmit=\"event.preventDefault(); return storeFrequencyRecord(this);\" method='POST'>" +
      "<input type='hidden' name='id' value='" + f.id + "'>" +
      wrapText("Station Name", "station_name", f.name, "frequency_name") +
      wrapText("Frequency (Hz)", "frequency", String(f.hz), null, "number") +
      wrapSelect("Frequency Mode", "frequency_mode", "frequency_mode_single", [["frequency_mode_single", "Single Frequency"], ["frequency_mode_range", "Scan Range"]]) +
      wrapText("Scan Range End (Hz)", "frequency_scan_end", "0", null, "number") +
      wrapText("Scan Range Interval (Hz)", "frequency_scan_interval", "0", null, "number") +
      wrapText("Scan Range Squelch Delay", "frequency_scan_squelch_delay", "0.0", null, "number", "0.1") +
      wrapSelect("Modulation", "modulation", f.mod, MOD_OPTS) +
      wrapSelect("FM Stereo", "stereo_flag", String(f.stereo), ON_OFF) +
      wrapText("Sample Rate", "sample_rate", String(f.rate), null, "number") +
      wrapText("Tuner Gain", "tuner_gain", String(f.gain), null, "number", "0.1") +
      wrapSelect("Tuner AGC", "tuner_agc", String(f.agc), ON_OFF) +
      wrapSelect("Sampling Mode", "sampling_mode", "0", SAMPLING) +
      wrapText("Oversampling", "oversampling", "4", null, "number") +
      wrapText("Squelch Level", "squelch_level", "0.0", null, "number", "0.1") +
      wrapText("FIR Size", "fir_size", "9", null, "number") +
      wrapText("Atan Math", "atan_math", "std") +
      wrapText("Audio Output Filter", "audio_output_filter", "vol 1") +
      wrapText("rtl_fm Options", "options", "") +
      wrapText("USB Device (serial number or index)", "usb_device_string", "", null, "text", null, "usb_device_datalist") + USB_DATALIST +
      wrapSelect("Bias-T Power", "bias_t_flag", "0", ON_OFF) +
      "<br><br><input class='button button-primary' type='submit' value='Save'> " +
      "<input class='button' type='button' value='Delete' onclick='deleteFrequencyRecord(this.form);'></form>";
  }

  var DEVICES_FORM_FIXTURE =
    "<form class='device_form' id='deviceForm' onsubmit='event.preventDefault(); return false;' method='POST'>" +
    "<label for='audio_input'>Select Audio Input:</label>" +
    "<select name='audio_input' class='twelve columns value-prop' title='Selects a Core Audio input device, like &quot;Built-in Microphone&quot;.'>" +
    "<option value='Built-in Microphone'>Built-in Microphone</option><option value='USB Audio CODEC'>USB Audio CODEC</option>" +
    "<option value='Loopback Audio'>Loopback Audio</option></select>" +
    "<label for='audio_output_filter'>Sox Audio Output Filter:</label>" +
    "<input class='twelve columns value-prop' type='text' " + VERBATIM + " id='audio_output_filter' name='audio_output_filter' value='vol 4' " +
    "title='Applied by the Sox audio tool to the final output. Default &quot;vol 4&quot;. Do not set a &quot;rate&quot; here — the sample rate is fixed at 48000.'>" +
    "<br><br><input class='twelve columns button button-primary' type='button' value='Listen' onclick=\"deviceListenButtonClicked(getElementById('deviceForm'));\" " +
    "title='Listen to the selected audio input device.'></form><br>&nbsp;<br>";

  var PAF_SAMPLE_FILES = [
    ["jazz-set-01.mp3", "8.4 MB", "Sep 18, 2026 at 7:30 PM"],
    ["morning-news-bumper.m4a", "412 KB", "Sep 21, 2026 at 6:05 AM"],
    ["station-ident.aac", "96 KB", "Sep 24, 2026 at 11:42 AM"],
    ["weekend-mix.mp3", "21.7 MB", "Sep 27, 2026 at 9:00 PM"]
  ];
  var PLAY_AUDIO_FILES_FORM_FIXTURE =
    "<form class='play_audio_files_form' id='playAudioFilesForm' onsubmit='event.preventDefault(); return false;' method='POST'>" +
    "<label>Play Audio Files</label>" +
    "<p>Play the audio files from a folder through the live audio pipeline (<code>PCMFilePlayer</code> decodes each one in turn).</p>" +
    "<div class='tts-select-actions'><input class='button' type='button' value='Select All' onclick='pafSelectAllFiles(true);'>" +
    "<input class='button' type='button' value='Select None' onclick='pafSelectAllFiles(false);'></div>" +
    "<div class='scrolling-file-list'><table class='u-full-width'><thead><tr><th></th><th>Name</th><th>Date</th></tr></thead><tbody>" +
    PAF_SAMPLE_FILES.map(function (f, i) {
      return "<tr><td><input type='checkbox' class='paf-file-checkbox' id='paf-file-" + i + "' value='" + f[0] + "' checked></td>" +
        "<td><label for='paf-file-" + i + "'>" + f[0] + " <span class='rec-size'>(" + f[1] + ")</span></label></td><td>" + f[2] + "</td></tr>";
    }).join("") + "</tbody></table></div>" +
    "<label for='paf_sequence'>Sequence</label>" +
    "<select id='paf_sequence' name='paf_sequence' class='u-full-width' title='Chronological plays the oldest file first; Alphabetical sorts by file name; Random shuffles the order.'>" +
    "<option value='chronological'>Chronological (oldest file first)</option><option value='alphabetical'>Alphabetical (by file name)</option><option value='random'>Random</option></select>" +
    "<label for='paf_playlist' title='Play a playlist file&#39;s own files, in its own order, instead of the checked files above.'>Playlist</label>" +
    "<select id='paf_playlist' name='paf_playlist' class='u-full-width' onchange='pafPlaylistChanged(this);'>" +
    "<option value=''>None (use checked files and Sequence above)</option><option value='weekend.m3u'>weekend.m3u</option></select>" +
    "<label for='paf_repeat' title='Loop through the folder continuously until you play something else.'><input type='checkbox' id='paf_repeat' name='paf_repeat' value='1'> Repeat indefinitely</label>" +
    "<br><br><input class='twelve columns button button-primary' type='button' value='Listen' onclick=\"playAudioFilesListenButtonClicked(getElementById('playAudioFilesForm'));\" " +
    "title='Play the selected folder&#39;s audio files through the live audio pipeline.'></form><br>&nbsp;<br>";

  var SPEAK_RSS_HEADLINES_FORM_FIXTURE =
    "<form class='speak_rss_headlines_form' id='speakRSSHeadlinesForm' onsubmit='event.preventDefault(); return false;' method='POST'>" +
    "<label>Speak RSS Headlines</label>" +
    "<p>Read the latest headlines from your subscribed feeds through the live audio pipeline (<code>PCMSpeechSynth</code> renders each headline, <code>PCMFilePlayer</code> plays them in turn).</p>" +
    "<div class='scrolling-file-list'><table class='u-full-width'><thead><tr><th></th><th>Name</th><th>Feed URL</th></tr></thead><tbody>" +
    FEEDS.map(function (f) {
      return "<tr><td><input type='checkbox' class='rss-feed-checkbox' id='rss-feed-" + f.id + "' value='" + f.id + "' checked></td>" +
        "<td><label for='rss-feed-" + f.id + "'><a onclick=\"loadContent('editrssfeed.html?id=" + f.id + "');\">" + f.name + "</a></label></td><td>" + f.url + "</td></tr>";
    }).join("") + "</tbody></table></div>" +
    "<div class='tts-select-actions'><input class='button' type='button' value='Add New Feed' onclick=\"loadContent('addrssfeedform.html');\">" +
    "<label class='button' for='rss_opml_file'>Import OPML…</label>" +
    "<input type='file' id='rss_opml_file' accept='.opml,.xml,text/xml' style='display:none;' onchange='importOPMLFeeds(this);'></div><br>&nbsp;<br>" +
    "<label for='rss_items_per_feed' title='How many of each checked feed’s newest items to read.'>Items per feed</label>" +
    "<input class='u-full-width' type='number' id='rss_items_per_feed' name='rss_items_per_feed' value='5' min='1' max='20'>" +
    "<label for='rss_voice_mode'>Voice</label>" +
    "<select id='rss_voice_mode' name='rss_voice_mode' class='u-full-width' onchange='rssVoiceModeChanged(this);' " +
    "title='Per feed uses each feed’s own assigned voice (Configuration default when unset). Alternate switches between two voices item by item, like a pair of co-anchors.'>" +
    "<option value='per_feed'>Use each feed's own voice</option><option value='alternate'>Alternate between two voices (co-anchors)</option></select>" +
    "<div id='rss_alternate_voices' style='display:none;'><label for='rss_voice_a'>Voice A</label>" + voiceSelect("rss_voice_a", "") +
    "<label for='rss_voice_b'>Voice B</label>" + voiceSelect("rss_voice_b", "") + "</div>" +
    "<label for='rss_repeat' title='Loop through the same batch of headlines continuously until you play something else.'><input type='checkbox' id='rss_repeat' name='rss_repeat' value='1'> Repeat indefinitely</label>" +
    "<br><br><input class='twelve columns button button-primary' type='button' value='Listen' onclick=\"speakRSSHeadlinesListenButtonClicked(getElementById('speakRSSHeadlinesForm'));\" " +
    "title='Fetch the checked feeds and read their newest headlines through the live audio pipeline.'></form><br>&nbsp;<br>";

  var ADD_RSS_FEED_FORM_FIXTURE =
    "<form id='addRSSFeedForm' onsubmit=\"event.preventDefault(); return addRSSFeedRecord(this);\" method='POST'>" +
    "<label for='rss_new_name'>Name<input class='u-full-width' type='text' id='rss_new_name' name='name' value='' placeholder='Feed name'></label>" +
    "<label for='rss_new_url'>Feed URL<input class='u-full-width' type='text' id='rss_new_url' name='feed_url' value='' placeholder='https://…/rss'></label>" +
    "<input class='twelve columns button button-primary' type='submit' value='Add New Feed'></form>";

  function editRSSFeedForm() {
    var f = byId(FEEDS, cur.feed);
    return "<form id='editRSSFeedForm' onsubmit=\"event.preventDefault(); return storeRSSFeedRecord(this);\" method='POST'>" +
      "<input type='hidden' name='id' value='" + f.id + "'>" +
      wrapText("Name", "name", f.name) + wrapText("Feed URL", "feed_url", f.url) +
      "<label>Voice" + voiceSelect("voice_identifier", f.voice) + "</label>" +
      wrapSelect("Read Mode", "read_mode", f.mode, [["title", "Title only"], ["title_and_summary", "Title + summary"]]) +
      "<br><br><input class='button button-primary' type='submit' value='Save'> " +
      "<input class='button' type='button' value='Delete' onclick='deleteRSSFeedRecord(this.form);'></form>";
  }

  var NOT_IN_PREVIEW =
    '<div style="max-width:520px;margin:1.5rem auto;padding:1rem 1.25rem;border:1px solid #d9b7b2;' +
    'border-radius:8px;background:#faf1f0;color:#7a2c22;text-align:left">' +
    '<strong>Not available in the static preview.</strong><br>' +
    'This screen needs the AntennaHead app running with a radio or audio device. ' +
    'The layout and navigation are still representative of the real UI.</div>';

  function icon(name) {
    return '<embed class="value-img" type="image/svg+xml" src="images/' + name + '.svg" />';
  }

  /* ControlBooth pages. The real app renders these on the server
     (controlBoothPageHTML() in AntennaHeadHTTPServer.swift); these fixtures
     mirror its markup with sample data: the radio on the air, a few
     pipelines, the AirPlay receiver idle, the dsd-neo scanner mid-call. */
  var CB_PAGES = {
    "controlbooth.html": "ControlBooth",
    "controlboothpipelines.html": "ControlBooth Remote Control",
    "controlboothradiopage.html": "AntennaHead Radio",
    "controlboothairplay.html": "AirPlay Receiver",
    "controlboothdsdneopage.html": "dsd-neo Scanner"
  };
  var CB_NOW_PLAYING = "AntennaHead Radio";

  function cbPreviewButton(value, primary) {
    return '<input class="twelve columns button' + (primary ? " button-primary" : "") + '" type="button" value="' +
      value + '" onclick="window.__ahPreviewToast(\'Preview only — this needs ControlBooth on the Mac\')"><br>&nbsp;<br>';
  }
  function cbTile(iconName, page, description) {
    return '<div class="six columns value-prop">' + icon(iconName) +
      '<div class="value-prop"><a class="button button-primary" onclick="loadContent(\'' + page + '\');">' +
      CB_PAGES[page] + "</a></div>" + description + "</div>";
  }
  function controlBoothPage(page) {
    var s = '<div class="container"><section class="header"><h2 class="title">AntennaHead</h2>' +
      '<h3 class="title" id="listen_title">' + CB_PAGES[page] + "</h3>" +
      '<p id="controlbooth_status" data-page="' + page + '">ControlBooth: <strong style="color:green">Running</strong></p>' +
      '<p id="controlbooth_active">Now playing: <strong>' + CB_NOW_PLAYING + "</strong></p>";
    if (page === "controlbooth.html") {
      s += '<div class="value-prop row">' +
        cbTile("cbradio", "controlboothradiopage.html", "Music with an announcer, news<br>and weather, on the air") +
        cbTile("cbremote", "controlboothpipelines.html", "Start a ControlBooth pipeline<br>as the audio source") +
        '</div><div class="value-prop row">' +
        cbTile("cbairplay", "controlboothairplay.html", "Play AirPlay audio sent<br>to ControlBooth") +
        cbTile("cbdsdneo", "controlboothdsdneopage.html", "Follow a P25 trunked system<br>with dsd-neo") +
        "</div>";
    } else if (page === "controlboothradiopage.html") {
      s += '<div id="radio_section" data-phase="onAir">' +
        '<p>Station: <strong id="radio_status">On the Air</strong></p>' +
        '<p id="radio_now_playing">Now playing: Cheap Sunglasses — ZZ Top</p>' +
        cbPreviewButton("Skip Song") + cbPreviewButton("Stop") + "</div>";
    } else if (page === "controlboothpipelines.html") {
      s += '<label for="pipeline_select">Select Pipeline:</label>' +
        '<select name="pipeline_select" class="twelve columns value-prop">' +
        ["KUAR-FM 89.1-1 Little Rock HD Radio", "KLRE-FM 90.5-1 Little Rock HD Radio",
         "NOAA Weather Radio", "Test 100.3 NRSC5"].map(function (p) {
          return "<option>" + p + "</option>";
        }).join("") + "</select><br><br>" +
        cbPreviewButton("Listen", true) + cbPreviewButton("Stop");
    } else if (page === "controlboothairplay.html") {
      s += "<p>AirPlay Receiver: <strong>Idle — advertising, no AirPlay client connected</strong></p>" +
        cbPreviewButton("Listen", true);
    } else if (page === "controlboothdsdneopage.html") {
      s += '<p>Scanner: <strong id="dsdneo_status">Scanning — TG 2101 Pulaski County Sheriff</strong></p>' +
        cbPreviewButton("Stop") + cbPreviewButton("Skip Call") +
        '<label for="dsdneo_mode">Follow:</label><select id="dsdneo_mode" class="twelve columns">' +
        '<option selected>Scan all talkgroups</option><option>Always Allow talkgroups only</option>' +
        "<option>Hold one talkgroup</option></select>" + cbPreviewButton("Apply") +
        '<p><input class="button" type="button" value="Lock Out TG 2101" ' +
        'onclick="window.__ahPreviewToast(\'Preview only — this needs ControlBooth on the Mac\')"></p>' +
        '<h5>Locked Out Talkgroups</h5><table class="u-full-width"><tbody>' +
        '<tr><td>Encrypted (TG 1417)</td><td><input class="button" type="button" value="Remove" ' +
        'onclick="window.__ahPreviewToast(\'Preview only — this needs ControlBooth on the Mac\')"></td></tr>' +
        "</tbody></table>";
    }
    s += '<br><input class="button" type="button" value="Refresh" onclick="loadContent(\'' + page + '\');">';
    if (page !== "controlbooth.html") {
      s += ' <input class="button" type="button" value="ControlBooth Menu" onclick="loadContent(\'controlbooth.html\');">';
    }
    return s + "<br>&nbsp;<br></section></div>";
  }

  /* Text to Speech page (devicetexttospeech.html). Mirrors
     textToSpeechFormHTML() + speakTextFormHTML() in AntennaHeadHTTPServer.swift
     with a sample folder; the Speak Text example and the markup guide below
     are copied from that file's speakTextExample / speechMarkupHelpHTML. */
  var SPEECH_MARKUP_HELP = "<details class='speech-markup-help'><summary>Controlling the voice: pauses, speed, pronunciation</summary>\n<p>There are two ways to control how the text is spoken, and they depend on the voice.</p>\n<p><strong>Modern voices</strong> (Ava, Samantha, Siri and other Premium/Enhanced voices): start the text with\n<code>&lt;speak&gt;</code> and end it with <code>&lt;/speak&gt;</code> to use SSML markup. Measured with the Premium Ava voice:</p>\n<table class='u-full-width'>\n<thead><tr><th>Markup</th><th>Effect</th></tr></thead>\n<tbody>\n<tr><td><code>&lt;prosody rate=\"50%\"&gt;&hellip;&lt;/prosody&gt;</code> (also <code>\"150%\"</code>, <code>\"slow\"</code>, <code>\"fast\"</code>)</td><td>\u2705 Speed. 50% took 3.7&nbsp;s where normal took 2.8&nbsp;s.</td></tr>\n<tr><td><code>&lt;break time=\"1500ms\"/&gt;</code></td><td>\u2705 A pause of that length.</td></tr>\n<tr><td><code>&lt;prosody volume=\"x-soft\"&gt;&hellip;&lt;/prosody&gt;</code></td><td>\u2705 Volume. <code>x-soft</code> is about a quarter as loud.</td></tr>\n<tr><td><code>&lt;say-as interpret-as=\"characters\"&gt;KHDX&lt;/say-as&gt;</code></td><td>\u2705 Spells it out letter by letter.</td></tr>\n<tr><td><code>&lt;phoneme alphabet=\"ipa\" ph=\"&hellip;\"&gt;word&lt;/phoneme&gt;</code></td><td>\u2705 Fixes a pronunciation, written in the IPA phonetic alphabet.</td></tr>\n<tr><td><code>&lt;prosody pitch=\"+40%\"&gt;&hellip;&lt;/prosody&gt;</code></td><td>\u26a0\ufe0f Changes the audio only slightly; the pitch barely moves.</td></tr>\n<tr><td><code>&lt;emphasis level=\"strong\"&gt;&hellip;&lt;/emphasis&gt;</code></td><td>\u274c Ignored.</td></tr>\n<tr><td><code>&lt;sub alias=\"North Little Rock\"&gt;NLR&lt;/sub&gt;</code></td><td>\u274c Ignored: still says the letters. Type the words out instead.</td></tr>\n</tbody></table>\n<p>If the markup can&rsquo;t be parsed (for example, a closing tag that doesn&rsquo;t match its opening tag),\nnothing is spoken at all and the log shows &ldquo;invalid SSML&rdquo;. A <code>&lt;voice name=\"&hellip;\"&gt;</code> tag inside the markup overrides the Voice menu.</p>\n<p><strong>Classic voices</strong> (names in the Voice menu such as Alex, Albert and Fred, whose identifiers start with\n<code>com.apple.speech.synthesis.voice.</code>) don&rsquo;t read SSML. Instead, put commands in double brackets\nin plain text:</p>\n<ul>\n<li><code>[[slnc 1500]]</code> &mdash; pause 1.5 seconds</li>\n<li><code>[[rate 120]]</code> &mdash; speed in words per minute</li>\n<li><code>[[pbas 40]]</code> &mdash; base pitch; <code>[[pmod 60]]</code> &mdash; how much the pitch varies</li>\n</ul>\n<p>Don&rsquo;t mix the two: modern voices read <code>[[&hellip;]]</code> commands out loud, and classic voices read SSML tags out loud.\nThe Voice menu&rsquo;s &ldquo;Default voice&rdquo; is the Text to Speech voice chosen in AntennaHead&rsquo;s Configuration tab.</p>\n</details>";
  var SPEAK_TEXT_EXAMPLE = "&lt;speak&gt;It is four oh nine &lt;break time=\"700ms\"/&gt; &lt;prosody rate=\"80%\"&gt;on AntennaHead Radio.&lt;/prosody&gt;&lt;/speak&gt;";
  var TTS_SAMPLE_FILES = [
    ["announcement-welcome.txt", "1 KB", "Sep 20, 2026 at 9:14 AM"],
    ["news-intro.txt", "2 KB", "Sep 22, 2026 at 6:02 PM"],
    ["station-id.txt", "1 KB", "Sep 24, 2026 at 11:40 AM"],
    ["weather-disclaimer.txt", "3 KB", "Sep 27, 2026 at 8:25 PM"]
  ];
  var TEXT_TO_SPEECH_FORM =
    '<form class="text_to_speech_form" id="textToSpeechForm" onsubmit="event.preventDefault(); return false;" method="POST">' +
    "<label>Text to Speech</label>" +
    "<p>Speak the <code>.txt</code> files from a folder through the live audio pipeline " +
    "(<code>PCMSpeechSynth</code> synthesizes each one in turn).</p>" +
    '<div class="tts-select-actions">' +
    '<input class="button" type="button" value="Select All" onclick="ttsSelectAllFiles(true);">' +
    '<input class="button" type="button" value="Select None" onclick="ttsSelectAllFiles(false);"></div>' +
    '<div class="scrolling-file-list"><table class="u-full-width">' +
    "<thead><tr><th></th><th>Name</th><th>Date</th></tr></thead><tbody>" +
    TTS_SAMPLE_FILES.map(function (f, i) {
      return '<tr><td><input type="checkbox" class="tts-file-checkbox" id="tts-file-' + i + '" value="' + f[0] + '" checked></td>' +
        '<td><label for="tts-file-' + i + '">' + f[0] + ' <span class="rec-size">(' + f[1] + ")</span></label></td>" +
        "<td>" + f[2] + "</td></tr>";
    }).join("") +
    "</tbody></table></div>" +
    '<label for="tts_sequence">Sequence</label>' +
    '<select id="tts_sequence" name="tts_sequence" class="u-full-width">' +
    '<option value="chronological">Chronological (oldest file first)</option>' +
    '<option value="alphabetical">Alphabetical (by file name)</option>' +
    '<option value="random">Random</option></select>' +
    '<label for="tts_repeat"><input type="checkbox" id="tts_repeat" name="tts_repeat" value="1"> Repeat indefinitely</label>' +
    '<br><br><input class="twelve columns button button-primary" type="button" value="Listen" ' +
    "onclick=\"textToSpeechListenButtonClicked(getElementById('textToSpeechForm'));\">" +
    "</form><br>&nbsp;<br>" +
    '<form class="speak_text_form" id="speakTextForm" onsubmit="event.preventDefault(); return false;" method="POST">' +
    '<label for="tts_speak_text">Speak Text</label>' +
    "<p>Type text and speak it once through the live audio pipeline. Text that starts with " +
    "<code>&lt;speak&gt;</code> is read as SSML markup (see below).</p>" +
    '<textarea id="tts_speak_text" name="tts_speak_text" class="u-full-width" rows="6" ' +
    'autocomplete="off" autocorrect="off" autocapitalize="none" spellcheck="false">' + SPEAK_TEXT_EXAMPLE + "</textarea>" +
    '<label for="tts_speak_voice">Voice</label>' +
    '<select id="tts_speak_voice" name="tts_speak_voice" class="u-full-width">' +
    '<option value="" selected>Default voice</option>' +
    "<option>Alex — en-US</option><option>Ava — en-US (Premium)</option>" +
    "<option>Fred — en-US</option><option>Samantha — en-US (Enhanced)</option></select>" +
    '<br><br><input class="twelve columns button button-primary" type="button" value="Speak" ' +
    "onclick=\"speakTextButtonClicked(getElementById('speakTextForm'));\">" +
    "</form><br>" + SPEECH_MARKUP_HELP + "<br>&nbsp;<br>";

  // "Listen to Gqrx" tile on the Radio page (the real app injects it when Gqrx
  // integration is enabled in Configuration).
  var GQRX_TILE =
    '<div class="six columns value-prop">' + icon("gqrx") +
    '<div class="value-prop"><a class="button button-primary" ' +
    'onclick="loadContent(\'devicegqrx.html\');">Listen to Gqrx</a></div>' +
    "Receive Gqrx's UDP audio output<br>and stream it here</div>";

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
    PLAY_AUDIO_FILES_ICON: icon("playaudiofiles"),
    SPEAK_RSS_HEADLINES_ICON: icon("rss"),
    LOCALRADIO_ANIMATION: icon("AntennaHead-animation"),
    GQRX_TILE: GQRX_TILE,

    CATEGORIES_TABLE: CATEGORIES_TABLE_REAL,
    CATEGORY_TABLE: categoryFavoritesTable,
    EDIT_CATEGORY_TABLE: editCategoryTable,
    SCAN_CATEGORY_BUTTON: scanCategoryButton,
    EDIT_CATEGORY_LIST_BUTTON: function () { return catNavButton("editcategory.html", "Edit Frequencies List"); },
    CATEGORY_SETTINGS_BUTTON: function () { return catNavButton("editcategorysettings.html", "Category Settings"); },
    DELETE_CATEGORY_BUTTON: deleteCategoryButton,
    FAVORITES_TABLE: FAVORITES_TABLE_REAL,
    SCANNER_CATEGORIES_TABLE: SCANNER_CATEGORIES_TABLE,
    RECORDINGS_LIST: RECORDINGS_LIST,

    NOW_PLAYING_NAME: "KUAR-NPR Little Rock 89.1",
    NOW_PLAYING_DETAILS: NOW_PLAYING_DETAILS,
    NOW_PLAYING_STATUS_RESULT: "",
    SPATIAL_AUDIO_CONTROLS: SPATIAL_AUDIO_CONTROLS,
    AUDIO_DELAY_CONTROLS: AUDIO_DELAY_CONTROLS,
    OPEN_AUDIO_PLAYER_PAGE_BUTTON: "",

    AAC_BITRATE_SELECT: AAC_BITRATE_SELECT,
    WEB_UI_THEME_SELECT: WEB_UI_THEME_SELECT,
    CATEGORY_SELECT: CATEGORY_SELECT,

    TUNER_FORM: TUNER_FORM,
    DEVICES_FORM: DEVICES_FORM_FIXTURE,
    GQRX_FORM: GQRX_FORM,
    TEXT_TO_SPEECH_FORM: TEXT_TO_SPEECH_FORM,
    PLAY_AUDIO_FILES_FORM: PLAY_AUDIO_FILES_FORM_FIXTURE,
    SPEAK_RSS_HEADLINES_FORM: SPEAK_RSS_HEADLINES_FORM_FIXTURE,
    ADD_RSS_FEED_FORM: ADD_RSS_FEED_FORM_FIXTURE,
    EDIT_RSS_FEED: editRSSFeedForm,
    EDIT_RSS_FEED_NAME: function () { return byId(FEEDS, cur.feed).name; },
    EDIT_FAVORITE: editFavoriteForm,
    EDIT_CATEGORY_SETTINGS: editCategorySettingsForm,
    VIEW_FAVORITE_ITEM: viewFavoriteItem,
    VIEW_LISTEN: NOT_IN_PREVIEW,
    SCAN_CATEGORY: NOT_IN_PREVIEW,
    SCAN_CATEGORY_LISTEN: NOT_IN_PREVIEW,

    CATEGORY_NAME: function () { return byId(CATS, cur.cat).name; },
    EDIT_CATEGORY_NAME: function () { return byId(CATS, cur.cat).name; },
    SCAN_CATEGORY_NAME: function () { return byId(CATS, cur.cat).name; },
    VIEW_FAVORITE_NAME: function () { return byId(FAVS, cur.fav).name; },
    EDIT_FAVORITE_NAME: function () { return byId(FAVS, cur.fav).name; },
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

  var audioDelay = 0; // seconds; state for the mocked /api/audio-delay/update

  function mockFor(method, url, body) {
    var u = String(url);
    method = String(method || "GET").toUpperCase();

    // Remember which record a fragment URL asked for (viewfavorite.html?id=3 ...)
    // so the token functions above render that record.
    var idm = /([a-z]+)\.html\?(?:[^#]*&)?id=(\d+)/.exec(u);
    if (idm) {
      var n = parseInt(idm[2], 10);
      if (idm[1] === "viewfavorite" || idm[1] === "editfavorite") cur.fav = n;
      else if (/^(category|editcategory|editcategorysettings|scancategory)$/.test(idm[1])) cur.cat = n;
      else if (idm[1] === "editrssfeed") cur.feed = n;
    }
    if (/editcategoryitem\.html/.test(u)) return { body: "", toast: "Preview only \u2014 category changes aren't saved" };

    // ControlBooth pages, and their actions (which stay on the same page).
    var cbPage = u.replace(/^.*\//, "").replace(/\?.*$/, "");
    if (Object.prototype.hasOwnProperty.call(CB_PAGES, cbPage)) return { body: controlBoothPage(cbPage) };
    var CB_ACTIONS = {
      "controlboothradio.html": "controlboothradiopage.html",
      "controlboothstop.html": "controlboothpipelines.html",
      "controlboothairplaystop.html": "controlboothairplay.html",
      "controlboothdsdneo.html": "controlboothdsdneopage.html",
      "controlboothlaunched.html": "controlbooth.html"
    };
    if (Object.prototype.hasOwnProperty.call(CB_ACTIONS, cbPage)) {
      return { body: controlBoothPage(CB_ACTIONS[cbPage]), toast: "Preview only — this needs ControlBooth on the Mac" };
    }
    if (/controlbooth(listenbuttonclicked|airplaylisten)\.html$/.test(u)) {
      return { body: "", toast: "Preview only — this needs ControlBooth on the Mac" };
    }

    if (method === "POST") { var gm = gqrxMock(u, body); if (gm) return gm; }
    if (/nowplayingstatus\.html$/.test(u)) {
      GQRX.signal = -31 + Math.round((Math.random() * 6 - 3) * 10) / 10;   // the meter moves a little, like a live signal
      return { body: JSON.stringify(NOW_PLAYING_STATUS) };
    }
    if (/rtlsdrdevices\.html$/.test(u)) return { body: JSON.stringify(["RTL2838 (00000001)"]) };
    if (/api\/aac-recorder\/status$/.test(u)) return { body: JSON.stringify({ recording: false, elapsed: 0 }) };
    if (/api\/aac-recorder\/(start|stop)$/.test(u)) return { body: JSON.stringify({ recording: false, elapsed: 0 }), toast: "Preview only — recorder needs the app" };
    if (/api\/v1\/controlbooth\/status$/.test(u)) return { body: JSON.stringify({ running: false }) };
    if (/captions\.json$/.test(u)) return { body: JSON.stringify({ seq: 0, lines: [] }) };
    if (/api\/spatial-audio\/update$/.test(u)) return { body: "{}" };
    if (/api\/audio-delay\/update$/.test(u)) {
      var req = {};
      try { req = JSON.parse(body || "{}"); } catch (e) {}
      if (typeof req.adjust === "number") audioDelay += req.adjust;
      else if (typeof req.seconds === "number") audioDelay = req.seconds;
      audioDelay = Math.max(0, Math.min(600, audioDelay));
      return { body: JSON.stringify({ seconds: audioDelay }) };
    }

    if (method === "POST" && /(listenbuttonclicked|insertnewfrequency|storefrequency|deletefrequency|storecategory|addcategory|deletecategory|applyaacsettings|applywebuitheme|texttospeechchoosefolder|speaktextbuttonclicked|storerssfeed|deleterssfeed|addrssfeed|importopmlfeeds)\.html$/.test(u)) {
      return { body: "", toast: "Preview only — this action needs the AntennaHead app" };
    }
    return null;
  }

  /* The real app polls nowplayingstatus.html every second or so, which is
     what fills and refreshes the Gqrx remote-control panel. Polling is off in
     this preview, so poll only while that panel is on screen. A new panel
     element means a fresh visit to the page: reset antennahead.js's
     "populate once" flags first, as the app's index.html does on navigation. */
  var gqrxPanelSeen = null;
  setInterval(function () {
    var panel = document.getElementById("gqrxPanel");
    if (!panel) { gqrxPanelSeen = null; return; }
    if (panel !== gqrxPanelSeen) {
      gqrxPanelSeen = panel;
      if (typeof gqrxResetPanelState === "function") gqrxResetPanelState();
    }
    var x = new XMLHttpRequest();
    x.open("POST", "nowplayingstatus.html", true);
    x.onload = function () {
      try { gqrxUpdatePanel(JSON.parse(x.responseText).gqrx); } catch (e) {}
    };
    x.send();
  }, 1000);

  XMLHttpRequest.prototype.open = function (method, url) {
    this.__m = method;
    this.__u = url;
    return RealOpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function (body) {
    var m = mockFor(this.__m, this.__u, body);
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
    // Tile icons are <embed>ed SVG files here (the app inlines them), so an
    // icon's own onclick runs inside the embedded document, where there's no
    // loadContent(). Let clicks fall through the embed to a wrapper that
    // presses the tile's button instead, like clicking the icon in the app.
    Array.prototype.forEach.call(root.querySelectorAll("embed.value-img"), function (embed) {
      var button = embed.parentNode && embed.parentNode.querySelector("a.button");
      if (!button || embed.parentNode.classList.contains("ah-icon-link")) return;
      var link = document.createElement("span");
      link.className = "ah-icon-link";
      link.setAttribute("role", "button");
      link.setAttribute("aria-label", button.textContent.trim());
      link.style.cssText = "display:inline-block;cursor:pointer";
      embed.style.pointerEvents = "none";
      embed.parentNode.insertBefore(link, embed);
      link.appendChild(embed);
      link.addEventListener("click", function () { button.click(); });
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
    r.textContent = "Interactive preview — no radio connected";
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
