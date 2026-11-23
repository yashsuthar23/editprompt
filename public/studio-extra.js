/* Creator Studio — extra tools (all run locally in the browser, no uploads, no external libraries).
   Social Resizer · Colour Palette & Contrast · Video Frame Grabber · Audio Trimmer · Caption Toolkit · Privacy Cleaner */
(function () {
  "use strict";
  var main = document.querySelector(".sp-main");
  if (!main) return;
  var $ = function (id) { return document.getElementById(id); };
  var say = function (id, m) { var e = $(id); if (e) e.textContent = m; };
  var esc = function (t) { var d = document.createElement("div"); d.textContent = t == null ? "" : String(t); return d.innerHTML; };
  var toBlob = function (c, type, q) { return new Promise(function (r) { c.toBlob(r, type, q); }); };
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var fmtSize = function (n) { return n > 1048576 ? (n / 1048576).toFixed(2) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB"; };
  function dl(blob, name) {
    var u = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(u); }, 5000);
  }
  function copy(text, statusId, okMsg) {
    var done = function () { say(statusId, okMsg || "Copied."); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () { say(statusId, "Copy blocked — select and copy manually."); });
    else say(statusId, "Copy is not available in this browser.");
  }
  function panel(o) {
    return '<section class="tool-panel" id="' + o.id + '" data-tool="' + o.id + '" data-title="' + o.title + '" data-group="' + o.group +
      '" data-desc="' + o.desc + '"' + (o.badge ? ' data-badge="' + o.badge + '"' : "") + '><span class="pill">' + o.pill + "</span><h2>" + o.heading +
      '</h2><p class="muted">' + o.intro + "</p>" + o.body + "</section>";
  }
  var html = "";

  /* ================= 1. Social Resizer ================= */
  var PRESETS = [
    ["Instagram post · 1:1", 1080, 1080, 1], ["Instagram portrait · 4:5", 1080, 1350, 1], ["Story / Reel / Short · 9:16", 1080, 1920, 1],
    ["YouTube thumbnail · 16:9", 1280, 720, 1], ["Facebook cover", 820, 312, 0], ["X / Twitter header", 1500, 500, 0],
    ["LinkedIn banner", 1584, 396, 0], ["Pinterest pin · 2:3", 1000, 1500, 0]
  ];
  html += panel({
    id: "social-resizer", title: "Social Resizer", group: "Image", desc: "One image, every social size", pill: "Image · Social",
    heading: "Resize for every platform",
    intro: "Pick one image and export it at the right size for Instagram, Stories, YouTube, Facebook, X, LinkedIn and Pinterest. Choose between filling the frame (smart crop) or fitting the whole image on a background.",
    body: '<input id="srFile" type="file" accept="image/png,image/jpeg,image/webp">' +
      '<div class="sp-three"><div><label for="srFit">Fit</label><select id="srFit"><option value="cover">Fill frame (crop)</option><option value="contain">Fit whole image</option></select></div>' +
      '<div><label for="srFocus">Crop focus</label><select id="srFocus"><option value="0.5,0.5">Center</option><option value="0.5,0">Top</option><option value="0.5,1">Bottom</option><option value="0,0.5">Left</option><option value="1,0.5">Right</option></select></div>' +
      '<div><label for="srFmt">Format</label><select id="srFmt"><option value="image/jpeg">JPG</option><option value="image/png">PNG</option><option value="image/webp">WebP</option></select></div></div>' +
      '<div class="sp-presets" id="srPresets">' + PRESETS.map(function (p, i) {
        return '<label class="sp-check"><input type="checkbox" value="' + i + '"' + (p[3] ? " checked" : "") + "><span><b>" + esc(p[0]) + "</b><small>" + p[1] + " × " + p[2] + " px</small></span></label>";
      }).join("") + "</div>" +
      '<div class="actions"><button class="btn" id="srRender" type="button">Create sizes</button><button class="btn ghost" id="srAll" type="button" disabled>Download all</button></div>' +
      '<div class="status" id="srStatus" role="status">Choose an image to begin.</div><div class="sp-results" id="srResults"></div>'
  });

  /* ================= 2. Colour palette & contrast ================= */
  html += panel({
    id: "color-tools", title: "Colour Palette", group: "Image", desc: "Extract colours, check contrast", pill: "Image · Design",
    heading: "Colour palette &amp; contrast checker",
    intro: "Extract the dominant colours from any image to build a brand or thumbnail palette, then check that your text colour is readable on its background (WCAG contrast).",
    body: '<input id="ctFile" type="file" accept="image/png,image/jpeg,image/webp"><div class="sp-swatches" id="ctSwatches"></div>' +
      '<div class="actions"><button class="btn ghost" id="ctCopyHex" type="button" disabled>Copy HEX list</button><button class="btn ghost" id="ctCopyCss" type="button" disabled>Copy as CSS variables</button></div>' +
      '<div class="status" id="ctStatus" role="status">Choose an image to extract its palette.</div><hr class="sp-hr">' +
      '<h3 class="sp-h3">Contrast checker</h3><div class="sp-three"><div><label for="ccFg">Text colour</label><input id="ccFg" type="color" value="#ffffff"></div>' +
      '<div><label for="ccBg">Background colour</label><input id="ccBg" type="color" value="#1f2937"></div><div><label>Ratio</label><div class="sp-ratio" id="ccRatio">—</div></div></div>' +
      '<div class="sp-contrast" id="ccPreview">Sample headline — The quick brown fox</div><div class="sp-badges" id="ccBadges"></div>'
  });

  /* ================= 3. Frame grabber ================= */
  html += panel({
    id: "frame-grabber", title: "Frame Grabber", group: "Video & Social", desc: "Capture thumbnails from a video", pill: "Video",
    heading: "Capture a frame from any video",
    intro: "Open a video, scrub to the perfect moment, step frame-by-frame and save it as a high-quality thumbnail or still. The video never leaves your device.",
    body: '<input id="fgFile" type="file" accept="video/*"><video id="fgVideo" class="sp-video" controls playsinline hidden></video>' +
      '<div class="actions"><button class="btn ghost" id="fgBack" type="button" disabled>◀ Frame</button><button class="btn ghost" id="fgFwd" type="button" disabled>Frame ▶</button>' +
      '<select id="fgFmt" class="sp-inline"><option value="image/png">PNG</option><option value="image/jpeg">JPG</option></select><button class="btn" id="fgCap" type="button" disabled>Capture frame</button></div>' +
      '<div class="status" id="fgStatus" role="status">Choose a video to begin.</div><div class="sp-results" id="fgGallery"></div>'
  });

  /* ================= 4. Audio trimmer ================= */
  html += panel({
    id: "audio-trimmer", title: "Audio Trimmer", group: "Audio", desc: "Cut audio and export WAV", pill: "Audio",
    heading: "Trim &amp; fade audio",
    intro: "Load an audio file (or the sound of a video), pick the start and end on the waveform, add optional fades, preview the selection and export it as a WAV file.",
    body: '<input id="atFile" type="file" accept="audio/*,video/*"><canvas id="atWave" class="sp-wave" width="1000" height="140" aria-label="Audio waveform"></canvas>' +
      '<div class="sp-two"><div><label for="atStart">Start <b id="atStartV">0.00s</b></label><input id="atStart" type="range" min="0" max="1000" value="0" disabled></div>' +
      '<div><label for="atEnd">End <b id="atEndV">0.00s</b></label><input id="atEnd" type="range" min="0" max="1000" value="1000" disabled></div></div>' +
      '<div class="sp-two"><div><label for="atFadeIn">Fade in (ms)</label><input id="atFadeIn" type="number" min="0" max="5000" value="0"></div>' +
      '<div><label for="atFadeOut">Fade out (ms)</label><input id="atFadeOut" type="number" min="0" max="5000" value="0"></div></div>' +
      '<div class="actions"><button class="btn ghost" id="atPlay" type="button" disabled>▶ Play selection</button><button class="btn ghost" id="atStop" type="button" disabled>Stop</button><button class="btn" id="atExport" type="button" disabled>Export WAV</button></div>' +
      '<div class="status" id="atStatus" role="status">Choose an audio or video file.</div>'
  });

  /* ================= 5. Caption toolkit ================= */
  var LIMITS = [["X / Twitter post", 280], ["YouTube title", 100], ["Instagram caption", 2200], ["LinkedIn post", 3000], ["YouTube description", 5000]];
  html += panel({
    id: "caption-toolkit", title: "Caption Toolkit", group: "Video & Social", desc: "Counters, limits, case, hashtags", pill: "Social",
    heading: "Caption toolkit",
    intro: "Write or paste a caption and see live character limits for popular platforms, tidy the text, change its case and pull out hashtags. Platform limits can change, so double-check before publishing.",
    body: '<textarea id="ckText" rows="7" placeholder="Paste or write your caption here..."></textarea>' +
      '<div class="sp-stats" id="ckStats"></div><div class="sp-meters" id="ckMeters">' + LIMITS.map(function (l, i) {
        return '<div class="sp-meter"><div class="sp-meter-top"><span>' + l[0] + '</span><b id="ckM' + i + '">0 / ' + l[1] + '</b></div><div class="sp-meter-track"><div class="sp-meter-fill" id="ckF' + i + '"></div></div></div>';
      }).join("") + "</div>" +
      '<div class="actions"><button class="btn ghost" data-ck="upper" type="button">UPPERCASE</button><button class="btn ghost" data-ck="lower" type="button">lowercase</button>' +
      '<button class="btn ghost" data-ck="title" type="button">Title Case</button><button class="btn ghost" data-ck="sentence" type="button">Sentence case</button>' +
      '<button class="btn ghost" data-ck="clean" type="button">Clean spacing</button><button class="btn ghost" data-ck="tags" type="button">Extract hashtags</button><button class="btn" data-ck="copy" type="button">Copy</button></div>' +
      '<div class="status" id="ckStatus" role="status"></div>'
  });

  /* ================= 6. Privacy cleaner ================= */
  html += panel({
    id: "image-cleaner", title: "Privacy Cleaner", group: "Image", desc: "Strip EXIF and GPS location", pill: "Image · Privacy",
    heading: "Remove hidden photo data",
    intro: "Photos can carry hidden EXIF data such as camera model, date and GPS location. This tool re-saves your images without that data, so you can share them safely. Batch supported.",
    body: '<input id="icFile" type="file" accept="image/png,image/jpeg,image/webp" multiple>' +
      '<div class="sp-two"><div><label for="icFmt">Output format</label><select id="icFmt"><option value="image/jpeg">JPG</option><option value="image/png">PNG</option><option value="image/webp">WebP</option></select></div>' +
      '<div><label for="icQ">Quality <b id="icQV">92%</b></label><input id="icQ" type="range" min="50" max="100" value="92"></div></div>' +
      '<div class="actions"><button class="btn" id="icRun" type="button">Clean images</button></div>' +
      '<div class="status" id="icStatus" role="status">Choose one or more images.</div><div class="sp-list" id="icList"></div>'
  });

  main.insertAdjacentHTML("beforeend", html);

  /* ---------- 1. Social Resizer logic ---------- */
  (function () {
    var bmp = null, rendered = [];
    $("srFile").addEventListener("change", async function () {
      var f = $("srFile").files[0]; if (!f) return;
      try { if (bmp && bmp.close) bmp.close(); bmp = await createImageBitmap(f); say("srStatus", f.name + " · " + bmp.width + " × " + bmp.height + " px. Select sizes and click Create sizes."); }
      catch (e) { bmp = null; say("srStatus", "Could not open this image."); }
    });
    function draw(p, fit, fx, fy) {
      var w = p[1], h = p[2], c = document.createElement("canvas"); c.width = w; c.height = h;
      var x = c.getContext("2d"); x.fillStyle = "#111"; x.fillRect(0, 0, w, h);
      function place(mode, fxx, fyy) {
        var s = mode === "cover" ? Math.max(w / bmp.width, h / bmp.height) : Math.min(w / bmp.width, h / bmp.height);
        var dw = bmp.width * s, dh = bmp.height * s; x.drawImage(bmp, (w - dw) * fxx, (h - dh) * fyy, dw, dh);
      }
      if (fit === "contain") { try { x.filter = "blur(28px) brightness(.7)"; place("cover", .5, .5); x.filter = "none"; } catch (e) { x.filter = "none"; } place("contain", .5, .5); }
      else place("cover", fx, fy);
      return c;
    }
    $("srRender").addEventListener("click", function () {
      if (!bmp) return say("srStatus", "Choose an image first.");
      var picks = [].slice.call($("srPresets").querySelectorAll("input:checked")).map(function (i) { return PRESETS[+i.value]; });
      if (!picks.length) return say("srStatus", "Select at least one size.");
      var fit = $("srFit").value, pos = $("srFocus").value.split(",").map(Number), type = $("srFmt").value;
      var ext = type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
      var box = $("srResults"); box.replaceChildren(); rendered = [];
      picks.forEach(function (p) {
        var c = draw(p, fit, pos[0], pos[1]); var name = "editprompt-" + p[1] + "x" + p[2] + "." + ext;
        var card = document.createElement("div"); card.className = "sp-card";
        var lab = document.createElement("div"); lab.className = "sp-card-title"; lab.textContent = p[0] + " — " + p[1] + " × " + p[2];
        var btn = document.createElement("button"); btn.type = "button"; btn.className = "btn ghost"; btn.textContent = "Download";
        var go = async function () { var b = await toBlob(c, type, 0.92); if (b) dl(b, name); };
        btn.addEventListener("click", go); rendered.push(go);
        card.append(c, lab, btn); box.append(card);
      });
      $("srAll").disabled = false; say("srStatus", picks.length + " size(s) ready.");
    });
    $("srAll").addEventListener("click", async function () { for (var i = 0; i < rendered.length; i++) { await rendered[i](); await sleep(350); } });
  })();

  /* ---------- 2. Colour tools ---------- */
  (function () {
    var colors = [];
    var hex = function (r, g, b) { return "#" + [r, g, b].map(function (v) { return Math.round(v).toString(16).padStart(2, "0"); }).join(""); };
    var lum = function (r, g, b) { var a = [r, g, b].map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2]; };
    var rgb = function (h) { return [1, 3, 5].map(function (i) { return parseInt(h.substr(i, 2), 16); }); };
    function medianCut(px, n) {
      var boxes = [px];
      while (boxes.length < n) {
        var bi = -1, best = 0, ch = 0;
        boxes.forEach(function (b, i) {
          if (b.length < 2) return;
          for (var c = 0; c < 3; c++) { var mn = 255, mx = 0; for (var k = 0; k < b.length; k++) { var v = b[k][c]; if (v < mn) mn = v; if (v > mx) mx = v; } var score = (mx - mn) * Math.sqrt(b.length); if (score > best) { best = score; bi = i; ch = c; } }
        });
        if (bi < 0) break;
        var b = boxes[bi].sort(function (p, q) { return p[ch] - q[ch]; }); var mid = b.length >> 1;
        boxes.splice(bi, 1, b.slice(0, mid), b.slice(mid));
      }
      var total = px.length;
      return boxes.filter(function (b) { return b.length; }).map(function (b) {
        var s = [0, 0, 0]; b.forEach(function (p) { s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; });
        return { hex: hex(s[0] / b.length, s[1] / b.length, s[2] / b.length), pct: b.length / total };
      }).sort(function (a, b) { return b.pct - a.pct; });
    }
    $("ctFile").addEventListener("change", async function () {
      var f = $("ctFile").files[0]; if (!f) return;
      try {
        var bmp = await createImageBitmap(f), s = Math.min(1, 110 / Math.max(bmp.width, bmp.height));
        var c = document.createElement("canvas"); c.width = Math.max(1, Math.round(bmp.width * s)); c.height = Math.max(1, Math.round(bmp.height * s));
        var x = c.getContext("2d", { willReadFrequently: true }); x.drawImage(bmp, 0, 0, c.width, c.height);
        var d = x.getImageData(0, 0, c.width, c.height).data, px = [];
        for (var i = 0; i < d.length; i += 4) if (d[i + 3] > 128) px.push([d[i], d[i + 1], d[i + 2]]);
        colors = medianCut(px, 6);
        var box = $("ctSwatches"); box.replaceChildren();
        colors.forEach(function (col) {
          var b = document.createElement("button"); b.type = "button"; b.className = "sp-swatch"; b.style.background = col.hex;
          var r = rgb(col.hex); b.style.color = lum(r[0], r[1], r[2]) > 0.45 ? "#111" : "#fff";
          b.innerHTML = "<b>" + col.hex.toUpperCase() + "</b><small>" + Math.round(col.pct * 100) + "%</small>";
          b.addEventListener("click", function () { copy(col.hex.toUpperCase(), "ctStatus", col.hex.toUpperCase() + " copied."); });
          box.append(b);
        });
        $("ctCopyHex").disabled = $("ctCopyCss").disabled = !colors.length;
        say("ctStatus", "Click a swatch to copy its HEX code.");
      } catch (e) { say("ctStatus", "Could not read this image."); }
    });
    $("ctCopyHex").addEventListener("click", function () { copy(colors.map(function (c) { return c.hex.toUpperCase(); }).join(", "), "ctStatus", "HEX list copied."); });
    $("ctCopyCss").addEventListener("click", function () { copy(":root {\n" + colors.map(function (c, i) { return "  --color-" + (i + 1) + ": " + c.hex + ";"; }).join("\n") + "\n}", "ctStatus", "CSS variables copied."); });
    function contrast() {
      var fg = $("ccFg").value, bg = $("ccBg").value, a = rgb(fg), b = rgb(bg), l1 = lum(a[0], a[1], a[2]), l2 = lum(b[0], b[1], b[2]);
      var r = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      $("ccRatio").textContent = r.toFixed(2) + " : 1";
      var p = $("ccPreview"); p.style.color = fg; p.style.background = bg;
      var tests = [["AA text", 4.5], ["AA large", 3], ["AAA text", 7]];
      $("ccBadges").innerHTML = tests.map(function (t) { return '<span class="sp-badge-chip ' + (r >= t[1] ? "ok" : "no") + '">' + (r >= t[1] ? "✓ " : "✗ ") + t[0] + "</span>"; }).join("");
    }
    $("ccFg").addEventListener("input", contrast); $("ccBg").addEventListener("input", contrast); contrast();
  })();

  /* ---------- 3. Frame grabber ---------- */
  (function () {
    var v = $("fgVideo"), url = null, n = 0;
    $("fgFile").addEventListener("change", function () {
      var f = $("fgFile").files[0]; if (!f) return;
      if (url) URL.revokeObjectURL(url); url = URL.createObjectURL(f); v.src = url; v.hidden = false; n = 0;
      say("fgStatus", "Loading video...");
    });
    v.addEventListener("loadedmetadata", function () { $("fgCap").disabled = $("fgBack").disabled = $("fgFwd").disabled = false; say("fgStatus", v.videoWidth + " × " + v.videoHeight + " px · " + v.duration.toFixed(1) + " s. Scrub to a moment, then capture."); });
    v.addEventListener("error", function () { say("fgStatus", "This video format cannot be played in your browser. Try MP4 (H.264) or WebM."); });
    var step = function (d) { v.pause(); v.currentTime = Math.max(0, Math.min(v.duration || 0, v.currentTime + d / 30)); };
    $("fgBack").addEventListener("click", function () { step(-1); }); $("fgFwd").addEventListener("click", function () { step(1); });
    $("fgCap").addEventListener("click", async function () {
      if (!v.videoWidth) return say("fgStatus", "Video is not ready yet.");
      var c = document.createElement("canvas"); c.width = v.videoWidth; c.height = v.videoHeight; c.getContext("2d").drawImage(v, 0, 0);
      var type = $("fgFmt").value, ext = type === "image/png" ? "png" : "jpg", t = v.currentTime; n++;
      var card = document.createElement("div"); card.className = "sp-card";
      var lab = document.createElement("div"); lab.className = "sp-card-title"; lab.textContent = "Frame " + n + " · " + t.toFixed(2) + " s";
      var b = document.createElement("button"); b.type = "button"; b.className = "btn ghost"; b.textContent = "Download";
      b.addEventListener("click", async function () { var bl = await toBlob(c, type, 0.95); if (bl) dl(bl, "frame-" + t.toFixed(2) + "s." + ext); });
      card.append(c, lab, b); $("fgGallery").prepend(card); say("fgStatus", "Captured frame " + n + ".");
    });
  })();

  /* ---------- 4. Audio trimmer ---------- */
  (function () {
    var ac = null, buf = null, peaks = null, src = null;
    var ctx2d = $("atWave").getContext("2d");
    var getAC = function () { var A = window.AudioContext || window.webkitAudioContext; if (!A) throw new Error("Web Audio is not supported in this browser."); return ac || (ac = new A()); };
    function sel() { var d = buf ? buf.duration : 0, a = $("atStart").value / 1000 * d, b = $("atEnd").value / 1000 * d; return { a: Math.min(a, b), b: Math.max(a, b), d: d }; }
    function draw() {
      var c = $("atWave"), w = c.width, h = c.height; ctx2d.clearRect(0, 0, w, h);
      var cs = getComputedStyle(document.body), accent = cs.getPropertyValue("--accent").trim() || "#e5233a", muted = cs.getPropertyValue("--muted").trim() || "#999";
      ctx2d.fillStyle = "rgba(128,128,128,.08)"; ctx2d.fillRect(0, 0, w, h);
      if (!peaks) return;
      var s = sel(), x0 = s.a / s.d * w, x1 = s.b / s.d * w;
      ctx2d.fillStyle = "rgba(229,35,58,.16)"; ctx2d.fillRect(x0, 0, x1 - x0, h);
      for (var i = 0; i < w; i++) { var p = peaks[i] * (h / 2 - 4); ctx2d.fillStyle = i >= x0 && i <= x1 ? accent : muted; ctx2d.fillRect(i, h / 2 - p, 1, Math.max(1, p * 2)); }
    }
    function labels() { var s = sel(); say("atStartV", s.a.toFixed(2) + "s"); say("atEndV", s.b.toFixed(2) + "s"); draw(); }
    $("atFile").addEventListener("change", async function () {
      var f = $("atFile").files[0]; if (!f) return; stop(); say("atStatus", "Decoding audio..."); ["atPlay", "atStop", "atExport"].forEach(function (i) { $(i).disabled = true; });
      try {
        var arr = await f.arrayBuffer(); buf = await getAC().decodeAudioData(arr);
        var w = $("atWave").width; peaks = new Float32Array(w); var block = Math.max(1, Math.floor(buf.length / w)), mx = 0;
        for (var ch = 0; ch < buf.numberOfChannels; ch++) { var d = buf.getChannelData(ch); for (var i = 0; i < w; i++) { var m = 0, st = i * block; for (var k = 0; k < block; k += 8) { var v = Math.abs(d[st + k] || 0); if (v > m) m = v; } if (m > peaks[i]) peaks[i] = m; } }
        peaks.forEach(function (v) { if (v > mx) mx = v; }); if (mx > 0) for (var j = 0; j < w; j++) peaks[j] /= mx;
        $("atStart").disabled = $("atEnd").disabled = false; $("atStart").value = 0; $("atEnd").value = 1000;
        ["atPlay", "atStop", "atExport"].forEach(function (i) { $(i).disabled = false; });
        labels(); say("atStatus", buf.duration.toFixed(2) + " s · " + buf.numberOfChannels + " channel(s) · " + buf.sampleRate + " Hz. Adjust Start / End.");
      } catch (e) { buf = peaks = null; draw(); say("atStatus", "Could not decode this file: " + (e.message || "unsupported format") + "."); }
    });
    ["atStart", "atEnd"].forEach(function (id) { $(id).addEventListener("input", labels); });
    function stop() { if (src) { try { src.stop(); } catch (e) {} src = null; } }
    $("atStop").addEventListener("click", stop);
    $("atPlay").addEventListener("click", function () {
      if (!buf) return; stop(); var s = sel(), a = getAC(); if (a.resume) a.resume();
      src = a.createBufferSource(); src.buffer = buf; src.connect(a.destination); src.start(0, s.a, Math.max(0.05, s.b - s.a)); say("atStatus", "Playing " + s.a.toFixed(2) + "s – " + s.b.toFixed(2) + "s");
    });
    $("atExport").addEventListener("click", function () {
      if (!buf) return; var s = sel(), sr = buf.sampleRate, from = Math.floor(s.a * sr), to = Math.min(buf.length, Math.floor(s.b * sr)), len = to - from;
      if (len < 1) return say("atStatus", "Selection is empty.");
      var ch = Math.min(2, buf.numberOfChannels), data = [], i, c;
      for (c = 0; c < ch; c++) data.push(buf.getChannelData(c).subarray(from, to));
      var fi = Math.min(len, Math.round((+$("atFadeIn").value || 0) / 1000 * sr)), fo = Math.min(len, Math.round((+$("atFadeOut").value || 0) / 1000 * sr));
      var out = new ArrayBuffer(44 + len * ch * 2), dv = new DataView(out), w = function (o, t) { for (var q = 0; q < t.length; q++) dv.setUint8(o + q, t.charCodeAt(q)); };
      w(0, "RIFF"); dv.setUint32(4, 36 + len * ch * 2, true); w(8, "WAVE"); w(12, "fmt "); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, ch, true);
      dv.setUint32(24, sr, true); dv.setUint32(28, sr * ch * 2, true); dv.setUint16(32, ch * 2, true); dv.setUint16(34, 16, true); w(36, "data"); dv.setUint32(40, len * ch * 2, true);
      var o = 44;
      for (i = 0; i < len; i++) {
        var g = 1; if (fi && i < fi) g = i / fi; if (fo && i > len - fo) g = Math.min(g, (len - i) / fo);
        for (c = 0; c < ch; c++) { var v = Math.max(-1, Math.min(1, data[c][i] * g)); dv.setInt16(o, v < 0 ? v * 32768 : v * 32767, true); o += 2; }
      }
      dl(new Blob([out], { type: "audio/wav" }), "editprompt-trimmed.wav"); say("atStatus", "Exported " + (s.b - s.a).toFixed(2) + " s as WAV.");
    });
    draw();
  })();

  /* ---------- 5. Caption toolkit ---------- */
  (function () {
    var t = $("ckText");
    function stats() {
      var v = t.value, chars = Array.from(v).length, words = (v.trim().match(/\S+/g) || []).length, lines = v ? v.split(/\n/).length : 0;
      var tags = (v.match(/#[\p{L}\p{N}_]+/gu) || []).length, ment = (v.match(/@[\w.]+/g) || []).length;
      $("ckStats").innerHTML = [["Characters", chars], ["Words", words], ["Lines", lines], ["Hashtags", tags], ["Mentions", ment]].map(function (s) { return '<div class="sp-stat"><b>' + s[1] + "</b><small>" + s[0] + "</small></div>"; }).join("");
      LIMITS.forEach(function (l, i) { var p = chars / l[1]; $("ckM" + i).textContent = chars + " / " + l[1]; var f = $("ckF" + i); f.style.width = Math.min(100, p * 100) + "%"; f.className = "sp-meter-fill" + (p > 1 ? " over" : p > 0.9 ? " warn" : ""); });
    }
    t.addEventListener("input", stats); stats();
    var keep = function (fn) { return function (s) { return s.split(/(\s+)/).map(function (tok) { return /^[#@]/.test(tok) ? tok : fn(tok); }).join(""); }; };
    var title = keep(function (w) { return w.toLowerCase().replace(/(^|[-(])(\p{L})/gu, function (m, a, b) { return a + b.toUpperCase(); }); });
    var sentence = function (s) { return s.split(/(\s+)/).map(function (tok) { return /^[#@]/.test(tok) ? tok : tok.toLowerCase(); }).join("").replace(/(^\s*|[.!?]\s+|\n\s*)(\p{L})/gu, function (m, a, b) { return a + b.toUpperCase(); }); };
    document.querySelectorAll("[data-ck]").forEach(function (b) {
      b.addEventListener("click", function () {
        var k = b.getAttribute("data-ck"), v = t.value;
        if (k === "copy") return copy(v, "ckStatus", "Caption copied.");
        if (k === "tags") { var m = v.match(/#[\p{L}\p{N}_]+/gu); if (!m) return say("ckStatus", "No hashtags found."); var u = Array.from(new Set(m)); copy(u.join(" "), "ckStatus", u.length + " unique hashtag(s) copied."); return; }
        t.value = k === "upper" ? v.toUpperCase() : k === "lower" ? v.toLowerCase() : k === "title" ? title(v) : k === "sentence" ? sentence(v) : v.replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim();
        stats(); say("ckStatus", "Updated.");
      });
    });
  })();

  /* ---------- 6. Privacy cleaner ---------- */
  (function () {
    $("icQ").addEventListener("input", function () { say("icQV", $("icQ").value + "%"); });
    function exifInfo(buf) {
      try {
        var v = new DataView(buf); if (v.getUint16(0) !== 0xFFD8) return { exif: false };
        var o = 2;
        while (o < v.byteLength - 4) {
          var m = v.getUint16(o);
          if (m === 0xFFE1) {
            if (v.getUint32(o + 4) === 0x45786966) {
              var t = o + 10, le = v.getUint16(t) === 0x4949, g16 = function (p) { return v.getUint16(p, le); }, g32 = function (p) { return v.getUint32(p, le); };
              var ifd = t + g32(t + 4), n = g16(ifd), gps = false;
              for (var i = 0; i < n; i++) if (g16(ifd + 2 + i * 12) === 0x8825) gps = true;
              return { exif: true, gps: gps };
            }
            o += 2 + v.getUint16(o + 2);
          } else if ((m & 0xFF00) === 0xFF00 && m !== 0xFFDA) o += 2 + v.getUint16(o + 2); else break;
        }
      } catch (e) { /* ignore */ }
      return { exif: false };
    }
    $("icRun").addEventListener("click", async function () {
      var files = [].slice.call($("icFile").files); if (!files.length) return say("icStatus", "Choose one or more images.");
      var type = $("icFmt").value, q = (+$("icQ").value || 92) / 100, ext = type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
      var btn = $("icRun"), list = $("icList"); btn.disabled = true; list.replaceChildren();
      for (var i = 0; i < files.length; i++) {
        var f = files[i]; say("icStatus", "Cleaning " + (i + 1) + " of " + files.length + "...");
        try {
          var info = exifInfo(await f.slice(0, 262144).arrayBuffer()), bmp = await createImageBitmap(f);
          var c = document.createElement("canvas"); c.width = bmp.width; c.height = bmp.height; var x = c.getContext("2d");
          if (type === "image/jpeg") { x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height); } x.drawImage(bmp, 0, 0); if (bmp.close) bmp.close();
          var blob = await toBlob(c, type, q); if (!blob) throw new Error("export failed");
          var row = document.createElement("div"); row.className = "sp-row";
          var tag = info.gps ? '<span class="sp-badge-chip no">GPS location found</span>' : info.exif ? '<span class="sp-badge-chip no">EXIF found</span>' : '<span class="sp-badge-chip ok">No EXIF detected</span>';
          row.innerHTML = '<div class="sp-row-main"><b>' + esc(f.name) + "</b><small>" + fmtSize(f.size) + " → " + fmtSize(blob.size) + "</small></div>" + tag;
          var b = document.createElement("button"); b.type = "button"; b.className = "btn ghost"; b.textContent = "Download clean copy";
          (function (bl, nm) { b.addEventListener("click", function () { dl(bl, nm); }); })(blob, f.name.replace(/\.[^.]+$/, "") + "-clean." + ext);
          row.append(b); list.append(row);
        } catch (e) { var r = document.createElement("div"); r.className = "sp-row"; r.textContent = f.name + ": could not process (" + (e.message || e) + ")."; list.append(r); }
      }
      say("icStatus", "Done. Metadata is removed from the downloaded copies; your originals are untouched."); btn.disabled = false;
    });
  })();
})();
