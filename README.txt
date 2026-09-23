EDITPROMPT V7 - VIDEO / VEO FIX

Replace:
  server.js
  .env.example

Important:
1. Keep your existing .env. Do NOT replace it with .env.example.
2. Add your Gemini API key to the existing .env:
   GEMINI_API_KEY=YOUR_GEMINI_API_KEY
3. Make sure:
   FREE_ONLY_MEDIA=false
   GEMINI_VIDEO_ENABLED=true
   VIDEO_MODEL=veo-3.1-fast-generate-preview
   VEO_RESOLUTION=720p
4. Restart the app after editing .env.

This patch:
- Connects Gemini Veo video generation to the Media Studio router.
- Supports Text-to-Video and Image-to-Video through Veo.
- Uses Gemini first when configured, then falls back to Local ComfyUI, Hugging Face, and Pollinations.
- Keeps async Veo polling and generated MP4 saving.
- Adds the missing Gemini video configuration to .env.example.
- Improves provider diagnostics.

Veo requires an available Gemini API quota/billing setup; this patch does not bypass provider charges or quotas.
