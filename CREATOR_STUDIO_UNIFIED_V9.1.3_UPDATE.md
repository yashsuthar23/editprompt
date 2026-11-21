# Creator Studio Unified V9.1.3 update

## Changes
- Removed the AI Background Remover card and its browser-model JavaScript handlers.
- Added the existing EditPrompt Image → Video Generator at the top of the Creator Lab tools area inside Creator Studio, embedded from `/index.html#imageVideo`.
- Kept Object Eraser, Speech-to-Text, Voice Recorder/MP3, Prompt Marketplace and Video Timeline in the same Creator Studio page.
- Updated the Creator Studio descriptions and renumbered the remaining tools.

## Install
Replace `public/studio-tools.html` and `public/creator-lab-v91.js` in the project, preserving paths. The legacy `/creator-lab-v91.html` redirect remains unchanged.

The embedded generator reuses the existing Image-to-Video implementation in `public/index.html` and its existing app scripts; it is not a newly invented video backend.
