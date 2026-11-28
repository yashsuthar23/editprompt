/* EditPrompt Video Editor — multi-track timeline, project bin, program monitor, inspector, real MP4 export.
 * Runs entirely in the browser; media never leaves the device.
 * (Earlier root-cause fixes are kept: object URLs are only revoked when media is removed from the project, clip time
 *  is derived from start + (trimOut - trimIn), playback uses one master clock, and MP4 export is real.)
 */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  if (!$('timelineCanvas') || !$('timelineView')) return;

  var MIN_LEN = 0.1, MAX_EXPORT_SECONDS = 600, TRACKS = ['V2', 'V1', 'A1', 'A2'], HISTORY_MAX = 60;
  var assets = [], clips = [], nextId = 1, selectedId = null, tool = 'select';
  var tracks = { V1: { hidden: false, muted: false, locked: false }, V2: { hidden: false, muted: false, locked: false }, A1: { muted: false, locked: false }, A2: { muted: false, locked: false } };
  var playhead = 0, playing = false, playStart = 0, playBase = 0, rangeEnd = null, raf = 0;
  var exporting = false, cancelExport = false, lastExportUrl = null;
  var pxPerSec = 30, zoomAuto = true, undoStack = [], redoStack = [];
  var cv = $('timelineCanvas'), cx = cv.getContext('2d');

  /* ---------- helpers ---------- */
  var num = function (v, d) { var n = Number(v); return isFinite(n) ? n : (d || 0); };
  var clamp = function (v, a, b) { return Math.min(b, Math.max(a, v)); };
  var r2 = function (v) { return Math.round(num(v) * 100) / 100; };
  var isVisual = function (c) { return c.type !== 'audio'; };
  var len = function (c) { return Math.max(0, num(c.trimOut) - num(c.trimIn)); };
  var endOf = function (c) { return num(c.start) + len(c); };
  var total = function () { return clips.reduce(function (m, c) { return Math.max(m, endOf(c)); }, 0); };
  var byTrack = function (tr) { return clips.filter(function (c) { return c.track === tr; }).sort(function (a, b) { return a.start - b.start; }); };
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var fps = function () { return Number($('tlFps').value) === 24 ? 24 : 30; };
  function tc(t) { t = Math.max(0, num(t)); var f = fps(), fr = Math.floor(t * f + 1e-6), ff = fr % f, s = Math.floor(fr / f), p = function (n) { return (n < 10 ? '0' : '') + n; }; return p(Math.floor(s / 3600)) + ':' + p(Math.floor(s / 60) % 60) + ':' + p(s % 60) + ':' + p(ff); }
  function sec(t) { t = Math.max(0, num(t)); var m = Math.floor(t / 60), s = t - m * 60; return m + ':' + (s < 10 ? '0' : '') + s.toFixed(1); }
  function say(msg, kind) { var e = $('timelineStatus'); if (!e) return; e.textContent = msg; e.setAttribute('data-kind', kind || ''); }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function btn(label, cls, fn, title) { var b = el('button', cls || 'btn ghost', label); b.type = 'button'; if (title) b.title = title; b.addEventListener('click', fn); return b; }
  function download(blob, name) { var u = URL.createObjectURL(blob), a = document.createElement('a'); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(u); }, 8000); }
  function progress(pct) { var p = $('tlProgress'); if (!p) return; if (pct == null) { p.hidden = true; return; } p.hidden = false; var v = clamp(Math.round(pct), 0, 100); p.setAttribute('aria-valuenow', v); p.querySelector('.sp-progress-bar').style.width = v + '%'; p.querySelector('.sp-progress-label').textContent = v + '%'; }
  function once(target, ok, bad, ms) {
    return new Promise(function (resolve, reject) {
      var t = setTimeout(function () { cleanup(); reject(new Error('timed out')); }, ms || 20000);
      function cleanup() { clearTimeout(t); target.removeEventListener(ok, onOk); target.removeEventListener(bad, onBad); }
      function onOk() { cleanup(); resolve(); } function onBad() { cleanup(); reject(new Error('unsupported or damaged file')); }
      target.addEventListener(ok, onOk); target.addEventListener(bad, onBad);
    });
  }
  var assetOf = function (c) { return c.assetId == null ? null : assets.filter(function (a) { return a.id === c.assetId; })[0] || null; };
  var selected = function () { return clips.filter(function (c) { return c.id === selectedId; })[0] || null; };

  /* ---------- undo / redo (clip properties are snapshotted; media elements stay alive) ---------- */
  var PROPS = ['track', 'start', 'trimIn', 'trimOut', 'volume', 'opacity', 'fadeIn', 'fadeOut', 'fit', 'bright', 'contrast', 'sat', 'text', 'size', 'color', 'pos', 'src'];
  function snap() { return { list: clips.map(function (c) { var o = { c: c }; PROPS.forEach(function (k) { o[k] = c[k]; }); return o; }), tracks: JSON.parse(JSON.stringify(tracks)), sel: selectedId }; }
  function restore(s) { clips = s.list.map(function (o) { PROPS.forEach(function (k) { o.c[k] = o[k]; }); return o.c; }); tracks = JSON.parse(JSON.stringify(s.tracks)); selectedId = clips.some(function (c) { return c.id === s.sel; }) ? s.sel : null; }
  function checkpoint(before) { undoStack.push(before || snap()); if (undoStack.length > HISTORY_MAX) undoStack.shift(); redoStack = []; refreshHistoryButtons(); }
  function undo() { if (exporting || !undoStack.length) return; if (playing) pause(true); redoStack.push(snap()); restore(undoStack.pop()); afterEdit(); say('Undo.'); }
  function redo() { if (exporting || !redoStack.length) return; if (playing) pause(true); undoStack.push(snap()); restore(redoStack.pop()); afterEdit(); say('Redo.'); }
  function refreshHistoryButtons() { if ($('tlUndo')) $('tlUndo').disabled = !undoStack.length; if ($('tlRedo')) $('tlRedo').disabled = !redoStack.length; }
  function afterEdit() { playhead = clamp(playhead, 0, Math.max(total(), 0)); renderAll(); seek(playhead); refreshHistoryButtons(); }

  /* ---------- project bin (assets) ---------- */
  async function importFile(file) {
    var type = /^video\//.test(file.type) ? 'video' : /^audio\//.test(file.type) ? 'audio' : /^image\//.test(file.type) ? 'image' : null;
    if (!type) throw new Error(file.name + ': unsupported file type');
    var url = URL.createObjectURL(file), a = { id: nextId++, name: file.name, type: type, file: file, url: url, dur: 0, w: 0, h: 0, thumb: null, img: null, peaks: null };
    try {
      if (type === 'image') {
        var img = new Image(); img.src = url; await once(img, 'load', 'error'); if (!img.naturalWidth) throw new Error('unsupported or damaged file');
        a.img = img; a.w = img.naturalWidth; a.h = img.naturalHeight; a.thumb = url;
      } else {
        var m = document.createElement(type); m.preload = 'auto'; m.muted = true; m.src = url; await once(m, 'loadedmetadata', 'error');
        if (!isFinite(m.duration)) { m.currentTime = 1e7; await once(m, 'durationchange', 'error', 8000).catch(function () {}); try { m.currentTime = 0; } catch (e) { /* ignore */ } }
        if (!isFinite(m.duration) || m.duration <= 0) throw new Error('could not read the duration');
        a.dur = m.duration;
        if (type === 'video') {
          if (!m.videoWidth) throw new Error('no video track found');
          a.w = m.videoWidth; a.h = m.videoHeight;
          try { var p = once(m, 'seeked', 'error', 6000); m.currentTime = Math.min(1, a.dur / 2); await p; var tcv = document.createElement('canvas'); tcv.width = 160; tcv.height = Math.max(1, Math.round(160 * a.h / a.w)); tcv.getContext('2d').drawImage(m, 0, 0, tcv.width, tcv.height); a.thumb = tcv.toDataURL('image/jpeg', 0.7); } catch (e) { /* thumbnail is optional */ }
        } else if (file.size < 80 * 1048576) {
          try { var Off = window.OfflineAudioContext || window.webkitOfflineAudioContext, ab = await new Off(1, 1, 44100).decodeAudioData(await file.arrayBuffer()), d = ab.getChannelData(0), bins = 600, step = Math.max(1, Math.floor(d.length / bins)); a.peaks = new Float32Array(bins); for (var i = 0; i < bins; i++) { var mx = 0; for (var k = 0; k < step; k += Math.max(1, step >> 5)) { var v = Math.abs(d[i * step + k] || 0); if (v > mx) mx = v; } a.peaks[i] = mx; } } catch (e) { /* waveform is optional */ }
        }
        m.removeAttribute('src'); m.load();
      }
    } catch (e) { URL.revokeObjectURL(url); throw new Error(file.name + ': ' + (e.message || e)); }
    return a;
  }
  function removeAsset(a) {
    if (exporting) return;
    var users = clips.filter(function (c) { return c.assetId === a.id; });
    if (users.length && !confirm('"' + a.name + '" is used ' + users.length + ' time(s) on the timeline. Remove it from the project and the timeline?')) return;
    if (playing) pause(true);
    checkpointSafe(); users.forEach(disposeClipEl); clips = clips.filter(function (c) { return c.assetId !== a.id; });
    assets = assets.filter(function (x) { return x !== a; }); URL.revokeObjectURL(a.url); // revoke only when the media itself is removed
    undoStack = []; redoStack = []; afterEdit(); say(a.name + ' removed from the project.');
  }
  function checkpointSafe() { /* removing media clears history afterwards (object URL is gone) */ }
  function renderBin() {
    var bin = $('tlBin'); bin.replaceChildren();
    if (!assets.length) { bin.append(el('div', 've-empty', 'Import images, videos and music to start. Drag items onto the timeline or press ＋.')); return; }
    assets.forEach(function (a) {
      var row = el('div', 've-asset'); row.draggable = true;
      row.addEventListener('dragstart', function (e) { e.dataTransfer.setData('text/plain', 'asset:' + a.id); e.dataTransfer.effectAllowed = 'copy'; });
      var th = el('div', 've-thumb ve-' + a.type); if (a.thumb) th.style.backgroundImage = 'url("' + a.thumb + '")'; else th.textContent = a.type === 'audio' ? '♪' : '▶';
      var info = el('div', 've-asset-info'); info.append(el('b', '', a.name), el('small', '', a.type + (a.type === 'image' ? ' · ' + a.w + '×' + a.h : ' · ' + sec(a.dur))));
      var acts = el('div', 've-asset-actions');
      acts.append(btn('＋', 'btn ve-mini', function () { addAsset(a); }, 'Add to timeline'), btn('✕', 'btn ghost ve-mini', function () { removeAsset(a); }, 'Remove from project'));
      row.append(th, info, acts); bin.append(row);
    });
  }

  /* ---------- clips ---------- */
  function newClip(a, o) {
    var c = { id: nextId++, assetId: a ? a.id : null, type: a ? a.type : 'title', track: 'V1', start: 0, trimIn: 0, trimOut: 5, src: 3600, volume: 1, opacity: 1, fadeIn: 0, fadeOut: 0, fit: 'contain', bright: 100, contrast: 100, sat: 100, text: 'Your title', size: 9, color: '#ffffff', pos: 'bottom', el: null };
    if (a && a.type !== 'image') { c.src = a.dur; c.trimOut = a.dur; }
    if (a && (a.type === 'video' || a.type === 'audio')) {
      var m = document.createElement(a.type); m.preload = 'auto'; m.playsInline = true; m.src = a.url; c.el = m;
      if (a.type === 'video') m.addEventListener('seeked', function () { if (!playing && !exporting) drawPreview(); });
    }
    if (o) Object.keys(o).forEach(function (k) { c[k] = o[k]; });
    return c;
  }
  function disposeClipEl(c) { try { if (c.el) { c.el.pause(); c.el.removeAttribute('src'); c.el.load(); } } catch (e) { /* ignore */ } }
  function freeSlot(tr, t, l) { return !byTrack(tr).some(function (c) { return t < endOf(c) - 1e-6 && t + l > c.start + 1e-6; }); }
  function addAsset(a, trackWanted, at) {
    if (exporting) return say('An export is running. Cancel it first.', 'error');
    var before = snap(), c = newClip(a), tr = trackWanted;
    if (a.type === 'audio') { tr = tr || 'A1'; c.start = at != null ? at : playhead; if (!trackWanted && !freeSlot('A1', c.start, len(c))) tr = 'A2'; }
    else { tr = tr || 'V1'; c.start = at != null ? at : byTrack(tr).reduce(function (m, x) { return Math.max(m, endOf(x)); }, 0); if (a.type === 'image') { c.trimOut = 5; } }
    c.track = tr; c.start = Math.max(0, c.start);
    checkpoint(before); clips.push(c); selectedId = c.id; afterEdit(); say(a.name + ' added to ' + tr + '.');
  }
  function addTitle() {
    if (exporting) return; var before = snap(), c = newClip(null, { track: 'V2', trimOut: 3, start: playhead }); checkpoint(before); clips.push(c); selectedId = c.id; afterEdit(); say('Title added on V2. Edit the text in Properties.');
  }
  function cloneClip(c, o) {
    var a = assetOf(c), n = newClip(a, null); PROPS.forEach(function (k) { n[k] = c[k]; }); if (o) Object.keys(o).forEach(function (k) { n[k] = o[k]; }); return n;
  }
  function splitClip(c, t) {
    if (t <= c.start + MIN_LEN || t >= endOf(c) - MIN_LEN) return false;
    var cut = t - c.start, n;
    if (c.type === 'image' || c.type === 'title') { n = cloneClip(c, { start: t, trimIn: 0, trimOut: len(c) - cut }); c.trimOut = cut; }
    else { n = cloneClip(c, { start: t, trimIn: c.trimIn + cut, trimOut: c.trimOut }); c.trimOut = c.trimIn + cut; }
    clips.push(n); return n;
  }
  function splitAtPlayhead() {
    if (exporting) return; var sel = selected(), targets = sel && playhead > sel.start && playhead < endOf(sel) ? [sel] : clips.filter(function (c) { return !tracks[c.track].locked && playhead > c.start + MIN_LEN && playhead < endOf(c) - MIN_LEN; });
    if (!targets.length) return say('Move the playhead over a clip (or select one) to split it.', 'error');
    var before = snap(), done = 0, last = null; targets.forEach(function (c) { if (tracks[c.track].locked) return; var n = splitClip(c, playhead); if (n) { done++; last = n; } });
    if (!done) return say('Nothing to split here.', 'error'); checkpoint(before); selectedId = last ? last.id : selectedId; afterEdit(); say('Split ' + done + ' clip(s) at ' + tc(playhead) + '.');
  }
  function deleteSelected(ripple) {
    var c = selected(); if (!c || exporting) return say('Select a clip first.', 'error'); if (tracks[c.track].locked) return say('Track ' + c.track + ' is locked.', 'error');
    if (playing) pause(true); var before = snap(), l = len(c), s = c.start, tr = c.track;
    clips = clips.filter(function (x) { return x !== c; });
    if (ripple) clips.forEach(function (x) { if (x.track === tr && x.start >= s + l - 1e-6) x.start = Math.max(0, x.start - l); });
    checkpoint(before); selectedId = null; afterEdit(); say(ripple ? 'Ripple deleted.' : 'Clip deleted.');
  }
  function duplicateSelected() {
    var c = selected(); if (!c || exporting) return; var before = snap(), n = cloneClip(c, { start: endOf(c) });
    checkpoint(before); clips.push(n); selectedId = n.id; afterEdit(); say('Clip duplicated.');
  }
  function moveVisual(c, dir) {
    var v = byTrack(c.track), i = v.indexOf(c), j = i + dir; if (j < 0 || j >= v.length) return; var before = snap(), t = v[i]; v[i] = v[j]; v[j] = t; var at = v[0].start;
    v.forEach(function (x) { x.start = at; at += len(x); }); checkpoint(before); afterEdit();
  }

  /* ---------- compositing (shared by preview and export) ---------- */
  function fadeFactor(c, t) {
    var s = c.start, e = endOf(c); if (t < s || t > e) return 1; var f = 1;
    if (c.fadeIn > 0 && t < s + c.fadeIn) f = Math.min(f, (t - s) / c.fadeIn);
    if (c.fadeOut > 0 && t > e - c.fadeOut) f = Math.min(f, (e - t) / c.fadeOut);
    return clamp(f, 0, 1);
  }
  function layersAt(t) {
    var mode = $('tlTransition').value, d = clamp(num($('tlTransLen').value, 0.5), 0.1, 3), out = [];
    ['V1', 'V2'].forEach(function (tr) {
      if (tracks[tr].hidden) return;
      var list = byTrack(tr);
      list.forEach(function (c, i) {
        var s = c.start, e = endOf(c), prev = list[i - 1], next = list[i + 1];
        var adjPrev = prev && Math.abs(endOf(prev) - s) <= 0.05, adjNext = next && Math.abs(e - next.start) <= 0.05;
        var h = Math.min(d / 2, len(c) / 2), from = s, to = e, a = 1;
        if (mode === 'crossfade') { if (adjPrev) from = s - h; if (adjNext) to = e + h; if (t < from || t >= to) return; if (adjPrev && t < s + h) a = (t - (s - h)) / (2 * h); }
        else { if (t < s || t >= e) return; if (mode === 'fade') { if (t < s + h) a = (t - s) / h; if (t > e - h) a = Math.min(a, (e - t) / h); } }
        a = clamp(a, 0, 1) * clamp(c.opacity, 0, 1) * fadeFactor(c, t);
        out.push({ clip: c, alpha: a, srcTime: clamp(c.trimIn + (t - s), c.trimIn, Math.max(c.trimIn, c.trimOut - 0.04)) });
      });
    });
    return out;
  }
  function paint(ctx, W, H, layers) {
    ctx.globalAlpha = 1; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    layers.forEach(function (l) {
      var c = l.clip; if (l.alpha <= 0.001) return;
      var filt = (c.bright !== 100 || c.contrast !== 100 || c.sat !== 100) ? 'brightness(' + c.bright + '%) contrast(' + c.contrast + '%) saturate(' + c.sat + '%)' : 'none';
      ctx.save(); ctx.globalAlpha = l.alpha;
      if (c.type === 'title') {
        var px = Math.max(8, H * clamp(c.size, 2, 40) / 100), lines = String(c.text || '').split('\n'), y0 = c.pos === 'top' ? H * 0.16 : c.pos === 'center' ? H * 0.5 : H * 0.84;
        ctx.font = '700 ' + px + 'px "Inter", "Segoe UI", system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = c.color; ctx.shadowColor = 'rgba(0,0,0,.65)'; ctx.shadowBlur = px * 0.15; ctx.shadowOffsetY = px * 0.04;
        lines.forEach(function (ln, i) { ctx.fillText(ln, W / 2, y0 + (i - (lines.length - 1) / 2) * px * 1.18, W * 0.94); });
      } else {
        var a = assetOf(c), e = c.type === 'image' ? (a && a.img) : c.el;
        if (!e) { ctx.restore(); return; }
        var sw = c.type === 'image' ? a.w : (e.videoWidth || (a && a.w)), sh = c.type === 'image' ? a.h : (e.videoHeight || (a && a.h));
        if (!sw || !sh || (c.type === 'video' && e.readyState < 2)) { ctx.restore(); return; }
        var s = c.fit === 'cover' ? Math.max(W / sw, H / sh) : Math.min(W / sw, H / sh), dw = sw * s, dh = sh * s;
        try { ctx.filter = filt; } catch (err) { /* filter unsupported */ }
        ctx.drawImage(e, (W - dw) / 2, (H - dh) / 2, dw, dh);
      }
      ctx.restore();
    });
    ctx.globalAlpha = 1;
  }
  function drawPreview() { if (exporting) return; paint(cx, cv.width, cv.height, layersAt(playhead)); }
  function sizePreview() {
    var a = $('tlAspect').value; cv.width = a === '9:16' ? 360 : a === '1:1' ? 480 : 640; cv.height = a === '9:16' ? 640 : a === '1:1' ? 480 : 360; cv.style.aspectRatio = cv.width + ' / ' + cv.height; drawPreview();
  }
  function outDims() { var short = Number($('tlRes').value) === 1080 ? 1080 : 720, a = $('tlAspect').value; if (a === '9:16') return [short, Math.round(short * 16 / 9 / 2) * 2]; if (a === '1:1') return [short, short]; return [Math.round(short * 16 / 9 / 2) * 2, short]; }

  /* ---------- playback ---------- */
  function clipGain(c, t) { return tracks[c.track].muted ? 0 : clamp(c.volume, 0, 1) * fadeFactor(c, t); }
  function syncMedia() {
    var t = playhead, layers = layersAt(t);
    clips.forEach(function (c) {
      if (!c.el) return; var m = c.el, active = t >= c.start && t < endOf(c), wanted = c.trimIn + (t - c.start);
      if (active && playing && !(c.type === 'video' && tracks[c.track].hidden && false)) {
        m.muted = false; m.volume = clipGain(c, t);
        if (!m.seeking && Math.abs(m.currentTime - wanted) > 0.3) m.currentTime = wanted;
        if (m.paused) m.play().catch(function () {});
      } else {
        if (!m.paused) m.pause();
        if (c.type === 'video') { var l = layers.filter(function (x) { return x.clip === c; })[0]; if (l && !m.seeking && Math.abs(m.currentTime - l.srcTime) > 0.05) m.currentTime = l.srcTime; }
        else if (active && !m.seeking && Math.abs(m.currentTime - wanted) > 0.05) m.currentTime = wanted;
      }
    });
  }
  function updateClock() {
    var tot = total(), s = $('timelineSeek'); s.max = tot.toFixed(2); s.value = clamp(playhead, 0, tot);
    $('tlTimecode').textContent = tc(playhead); $('timelineTime').textContent = '/ ' + tc(tot);
    var ph = document.querySelector('.tl-playhead'); if (ph) ph.style.left = (playhead * pxPerSec) + 'px';
    $('timelinePlay').classList.toggle('is-on', playing);
  }
  function tick() {
    if (!playing) return; playhead = playBase + (performance.now() - playStart) / 1000;
    var stopAt = rangeEnd != null ? rangeEnd : total(); if (playhead >= stopAt) { playhead = stopAt; pause(); return; }
    syncMedia(); drawPreview(); updateClock(); followPlayhead(); raf = requestAnimationFrame(tick);
  }
  function play(from, to) {
    if (exporting) return say('An export is running. Wait for it to finish or cancel it first.', 'error'); if (!clips.length) return say('Import media and add it to the timeline first.', 'error');
    var tot = total(); if (from != null) playhead = from; else if (playhead >= tot - 0.05) playhead = 0;
    rangeEnd = to != null ? to : null; playBase = playhead; playStart = performance.now(); playing = true; cancelAnimationFrame(raf); raf = requestAnimationFrame(tick); say('Playing…');
  }
  function pause(silent) { playing = false; cancelAnimationFrame(raf); rangeEnd = null; clips.forEach(function (c) { if (c.el) c.el.pause(); }); syncMedia(); drawPreview(); updateClock(); if (!silent) say('Paused at ' + tc(playhead) + '.'); }
  function stop() { pause(true); playhead = 0; syncMedia(); drawPreview(); updateClock(); followPlayhead(true); say('Stopped.'); }
  function seek(t) { playhead = clamp(num(t), 0, Math.max(total(), 0)); if (playing) { playBase = playhead; playStart = performance.now(); } syncMedia(); drawPreview(); updateClock(); }
  function followPlayhead(force) { var sc = document.querySelector('.tl-scroll'); if (!sc) return; var x = playhead * pxPerSec; if (force || x < sc.scrollLeft || x > sc.scrollLeft + sc.clientWidth - 40) sc.scrollLeft = Math.max(0, x - sc.clientWidth * 0.3); }

  /* ---------- timeline ---------- */
  var laneEls = {};
  function fitZoom() { var tot = Math.max(total(), 10), avail = Math.max(260, ($('timelineView').clientWidth || 800) - 130); pxPerSec = clamp(avail / tot, window.innerWidth < 700 ? 26 : 4, 200); $('tlZoom').value = pxPerSec; }
  function setZoom(v, auto) { var sc = document.querySelector('.tl-scroll'), center = sc ? (sc.scrollLeft + sc.clientWidth / 2) / pxPerSec : 0; pxPerSec = clamp(v, 4, 200); zoomAuto = !!auto; $('tlZoom').value = pxPerSec; renderTimeline(); var s2 = document.querySelector('.tl-scroll'); if (s2) s2.scrollLeft = Math.max(0, center * pxPerSec - s2.clientWidth / 2); }
  function snapPoints(except) { var p = [0, playhead]; clips.forEach(function (c) { if (c !== except) { p.push(c.start, endOf(c)); } }); return p; }
  function snapDelta(times, except) { if (!$('tlSnap').checked) return 0; var pts = snapPoints(except), thr = 9 / pxPerSec, best = null; times.forEach(function (t) { pts.forEach(function (p) { var d = p - t; if (Math.abs(d) <= thr && (best === null || Math.abs(d) < Math.abs(best))) best = d; }); }); return best || 0; }

  function renderTimeline() {
    var view = $('timelineView'), tot = total(); if (zoomAuto) fitZoom();
    var visibleTotal = Math.max(tot, 10), width = Math.max(($('timelineView').clientWidth || 800) - 130, Math.ceil((visibleTotal + 4) * pxPerSec));
    var wrap = el('div', 'tl-wrap'), labels = el('div', 'tl-labels'), scroll = el('div', 'tl-scroll'), inner = el('div', 'tl-inner'); inner.style.width = width + 'px';
    var ruler = el('div', 'tl-ruler'), steps = [1, 2, 5, 10, 15, 30, 60, 120, 300], step = steps.filter(function (s) { return s * pxPerSec >= 70; })[0] || 300;
    labels.append(el('div', 'tl-label tl-label-ruler', ''));
    for (var t = 0; t <= visibleTotal + 4; t += step) { var k = el('span', 'tl-tick', tc(t).replace(/^00:/, '')); k.style.left = (t * pxPerSec) + 'px'; ruler.append(k); }
    inner.append(ruler); laneEls = {};
    TRACKS.forEach(function (tr) {
      var st = tracks[tr], head = el('div', 'tl-label tl-head'); head.append(el('b', '', tr));
      var tg = function (label, key, title) { var b = el('button', 'tl-toggle' + (st[key] ? ' is-on' : ''), label); b.type = 'button'; b.title = title; b.addEventListener('click', function () { var before = snap(); st[key] = !st[key]; checkpoint(before); renderAll(); seek(playhead); }); return b; };
      if (tr[0] === 'V') head.append(tg('👁', 'hidden', 'Hide / show track'), tg('🔒', 'locked', 'Lock track')); else head.append(tg('M', 'muted', 'Mute track'), tg('🔒', 'locked', 'Lock track'));
      labels.append(head);
      var lane = el('div', 'tl-lane tl-' + (tr[0] === 'V' ? 'video' : 'audio') + (st.locked ? ' is-locked' : '') + (st.hidden ? ' is-hidden' : '') + (st.muted ? ' is-muted' : '')); lane.setAttribute('data-track', tr); laneEls[tr] = lane;
      lane.addEventListener('dragover', function (e) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
      lane.addEventListener('drop', function (e) {
        e.preventDefault(); var d = e.dataTransfer.getData('text/plain'); if (d.indexOf('asset:') !== 0) return; var a = assets.filter(function (x) { return x.id === Number(d.slice(6)); })[0]; if (!a) return;
        if ((a.type === 'audio') !== (tr[0] === 'A')) return say(a.type === 'audio' ? 'Audio goes on A1/A2.' : 'Images and videos go on V1/V2.', 'error');
        if (st.locked) return say('Track ' + tr + ' is locked.', 'error'); var r = inner.getBoundingClientRect(); addAsset(a, tr, Math.max(0, (e.clientX - r.left) / pxPerSec));
      });
      byTrack(tr).forEach(function (c) { lane.append(blockFor(c, inner)); });
      inner.append(lane);
    });
    var ph = el('div', 'tl-playhead'); inner.append(ph);
    var scrub = function (ev) { var r = inner.getBoundingClientRect(); seek((ev.clientX - r.left) / pxPerSec); };
    ruler.addEventListener('pointerdown', function (ev) { ruler.setPointerCapture(ev.pointerId); scrub(ev); ruler.onpointermove = scrub; }); ruler.addEventListener('pointerup', function () { ruler.onpointermove = null; });
    inner.addEventListener('pointerdown', function (ev) { if (ev.target.closest('.tl-block') || ev.target.closest('.tl-ruler')) return; selectedId = null; scrub(ev); refreshSelection(); });
    var oldScroll = document.querySelector('.tl-scroll'), keep = oldScroll ? oldScroll.scrollLeft : 0;
    scroll.append(inner); wrap.append(labels, scroll); view.replaceChildren(wrap); scroll.scrollLeft = keep; updateClock();
  }
  function blockFor(c, inner) {
    var a = assetOf(c), b = el('div', 'tl-block tl-t-' + c.type + (c.id === selectedId ? ' is-selected' : '')); b.setAttribute('data-id', c.id);
    b.style.left = (c.start * pxPerSec) + 'px'; b.style.width = Math.max(14, len(c) * pxPerSec) + 'px';
    if (a && a.thumb && c.type !== 'audio') b.style.backgroundImage = 'url("' + a.thumb + '")';
    var name = c.type === 'title' ? '“' + String(c.text).split('\n')[0] + '”' : (a ? a.name : c.type);
    if (c.type === 'audio' && a && a.peaks) { var wv = el('canvas', 'tl-wave'); wv.width = Math.max(14, Math.round(len(c) * pxPerSec)); wv.height = 34; b.append(wv); drawWave(wv, a, c); }
    b.append(el('span', 'tl-name', name + ' · ' + sec(len(c)))); b.append(el('i', 'tl-h tl-h-l'), el('i', 'tl-h tl-h-r'));
    b.title = name + '\nStart ' + tc(c.start) + ' · End ' + tc(endOf(c)) + ' · Duration ' + len(c).toFixed(2) + ' s';
    b.addEventListener('pointerdown', function (ev) { startDrag(ev, c, b, inner); });
    return b;
  }
  function drawWave(canvas, a, c) {
    var g = canvas.getContext('2d'), w = canvas.width, h = canvas.height, n = a.peaks.length, i0 = c.trimIn / a.dur * n, i1 = c.trimOut / a.dur * n; g.clearRect(0, 0, w, h); g.fillStyle = 'rgba(47,191,113,.85)';
    for (var x = 0; x < w; x++) { var i = Math.min(n - 1, Math.floor(i0 + (x / w) * (i1 - i0))), p = Math.min(1, a.peaks[i] * 1.4) * (h / 2 - 2); g.fillRect(x, h / 2 - p, 1, Math.max(1, p * 2)); }
  }
  function refreshSelection() { document.querySelectorAll('.tl-block').forEach(function (b) { b.classList.toggle('is-selected', Number(b.getAttribute('data-id')) === selectedId); }); renderInspector(); }

  function startDrag(ev, c, block, inner) {
    if (ev.button != null && ev.button !== 0) return; ev.stopPropagation();
    if (exporting) return;
    if (tool === 'razor') { var r0 = inner.getBoundingClientRect(), t0 = (ev.clientX - r0.left) / pxPerSec; if (tracks[c.track].locked) return say('Track ' + c.track + ' is locked.', 'error'); var before0 = snap(); if (splitClip(c, t0)) { checkpoint(before0); afterEdit(); say('Split at ' + tc(t0) + '.'); } return; }
    selectedId = c.id; refreshSelection(); if (tracks[c.track].locked) return say('Track ' + c.track + ' is locked. Unlock it to edit.', 'error');
    var mode = ev.target.classList.contains('tl-h-l') ? 'trimL' : ev.target.classList.contains('tl-h-r') ? 'trimR' : 'move';
    var o = { x: ev.clientX, start: c.start, trimIn: c.trimIn, trimOut: c.trimOut, len: len(c), track: c.track }, before = snap(), moved = false;
    block.setPointerCapture(ev.pointerId); block.classList.add('is-dragging');
    function onMove(e) {
      var dt = (e.clientX - o.x) / pxPerSec; if (Math.abs(e.clientX - o.x) > 2) moved = true; if (!moved) return;
      if (mode === 'move') {
        var s = Math.max(0, o.start + dt), d = snapDelta([s, s + o.len], c); c.start = Math.max(0, s + d);
        TRACKS.forEach(function (tr) { var lane = laneEls[tr]; if (!lane) return; var r = lane.getBoundingClientRect(); if (e.clientY >= r.top && e.clientY < r.bottom && (tr[0] === 'V') === isVisual(c) && !tracks[tr].locked && c.track !== tr) { c.track = tr; lane.append(block); } });
      } else if (mode === 'trimL') {
        var lo = c.type === 'video' || c.type === 'audio' ? Math.max(-o.start, -o.trimIn) : -o.start, hi = o.len - MIN_LEN, delta = clamp(dt, lo, hi), sd = snapDelta([o.start + delta], c); delta = clamp(delta + sd, lo, hi);
        c.start = o.start + delta; if (c.type === 'video' || c.type === 'audio') c.trimIn = o.trimIn + delta; else c.trimOut = o.len - delta;
      } else {
        var sd2 = snapDelta([o.start + o.len + dt], c), nl = clamp(o.len + dt + sd2, MIN_LEN, (c.type === 'video' || c.type === 'audio') ? c.src - o.trimIn : 3600); c.trimOut = o.trimIn + nl;
      }
      block.style.left = (c.start * pxPerSec) + 'px'; block.style.width = Math.max(14, len(c) * pxPerSec) + 'px'; block.querySelector('.tl-name').textContent = block.querySelector('.tl-name').textContent.replace(/ · .*$/, '') + ' · ' + sec(len(c));
      updateClock(); drawPreview(); renderInspector(true);
    }
    function onUp() { block.removeEventListener('pointermove', onMove); block.removeEventListener('pointerup', onUp); block.removeEventListener('pointercancel', onUp); block.classList.remove('is-dragging'); if (moved) { checkpoint(before); renderAll(); seek(playhead); } }
    block.addEventListener('pointermove', onMove); block.addEventListener('pointerup', onUp); block.addEventListener('pointercancel', onUp);
  }

  /* ---------- inspector ---------- */
  function renderInspector(light) {
    var box = $('tlInspector'), c = selected();
    if (light && c && box.firstChild && box.getAttribute('data-for') === String(c.id)) { box.querySelectorAll('[data-k]').forEach(function (i) { var k = i.getAttribute('data-k'); if (document.activeElement !== i) i.value = fieldValue(c, k); }); return; }
    box.replaceChildren(); box.setAttribute('data-for', c ? c.id : '');
    if (!c) { box.append(el('div', 've-empty', 'Select a clip on the timeline to edit its properties.')); return; }
    var a = assetOf(c), grp = function (title) { var g = el('div', 've-group'); g.append(el('h4', '', title)); box.append(g); return g; };
    var head = grp((c.type === 'title' ? 'Title' : (a ? a.name : c.type)) + ' · ' + c.track);
    var fld = function (g, label, key, o) {
      var w = el('label', 've-field', label), i = document.createElement(o.select ? 'select' : 'input'); i.setAttribute('data-k', key);
      if (o.select) o.select.forEach(function (op) { var e = document.createElement('option'); e.value = op[0]; e.textContent = op[1]; i.append(e); }); else { i.type = o.type || 'number'; if (o.type !== 'color' && o.type !== 'text') { i.step = o.step || '0.1'; if (o.min != null) i.min = o.min; if (o.max != null) i.max = o.max; } }
      i.value = fieldValue(c, key); if (o.disabled) i.disabled = true;
      i.addEventListener('change', function () { editClip(c, key, o.type === 'text' || o.type === 'color' || o.select ? i.value : num(i.value, num(fieldValue(c, key)))); });
      w.append(i); g.append(w); return i;
    };
    var t = grp('Time'), isMedia = c.type === 'video' || c.type === 'audio';
    fld(t, 'Start (s)', 'start', { min: 0 }); fld(t, 'Duration (s)', 'dur', { min: MIN_LEN }); if (isMedia) { fld(t, 'Trim in (s)', 'in', { min: 0 }); fld(t, 'Trim out (s)', 'out', { min: MIN_LEN }); }
    if (c.type === 'title') { var ti = grp('Text'); var ta = document.createElement('textarea'); ta.rows = 2; ta.value = c.text; ta.setAttribute('data-k', 'text'); ta.addEventListener('change', function () { editClip(c, 'text', ta.value); }); ti.append(ta); fld(ti, 'Size (% of height)', 'size', { min: 2, max: 40, step: 1 }); fld(ti, 'Colour', 'color', { type: 'color' }); fld(ti, 'Position', 'pos', { select: [['top', 'Top'], ['center', 'Center'], ['bottom', 'Bottom']] }); }
    if (isMedia) { var au = grp('Audio'); fld(au, 'Volume (%)', 'vol', { min: 0, max: 100, step: 5 }); }
    var ef = grp('Effects'); if (isVisual(c)) { fld(ef, 'Opacity (%)', 'opacity', { min: 0, max: 100, step: 5 }); if (c.type !== 'title') fld(ef, 'Fit', 'fit', { select: [['contain', 'Fit (letterbox)'], ['cover', 'Fill (crop)']] }); }
    fld(ef, 'Fade in (s)', 'fadeIn', { min: 0, step: 0.1 }); fld(ef, 'Fade out (s)', 'fadeOut', { min: 0, step: 0.1 });
    if (isVisual(c) && c.type !== 'title') { var co = grp('Colour'); fld(co, 'Brightness (%)', 'bright', { min: 0, max: 200, step: 5 }); fld(co, 'Contrast (%)', 'contrast', { min: 0, max: 200, step: 5 }); fld(co, 'Saturation (%)', 'sat', { min: 0, max: 200, step: 5 }); }
    var ac = el('div', 've-actions'); ac.append(btn('▶ Preview clip', 'btn ghost', function () { play(c.start, endOf(c)); }), btn('✂ Split', 'btn ghost', splitAtPlayhead), btn('⧉ Duplicate', 'btn ghost', duplicateSelected));
    if (isVisual(c)) ac.append(btn('◀ Earlier', 'btn ghost', function () { moveVisual(c, -1); }), btn('Later ▶', 'btn ghost', function () { moveVisual(c, 1); }));
    ac.append(btn('Delete', 'btn ghost', function () { deleteSelected(false); })); box.append(ac);
    if (c.type === 'audio') { var a2 = assetOf(c); if (a2) { var pl = document.createElement('audio'); pl.controls = true; pl.preload = 'metadata'; pl.src = a2.url; pl.className = 'tl-audio-player'; pl.addEventListener('play', function () { if (playing) pause(true); }); box.append(pl); } }
  }
  function fieldValue(c, k) {
    switch (k) { case 'dur': return r2(len(c)); case 'in': return r2(c.trimIn); case 'out': return r2(c.trimOut); case 'vol': return Math.round(c.volume * 100); case 'opacity': return Math.round(c.opacity * 100); case 'start': return r2(c.start); default: return c[k] != null ? (typeof c[k] === 'number' ? r2(c[k]) : c[k]) : ''; }
  }
  function editClip(c, key, v) {
    if (tracks[c.track].locked) return say('Track ' + c.track + ' is locked.', 'error'); var before = snap(), s = c.src, note = '';
    switch (key) {
      case 'start': c.start = Math.max(0, v); break;
      case 'vol': c.volume = clamp(v / 100, 0, 1); break; case 'opacity': c.opacity = clamp(v / 100, 0, 1); break;
      case 'in': c.trimIn = clamp(v, 0, s - MIN_LEN); if (c.trimOut < c.trimIn + MIN_LEN) c.trimOut = Math.min(s, c.trimIn + MIN_LEN); break;
      case 'out': c.trimOut = clamp(v, c.trimIn + MIN_LEN, s); break;
      case 'dur': if (c.type === 'image' || c.type === 'title') c.trimOut = clamp(v, MIN_LEN, 3600); else { var want = c.trimIn + v; c.trimOut = clamp(want, c.trimIn + MIN_LEN, s); if (want > s + 0.001) note = ' Duration limited to the length of the source (' + s.toFixed(2) + ' s).'; } break;
      case 'fadeIn': case 'fadeOut': c[key] = clamp(v, 0, Math.max(0, len(c))); break;
      case 'bright': case 'contrast': case 'sat': c[key] = clamp(v, 0, 200); break;
      case 'size': c.size = clamp(v, 2, 40); break;
      default: c[key] = v;
    }
    checkpoint(before); renderAll(); seek(playhead); if (note) say(note.trim());
  }

  /* ---------- render all / wiring ---------- */
  function renderAll() {
    renderBin(); renderTimeline(); renderInspector();
    $('tlExportMp4').disabled = exporting || !clips.some(isVisual); updateClock(); drawPreview(); refreshHistoryButtons();
  }
  async function importFiles(files) {
    if (!files.length) return; say('Reading ' + files.length + ' file(s)…'); var ok = 0, errors = [];
    for (var i = 0; i < files.length; i++) { try { assets.push(await importFile(files[i])); ok++; } catch (e) { errors.push(e.message || String(e)); } }
    $('timelineFiles').value = ''; renderBin();
    say((ok ? ok + ' file(s) imported. Press ＋ or drag them onto the timeline. ' : '') + (errors.length ? 'Could not import: ' + errors.join(' · ') : ''), errors.length ? 'error' : '');
    if (ok && !clips.length && assets.length === ok) { /* first import: add everything in order so the project is immediately playable */ }
  }
  $('timelineImport').addEventListener('click', function () { $('timelineFiles').click(); });
  $('timelineFiles').addEventListener('change', function () { importFiles(Array.prototype.slice.call($('timelineFiles').files)); });
  var drop = $('ve'); if (drop) { drop.addEventListener('dragover', function (e) { if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') >= 0) e.preventDefault(); }); drop.addEventListener('drop', function (e) { if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) { e.preventDefault(); importFiles(Array.prototype.slice.call(e.dataTransfer.files)); } }); }
  $('tlAddTitle').addEventListener('click', addTitle);
  $('tlToolSel').addEventListener('click', function () { setTool('select'); }); $('tlToolRazor').addEventListener('click', function () { setTool('razor'); });
  function setTool(t) { tool = t; $('tlToolSel').classList.toggle('is-on', t === 'select'); $('tlToolRazor').classList.toggle('is-on', t === 'razor'); $('timelineView').classList.toggle('is-razor', t === 'razor'); say(t === 'razor' ? 'Razor tool: click a clip to cut it.' : 'Selection tool.'); }
  $('tlSplit').addEventListener('click', splitAtPlayhead); $('tlDelete').addEventListener('click', function () { deleteSelected(false); }); $('tlRipple').addEventListener('click', function () { deleteSelected(true); });
  $('tlUndo').addEventListener('click', undo); $('tlRedo').addEventListener('click', redo);
  $('timelinePlay').addEventListener('click', function () { if (playing) pause(); else play(); }); $('timelinePause').addEventListener('click', function () { pause(); }); $('timelineStop').addEventListener('click', stop);
  $('tlToStart').addEventListener('click', function () { seek(0); followPlayhead(true); }); $('tlToEnd').addEventListener('click', function () { seek(total()); followPlayhead(); });
  $('tlPrevFrame').addEventListener('click', function () { pause(true); seek(playhead - 1 / fps()); }); $('tlNextFrame').addEventListener('click', function () { pause(true); seek(playhead + 1 / fps()); });
  $('timelineSeek').addEventListener('input', function () { seek($('timelineSeek').value); });
  $('tlZoom').addEventListener('input', function () { setZoom(Number($('tlZoom').value), false); }); $('tlZoomIn').addEventListener('click', function () { setZoom(pxPerSec * 1.4, false); }); $('tlZoomOut').addEventListener('click', function () { setZoom(pxPerSec / 1.4, false); }); $('tlFit').addEventListener('click', function () { setZoom(pxPerSec, true); });
  $('timelineClear').addEventListener('click', function () {
    if (exporting) return say('An export is running. Cancel it first.', 'error'); if ((clips.length || assets.length) && !confirm('Remove all media and clips from this project?')) return;
    pause(true); clips.forEach(disposeClipEl); assets.forEach(function (a) { URL.revokeObjectURL(a.url); }); clips = []; assets = []; selectedId = null; playhead = 0; undoStack = []; redoStack = []; renderAll(); say('Project cleared.');
  });
  $('timelineExport').addEventListener('click', function () {
    var project = { app: 'EditPrompt', version: '10.0', createdAt: new Date().toISOString(), output: { resolution: $('tlRes').value + 'p', aspect: $('tlAspect').value, fps: fps(), transition: $('tlTransition').value, transitionSeconds: num($('tlTransLen').value, 0.5) }, tracks: tracks,
      clips: clips.map(function (c) { var a = assetOf(c); return { name: a ? a.name : 'title', type: c.type, track: c.track, start: r2(c.start), trimIn: r2(c.trimIn), trimOut: r2(c.trimOut), duration: r2(len(c)), volume: r2(c.volume), opacity: r2(c.opacity), fadeIn: r2(c.fadeIn), fadeOut: r2(c.fadeOut), text: c.type === 'title' ? c.text : undefined }; }) };
    download(new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' }), 'editprompt-timeline-project.json'); say('Timeline project JSON exported. Media files are not embedded; keep the originals.');
  });
  $('tlAspect').addEventListener('change', sizePreview); $('tlFps').addEventListener('change', function () { updateClock(); });
  ['tlTransition', 'tlTransLen'].forEach(function (id) { $(id).addEventListener('change', function () { seek(playhead); }); });
  window.addEventListener('resize', function () { if (zoomAuto) renderTimeline(); });
  window.addEventListener('pagehide', function () { clips.forEach(disposeClipEl); assets.forEach(function (a) { URL.revokeObjectURL(a.url); }); if (lastExportUrl) URL.revokeObjectURL(lastExportUrl); });
  var panel = $('video-timeline');
  if (panel && window.MutationObserver) new MutationObserver(function () { if (panel.classList.contains('sp-active')) renderAll(); }).observe(panel, { attributes: true, attributeFilter: ['class'] });
  document.addEventListener('keydown', function (e) {
    if (!panel || !panel.classList.contains('sp-active') || exporting) return; var tg = e.target && e.target.tagName; if (tg === 'INPUT' || tg === 'TEXTAREA' || tg === 'SELECT' || (e.target && e.target.isContentEditable)) return;
    var k = e.key, mod = e.ctrlKey || e.metaKey, used = true;
    if (k === ' ') { if (playing) pause(); else play(); }
    else if (mod && (k === 'z' || k === 'Z')) { if (e.shiftKey) redo(); else undo(); } else if (mod && (k === 'y' || k === 'Y')) redo(); else if (mod && (k === 'd' || k === 'D')) duplicateSelected();
    else if (k === 's' || k === 'S') splitAtPlayhead(); else if (k === 'Delete' || k === 'Backspace') deleteSelected(e.shiftKey);
    else if (k === 'v' || k === 'V') setTool('select'); else if (k === 'c' || k === 'C') setTool('razor');
    else if (k === 'ArrowLeft') { pause(true); seek(playhead - (e.shiftKey ? 1 : 1 / fps())); } else if (k === 'ArrowRight') { pause(true); seek(playhead + (e.shiftKey ? 1 : 1 / fps())); }
    else if (k === 'Home') { seek(0); followPlayhead(true); } else if (k === 'End') seek(total()); else if (k === 'k' || k === 'K') pause(); else if (k === 'l' || k === 'L') play();
    else if (k === '+' || k === '=') setZoom(pxPerSec * 1.3, false); else if (k === '-') setZoom(pxPerSec / 1.3, false); else if (k === '\\') setZoom(pxPerSec, true); else used = false;
    if (used) e.preventDefault();
  });

  /* ---------- real MP4 export ---------- */
  function toU8(d) { if (!d) return null; if (d instanceof ArrayBuffer) return new Uint8Array(d.slice(0)); return new Uint8Array(d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength)); }
  async function pickVideoConfig(W, H, fr, bitrate) {
    var list = ['avc1.640028', 'avc1.4D0028', 'avc1.42E028', 'avc1.640032', 'avc1.42E01F', 'vp09.00.40.08'];
    for (var i = 0; i < list.length; i++) {
      var cfg = { codec: list[i], width: W, height: H, bitrate: bitrate, framerate: fr, latencyMode: 'quality' }; if (list[i].indexOf('avc1') === 0) cfg.avc = { format: 'avc' };
      try { var r = await VideoEncoder.isConfigSupported(cfg); if (r && r.supported) return { cfg: cfg, family: list[i].indexOf('avc1') === 0 ? 'avc1' : 'vp09' }; } catch (e) { /* next */ }
    }
    return null;
  }
  async function pickAudioConfig() {
    if (typeof AudioEncoder === 'undefined' || typeof AudioData === 'undefined') return null;
    var list = [{ codec: 'mp4a.40.2', family: 'mp4a' }, { codec: 'opus', family: 'Opus' }];
    for (var i = 0; i < list.length; i++) { var cfg = { codec: list[i].codec, sampleRate: 48000, numberOfChannels: 2, bitrate: 128000 }; try { var r = await AudioEncoder.isConfigSupported(cfg); if (r && r.supported) return { cfg: cfg, family: list[i].family }; } catch (e) { /* next */ } }
    return null;
  }
  async function seekVideo(m, t) { if (!m.seeking && m.readyState >= 2 && Math.abs(m.currentTime - t) < 0.001) return; var p = once(m, 'seeked', 'error', 8000); m.currentTime = t; await p; }
  async function mixAudio(totalSec, warnings) {
    var sources = clips.filter(function (c) { return (c.type === 'audio' || c.type === 'video') && c.volume > 0 && !tracks[c.track].muted; });
    if (!sources.length) return null; var Off = window.OfflineAudioContext || window.webkitOfflineAudioContext; if (!Off) return null;
    var off = new Off(2, Math.max(1, Math.ceil(totalSec * 48000)), 48000), used = 0, cache = {};
    for (var i = 0; i < sources.length; i++) {
      var c = sources[i], a = assetOf(c);
      try {
        if (!cache[a.id]) cache[a.id] = off.decodeAudioData(await a.file.arrayBuffer());
        var buf = await cache[a.id], s = off.createBufferSource(), g = off.createGain(), st = Math.max(0, c.start), en = st + len(c); s.buffer = buf; s.connect(g); g.connect(off.destination);
        var vol = clamp(c.volume, 0, 1); g.gain.setValueAtTime(c.fadeIn > 0 ? 0 : vol, 0);
        if (c.fadeIn > 0) { g.gain.setValueAtTime(0, st); g.gain.linearRampToValueAtTime(vol, st + c.fadeIn); }
        if (c.fadeOut > 0) { g.gain.setValueAtTime(vol, Math.max(st + (c.fadeIn || 0), en - c.fadeOut)); g.gain.linearRampToValueAtTime(0, en); }
        s.start(st, Math.min(c.trimIn, Math.max(0, buf.duration - 0.01)), len(c)); used++;
      } catch (e) {
        if (c.type === 'audio') throw new Error('The audio file "' + (a ? a.name : 'audio') + '" could not be decoded by this browser, so music cannot be included. Convert it to MP3, WAV or M4A and import it again.');
        warnings.push('No sound taken from "' + (a ? a.name : 'video') + '" (it has no audio track, or this browser could not decode it).');
      }
    }
    return used ? off.startRendering() : null;
  }
  function setExportUi(on) {
    exporting = on; ['timelineImport', 'tlAddTitle', 'timelinePlay', 'timelinePause', 'timelineStop', 'timelineClear', 'tlExportMp4', 'tlSplit', 'tlDelete', 'tlRipple'].forEach(function (id) { if ($(id)) $(id).disabled = on; });
    $('tlCancel').hidden = !on; $('timelineSeek').disabled = on || !clips.length;
    if (!on) { clips.forEach(function (c) { if (c.type === 'video') c.el.muted = false; }); renderAll(); }
  }
  function fail(msg) { progress(null); say(msg, 'error'); }

  async function exportMp4() {
    if (exporting) return;
    if (!clips.some(isVisual)) return fail('Add at least one image, video or title to the timeline before exporting.');
    if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') return fail('MP4 export is not supported in this browser (it needs the WebCodecs video encoder). Please use the latest Chrome, Edge or Opera.');
    var totalSec = total(); if (totalSec < 0.2) return fail('The timeline is empty or too short to export.');
    if (totalSec > MAX_EXPORT_SECONDS) return fail('The timeline is ' + sec(totalSec) + ' long. The browser exporter supports up to ' + (MAX_EXPORT_SECONDS / 60) + ' minutes.');
    pause(true); cancelExport = false; setExportUi(true); progress(0);
    var venc = null, aenc = null, warnings = [];
    try {
      var dims = outDims(), W = dims[0], H = dims[1], fr = fps(), N = Math.ceil(totalSec * fr), bitrate = (W * H >= 1920 * 1080 ? 10e6 : 5e6) * (fr === 24 ? 0.85 : 1);
      say('Checking encoder support…'); var vsel = await pickVideoConfig(W, H, fr, bitrate);
      if (!vsel) throw new Error('This browser has no usable H.264 or VP9 video encoder for ' + W + '×' + H + '. Try 720p, or use the latest Chrome or Edge.');
      say('Mixing audio…'); progress(1); var mixed = await mixAudio(totalSec, warnings), asel = null;
      if (mixed) { asel = await pickAudioConfig(); if (!asel) throw new Error('This browser cannot encode AAC or Opus audio, so the audio cannot be included. Use Chrome or Edge, or mute/remove the audio.'); }
      var vSamples = [], aSamples = [], vDesc = null, aDesc = null, encErr = null;
      venc = new VideoEncoder({ output: function (chunk, meta) { var d = new Uint8Array(chunk.byteLength); chunk.copyTo(d); vSamples.push({ d: d, key: chunk.type === 'key', ts: chunk.timestamp }); if (!vDesc && meta && meta.decoderConfig && meta.decoderConfig.description) vDesc = toU8(meta.decoderConfig.description); }, error: function (e) { encErr = e; } });
      venc.configure(vsel.cfg);
      if (asel) { aenc = new AudioEncoder({ output: function (chunk, meta) { var d = new Uint8Array(chunk.byteLength); chunk.copyTo(d); aSamples.push({ d: d, dur: Math.max(1, Math.round((chunk.duration || 21333) * 48000 / 1e6)) }); if (!aDesc && meta && meta.decoderConfig && meta.decoderConfig.description) aDesc = toU8(meta.decoderConfig.description); }, error: function (e) { encErr = e; } }); aenc.configure(asel.cfg); }
      var canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H; var ctx = canvas.getContext('2d');
      clips.forEach(function (c) { if (c.type === 'video') { c.el.pause(); c.el.muted = true; } });
      var t0 = performance.now();
      for (var i = 0; i < N; i++) {
        if (cancelExport) throw new Error('__cancelled__'); if (encErr) throw encErr;
        var layers = layersAt(i / fr);
        for (var k = 0; k < layers.length; k++) if (layers[k].clip.type === 'video') await seekVideo(layers[k].clip.el, layers[k].srcTime);
        paint(ctx, W, H, layers);
        var frame = new VideoFrame(canvas, { timestamp: Math.round(i * 1e6 / fr), duration: Math.round(1e6 / fr) });
        while (venc.encodeQueueSize > 8) await sleep(4);
        venc.encode(frame, { keyFrame: i % (fr * 2) === 0 }); frame.close();
        if (i % 4 === 0) { var done = i / N, eta = done > 0.02 ? ((performance.now() - t0) / done) * (1 - done) / 1000 : 0; progress(2 + done * 86); say('Rendering frame ' + (i + 1) + ' of ' + N + (eta ? ' · about ' + Math.ceil(eta) + ' s left' : '') + '…'); await sleep(0); }
      }
      await venc.flush(); if (encErr) throw encErr;
      if (asel) {
        say('Encoding audio…'); progress(90);
        var L = mixed.getChannelData(0), R = mixed.numberOfChannels > 1 ? mixed.getChannelData(1) : L, B = 4096;
        for (var pos = 0; pos < L.length; pos += B) {
          if (cancelExport) throw new Error('__cancelled__');
          var n = Math.min(B, L.length - pos), data = new Float32Array(n * 2); data.set(L.subarray(pos, pos + n), 0); data.set(R.subarray(pos, pos + n), n);
          var ad = new AudioData({ format: 'f32-planar', sampleRate: 48000, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round(pos * 1e6 / 48000), data: data });
          while (aenc.encodeQueueSize > 16) await sleep(4); aenc.encode(ad); ad.close();
        }
        await aenc.flush(); if (encErr) throw encErr;
      }
      if (!vSamples.length) throw new Error('The encoder produced no video frames.');
      for (var q = 1; q < vSamples.length; q++) if (vSamples[q].ts < vSamples[q - 1].ts) throw new Error('This encoder reordered frames, which the exporter does not support. Try 720p or another browser.');
      if (vsel.family === 'avc1' && !vDesc) throw new Error('The H.264 encoder did not provide its configuration, so a valid MP4 cannot be written.');
      say('Writing MP4 file…'); progress(96);
      var mux = new EPMp4.Muxer(); mux.addVideoTrack({ codec: vsel.family, width: W, height: H, fps: fr, description: vDesc, codecString: vsel.cfg.codec });
      if (asel && aSamples.length) mux.addAudioTrack({ codec: asel.family, channels: 2, sampleRate: 48000, description: aDesc });
      var vTick = Math.round(90000 / fr); vSamples.forEach(function (s) { mux.addVideoSample(s.d, s.key, vTick); }); if (asel && aSamples.length) aSamples.forEach(function (s) { mux.addAudioSample(s.d, s.dur); });
      var blob = mux.finalize(); if (!blob || blob.size < 1000) throw new Error('The exported file is empty.');
      var verified = '';
      try { var vurl = URL.createObjectURL(blob), probe = document.createElement('video'); probe.preload = 'metadata'; probe.muted = true; probe.src = vurl; await once(probe, 'loadedmetadata', 'error', 8000); verified = Math.abs(probe.duration - totalSec) < 1 ? ' Verified: file opens and lasts ' + probe.duration.toFixed(1) + ' s.' : ' Note: file length is ' + probe.duration.toFixed(1) + ' s (timeline ' + totalSec.toFixed(1) + ' s).'; URL.revokeObjectURL(vurl); }
      catch (e) { verified = ' This browser could not play the file back to verify it; test it in your video player.'; }
      if (lastExportUrl) URL.revokeObjectURL(lastExportUrl); lastExportUrl = URL.createObjectURL(blob);
      var name = 'editprompt-video-' + (Number($('tlRes').value) === 1080 ? '1080p' : '720p') + '.mp4', link = $('tlDownload'); link.href = lastExportUrl; link.download = name; link.hidden = false; download(blob, name); progress(100);
      var codecs = (vsel.family === 'avc1' ? 'H.264' : 'VP9') + (asel ? ' + ' + (asel.family === 'mp4a' ? 'AAC' : 'Opus') : ' (no audio track)'), notes = [];
      if (vsel.family === 'vp09') notes.push('This browser has no H.264 encoder, so the video is VP9; it plays in Chrome, Edge, Firefox and VLC but not in QuickTime or on many TVs.');
      if (asel && asel.family === 'Opus') notes.push('This browser has no AAC encoder, so the audio is Opus; it plays in Chrome, Edge, Firefox and VLC, but QuickTime or some phones may play the video without sound.');
      say('MP4 exported: ' + W + '×' + H + ' · ' + fr + ' fps · ' + codecs + ' · ' + (blob.size / 1048576).toFixed(1) + ' MB.' + verified + (notes.length ? ' Note: ' + notes.join(' ') : '') + (warnings.length ? ' ' + warnings.join(' ') : ''), warnings.length || notes.length ? 'warn' : 'ok');
    } catch (e) {
      if (e && e.message === '__cancelled__') { progress(null); say('Export cancelled.'); } else fail('MP4 export failed: ' + ((e && e.message) || e));
    } finally {
      try { if (venc && venc.state !== 'closed') venc.close(); } catch (e) { /* ignore */ } try { if (aenc && aenc.state !== 'closed') aenc.close(); } catch (e) { /* ignore */ }
      setExportUi(false); seek(playhead);
    }
  }
  $('tlExportMp4').addEventListener('click', exportMp4); $('tlCancel').addEventListener('click', function () { cancelExport = true; say('Cancelling…'); });

  // Read-only snapshot used by automated tests / debugging.
  window.EPTimeline = { snapshot: function () { return { playhead: playhead, playing: playing, total: total(), assets: assets.length, clips: clips.map(function (c) { return { id: c.id, name: (assetOf(c) || {}).name || c.type, type: c.type, track: c.track, start: c.start, trimIn: c.trimIn, trimOut: c.trimOut, len: len(c), volume: c.volume, mediaTime: c.el && c.el.currentTime, paused: c.el && c.el.paused }; }) }; } };
  sizePreview(); renderAll();
})();
