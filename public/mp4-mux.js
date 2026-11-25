/* EditPrompt MP4 muxer — writes a real, fast-start (moov-first) MP4 from encoded samples.
 * Video: H.264 (avc1) or VP9 (vp09).  Audio: AAC (mp4a) or Opus.  No dependencies.
 * Usage: const m = new EPMp4.Muxer(); m.addVideoTrack({...}); m.addAudioTrack({...});
 *        m.addVideoSample(u8, isKey); m.addAudioSample(u8, durationSamples); const blob = m.finalize();
 */
(function (g) {
  'use strict';
  var enc = new TextEncoder();
  var u8 = function () { return Uint8Array.from(arguments); };
  var u32 = function (n) { return u8((n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255); };
  var u16 = function (n) { return u8((n >> 8) & 255, n & 255); };
  var str = function (s) { return enc.encode(s); };
  function cat() {
    var parts = Array.prototype.slice.call(arguments), len = 0, i;
    for (i = 0; i < parts.length; i++) len += parts[i].length;
    var out = new Uint8Array(len), o = 0;
    for (i = 0; i < parts.length; i++) { out.set(parts[i], o); o += parts[i].length; }
    return out;
  }
  function box(type) { var body = cat.apply(null, Array.prototype.slice.call(arguments, 1)); return cat(u32(8 + body.length), str(type), body); }
  function fbox(type, version, flags) { return box.apply(null, [type, u8(version, (flags >> 16) & 255, (flags >> 8) & 255, flags & 255)].concat(Array.prototype.slice.call(arguments, 3))); }
  var zeros = function (n) { return new Uint8Array(n); };
  var MATRIX = cat(u32(0x00010000), u32(0), u32(0), u32(0), u32(0x00010000), u32(0), u32(0), u32(0), u32(0x40000000));
  var EPOCH = Math.floor(Date.now() / 1000) + 2082844800;

  function Muxer() { this.video = null; this.audio = null; }
  Muxer.prototype.addVideoTrack = function (o) { // {codec:'avc1'|'vp09', width, height, fps, description:Uint8Array|null, codecString}
    this.video = { kind: 'vide', o: o, timescale: 90000, sizes: [], durs: [], keys: [], data: [] };
    return this;
  };
  Muxer.prototype.addAudioTrack = function (o) { // {codec:'mp4a'|'Opus', channels, sampleRate, description:Uint8Array|null}
    this.audio = { kind: 'soun', o: o, timescale: o.sampleRate, sizes: [], durs: [], keys: [], data: [] };
    return this;
  };
  Muxer.prototype.addVideoSample = function (data, isKey, durTicks) {
    var t = this.video; t.sizes.push(data.length); t.durs.push(durTicks || Math.round(t.timescale / (t.o.fps || 30))); if (isKey) t.keys.push(t.sizes.length); t.data.push(data);
  };
  Muxer.prototype.addAudioSample = function (data, durSamples) {
    var t = this.audio; t.sizes.push(data.length); t.durs.push(durSamples); t.keys.push(t.sizes.length); t.data.push(data);
  };

  function sampleEntry(t) {
    var o = t.o;
    if (t.kind === 'vide') {
      var head = cat(zeros(6), u16(1), zeros(16), u16(o.width), u16(o.height), u32(0x00480000), u32(0x00480000), zeros(4), u16(1), zeros(32), u16(0x18), u16(0xFFFF));
      if (o.codec === 'avc1') return box('avc1', head, box('avcC', o.description));
      var m = /^vp09\.(\d+)\.(\d+)\.(\d+)/.exec(o.codecString || '') || [0, '00', '40', '08'];
      var depth = parseInt(m[3], 10) || 8;
      var vpcC = fbox('vpcC', 1, 0, u8(parseInt(m[1], 10) || 0, parseInt(m[2], 10) || 40, (depth << 4) | (1 << 1), 1, 1, 1), u16(0));
      return box('vp09', head, vpcC);
    }
    var ahead = cat(zeros(6), u16(1), zeros(8), u16(o.channels), u16(16), u16(0), u16(0), u32((o.sampleRate << 16) >>> 0));
    if (o.codec === 'mp4a') {
      var asc = o.description && o.description.length ? o.description : u8(0x11, 0x90);
      var dsi = cat(u8(0x05, asc.length), asc);
      var dcd = cat(u8(0x04, 13 + dsi.length, 0x40, 0x15), zeros(3), u32(0), u32(0), dsi);
      var esd = cat(u8(0x03, 3 + dcd.length + 3, 0, 1, 0), dcd, u8(0x06, 0x01, 0x02));
      return box('mp4a', ahead, fbox('esds', 0, 0, esd));
    }
    var pre = 312;
    if (o.description && o.description.length >= 12 && String.fromCharCode.apply(null, o.description.slice(0, 8)) === 'OpusHead') pre = o.description[10] | (o.description[11] << 8);
    return box('Opus', ahead, box('dOps', u8(0, o.channels), u16(pre), u32(o.sampleRate), u16(0), u8(0)));
  }
  function runs(arr) { var out = [], i = 0; while (i < arr.length) { var j = i; while (j < arr.length && arr[j] === arr[i]) j++; out.push([j - i, arr[i]]); i = j; } return out; }
  function trackDurTicks(t) { var s = 0; for (var i = 0; i < t.durs.length; i++) s += t.durs[i]; return s; }

  function buildChunks(t) { // group samples into ~0.5s chunks so audio/video interleave in the file
    var chunks = [], i = 0, n = t.sizes.length, acc = 0, start = 0, cur = null, offsetT = 0;
    for (i = 0; i < n; i++) {
      if (!cur) { cur = { first: i, count: 0, size: 0, time: offsetT / t.timescale }; start = acc = 0; }
      cur.count++; cur.size += t.sizes[i]; acc += t.durs[i]; offsetT += t.durs[i];
      if (acc / t.timescale >= 0.5) { chunks.push(cur); cur = null; }
    }
    if (cur) chunks.push(cur);
    return chunks;
  }

  function trak(t, id, chunkOffsets) {
    var o = t.o, dur = trackDurTicks(t), movieDur = Math.round(dur * 1000 / t.timescale), isV = t.kind === 'vide';
    var chunkRuns = []; // stsc runs
    var chunks = t.chunks, i;
    for (i = 0; i < chunks.length; i++) { if (!chunkRuns.length || chunkRuns[chunkRuns.length - 1][1] !== chunks[i].count) chunkRuns.push([i + 1, chunks[i].count]); }
    var stsd = fbox('stsd', 0, 0, u32(1), sampleEntry(t));
    var stts = fbox.apply(null, ['stts', 0, 0, u32(runs(t.durs).length)].concat(runs(t.durs).map(function (r) { return cat(u32(r[0]), u32(r[1])); })));
    var stsc = fbox.apply(null, ['stsc', 0, 0, u32(chunkRuns.length)].concat(chunkRuns.map(function (r) { return cat(u32(r[0]), u32(r[1]), u32(1)); })));
    var sz = new Uint8Array(t.sizes.length * 4); var dv = new DataView(sz.buffer); for (i = 0; i < t.sizes.length; i++) dv.setUint32(i * 4, t.sizes[i]);
    var stsz = fbox('stsz', 0, 0, u32(0), u32(t.sizes.length), sz);
    var co = new Uint8Array(chunks.length * 4); var cv = new DataView(co.buffer); for (i = 0; i < chunks.length; i++) cv.setUint32(i * 4, chunkOffsets ? chunkOffsets[i] : 0);
    var stco = fbox('stco', 0, 0, u32(chunks.length), co);
    var parts = [stsd, stts, stsc, stsz, stco];
    if (isV && t.keys.length && t.keys.length < t.sizes.length) { var ks = new Uint8Array(t.keys.length * 4), kv = new DataView(ks.buffer); for (i = 0; i < t.keys.length; i++) kv.setUint32(i * 4, t.keys[i]); parts.push(fbox('stss', 0, 0, u32(t.keys.length), ks)); }
    var stbl = box.apply(null, ['stbl'].concat(parts));
    var minf = box('minf', isV ? fbox('vmhd', 0, 1, zeros(8)) : fbox('smhd', 0, 0, zeros(4)), box('dinf', fbox('dref', 0, 0, u32(1), fbox('url ', 0, 1))), stbl);
    var mdia = box('mdia', fbox('mdhd', 0, 0, u32(EPOCH), u32(EPOCH), u32(t.timescale), u32(dur), u16(0x55C4), u16(0)),
      fbox('hdlr', 0, 0, u32(0), str(isV ? 'vide' : 'soun'), zeros(12), str(isV ? 'VideoHandler' : 'SoundHandler'), u8(0)), minf);
    var tkhd = fbox('tkhd', 0, 3, u32(EPOCH), u32(EPOCH), u32(id), u32(0), u32(movieDur), zeros(8), u16(0), u16(0), u16(isV ? 0 : 0x0100), u16(0), MATRIX, u32(isV ? (o.width << 16) >>> 0 : 0), u32(isV ? (o.height << 16) >>> 0 : 0));
    return box('trak', tkhd, mdia);
  }

  Muxer.prototype.finalize = function () {
    var tracks = [this.video, this.audio].filter(Boolean);
    if (!tracks.length || !tracks[0].sizes.length) throw new Error('Nothing was encoded.');
    tracks.forEach(function (t) { t.chunks = buildChunks(t); });
    var ftyp = box('ftyp', str('isom'), u32(0x200), str('isom'), str('iso2'), str('avc1'), str('mp41'));
    var movieDur = 0; tracks.forEach(function (t) { movieDur = Math.max(movieDur, Math.round(trackDurTicks(t) * 1000 / t.timescale)); });
    function moov(offsets) {
      var mvhd = fbox('mvhd', 0, 0, u32(EPOCH), u32(EPOCH), u32(1000), u32(movieDur), u32(0x00010000), u16(0x0100), u16(0), zeros(8), MATRIX, zeros(24), u32(tracks.length + 1));
      var traks = tracks.map(function (t, i) { return trak(t, i + 1, offsets ? offsets[i] : null); });
      return box.apply(null, ['moov', mvhd].concat(traks));
    }
    var moovLen = moov(null).length, mdatStart = ftyp.length + moovLen + 8;
    // interleave chunks by time; video first on ties
    var order = []; tracks.forEach(function (t, ti) { t.chunks.forEach(function (c, ci) { order.push({ ti: ti, ci: ci, time: c.time, size: c.size }); }); });
    order.sort(function (a, b) { return a.time - b.time || a.ti - b.ti; });
    var offsets = tracks.map(function (t) { return new Array(t.chunks.length); }), pos = mdatStart, total = 0, pieces = [];
    order.forEach(function (c) {
      offsets[c.ti][c.ci] = pos; pos += c.size; total += c.size;
      var t = tracks[c.ti], ch = t.chunks[c.ci]; for (var k = 0; k < ch.count; k++) pieces.push(t.data[ch.first + k]);
    });
    if (total + 8 > 0xFFFFFFFF) throw new Error('The video is too large for this exporter (over 4 GB).');
    var moovFinal = moov(offsets);
    if (moovFinal.length !== moovLen) throw new Error('Internal MP4 layout error.');
    return new Blob([ftyp, moovFinal, cat(u32(8 + total), str('mdat'))].concat(pieces), { type: 'video/mp4' });
  };

  g.EPMp4 = { Muxer: Muxer };
  if (typeof module !== 'undefined') module.exports = g.EPMp4;
})(typeof self !== 'undefined' ? self : globalThis);
