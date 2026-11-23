/* EditPrompt Object Eraser worker — built-in, offline, no downloads.
 * Patch-based inpainting: the selected area is filled from the outside in. For each pixel it searches
 * the surrounding image for the 5x5 patch that best matches the already-known neighbours and copies it,
 * which keeps textures (walls, grass, sand) instead of smearing them. Runs off the UI thread and reports real progress.
 */
'use strict';
const HW = 2; // patch half-size (5x5)

function lcg(seed) { let s = seed >>> 0; return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; }

function diffuseFill(out, unknown, W, H) {
  // Fallback used only when no usable source patches exist: onion-peel weighted average.
  const unk = unknown.slice(); let remaining = 0; for (let p = 0; p < W * H; p++) if (unk[p]) remaining++;
  const R = 6; let guard = 0;
  while (remaining > 0 && guard++ < 4000) {
    const fr = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const p = y * W + x; if (!unk[p]) continue; if ((x > 0 && !unk[p - 1]) || (x < W - 1 && !unk[p + 1]) || (y > 0 && !unk[p - W]) || (y < H - 1 && !unk[p + W])) fr.push(p); }
    if (!fr.length) break;
    const vals = new Float32Array(fr.length * 3);
    for (let k = 0; k < fr.length; k++) {
      const p = fr[k], px = p % W, py = (p / W) | 0; let r = 0, g = 0, b = 0, w = 0;
      for (let dy = -R; dy <= R; dy++) { const yy = py + dy; if (yy < 0 || yy >= H) continue; for (let dx = -R; dx <= R; dx++) { const xx = px + dx; if (xx < 0 || xx >= W) continue; const q = yy * W + xx; if (unk[q]) continue; const wt = 1 / (dx * dx + dy * dy + 1); r += out[q * 4] * wt; g += out[q * 4 + 1] * wt; b += out[q * 4 + 2] * wt; w += wt; } }
      if (w > 0) { vals[k * 3] = r / w; vals[k * 3 + 1] = g / w; vals[k * 3 + 2] = b / w; } else { vals[k * 3] = out[p * 4]; vals[k * 3 + 1] = out[p * 4 + 1]; vals[k * 3 + 2] = out[p * 4 + 2]; }
    }
    for (let k = 0; k < fr.length; k++) { const p = fr[k]; out[p * 4] = vals[k * 3]; out[p * 4 + 1] = vals[k * 3 + 1]; out[p * 4 + 2] = vals[k * 3 + 2]; out[p * 4 + 3] = 255; unk[p] = 0; remaining--; }
  }
  return out;
}

function inpaint(src, maskRgba, W, H, onProgress) {
  const N = W * H, out = new Uint8ClampedArray(src);
  let unk = new Uint8Array(N), count = 0;
  for (let p = 0; p < N; p++) if (maskRgba[p * 4] > 10 || maskRgba[p * 4 + 1] > 10 || maskRgba[p * 4 + 2] > 10) { unk[p] = 1; count++; }
  if (!count) return out;
  // grow the selection by 3px so soft brush edges and thin outlines/shadows are covered
  for (let it = 0; it < 3; it++) {
    const g = unk.slice();
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const p = y * W + x; if (unk[p]) continue; if ((x > 0 && unk[p - 1]) || (x < W - 1 && unk[p + 1]) || (y > 0 && unk[p - W]) || (y < H - 1 && unk[p + W])) { g[p] = 1; count++; } }
    unk = g;
  }
  const origUnk = unk.slice();
  let minx = W, miny = H, maxx = 0, maxy = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (unk[y * W + x]) { if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y; }
  // summed-area table of the unknown mask -> which patch centres are fully known
  const SW = W + 1, sat = new Int32Array(SW * (H + 1));
  for (let y = 0; y < H; y++) { let row = 0; for (let x = 0; x < W; x++) { row += origUnk[y * W + x]; sat[(y + 1) * SW + x + 1] = sat[y * SW + x + 1] + row; } }
  const win = (x0, y0, x1, y1) => sat[(y1 + 1) * SW + x1 + 1] - sat[y0 * SW + x1 + 1] - sat[(y1 + 1) * SW + x0] + sat[y0 * SW + x0];
  const candOK = new Uint8Array(N);
  for (let y = HW; y < H - HW; y++) for (let x = HW; x < W - HW; x++) if (win(x - HW, y - HW, x + HW, y + HW) === 0) candOK[y * W + x] = 1;
  const margin = Math.max(48, Math.round(Math.max(maxx - minx, maxy - miny) * 0.75));
  const rx0 = Math.max(0, minx - margin), ry0 = Math.max(0, miny - margin), rx1 = Math.min(W - 1, maxx + margin), ry1 = Math.min(H - 1, maxy + margin);
  let list = [];
  for (let y = ry0; y <= ry1; y++) for (let x = rx0; x <= rx1; x++) if (candOK[y * W + x]) list.push(y * W + x);
  if (list.length < 40) { list = []; for (let p = 0; p < N; p++) if (candOK[p]) list.push(p); }
  if (!list.length) return diffuseFill(out, origUnk, W, H);
  if (list.length > 6000) { const step = list.length / 6000, s = []; for (let i = 0; i < 6000; i++) s.push(list[Math.floor(i * step)]); list = s; }
  const L = list.length, known = new Uint8Array(N); for (let p = 0; p < N; p++) known[p] = unk[p] ? 0 : 1;
  const srcMap = new Int32Array(N).fill(-1), rnd = lcg(20240611);
  const K = count > 120000 ? 32 : count > 40000 ? 56 : 80;
  const offs = new Int32Array((2 * HW + 1) ** 2), tr = new Int32Array(offs.length), tg = new Int32Array(offs.length), tb = new Int32Array(offs.length);
  let total = count, remaining = count, sinceReport = 0;
  while (remaining > 0) {
    const fp = [], fc = [];
    for (let y = miny; y <= maxy; y++) for (let x = minx; x <= maxx; x++) {
      const p = y * W + x; if (known[p]) continue;
      const c = (x > 0 && known[p - 1] ? 1 : 0) + (x < W - 1 && known[p + 1] ? 1 : 0) + (y > 0 && known[p - W] ? 1 : 0) + (y < H - 1 && known[p + W] ? 1 : 0);
      if (c > 0) { fp.push(p); fc.push(c); }
    }
    if (!fp.length) break;
    const order = fp.map((_, i) => i).sort((a, b) => fc[b] - fc[a]);
    for (let oi = 0; oi < order.length; oi++) {
      const p = fp[order[oi]], px = p % W, py = (p / W) | 0;
      let nt = 0;
      for (let dy = -HW; dy <= HW; dy++) { const yy = py + dy; if (yy < 0 || yy >= H) continue; for (let dx = -HW; dx <= HW; dx++) { const xx = px + dx; if (xx < 0 || xx >= W) continue; const q = yy * W + xx; if (!known[q]) continue; offs[nt] = dy * W + dx; tr[nt] = out[q * 4]; tg[nt] = out[q * 4 + 1]; tb[nt] = out[q * 4 + 2]; nt++; } }
      let best = Infinity, bestC = -1;
      const tryC = c => { let s = 0; for (let t = 0; t < nt; t++) { const ci = (c + offs[t]) * 4, dr = out[ci] - tr[t], dg = out[ci + 1] - tg[t], db = out[ci + 2] - tb[t]; s += dr * dr + dg * dg + db * db; if (s >= best) return; } best = s; bestC = c; };
      // coherence: continue the source offset of already-filled neighbours
      for (let n = 0; n < 4; n++) {
        const qx = px + (n === 0 ? -1 : n === 1 ? 1 : 0), qy = py + (n === 2 ? -1 : n === 3 ? 1 : 0);
        if (qx < 0 || qx >= W || qy < 0 || qy >= H) continue;
        const sq = srcMap[qy * W + qx]; if (sq < 0) continue;
        const cx = (sq % W) + (px - qx), cy = ((sq / W) | 0) + (py - qy);
        if (cx < 0 || cx >= W || cy < 0 || cy >= H) continue;
        const c = cy * W + cx; if (candOK[c]) tryC(c);
      }
      for (let k = 0; k < K; k++) tryC(list[(rnd() * L) | 0]);
      if (bestC >= 0) { out[p * 4] = out[bestC * 4]; out[p * 4 + 1] = out[bestC * 4 + 1]; out[p * 4 + 2] = out[bestC * 4 + 2]; srcMap[p] = bestC; }
      else if (nt) { let r = 0, g = 0, b = 0; for (let t = 0; t < nt; t++) { r += tr[t]; g += tg[t]; b += tb[t]; } out[p * 4] = r / nt; out[p * 4 + 1] = g / nt; out[p * 4 + 2] = b / nt; }
      out[p * 4 + 3] = 255; known[p] = 1; remaining--;
      if (++sinceReport >= 1200) { sinceReport = 0; onProgress(Math.min(96, Math.round(100 * (total - remaining) / total))); }
    }
  }
  // light smoothing on the filled pixels only, to hide patch seams
  const ref = new Uint8ClampedArray(out);
  for (let y = Math.max(1, miny); y <= Math.min(H - 2, maxy); y++) for (let x = Math.max(1, minx); x <= Math.min(W - 2, maxx); x++) {
    const p = y * W + x; if (!origUnk[p]) continue;
    for (let ch = 0; ch < 3; ch++) {
      let s = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += ref[((y + dy) * W + x + dx) * 4 + ch];
      out[p * 4 + ch] = ref[p * 4 + ch] * 0.6 + (s / 9) * 0.4;
    }
  }
  return out;
}


/* ---------- Large selections: solve at low resolution, upscale, add matching grain ----------
 * The patch search is great for small objects but copies visible streaks when the hole is big.
 * For big holes we fill a small version of the picture (where the hole is only ~80px), upscale that
 * fill, feather it into the original and add film grain that matches the surroundings. */
const LARGE_PX = 96;      // hole bigger than this (px, either side) uses the low-res path
const LOWRES_MODE = 'smooth'; // 'smooth' avoids streaks/blotches on big holes; 'patch' kept for experiments

function dilateBin(bin, w, h, iters) {
  let cur = bin;
  for (let it = 0; it < iters; it++) {
    const nxt = cur.slice();
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const p = y * w + x; if (cur[p]) continue;
      if ((x > 0 && cur[p - 1]) || (x < w - 1 && cur[p + 1]) || (y > 0 && cur[p - w]) || (y < h - 1 && cur[p + w])) nxt[p] = 1;
    }
    cur = nxt;
  }
  return cur;
}
function boxBlurF(src, w, h, r) {
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h), n = 2 * r + 1;
  for (let y = 0; y < h; y++) { let s = 0; for (let x = -r; x <= r; x++) s += src[y * w + Math.min(w - 1, Math.max(0, x))]; for (let x = 0; x < w; x++) { tmp[y * w + x] = s / n; s += src[y * w + Math.min(w - 1, x + r + 1)] - src[y * w + Math.max(0, x - r)]; } }
  for (let x = 0; x < w; x++) { let s = 0; for (let y = -r; y <= r; y++) s += tmp[Math.min(h - 1, Math.max(0, y)) * w + x]; for (let y = 0; y < h; y++) { out[y * w + x] = s / n; s += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x]; } }
  return out;
}
function areaDown(src, w, h, nw, nh, ch) {
  const out = new Float32Array(nw * nh * ch);
  for (let dy = 0; dy < nh; dy++) {
    const y0 = Math.floor(dy * h / nh), y1 = Math.max(y0 + 1, Math.floor((dy + 1) * h / nh));
    for (let dx = 0; dx < nw; dx++) {
      const x0 = Math.floor(dx * w / nw), x1 = Math.max(x0 + 1, Math.floor((dx + 1) * w / nw));
      for (let c = 0; c < ch; c++) { let s = 0, n = 0; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { s += src[(y * w + x) * ch + c]; n++; } out[(dy * nw + dx) * ch + c] = s / n; }
    }
  }
  return out;
}
function bilinearUp(src, w, h, nw, nh) {
  const out = new Float32Array(nw * nh * 3);
  for (let y = 0; y < nh; y++) {
    const fy = Math.min(h - 1, Math.max(0, (y + 0.5) * h / nh - 0.5)), y0 = Math.floor(fy), y1 = Math.min(h - 1, y0 + 1), ty = fy - y0;
    for (let x = 0; x < nw; x++) {
      const fx = Math.min(w - 1, Math.max(0, (x + 0.5) * w / nw - 0.5)), x0 = Math.floor(fx), x1 = Math.min(w - 1, x0 + 1), tx = fx - x0;
      for (let c = 0; c < 3; c++) {
        const a = src[(y0 * w + x0) * 4 + c], b = src[(y0 * w + x1) * 4 + c], d = src[(y1 * w + x0) * 4 + c], e = src[(y1 * w + x1) * 4 + c];
        out[(y * nw + x) * 3 + c] = (a * (1 - tx) + b * tx) * (1 - ty) + (d * (1 - tx) + e * tx) * ty;
      }
    }
  }
  return out;
}

function inpaintAuto(src, maskRgba, W, H, onProgress) {
  const mask = new Uint8Array(W * H); let minx = W, miny = H, maxx = -1, maxy = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const p = y * W + x; if (maskRgba[p * 4] > 10 || maskRgba[p * 4 + 1] > 10 || maskRgba[p * 4 + 2] > 10) { mask[p] = 1; if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y; } }
  if (maxx < 0) return new Uint8ClampedArray(src);
  const bw = maxx - minx + 1, bh = maxy - miny + 1, big = Math.max(bw, bh);
  if (big <= LARGE_PX) return inpaint(src, maskRgba, W, H, onProgress);

  const side = Math.round(big * 1.8) + 64, cw = Math.min(W, side), ch = Math.min(H, side);
  const cx0 = Math.min(W - cw, Math.max(0, Math.round((minx + maxx) / 2 - cw / 2))), cy0 = Math.min(H - ch, Math.max(0, Math.round((miny + maxy) / 2 - ch / 2)));
  const s = Math.max(1 / 10, 80 / big), lw = Math.max(24, Math.round(cw * s)), lh = Math.max(24, Math.round(ch * s));
  const crop = new Float32Array(cw * ch * 4), cm = new Float32Array(cw * ch);
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) { const o = ((cy0 + y) * W + cx0 + x), i = (y * cw + x) * 4; crop[i] = src[o * 4]; crop[i + 1] = src[o * 4 + 1]; crop[i + 2] = src[o * 4 + 2]; crop[i + 3] = 255; cm[y * cw + x] = mask[o]; }
  const lowF = areaDown(crop, cw, ch, lw, lh, 4), lowMF = areaDown(cm, cw, ch, lw, lh, 1);
  const lowImg = new Uint8ClampedArray(lw * lh * 4), lowMask = new Uint8ClampedArray(lw * lh * 4);
  for (let p = 0; p < lw * lh; p++) { lowImg[p * 4] = lowF[p * 4]; lowImg[p * 4 + 1] = lowF[p * 4 + 1]; lowImg[p * 4 + 2] = lowF[p * 4 + 2]; lowImg[p * 4 + 3] = 255; if (lowMF[p] > 0.2) { lowMask[p * 4] = lowMask[p * 4 + 1] = lowMask[p * 4 + 2] = 255; lowMask[p * 4 + 3] = 255; } }
  let lowOut;
  if (LOWRES_MODE === 'smooth') { onProgress(40); const unk = new Uint8Array(lw * lh); for (let p = 0; p < lw * lh; p++) unk[p] = lowMask[p * 4] ? 1 : 0; lowOut = diffuseFill(new Uint8ClampedArray(lowImg), dilateBin(unk, lw, lh, 1), lw, lh); }
  else lowOut = inpaint(lowImg, lowMask, lw, lh, p => onProgress(Math.round(p * 0.9)));
  const fill = bilinearUp(lowOut, lw, lh, cw, ch);

  // film grain that matches the area around the selection
  let m0 = new Uint8Array(cw * ch); for (let p = 0; p < m0.length; p++) m0[p] = cm[p] > 0 ? 1 : 0;
  const mDil = dilateBin(m0, cw, ch, 6); let sum = 0, cnt = 0;
  const lum = i => 0.299 * src[i] + 0.587 * src[i + 1] + 0.114 * src[i + 2];
  for (let y = 2; y < ch - 2; y += 2) for (let x = 2; x < cw - 2; x += 2) {
    if (mDil[y * cw + x]) continue; const o = ((cy0 + y) * W + cx0 + x) * 4; let m = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) m += lum(((cy0 + y + dy) * W + cx0 + x + dx) * 4);
    const r = lum(o) - m / 9; sum += r * r; cnt++;
  }
  const sigma = Math.min(14, cnt ? Math.sqrt(sum / cnt) * 0.9 : 0);
  let seed = 7; const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-9)) * Math.cos(2 * Math.PI * rnd());

  // feathered composite
  const grow = dilateBin(m0, cw, ch, 2), mf = new Float32Array(cw * ch); for (let p = 0; p < mf.length; p++) mf[p] = grow[p];
  const alpha = boxBlurF(mf, cw, ch, 2), out = new Uint8ClampedArray(src);
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
    const a = alpha[y * cw + x]; if (a <= 0.001) continue;
    const o = ((cy0 + y) * W + cx0 + x) * 4, f = (y * cw + x) * 3, n = gauss() * sigma * a;
    out[o] = src[o] * (1 - a) + (fill[f] + n) * a; out[o + 1] = src[o + 1] * (1 - a) + (fill[f + 1] + n) * a; out[o + 2] = src[o + 2] * (1 - a) + (fill[f + 2] + n) * a; out[o + 3] = 255;
  }
  return out;
}

self.onmessage = event => {
  const { id, width, height, imageBuffer, maskBuffer } = event.data;
  try {
    const img = new Uint8ClampedArray(imageBuffer), mask = new Uint8ClampedArray(maskBuffer);
    let any = false; for (let p = 0; p < width * height; p++) if (mask[p * 4] > 10 || mask[p * 4 + 1] > 10 || mask[p * 4 + 2] > 10) { any = true; break; }
    if (!any) throw new Error('Select the object first (paint over it or draw a rectangle), then click Erase.');
    self.postMessage({ id, type: 'progress', pct: 1 });
    const result = inpaintAuto(img, mask, width, height, pct => self.postMessage({ id, type: 'progress', pct }));
    self.postMessage({ id, type: 'done', output: result.buffer, engine: 'builtin' }, [result.buffer]);
  } catch (error) {
    self.postMessage({ id, type: 'error', message: error && error.message ? error.message : String(error) });
  }
};
