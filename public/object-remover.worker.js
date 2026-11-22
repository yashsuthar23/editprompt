/* EditPrompt Object Remover worker.
 * Engine 1: OpenCV (Telea inpainting) fetched from a CDN with a hard timeout.
 * Engine 2: built-in JavaScript inpainting that needs no download and works offline.
 * Everything runs off the UI thread so Creator Studio never freezes.
 */
const OPENCV_SOURCES = [
  'https://cdn.jsdelivr.net/npm/@techstark/opencv-js@4.10.0-release.1/dist/opencv.js',
  'https://docs.opencv.org/4.10.0/opencv.js'
];
let cvPromise = null;
let cvFailed = false;

async function fetchScriptUrl(url, ms) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctl.signal });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return URL.createObjectURL(await res.blob());
  } finally {
    clearTimeout(timer);
  }
}

async function loadOpenCV() {
  let lastError;
  for (const src of OPENCV_SOURCES) {
    try {
      const blobUrl = await fetchScriptUrl(src, 15000);
      self.Module = self.Module || {};
      importScripts(blobUrl);
      let cv = self.cv;
      if (cv && typeof cv.then === 'function') cv = await cv;
      const started = Date.now();
      while (!cv || typeof cv.Mat !== 'function' || typeof cv.inpaint !== 'function') {
        if (Date.now() - started > 20000) throw new Error('OpenCV initialization timed out.');
        await new Promise(r => setTimeout(r, 100));
        cv = self.cv;
        if (cv && typeof cv.then === 'function') cv = await cv;
      }
      return cv;
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError || new Error('OpenCV could not be loaded.');
}

function getOpenCV() {
  if (cvFailed) return Promise.reject(new Error('OpenCV unavailable'));
  if (!cvPromise) cvPromise = loadOpenCV().catch(e => { cvFailed = true; throw e; });
  return cvPromise;
}

/* Built-in inpainting: fills the masked area from the outside in ("onion peel"),
 * each pixel taking a distance-weighted average of nearby known pixels. */
function jsInpaint(rgba, maskRgba, w, h) {
  const out = new Uint8ClampedArray(rgba);
  const unknown = new Uint8Array(w * h);
  let remaining = 0;
  for (let p = 0; p < w * h; p++) {
    if (maskRgba[p * 4] > 10 || maskRgba[p * 4 + 1] > 10 || maskRgba[p * 4 + 2] > 10) { unknown[p] = 1; remaining++; }
  }
  // grow the mask by 1px so brush edges do not leave a halo
  const grown = unknown.slice();
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = y * w + x;
    if (unknown[p]) continue;
    if ((x > 0 && unknown[p - 1]) || (x < w - 1 && unknown[p + 1]) || (y > 0 && unknown[p - w]) || (y < h - 1 && unknown[p + w])) { grown[p] = 1; remaining++; }
  }
  unknown.set(grown);
  const R = 6;
  let guard = 0;
  while (remaining > 0 && guard++ < 4000) {
    const frontier = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const p = y * w + x;
      if (!unknown[p]) continue;
      if ((x > 0 && !unknown[p - 1]) || (x < w - 1 && !unknown[p + 1]) || (y > 0 && !unknown[p - w]) || (y < h - 1 && !unknown[p + w])) frontier.push(p);
    }
    if (!frontier.length) break;
    const vals = new Float32Array(frontier.length * 3);
    for (let k = 0; k < frontier.length; k++) {
      const p = frontier[k], px = p % w, py = (p / w) | 0;
      let sr = 0, sg = 0, sb = 0, sw = 0;
      for (let dy = -R; dy <= R; dy++) {
        const yy = py + dy; if (yy < 0 || yy >= h) continue;
        for (let dx = -R; dx <= R; dx++) {
          const xx = px + dx; if (xx < 0 || xx >= w) continue;
          const q = yy * w + xx; if (unknown[q]) continue;
          const wt = 1 / (dx * dx + dy * dy + 1);
          sr += out[q * 4] * wt; sg += out[q * 4 + 1] * wt; sb += out[q * 4 + 2] * wt; sw += wt;
        }
      }
      if (sw > 0) { vals[k * 3] = sr / sw; vals[k * 3 + 1] = sg / sw; vals[k * 3 + 2] = sb / sw; }
      else { vals[k * 3] = out[p * 4]; vals[k * 3 + 1] = out[p * 4 + 1]; vals[k * 3 + 2] = out[p * 4 + 2]; }
    }
    for (let k = 0; k < frontier.length; k++) {
      const p = frontier[k];
      out[p * 4] = vals[k * 3]; out[p * 4 + 1] = vals[k * 3 + 1]; out[p * 4 + 2] = vals[k * 3 + 2]; out[p * 4 + 3] = 255;
      unknown[p] = 0; remaining--;
    }
  }
  return out;
}

function hasMask(maskRgba, n) {
  for (let p = 0; p < n; p++) if (maskRgba[p * 4] > 10 || maskRgba[p * 4 + 1] > 10 || maskRgba[p * 4 + 2] > 10) return true;
  return false;
}

self.onmessage = async event => {
  const { id, width, height, imageBuffer, maskBuffer } = event.data;
  const say = message => self.postMessage({ id, type: 'status', message });
  let srcRgba, maskRgba, srcRgb, maskGray, dstRgb, dstRgba;
  try {
    const imgBytes = new Uint8ClampedArray(imageBuffer);
    const maskBytes = new Uint8ClampedArray(maskBuffer);
    if (!hasMask(maskBytes, width * height)) throw new Error('Paint over the unwanted object first, then click Erase painted area.');

    let cv = null;
    if (!cvFailed) {
      say('Loading the high-quality OpenCV engine (up to ~15s). Falls back to the built-in eraser if unavailable...');
      try { cv = await getOpenCV(); } catch (_) { cv = null; }
    }

    if (cv) {
      say('Erasing the painted area with OpenCV...');
      srcRgba = new cv.Mat(height, width, cv.CV_8UC4); srcRgba.data.set(new Uint8Array(imageBuffer));
      maskRgba = new cv.Mat(height, width, cv.CV_8UC4); maskRgba.data.set(new Uint8Array(maskBuffer));
      srcRgb = new cv.Mat(); maskGray = new cv.Mat(); dstRgb = new cv.Mat(); dstRgba = new cv.Mat();
      cv.cvtColor(srcRgba, srcRgb, cv.COLOR_RGBA2RGB);
      cv.cvtColor(maskRgba, maskGray, cv.COLOR_RGBA2GRAY);
      cv.threshold(maskGray, maskGray, 10, 255, cv.THRESH_BINARY);
      cv.inpaint(srcRgb, maskGray, dstRgb, 5, cv.INPAINT_TELEA);
      cv.cvtColor(dstRgb, dstRgba, cv.COLOR_RGB2RGBA);
      const output = dstRgba.data.slice().buffer;
      self.postMessage({ id, type: 'done', output, engine: 'opencv' }, [output]);
    } else {
      say('Erasing with the built-in eraser (works offline)...');
      const result = jsInpaint(imgBytes, maskBytes, width, height);
      const output = result.buffer;
      self.postMessage({ id, type: 'done', output, engine: 'builtin' }, [output]);
    }
  } catch (error) {
    self.postMessage({ id, type: 'error', message: error && error.message ? error.message : String(error) });
  } finally {
    [srcRgba, maskRgba, srcRgb, maskGray, dstRgb, dstRgba].forEach(mat => {
      if (mat && typeof mat.delete === 'function') mat.delete();
    });
  }
};
