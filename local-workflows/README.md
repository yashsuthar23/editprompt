# Local ComfyUI fallback

The server uses Pollinations first. If Pollinations fails, it calls ComfyUI at `COMFYUI_URL`.

1. Install/run ComfyUI locally.
2. Export an **API-format workflow** from ComfyUI for image generation and save it as `image.json`.
3. Export an API-format workflow for video generation and save it as `video.json`.
4. In the exported workflows, put these placeholders where appropriate:
   - `{{PROMPT}}` for the positive prompt
   - `{{WIDTH}}` / `{{HEIGHT}}` for image size
   - `{{DURATION}}` and `{{FPS}}` for video workflows
   - `{{IMAGE_FILE}}` for the input image filename in image-to-video workflows
5. Set `COMFYUI_INPUT_DIR` to your ComfyUI `input` folder if image-to-video is enabled.

The exact workflow depends on which local checkpoints/nodes you install (for example, an image workflow and a Wan/LTX/other video workflow). This folder intentionally does not bundle multi-GB model weights.
