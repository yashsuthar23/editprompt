EditPrompt Puter.js T2V patch — changed files only

Included:
- v6/public/index.html (adds Video Provider selector and loads Puter SDK/provider)
- v6/public/app.js (routes selected Puter Text-to-Video to helper; existing Hugging Face route is retained)
- v6/public/puter-video.js (new Puter Wan 2.7 T2V adapter)

Apply:
1. Back up current v6/public/index.html and v6/public/app.js.
2. Extract this ZIP over your project root (paths begin with v6/).
3. Restart EditPrompt and hard-refresh the browser.

Limitations:
- Puter generation may require Puter sign-in/usage approval and may consume credits; it is not guaranteed unlimited/free.
- Puter is wired for Text-to-Video only. Image-to-Video remains on Hugging Face.
- Code integration is not a live generation test.
