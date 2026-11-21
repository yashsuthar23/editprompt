EditPrompt Creator Studio Unified Update

- Creator Studio is now the single workspace page.
- V9.1 Creator Lab tools are embedded in /studio-tools.html under More Creator Tools.
- Removed the separate V9.1 Creator Lab navigation button.
- Old /creator-lab-v91.html bookmarks redirect to /studio-tools.html#creatorLabTools.
- Preserved the V9.1.1 OpenCV RGBA-to-RGB inpainting fix.
- Renamed the Lab voice preview IDs to avoid collisions with Creator Studio's existing TTS controls.

Deploy by replacing the files in this patch, then run:
  git add public/studio-tools.html public/creator-lab-v91.html public/creator-lab-v91.js
  git commit -m "Merge V9.1 Creator Lab into Creator Studio"
  git push origin main
