# AI Media Studio

Adds the Prompt -> Media flow on top of the existing prompt generator.

## Flow

    Generate Prompt
        v
    Generated Prompt  [Copy] [Improve] [Favorite]
        v
    [ Generate Media ]
        v
    Select Type -> Image | Video
        v
    Generate
        v
    Media Preview
        v
    [Download]  [Animate Image]*  [Regenerate]  [Change Type]

    * Image only. Animate Image sends the generated image to Veo as the
      first frame, producing Image-to-Video -> Generated Video -> Download.

## Setup

Add to `.env`:

    GEMINI_API_KEY=your_key
    IMAGE_MODEL=gemini-2.5-flash-image
    VIDEO_MODEL=veo-3.1-fast-generate-preview
    MEDIA_TTL_HOURS=48

Veo requires a **paid** Gemini API key. Image generation works on most keys.
If a model name is not available on your key, the server automatically falls
back through a list of known image models; for video, change `VIDEO_MODEL`
(e.g. `veo-3.1-generate-preview`, `veo-3.1-lite-generate-preview`).

## API

| Method | Route                       | Notes                                    |
|--------|-----------------------------|------------------------------------------|
| POST   | `/api/media/image`          | `{prompt, ratio}` -> saved PNG           |
| POST   | `/api/media/video`          | `{prompt, ratio, duration, imageFile?}` -> `{jobId}` |
| GET    | `/api/media/video/:jobId`   | poll; `pending` \| `done` \| `failed`    |
| GET    | `/api/media/file/:name`     | serves the file; `?download=1` to attach |
| GET    | `/api/media/history`        | last 24 generations for the user         |

All media routes require login. Rate limits: 12 images / 5 min,
6 videos / 10 min per IP.

## Storage

Files are written to `./media/` and deleted after `MEDIA_TTL_HOURS`.
A `media_history` table records each generation per user.

## Notes / limits

- Veo clips are 4, 6 or 8 seconds at 24fps, 720p. The generator's longer
  duration options (15s, 30s...) are clamped to 8s for the video call;
  they still appear in the text prompt.
- Aspect ratio comes from the generator's Ratio field. Video supports only
  16:9 and 9:16, so other ratios are mapped to the nearest one.
- Video takes roughly 1-3 minutes. The client polls every 8 seconds.
- Video jobs live in memory, so a server restart loses in-flight jobs.
  Finished files on disk are unaffected.
