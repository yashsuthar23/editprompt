# EditPrompt V7 — Local Video Workflow Fix

This build fixes the local Hugging Face ZeroGPU Wan2.2 fallback that was producing the 256x256 / 4-frame test output.

## Fixed
- Local video workflow now uses the actual generated prompt instead of a hard-coded demo prompt.
- 4:5 is preserved as a real 4:5 canvas (448x560).
- Requested FPS is passed into `VHS_VideoCombine`.
- Local output is H.264 MP4 instead of GIF.
- Dynamic frame count is supported through `{{FRAME_COUNT}}`.
- Numeric workflow placeholders remain numeric when sent to Hugging Face ZeroGPU.
- Random seed is generated per job.
- Frontend correctly plays MP4 and still supports GIF outputs.
- Local CPU preview is capped at 16 generated frames by default to avoid runaway CPU jobs.

## Important limitation
A real 10-second 24-FPS clip requires 240 generated frames. The included SD1.5 + Wan2.2 CPU fallback cannot reasonably generate that many frames on the current CPU-only setup. The default local cap therefore produces a short preview at the requested FPS.

For a true 10-second result, use a compatible GPU/local video model or an available remote video provider. The workflow itself is now correctly wired for prompt, ratio, FPS and frame count.
