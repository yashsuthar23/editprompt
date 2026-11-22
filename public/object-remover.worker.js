/* EditPrompt Object Remover worker.
 * OpenCV loading and inpainting happen off the UI thread to avoid freezing Creator Studio.
 */
let cvPromise;

async function getOpenCV() {
  if (!cvPromise) {
    cvPromise = (async () => {
      self.Module = self.Module || {};
      self.Module.locateFile = file => new URL(file, 'https://docs.opencv.org/4.x/').href;
      importScripts('https://docs.opencv.org/4.x/opencv.js');
      let cv = self.cv;
      if (cv && typeof cv.then === 'function') cv = await cv;
      const started = Date.now();
      while (!cv || typeof cv.Mat !== 'function' || typeof cv.inpaint !== 'function') {
        if (Date.now() - started > 60000) {
          throw new Error('OpenCV initialization timed out. Try a smaller image or retry later.');
        }
        await new Promise(resolve => setTimeout(resolve, 100));
        cv = self.cv;
        if (cv && typeof cv.then === 'function') cv = await cv;
      }
      return cv;
    })();
  }
  return cvPromise;
}

self.onmessage = async event => {
  const { id, width, height, imageBuffer, maskBuffer } = event.data;
  let srcRgba, maskRgba, srcRgb, maskGray, dstRgb, dstRgba;
  try {
    self.postMessage({ id, type: 'status', message: 'Loading OpenCV in background. You can keep using this page...' });
    const cv = await getOpenCV();
    srcRgba = new cv.Mat(height, width, cv.CV_8UC4);
    srcRgba.data.set(new Uint8Array(imageBuffer));
    maskRgba = new cv.Mat(height, width, cv.CV_8UC4);
    maskRgba.data.set(new Uint8Array(maskBuffer));
    srcRgb = new cv.Mat();
    maskGray = new cv.Mat();
    dstRgb = new cv.Mat();
    dstRgba = new cv.Mat();
    cv.cvtColor(srcRgba, srcRgb, cv.COLOR_RGBA2RGB);
    cv.cvtColor(maskRgba, maskGray, cv.COLOR_RGBA2GRAY);
    cv.threshold(maskGray, maskGray, 10, 255, cv.THRESH_BINARY);
    if (cv.countNonZero(maskGray) === 0) {
      throw new Error('Paint over the unwanted object first, then click Erase painted area.');
    }
    self.postMessage({ id, type: 'status', message: 'Erasing the painted area in the background...' });
    cv.inpaint(srcRgb, maskGray, dstRgb, 5, cv.INPAINT_TELEA);
    cv.cvtColor(dstRgb, dstRgba, cv.COLOR_RGB2RGBA);
    const output = dstRgba.data.slice().buffer;
    self.postMessage({ id, type: 'done', output }, [output]);
  } catch (error) {
    self.postMessage({ id, type: 'error', message: error && error.message ? error.message : String(error) });
  } finally {
    [srcRgba, maskRgba, srcRgb, maskGray, dstRgb, dstRgba].forEach(mat => {
      if (mat && typeof mat.delete === 'function') mat.delete();
    });
  }
};
