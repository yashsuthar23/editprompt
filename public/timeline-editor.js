/* EditPrompt — Video Timeline editor (arrange clips, synchronized preview, real MP4 export).
 * Everything runs in the browser; media never leaves the device.
 *
 * Root causes fixed compared with the previous version:
 *  - Broken image preview: previewing a clip revoked the object URL of the *previous* clip, which was still in use.
 *    URLs are now revoked only when a clip is removed / the timeline is cleared / the page is left.
 *  - NaN:NaN: timeline blocks read `clip.end`, a property that never existed. Time is now derived from start + (trimOut - trimIn).
 *  - Audio ignored "Start": preview only ever played the first clip. Playback is now driven by one master clock that
 *    starts/stops every clip at its own start time.
 *  - No MP4 export existed (JSON only). Frames are rendered to a canvas, encoded with WebCodecs and muxed by mp4-mux.js.
 */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  if (!$('timelineFiles') || !$('timelineCanvas')) return;

  var MIN_LEN = 0.1, MAX_EXPORT_SECONDS = 600;
  var clips = [], nextId = 1, selectedId = null;
  var playhead = 0, playing = false, playStart = 0, playBase = 0, rangeEnd = null, raf = 0;
  var exporting = false, cancelExport = false, lastExportUrl = null;
  var cv = $('timelineCanvas'), cx = cv.getContext('2d');

  /* ---------- helpers ---------- */
  var num = function (v, d) { var n = Number(v); return isFinite(n) ? n : (d || 0); };
  var clamp = function (v, a, b) { return Math.min(b, Math.max(a, v)); };
  var r2 = function (v) { return Math.round(num(v) * 100) / 100; };
  var fmt = function (t) { t = Math.max(0, num(t)); var m = Math.floor(t / 60), s = t - m * 60; return m + ':' + (s < 10 ? '0' : '') + s.toFixed(1); };
  var len = function (c) { return Math.max(0, num(c.trimOut) - num(c.trimIn)); };
  var endOf = function (c) { return num(c.start) + len(c); };
  var total = function () { return clips.reduce(function (m, c) { return Math.max(m, endOf(c)); }, 0); };
  var visuals = function () { return clips.filter(function (c) { return c.type !== 'audio'; }).sort(function (a, b) { return a.start - b.start; }); };
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  function say(msg, kind) { var e = $('timelineStatus'); if (!e) return; e.textContent = msg; e.setAttribute('data-kind', kind || ''); }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function download(blob, name) { var u = URL.createObjectURL(blob), a = document.createElement('a'); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(u); }, 8000); }
  function progress(pct) { var p = $('tlProgress'); if (!p) return; if (pct == null) { p.hidden = true; return; } p.hidden = false; var v = clamp(Math.round(pct), 0, 100); p.setAttribute('aria-valuenow', v); p.querySelector('.sp-progress-bar').style.width = v + '%'; p.querySelector('.sp-progress-label').textContent = v + '%'; }

  /* ---------- output size ---------- */
  function outDims() {
    var short = Number($('tlRes').value) === 1080 ? 1080 : 720, a = $('tlAspect').value;
    if (a === '9:16') return [short, Math.round(short * 16 / 9 / 2) * 2];
    if (a === '1:1') return [short, short];
    return [Math.round(short * 16 / 9 / 2) * 2, short];
  }
  function sizePreview() {
    var a = $('tlAspect').value;
    cv.width = a === '9:16' ? 360 : a === '1:1' ? 480 : 640; cv.height = a === '9:16' ? 640 : a === '1:1' ? 480 : 360;
    cv.style.aspectRatio = cv.width + ' / ' + cv.height; drawPreview();
  }

  /* ---------- loading media ---------- */
  function once(target, ok, bad, ms) {
    return new Promise(function (resolve, reject) {
      var t = setTimeout(function () { cleanup(); reject(new Error('timed out')); }, ms || 20000);
      function cleanup() { clearTimeout(t); target.removeEventListener(ok, onOk); target.removeEventListener(bad, onBad); }
      function onOk() { cleanup(); resolve(); } function onBad() { cleanup(); reject(new Error('unsupported or damaged file')); }
      target.addEventListener(ok, onOk); target.addEventListener(bad, onBad);
    });
  }
  async function loadClip(file) {
    var type = /^video\//.test(file.type) ? 'video' : /^audio\//.test(file.type) ? 'audio' : /^image\//.test(file.type) ? 'image' : null;
    if (!type) throw new Error(file.name + ': unsupported file type');
    var url = URL.createObjectURL(file);
    var clip = { id: nextId++, name: file.name, type: type, file: file, url: url, src: 0, start: 0, trimIn: 0, trimOut: 0, volume: 1, el: null, w: 0, h: 0 };
    try {
      if (type === 'image') {
        var img = new Image(); img.src = url; await once(img, 'load', 'error');
        if (!img.naturalWidth) throw new Error('unsupported or damaged file');
        clip.el = img; clip.w = img.naturalWidth; clip.h = img.naturalHeight; clip.src = 5; clip.trimOut = 5;
      } else {
        var m = document.createElement(type); m.preload = 'auto'; m.playsInline = true; m.src = url;
        await once(m, 'loadedmetadata', 'error');
        if (!isFinite(m.duration)) { // some recorded files report Infinity until seeked to the end
          m.currentTime = 1e7; await once(m, 'durationchange', 'error', 8000).catch(function () {}); try { m.currentTime = 0; } catch (e) { /* ignore */ }
        }
        if (!isFinite(m.duration) || m.duration <= 0) throw new Error('could not read the duration');
        if (type === 'video' && !m.videoWidth) throw new Error('no video track found');
        clip.el = m; clip.src = m.duration; clip.trimOut = m.duration; clip.w = m.videoWidth || 0; clip.h = m.videoHeight || 0;
        if (type === 'video') m.addEventListener('seeked', function () { if (!playing && !exporting) drawPreview(); });
      }
    } catch (e) { URL.revokeObjectURL(url); throw new Error(file.name + ': ' + (e.message || e)); }
    clip.start = type === 'audio' ? 0 : visuals().reduce(function (m, c) { return Math.max(m, endOf(c)); }, 0);
    return clip;
  }
  function disposeClip(c) { try { if (c.el && c.el.pause) c.el.pause(); if (c.el && c.el.removeAttribute) { c.el.removeAttribute('src'); if (c.el.load) c.el.load(); } } catch (e) { /* ignore */ } URL.revokeObjectURL(c.url); }

  /* ---------- compositing (shared by preview and export) ---------- */
  function layersAt(t) {
    var vis = visuals(), mode = $('tlTransition').value, d = clamp(num($('tlTransLen').value, 0.5), 0.1, 3), out = [];
    vis.forEach(function (c, i) {
      var s = c.start, e = endOf(c), prev = vis[i - 1], next = vis[i + 1];
      var adjPrev = prev && Math.abs(endOf(prev) - s) <= 0.05, adjNext = next && Math.abs(e - next.start) <= 0.05;
      var h = Math.min(d / 2, len(c) / 2), from = s, to = e, a = 1;
      if (mode === 'crossfade') {
        if (adjPrev) from = s - h; if (adjNext) to = e + h;
        if (t < from || t >= to) return;
        if (adjPrev && t < s + h) a = (t - (s - h)) / (2 * h);
      } else {
        if (t < s || t >= e) return;
        if (mode === 'fade') { if (t < s + h) a = (t - s) / h; if (t > e - h) a = Math.min(a, (e - t) / h); }
      }
      var st = clamp(c.trimIn + (t - s), c.trimIn, Math.max(c.trimIn, c.trimOut - 0.04));
      out.push({ clip: c, alpha: clamp(a, 0, 1), srcTime: st });
    });
    return out;
  }
  function paint(ctx, W, H, layers) {
    ctx.globalAlpha = 1; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    layers.forEach(function (l) {
      var c = l.clip, e = c.el, sw = c.type === 'image' ? c.w : (e.videoWidth || c.w), sh = c.type === 'image' ? c.h : (e.videoHeight || c.h);
      if (!sw || !sh || (c.type === 'video' && e.readyState < 2)) return;
      var s = Math.min(W / sw, H / sh), dw = sw * s, dh = sh * s;
      ctx.globalAlpha = l.alpha; ctx.drawImage(e, (W - dw) / 2, (H - dh) / 2, dw, dh);
    });
    ctx.globalAlpha = 1;
  }
  function drawPreview() { if (exporting) return; paint(cx, cv.width, cv.height, layersAt(playhead)); }

  /* ---------- preview playback (one master clock) ---------- */
  function syncMedia() {
    var t = playhead, layers = layersAt(t);
    clips.forEach(function (c) {
      if (c.type === 'image') return;
      var m = c.el, active = t >= c.start && t < endOf(c), wanted = c.trimIn + (t - c.start);
      if (active && playing) {
        m.muted = false; m.volume = clamp(c.volume, 0, 1);
        if (!m.seeking && Math.abs(m.currentTime - wanted) > 0.3) m.currentTime = wanted;
        if (m.paused) m.play().catch(function () {});
      } else {
        if (!m.paused) m.pause();
        if (c.type === 'video') { var l = layers.filter(function (x) { return x.clip === c; })[0]; if (l && !m.seeking && Math.abs(m.currentTime - l.srcTime) > 0.05) m.currentTime = l.srcTime; }
        else if (active && !playing && !m.seeking && Math.abs(m.currentTime - wanted) > 0.05) m.currentTime = wanted;
      }
    });
  }
  function updateClock() { var tot = total(), s = $('timelineSeek'); s.max = tot.toFixed(2); s.value = clamp(playhead, 0, tot); $('timelineTime').textContent = fmt(playhead) + ' / ' + fmt(tot); var ph = document.querySelector('.tl-playhead'); if (ph) ph.style.left = (playhead * pxPerSec) + 'px'; }
  function tick() {
    if (!playing) return;
    playhead = playBase + (performance.now() - playStart) / 1000;
    var stopAt = rangeEnd != null ? rangeEnd : total();
    if (playhead >= stopAt) { playhead = stopAt; pause(); return; }
    syncMedia(); drawPreview(); updateClock(); raf = requestAnimationFrame(tick);
  }
  function play(from, to) {
    if (exporting) return say('An export is running. Wait for it to finish or cancel it first.', 'error');
    if (!clips.length) return say('Add media first.', 'error');
    var tot = total();
    if (from != null) playhead = from; else if (playhead >= tot - 0.05) playhead = 0;
    rangeEnd = to != null ? to : null; playBase = playhead; playStart = performance.now(); playing = true;
    cancelAnimationFrame(raf); raf = requestAnimationFrame(tick); say('Playing preview…');
  }
  function pause(silent) {
    playing = false; cancelAnimationFrame(raf); rangeEnd = null;
    clips.forEach(function (c) { if (c.el && c.el.pause) c.el.pause(); });
    syncMedia(); drawPreview(); updateClock(); if (!silent) say('Paused at ' + fmt(playhead) + '.');
  }
  function stop() { pause(true); playhead = 0; syncMedia(); drawPreview(); updateClock(); say('Stopped.'); }
  function seek(t) {
    playhead = clamp(num(t), 0, total());
    if (playing) { playBase = playhead; playStart = performance.now(); }
    syncMedia(); drawPreview(); updateClock();
  }

  /* ---------- timeline + clip list UI ---------- */
  var pxPerSec = 20;
  function renderTimeline() {
    var view = $('timelineView'), list = $('timelineClips'), listNodes = [];
    var tot = total(), has = clips.length > 0;
    $('timelineSeek').disabled = !has; $('tlExportMp4').disabled = exporting || !visuals().length;
    if (!has) { view.replaceChildren(el('div', 'muted', 'Add media to build your timeline.')); list.replaceChildren(); updateClock(); drawPreview(); return; }
    var avail = Math.max(240, view.clientWidth - 96); pxPerSec = clamp(avail / Math.max(tot, 5), 6, 120);
    var width = Math.max(avail, Math.ceil(Math.max(tot, 5) * pxPerSec));
    var wrap = el('div', 'tl-wrap'), labels = el('div', 'tl-labels'), scroll = el('div', 'tl-scroll'), inner = el('div', 'tl-inner'); inner.style.width = width + 'px';
    var ruler = el('div', 'tl-ruler'), steps = [1, 2, 5, 10, 15, 30, 60, 120, 300], step = steps.filter(function (s) { return s * pxPerSec >= 56; })[0] || 300;
    labels.append(el('div', 'tl-label tl-label-ruler', ''));
    for (var t = 0; t <= Math.max(tot, 5) + 0.001; t += step) { var tick = el('span', 'tl-tick', fmt(t).replace(/\.0$/, '')); tick.style.left = (t * pxPerSec) + 'px'; ruler.append(tick); }
    inner.append(ruler);
    [['video', 'VIDEO'], ['image', 'IMAGE'], ['audio', 'AUDIO']].forEach(function (row) {
      var items = clips.filter(function (c) { return c.type === row[0]; }); if (!items.length) return;
      labels.append(el('div', 'tl-label', row[1]));
      var lane = el('div', 'tl-lane tl-' + row[0]);
      items.forEach(function (c) {
        var b = el('button', 'tl-block' + (c.id === selectedId ? ' is-selected' : ''), c.name + ' · ' + fmt(c.start) + '–' + fmt(endOf(c)));
        b.type = 'button'; b.style.left = (c.start * pxPerSec) + 'px'; b.style.width = Math.max(28, len(c) * pxPerSec) + 'px';
        b.title = c.name + '\nStart ' + fmt(c.start) + ' · End ' + fmt(endOf(c)) + ' · Duration ' + len(c).toFixed(2) + ' s';
        b.addEventListener('click', function (ev) { ev.stopPropagation(); selectedId = c.id; renderTimeline(); var card = document.getElementById('tlclip-' + c.id); if (card) card.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); });
        lane.append(b);
      });
      inner.append(lane);
    });
    var ph = el('div', 'tl-playhead'); inner.append(ph);
    var scrub = function (ev) { var r = inner.getBoundingClientRect(); seek((ev.clientX - r.left) / pxPerSec); };
    inner.addEventListener('pointerdown', function (ev) { if (ev.target.closest('.tl-block')) return; inner.setPointerCapture(ev.pointerId); scrub(ev); inner.onpointermove = scrub; });
    inner.addEventListener('pointerup', function () { inner.onpointermove = null; });
    scroll.append(inner); wrap.append(labels, scroll);
    clips.forEach(function (c, i) { listNodes.push(clipCard(c, i)); });
    // Replace in one go. Removing a focused input can fire a nested 'change' -> nested render; doing the swap last keeps the DOM consistent.
    view.replaceChildren(wrap); list.replaceChildren.apply(list, listNodes);
    updateClock();
  }
  function clipCard(c, i) {
    var box = el('div', 'clip' + (c.id === selectedId ? ' is-selected' : '')); box.id = 'tlclip-' + c.id;
    box.append(el('b', '', (i + 1) + '. ' + c.name + ' (' + c.type + ')'));
    var grid = el('div', 'clip-controls');
    var isImg = c.type === 'image';
    var fields = [['Start (s)', 'start', c.start, false], ['Trim in (s)', 'in', c.trimIn, isImg], ['Trim out (s)', 'out', c.trimOut, isImg], ['Duration (s)', 'dur', len(c), false]];
    if (!isImg) fields.push(['Volume (%)', 'vol', Math.round(c.volume * 100), false]);
    fields.forEach(function (f) {
      var wrap = el('label', '', f[0]), inp = document.createElement('input'); inp.type = 'number'; inp.step = f[1] === 'vol' ? '5' : '0.1'; inp.min = '0'; if (f[1] === 'vol') inp.max = '100';
      inp.value = r2(f[2]); inp.disabled = f[3];
      inp.addEventListener('change', function () { applyEdit(c, f[1], num(inp.value, f[2])); });
      wrap.append(inp); grid.append(wrap);
    });
    box.append(grid);
    var act = el('div', 'actions');
    var mk = function (label, fn) { var b = el('button', 'btn ghost', label); b.type = 'button'; b.addEventListener('click', fn); return b; };
    act.append(mk('Preview clip', function () { selectedId = c.id; play(c.start, endOf(c)); }));
    if (c.type !== 'audio') { act.append(mk('◀ Earlier', function () { moveVisual(c, -1); }), mk('Later ▶', function () { moveVisual(c, 1); })); }
    act.append(mk('Remove', function () { removeClip(c); }));
    box.append(act);
    if (c.type === 'audio') {
      var pl = document.createElement('audio'); pl.controls = true; pl.preload = 'metadata'; pl.src = c.url; pl.className = 'tl-audio-player';
      pl.addEventListener('play', function () { if (playing) pause(true); }); box.append(pl);
    }
    if (c.type === 'audio') box.append(el('div', 'muted small', 'Audio starts exactly at the Start time above and plays for the Duration, trimmed from Trim in to Trim out.'));
    return box;
  }
  function applyEdit(c, key, v) {
    var s = c.src, note = '';
    if (key === 'start') c.start = Math.max(0, v);
    else if (key === 'vol') c.volume = clamp(v / 100, 0, 1);
    else if (c.type === 'image') { if (key === 'dur') { c.src = c.trimOut = clamp(v, MIN_LEN, 3600); } }
    else if (key === 'in') { c.trimIn = clamp(v, 0, s - MIN_LEN); if (c.trimOut < c.trimIn + MIN_LEN) c.trimOut = Math.min(s, c.trimIn + MIN_LEN); }
    else if (key === 'out') c.trimOut = clamp(v, c.trimIn + MIN_LEN, s);
    else if (key === 'dur') { var want = c.trimIn + v; c.trimOut = clamp(want, c.trimIn + MIN_LEN, s); if (want > s + 0.001) note = ' Duration limited to the length of the source (' + s.toFixed(2) + ' s).'; }
    renderTimeline(); seek(playhead); if (note) say(c.name + ':' + note);
  }
  function moveVisual(c, dir) {
    var v = visuals(), i = v.indexOf(c), j = i + dir; if (j < 0 || j >= v.length) return;
    var t = v[i]; v[i] = v[j]; v[j] = t; var at = 0;
    v.forEach(function (x) { x.start = at; at += len(x); });
    renderTimeline(); seek(playhead);
  }
  function removeClip(c) {
    if (playing) pause(true);
    clips = clips.filter(function (x) { return x !== c; }); disposeClip(c);
    if (selectedId === c.id) selectedId = null;
    playhead = clamp(playhead, 0, total()); renderTimeline(); drawPreview(); say(c.name + ' removed.');
  }

  /* ---------- toolbar ---------- */
  $('timelineAdd').addEventListener('click', async function () {
    var files = Array.prototype.slice.call($('timelineFiles').files);
    if (!files.length) return say('Choose one or more media files first.', 'error');
    var btn = $('timelineAdd'); btn.disabled = true; say('Reading ' + files.length + ' file(s)…');
    var ok = 0, errors = [];
    for (var i = 0; i < files.length; i++) { try { clips.push(await loadClip(files[i])); ok++; } catch (e) { errors.push(e.message || String(e)); } }
    btn.disabled = false; $('timelineFiles').value = '';
    renderTimeline(); seek(playhead);
    say((ok ? ok + ' media item(s) added. ' : '') + (errors.length ? 'Could not add: ' + errors.join(' · ') : ''), errors.length ? 'error' : '');
  });
  $('timelinePlay').addEventListener('click', function () { play(); });
  $('timelinePause').addEventListener('click', function () { pause(); });
  $('timelineStop').addEventListener('click', stop);
  $('timelineSeek').addEventListener('input', function () { seek($('timelineSeek').value); });
  $('timelineClear').addEventListener('click', function () {
    if (exporting) return say('An export is running. Cancel it first.', 'error');
    pause(true); clips.forEach(disposeClip); clips = []; selectedId = null; playhead = 0; renderTimeline(); drawPreview(); say('Timeline cleared.');
  });
  $('timelineExport').addEventListener('click', function () {
    var project = { app: 'EditPrompt', version: '9.2', createdAt: new Date().toISOString(), output: { resolution: $('tlRes').value + 'p', aspect: $('tlAspect').value, fps: Number($('tlFps').value), transition: $('tlTransition').value, transitionSeconds: num($('tlTransLen').value, 0.5) },
      clips: clips.map(function (c) { return { name: c.name, type: c.type, start: r2(c.start), trimIn: r2(c.trimIn), trimOut: r2(c.trimOut), duration: r2(len(c)), volume: r2(c.volume) }; }) };
    download(new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' }), 'editprompt-timeline-project.json');
    say('Timeline project JSON exported. Media files are not embedded; keep the originals.');
  });
  ['tlAspect'].forEach(function (id) { $(id).addEventListener('change', function () { sizePreview(); }); });
  ['tlTransition', 'tlTransLen'].forEach(function (id) { $(id).addEventListener('change', function () { seek(playhead); }); });
  window.addEventListener('resize', function () { if (clips.length) renderTimeline(); });
  window.addEventListener('pagehide', function () { clips.forEach(disposeClip); if (lastExportUrl) URL.revokeObjectURL(lastExportUrl); });
  // The panel is hidden until its tab is opened; lay the timeline out again when it becomes visible.
  var panel = $('video-timeline');
  if (panel && window.MutationObserver) new MutationObserver(function () { if (panel.classList.contains('sp-active') && clips.length) renderTimeline(); }).observe(panel, { attributes: true, attributeFilter: ['class'] });

  /* ---------- real MP4 export ---------- */
  function toU8(d) { if (!d) return null; if (d instanceof ArrayBuffer) return new Uint8Array(d.slice(0)); return new Uint8Array(d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength)); }
  async function pickVideoConfig(W, H, fps, bitrate) {
    var list = ['avc1.640028', 'avc1.4D0028', 'avc1.42E028', 'avc1.640032', 'avc1.42E01F', 'vp09.00.40.08'];
    for (var i = 0; i < list.length; i++) {
      var cfg = { codec: list[i], width: W, height: H, bitrate: bitrate, framerate: fps, latencyMode: 'quality' };
      if (list[i].indexOf('avc1') === 0) cfg.avc = { format: 'avc' };
      try { var r = await VideoEncoder.isConfigSupported(cfg); if (r && r.supported) return { cfg: cfg, family: list[i].indexOf('avc1') === 0 ? 'avc1' : 'vp09' }; } catch (e) { /* try next */ }
    }
    return null;
  }
  async function pickAudioConfig() {
    if (typeof AudioEncoder === 'undefined' || typeof AudioData === 'undefined') return null;
    var list = [{ codec: 'mp4a.40.2', family: 'mp4a' }, { codec: 'opus', family: 'Opus' }];
    for (var i = 0; i < list.length; i++) {
      var cfg = { codec: list[i].codec, sampleRate: 48000, numberOfChannels: 2, bitrate: 128000 };
      try { var r = await AudioEncoder.isConfigSupported(cfg); if (r && r.supported) return { cfg: cfg, family: list[i].family }; } catch (e) { /* try next */ }
    }
    return null;
  }
  async function seekVideo(m, t) {
    if (!m.seeking && m.readyState >= 2 && Math.abs(m.currentTime - t) < 0.001) return;
    var p = once(m, 'seeked', 'error', 8000); m.currentTime = t; await p;
  }
  async function mixAudio(totalSec, warnings) {
    var sources = clips.filter(function (c) { return c.type === 'audio' || (c.type === 'video' && c.volume > 0); });
    if (!sources.length) return null;
    var Off = window.OfflineAudioContext || window.webkitOfflineAudioContext; if (!Off) return null;
    var off = new Off(2, Math.max(1, Math.ceil(totalSec * 48000)), 48000), used = 0;
    for (var i = 0; i < sources.length; i++) {
      var c = sources[i];
      try {
        var buf = await off.decodeAudioData(await c.file.arrayBuffer());
        var s = off.createBufferSource(), g = off.createGain(); s.buffer = buf; g.gain.value = clamp(c.volume, 0, 1); s.connect(g); g.connect(off.destination);
        s.start(Math.max(0, c.start), Math.min(c.trimIn, Math.max(0, buf.duration - 0.01)), len(c)); used++;
      } catch (e) {
        if (c.type === 'audio') throw new Error('The audio file "' + c.name + '" could not be decoded by this browser, so music cannot be included. Convert it to MP3, WAV or M4A and add it again.');
        warnings.push('No sound taken from "' + c.name + '" (it has no audio track, or this browser could not decode it).');
      }
    }
    if (!used) return null;
    return off.startRendering();
  }
  function setExportUi(on) {
    exporting = on; ['timelineAdd', 'timelinePlay', 'timelinePause', 'timelineStop', 'timelineClear', 'tlExportMp4'].forEach(function (id) { $(id).disabled = on; });
    $('tlCancel').hidden = !on; $('timelineSeek').disabled = on || !clips.length;
    if (!on) { clips.forEach(function (c) { if (c.type === 'video') c.el.muted = false; }); renderTimeline(); }
  }
  function fail(msg) { progress(null); say(msg, 'error'); }

  async function exportMp4() {
    if (exporting) return;
    if (!visuals().length) return fail('Add at least one image or video clip before exporting.');
    if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') return fail('MP4 export is not supported in this browser (it needs the WebCodecs video encoder). Please use the latest Chrome, Edge or Opera.');
    var totalSec = total();
    if (totalSec < 0.2) return fail('The timeline is empty or too short to export.');
    if (totalSec > MAX_EXPORT_SECONDS) return fail('The timeline is ' + fmt(totalSec) + ' long. The browser exporter supports up to ' + (MAX_EXPORT_SECONDS / 60) + ' minutes.');
    pause(true); cancelExport = false; setExportUi(true); progress(0);
    var venc = null, aenc = null, warnings = [];
    try {
      var dims = outDims(), W = dims[0], H = dims[1], fps = Number($('tlFps').value) === 24 ? 24 : 30, N = Math.ceil(totalSec * fps);
      var bitrate = (W * H >= 1920 * 1080 ? 10e6 : 5e6) * (fps === 24 ? 0.85 : 1);
      say('Checking encoder support…');
      var vsel = await pickVideoConfig(W, H, fps, bitrate);
      if (!vsel) throw new Error('This browser has no usable H.264 or VP9 video encoder for ' + W + '×' + H + '. Try 720p, or use the latest Chrome or Edge.');
      say('Mixing audio…'); progress(1);
      var mixed = await mixAudio(totalSec, warnings), asel = null;
      if (mixed) { asel = await pickAudioConfig(); if (!asel) throw new Error('This browser cannot encode AAC or Opus audio, so the background music cannot be included. Use Chrome or Edge, or remove the audio clips.'); }

      var vSamples = [], aSamples = [], vDesc = null, aDesc = null, encErr = null;
      venc = new VideoEncoder({
        output: function (chunk, meta) { var d = new Uint8Array(chunk.byteLength); chunk.copyTo(d); vSamples.push({ d: d, key: chunk.type === 'key', ts: chunk.timestamp }); if (!vDesc && meta && meta.decoderConfig && meta.decoderConfig.description) vDesc = toU8(meta.decoderConfig.description); },
        error: function (e) { encErr = e; }
      });
      venc.configure(vsel.cfg);
      if (asel) {
        aenc = new AudioEncoder({
          output: function (chunk, meta) { var d = new Uint8Array(chunk.byteLength); chunk.copyTo(d); aSamples.push({ d: d, dur: Math.max(1, Math.round((chunk.duration || 21333) * 48000 / 1e6)) }); if (!aDesc && meta && meta.decoderConfig && meta.decoderConfig.description) aDesc = toU8(meta.decoderConfig.description); },
          error: function (e) { encErr = e; }
        });
        aenc.configure(asel.cfg);
      }

      var canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H; var ctx = canvas.getContext('2d');
      clips.forEach(function (c) { if (c.type === 'video') { c.el.pause(); c.el.muted = true; } });
      var t0 = performance.now();
      for (var i = 0; i < N; i++) {
        if (cancelExport) throw new Error('__cancelled__');
        if (encErr) throw encErr;
        var layers = layersAt(i / fps);
        for (var k = 0; k < layers.length; k++) if (layers[k].clip.type === 'video') await seekVideo(layers[k].clip.el, layers[k].srcTime);
        paint(ctx, W, H, layers);
        var frame = new VideoFrame(canvas, { timestamp: Math.round(i * 1e6 / fps), duration: Math.round(1e6 / fps) });
        while (venc.encodeQueueSize > 8) await sleep(4);
        venc.encode(frame, { keyFrame: i % (fps * 2) === 0 }); frame.close();
        if (i % 4 === 0) {
          var done = i / N, eta = done > 0.02 ? ((performance.now() - t0) / done) * (1 - done) / 1000 : 0;
          progress(2 + done * 86); say('Rendering frame ' + (i + 1) + ' of ' + N + (eta ? ' · about ' + Math.ceil(eta) + ' s left' : '') + '…'); await sleep(0);
        }
      }
      await venc.flush(); if (encErr) throw encErr;

      if (asel) {
        say('Encoding audio…'); progress(90);
        var L = mixed.getChannelData(0), R = mixed.numberOfChannels > 1 ? mixed.getChannelData(1) : L, B = 4096;
        for (var pos = 0; pos < L.length; pos += B) {
          if (cancelExport) throw new Error('__cancelled__');
          var n = Math.min(B, L.length - pos), data = new Float32Array(n * 2); data.set(L.subarray(pos, pos + n), 0); data.set(R.subarray(pos, pos + n), n);
          var ad = new AudioData({ format: 'f32-planar', sampleRate: 48000, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round(pos * 1e6 / 48000), data: data });
          while (aenc.encodeQueueSize > 16) await sleep(4);
          aenc.encode(ad); ad.close();
        }
        await aenc.flush(); if (encErr) throw encErr;
      }
      if (!vSamples.length) throw new Error('The encoder produced no video frames.');
      for (var q = 1; q < vSamples.length; q++) if (vSamples[q].ts < vSamples[q - 1].ts) throw new Error('This encoder reordered frames, which the exporter does not support. Try 720p or another browser.');
      if (vsel.family === 'avc1' && !vDesc) throw new Error('The H.264 encoder did not provide its configuration, so a valid MP4 cannot be written.');

      say('Writing MP4 file…'); progress(96);
      var mux = new EPMp4.Muxer();
      mux.addVideoTrack({ codec: vsel.family, width: W, height: H, fps: fps, description: vDesc, codecString: vsel.cfg.codec });
      if (asel && aSamples.length) mux.addAudioTrack({ codec: asel.family, channels: 2, sampleRate: 48000, description: aDesc });
      var vTick = Math.round(90000 / fps);
      vSamples.forEach(function (s) { mux.addVideoSample(s.d, s.key, vTick); });
      if (asel && aSamples.length) aSamples.forEach(function (s) { mux.addAudioSample(s.d, s.dur); });
      var blob = mux.finalize();
      if (!blob || blob.size < 1000) throw new Error('The exported file is empty.');

      // Verify the browser can read the file back before claiming success.
      var verified = '';
      try {
        var vurl = URL.createObjectURL(blob), probe = document.createElement('video'); probe.preload = 'metadata'; probe.muted = true; probe.src = vurl;
        await once(probe, 'loadedmetadata', 'error', 8000);
        verified = Math.abs(probe.duration - totalSec) < 1 ? ' Verified: file opens and lasts ' + probe.duration.toFixed(1) + ' s.' : ' Note: file length is ' + probe.duration.toFixed(1) + ' s (timeline ' + totalSec.toFixed(1) + ' s).';
        URL.revokeObjectURL(vurl);
      } catch (e) { verified = ' This browser could not play the file back to verify it; test it in your video player.'; }

      if (lastExportUrl) URL.revokeObjectURL(lastExportUrl);
      lastExportUrl = URL.createObjectURL(blob); var name = 'editprompt-video-' + (Number($('tlRes').value) === 1080 ? '1080p' : '720p') + '.mp4';
      var link = $('tlDownload'); link.href = lastExportUrl; link.download = name; link.hidden = false;
      download(blob, name); progress(100);
      var codecs = (vsel.family === 'avc1' ? 'H.264' : 'VP9') + (asel ? ' + ' + (asel.family === 'mp4a' ? 'AAC' : 'Opus') : ' (no audio track)');
      var notes = [];
      if (vsel.family === 'vp09') notes.push('This browser has no H.264 encoder, so the video is VP9; it plays in Chrome, Edge, Firefox and VLC but not in QuickTime or on many TVs.');
      if (asel && asel.family === 'Opus') notes.push('This browser has no AAC encoder, so the audio is Opus; it plays in Chrome, Edge, Firefox and VLC, but QuickTime or some phones may play the video without sound.');
      var compat = notes.length ? ' Note: ' + notes.join(' ') : '';
      say('MP4 exported: ' + W + '×' + H + ' · ' + fps + ' fps · ' + codecs + ' · ' + (blob.size / 1048576).toFixed(1) + ' MB.' + verified + compat + (warnings.length ? ' ' + warnings.join(' ') : ''), warnings.length || notes.length ? 'warn' : 'ok');
    } catch (e) {
      if (e && e.message === '__cancelled__') { progress(null); say('Export cancelled.'); }
      else fail('MP4 export failed: ' + ((e && e.message) || e));
    } finally {
      try { if (venc && venc.state !== 'closed') venc.close(); } catch (e) { /* ignore */ }
      try { if (aenc && aenc.state !== 'closed') aenc.close(); } catch (e) { /* ignore */ }
      setExportUi(false); seek(playhead);
    }
  }
  $('tlExportMp4').addEventListener('click', exportMp4);
  $('tlCancel').addEventListener('click', function () { cancelExport = true; say('Cancelling…'); });


  // Read-only snapshot used by automated tests / debugging.
  window.EPTimeline = { snapshot: function () { return { playhead: playhead, playing: playing, total: total(), clips: clips.map(function (c) { return { name: c.name, type: c.type, start: c.start, trimIn: c.trimIn, trimOut: c.trimOut, len: len(c), volume: c.volume, mediaTime: c.el && c.el.currentTime, paused: c.el && c.el.paused }; }) }; } };
  sizePreview(); renderTimeline();
})();
