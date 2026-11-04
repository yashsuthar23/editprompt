EditPrompt Puter fallback patch
- Replace public/app.js and public/index.html with these files.
- Puter SDK is loaded from https://js.puter.com/v2/.
- Existing Hugging Face image/video flow remains primary. Image-to-video uses uploaded File as input_reference.
- On HF job failure, browser tries Puter Wan 2.7 T2V.
- Puter requires user authentication/authorization on EditPrompt origin and available user credits. This is not unlimited free video.
- Tested JavaScript syntax only; live generation must be tested in browser.
