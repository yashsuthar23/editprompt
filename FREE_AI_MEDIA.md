# Free-only AI Media Mode

This build is configured for **free-only media generation**.

- Media generation uses Pollinations only when `POLLINATIONS_API_KEY` is configured.
- Gemini/Veo are disabled for media in `FREE_ONLY_MEDIA=true` mode.
- ComfyUI/local media is disabled in free-only mode.
- If Pollinations returns an insufficient-balance/402 error, the app does **not** switch to Gemini, Veo, or ComfyUI. It reports the provider error instead.

## Environment

```env
FREE_ONLY_MEDIA=true
POLLINATIONS_API_KEY=
POLLINATIONS_BASE_URL=https://gen.pollinations.ai
POLLINATIONS_IMAGE_MODEL=flux
POLLINATIONS_VIDEO_MODEL=veo
COMFYUI_URL=
```

### Important
Pollinations image/video generation is not an unlimited free API. Video may require available Pollen/credits. The application deliberately does not add a paid fallback.

For a Windows `.exe`, the app can be packaged with the existing `npm run build:exe` workflow. Never ship a personal server-side API key inside a public `.exe`; use a backend or have each user configure their own key.
