/* EditPrompt Object Eraser — AI mode (LaMa inpainting, runs 100% in your browser via ONNX Runtime Web).
 * Downloads the model once (cached in the browser Cache Storage), then erases large objects such as people,
 * signs or vehicles and re-creates sky, water, walls etc. Falls back (aiFailed) so the page can use the built-in eraser.
 * Model: Carve/LaMa-ONNX (Big-LaMa, 512x512). Place a copy at /models/lama_fp32.onnx to self-host it.
 */
'use strict';
const MODEL_URLS = ['/models/lama_fp32.onnx', 'https://huggingface.co/Carve/LaMa-ONNX/resolve/main/lama_fp32.onnx'];
const ORT_BASES = ['https://cdn.jsdelivr.net/npm/onnxruntime-web@1.17.3/dist/', 'https://unpkg.com/onnxruntime-web@1.17.3/dist/'];
const SIZE = 512;
let session = null;
const post = (id, o) => self.postMessage(Object.assign({ id }, o));

function loadOrt() {
  if (self.ort) return;
  let last;
  for (const base of ORT_BASES) {
    try { importScripts(base + 'ort.min.js'); self.ort.env.wasm.wasmPaths = base; self.ort.env.wasm.numThreads = 1; self.ort.env.wasm.proxy = false; return; }
    catch (e) { last = e; }
  }
  throw last || new Error('ONNX runtime could not be loaded');
}

async function fetchModel(id) {
  const cache = self.caches ? await self.caches.open('ep-inpaint-v1').catch(() => null) : null;
  let last;
  for (const url of MODEL_URLS) {
    try {
      if (cache) { const hit = await cache.match(url); if (hit) { post(id, { type: 'progress', pct: 54, label: 'Loading cached AI model...' }); return new Uint8Array(await hit.arrayBuffer()); } }
      const ctl = new AbortController(); let idle;
      const bump = () => { clearTimeout(idle); idle = setTimeout(() => ctl.abort(), 30000); };
      bump();
      const res = await fetch(url, { signal: ctl.signal });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const total = Number(res.headers.get('content-length')) || 208e6;
      const reader = res.body.getReader(); const chunks = []; let got = 0;
      for (;;) {
        const { done, value } = await reader.read(); if (done) break;
        chunks.push(value); got += value.length; bump();
        post(id, { type: 'progress', pct: Math.min(54, got / total * 54), label: `Downloading AI model (first time only)... ${Math.round(got / 1048576)} MB` });
      }
      clearTimeout(idle);
      if (got < 5e6) throw new Error('Model file looks incomplete');
      const out = new Uint8Array(got); let o = 0; for (const c of chunks) { out.set(c, o); o += c.length; }
      if (cache) { try { await cache.put(url, new Response(out)); } catch (e) { /* storage full: fine */ } }
      return out;
    } catch (e) { last = e; }
  }
  throw last || new Error('Model download failed');
}

function dilate(bin, w, h, iters) {
  let cur = bin;
  for (let it = 0; it < iters; it++) {
    const nxt = cur.slice();
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const p = y * w + x; if (cur[p]) continue;
      if ((x > 0 && cur[p - 1]) || (x < w - 1 && cur[p + 1]) || (y > 0 && cur[p - w]) || (y < h - 1 && cur[p + w]) ||
          (x > 0 && y > 0 && cur[p - w - 1]) || (x < w - 1 && y > 0 && cur[p - w + 1]) || (x > 0 && y < h - 1 && cur[p + w - 1]) || (x < w - 1 && y < h - 1 && cur[p + w + 1])) nxt[p] = 1;
    }
    cur = nxt;
  }
  return cur;
}
function boxBlur(src, w, h, r) {
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h), n = 2 * r + 1;
  for (let y = 0; y < h; y++) { let s = 0; for (let x = -r; x <= r; x++) s += src[y * w + Math.min(w - 1, Math.max(0, x))]; for (let x = 0; x < w; x++) { tmp[y * w + x] = s / n; s += src[y * w + Math.min(w - 1, x + r + 1)] - src[y * w + Math.max(0, x - r)]; } }
  for (let x = 0; x < w; x++) { let s = 0; for (let y = -r; y <= r; y++) s += tmp[Math.min(h - 1, Math.max(0, y)) * w + x]; for (let y = 0; y < h; y++) { out[y * w + x] = s / n; s += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x]; } }
  return out;
}

async function run(d) {
  const { id, width: W, height: H } = d;
  const fail = m => { const e = new Error(m); e.aiFailed = true; throw e; };
  if (typeof OffscreenCanvas === 'undefined') fail('this browser does not support OffscreenCanvas');
  const img = new Uint8ClampedArray(d.imageBuffer), maskRgba = new Uint8ClampedArray(d.maskBuffer);
  const mask = new Uint8Array(W * H); let minx = W, miny = H, maxx = -1, maxy = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const p = y * W + x; if (maskRgba[p * 4] > 10 || maskRgba[p * 4 + 1] > 10 || maskRgba[p * 4 + 2] > 10) { mask[p] = 1; if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y; } }
  if (maxx < 0) throw new Error('Select the object first (paint over it or draw a rectangle), then click Erase.');
  post(id, { type: 'progress', pct: 1, label: 'Preparing AI engine...' });
  if (!session) {
    try { loadOrt(); } catch (e) { fail('AI runtime could not load (' + (e.message || e) + ')'); }
    let bytes; try { bytes = await fetchModel(id); } catch (e) { fail('model download failed (' + (e.message || e) + ')'); }
    post(id, { type: 'progress', pct: 56, label: 'Starting AI engine...' });
    try { session = await self.ort.InferenceSession.create(bytes, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' }); }
    catch (e) { fail('AI engine could not start (' + (e.message || e) + ')'); }
  }
  // crop a square-ish context window around the selection and resize to the model size
  const bw = maxx - minx + 1, bh = maxy - miny + 1;
  const side = Math.max(256, Math.round(Math.max(bw, bh) * 1.9) + 48);
  const cw = Math.min(W, side), ch = Math.min(H, side);
  const cx0 = Math.min(W - cw, Math.max(0, Math.round((minx + maxx) / 2 - cw / 2))), cy0 = Math.min(H - ch, Math.max(0, Math.round((miny + maxy) / 2 - ch / 2)));
  const full = new OffscreenCanvas(W, H); full.getContext('2d').putImageData(new ImageData(img, W, H), 0, 0);
  const small = new OffscreenCanvas(SIZE, SIZE), sctx = small.getContext('2d', { willReadFrequently: true });
  sctx.imageSmoothingQuality = 'high'; sctx.drawImage(full, cx0, cy0, cw, ch, 0, 0, SIZE, SIZE);
  const simg = sctx.getImageData(0, 0, SIZE, SIZE).data;
  const mfull = new OffscreenCanvas(W, H); mfull.getContext('2d').putImageData(new ImageData(maskRgba, W, H), 0, 0);
  sctx.clearRect(0, 0, SIZE, SIZE); sctx.drawImage(mfull, cx0, cy0, cw, ch, 0, 0, SIZE, SIZE);
  const mraw = sctx.getImageData(0, 0, SIZE, SIZE).data, mbin = new Uint8Array(SIZE * SIZE);
  for (let p = 0; p < SIZE * SIZE; p++) mbin[p] = mraw[p * 4 + 3] > 90 ? 1 : 0;
  const mdil = dilate(mbin, SIZE, SIZE, 3);
  const A = SIZE * SIZE, imgT = new Float32Array(3 * A), mT = new Float32Array(A);
  for (let p = 0; p < A; p++) { imgT[p] = simg[p * 4] / 255; imgT[A + p] = simg[p * 4 + 1] / 255; imgT[2 * A + p] = simg[p * 4 + 2] / 255; mT[p] = mdil[p]; }
  const names = session.inputNames, iName = names.find(n => /img|image/i.test(n)) || names[0], mName = names.find(n => /mask/i.test(n)) || names[1];
  const feeds = {}; feeds[iName] = new self.ort.Tensor('float32', imgT, [1, 3, SIZE, SIZE]); feeds[mName] = new self.ort.Tensor('float32', mT, [1, 1, SIZE, SIZE]);
  post(id, { type: 'stage', stage: 'infer', from: 58, watchMs: 300000 });
  let outT;
  try { const res = await session.run(feeds); outT = res[session.outputNames[0]]; } catch (e) { session = null; fail('AI inference failed (' + (e.message || e) + ')'); }
  const od = outT.data, dims = outT.dims || [1, 3, SIZE, SIZE], nhwc = dims.length === 4 && dims[3] === 3;
  let mx = 0; for (let i = 0; i < od.length; i += 97) if (od[i] > mx) mx = od[i];
  const sc = mx <= 1.5 ? 255 : 1, ores = new Uint8ClampedArray(A * 4);
  for (let p = 0; p < A; p++) {
    const r = nhwc ? od[p * 3] : od[p], g = nhwc ? od[p * 3 + 1] : od[A + p], b = nhwc ? od[p * 3 + 2] : od[2 * A + p];
    ores[p * 4] = r * sc; ores[p * 4 + 1] = g * sc; ores[p * 4 + 2] = b * sc; ores[p * 4 + 3] = 255;
  }
  sctx.clearRect(0, 0, SIZE, SIZE); sctx.putImageData(new ImageData(ores, SIZE, SIZE), 0, 0);
  const back = new OffscreenCanvas(cw, ch), bctx = back.getContext('2d', { willReadFrequently: true });
  bctx.imageSmoothingQuality = 'high'; bctx.drawImage(small, 0, 0, SIZE, SIZE, 0, 0, cw, ch);
  const ai = bctx.getImageData(0, 0, cw, ch).data;
  // feathered alpha at full resolution so only the selected area is replaced
  let m0 = new Uint8Array(cw * ch);
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) m0[y * cw + x] = mask[(cy0 + y) * W + cx0 + x];
  m0 = dilate(m0, cw, ch, 2);
  const mf = new Float32Array(cw * ch); for (let p = 0; p < mf.length; p++) mf[p] = m0[p];
  const alpha = boxBlur(mf, cw, ch, 2), out = new Uint8ClampedArray(img);
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
    const a = alpha[y * cw + x]; if (a <= 0.001) continue;
    const o = ((cy0 + y) * W + cx0 + x) * 4, s = (y * cw + x) * 4;
    out[o] = img[o] * (1 - a) + ai[s] * a; out[o + 1] = img[o + 1] * (1 - a) + ai[s + 1] * a; out[o + 2] = img[o + 2] * (1 - a) + ai[s + 2] * a; out[o + 3] = 255;
  }
  post(id, { type: 'progress', pct: 99, label: 'Finishing...' });
  self.postMessage({ id, type: 'done', output: out.buffer, engine: 'ai' }, [out.buffer]);
}

self.onmessage = async event => {
  try { await run(event.data); }
  catch (error) { self.postMessage({ id: event.data.id, type: 'error', message: error && error.message ? error.message : String(error), aiFailed: !!(error && error.aiFailed) }); }
};
