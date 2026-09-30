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
    AUDIO_DELAY_CONTROLS: AUDIO_DELAY_CONTROLS,
    OPEN_AUDIO_PLAYER_PAGE_BUTTON: "",

    AAC_BITRATE_SELECT: AAC_BITRATE_SELECT,
    WEB_UI_THEME_SELECT: WEB_UI_THEME_SELECT,
    CATEGORY_SELECT: CATEGORY_SELECT,

    TUNER_FORM: NOT_IN_PREVIEW,
    DEVICES_FORM: NOT_IN_PREVIEW,
    GQRX_FORM: NOT_IN_PREVIEW,
    TEXT_TO_SPEECH_FORM: TEXT_TO_SPEECH_FORM,
    PLAY_AUDIO_FILES_FORM: NOT_IN_PREVIEW,
    SPEAK_RSS_HEADLINES_FORM: NOT_IN_PREVIEW,
    ADD_RSS_FEED_FORM: NOT_IN_PREVIEW,
    EDIT_RSS_FEED: NOT_IN_PREVIEW,
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

  var audioDelay = 0; // seconds; state for the mocked /api/audio-delay/update

  function mockFor(method, url, body) {
    var u = String(url);
    method = String(method || "GET").toUpperCase();

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

    if (/nowplayingstatus\.html$/.test(u)) return { body: JSON.stringify(NOW_PLAYING_STATUS) };
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

    if (method === "POST" && /(listenbuttonclicked|insertnewfrequency|storefrequency|deletefrequency|storecategory|addcategory|deletecategory|applyaacsettings|applywebuitheme|texttospeechchoosefolder|speaktextbuttonclicked)\.html$/.test(u)) {
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
