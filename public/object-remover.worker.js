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

self.onmessage = event => {
  const { id, width, height, imageBuffer, maskBuffer } = event.data;
  try {
    const img = new Uint8ClampedArray(imageBuffer), mask = new Uint8ClampedArray(maskBuffer);
    let any = false; for (let p = 0; p < width * height; p++) if (mask[p * 4] > 10 || mask[p * 4 + 1] > 10 || mask[p * 4 + 2] > 10) { any = true; break; }
    if (!any) throw new Error('Select the object first (paint over it or draw a rectangle), then click Erase.');
    self.postMessage({ id, type: 'progress', pct: 1 });
    const result = inpaint(img, mask, width, height, pct => self.postMessage({ id, type: 'progress', pct }));
    self.postMessage({ id, type: 'done', output: result.buffer, engine: 'builtin' }, [result.buffer]);
  } catch (error) {
    self.postMessage({ id, type: 'error', message: error && error.message ? error.message : String(error) });
  }
};
