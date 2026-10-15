# EditPrompt V8 — Complete Upgrade Plan (₹0 / Free-only)

## Scope and rules
- Keep the current Express + SQLite + vanilla JS architecture.
- Preserve existing login/OTP, prompt generator/improver, prompt history/versions/favorites, Creator Library, public media share links, image candidate generation, image-to-video, persistent video jobs, retry/cancel, admin media monitoring, prompt packs, utilities, and desktop packaging.
- Do not add a second library/history/queue/share implementation.
- Do not enable paid providers. No provider is described as “unlimited” or guaranteed free.
- Local ComfyUI is excluded from the video plan.

## Existing functionality found in the supplied ZIP
- Backend: `server.js` (Express, SQLite, media providers, auth/admin, generation APIs).
- Frontend: `public/index.html`, `public/app.js`, `public/styles.css`, `public/v76-enhancements.js`.
- Media routes already present: `GET /api/media/providers/health`, `GET /api/media/file/:name`, `POST /api/media/share`, `DELETE /api/media/share/:token`, `GET /api/media/share/file/:token`, `GET /share/media/:token`, `POST /api/media/upload-image`, `POST /api/media/image`, `POST /api/media/video`, `GET /api/media/video-jobs`, `POST /api/media/video/:jobId/cancel`, `POST /api/media/video/:jobId/retry`, `GET /api/media/video/:jobId`, `GET /api/media/history`.
- Prompt routes already include create/improve, version save/list/restore, duplicate, search, favorites and delete.
- SQLite already has `media_history`, `media_shares`, and `video_jobs` tables.
- The current image endpoint already supports up to four candidates per request. Do not create a duplicate batch-image endpoint.

## V8 feature plan

### Phase 0 — Safety and baseline (must do first)
1. Make a clean backup of source and `editprompt.db`; keep the current ZIP unchanged.
2. The uploaded archive includes a `.env` file. Treat any credentials inside it as exposed: rotate API keys/passwords before sharing the archive or publishing the repository. Never print keys in logs or documentation.
3. Keep `.env`, SQLite DB/WAL/SHM, generated media, backups, `node_modules`, and `.exe` out of source-control/public release archives. The release package can include runtime assets only when deliberately bundled.
4. Run `node --check server.js`, existing smoke tests, and verify login, prompt generation, image generation, video queue, cancel/retry, library, share links and admin before changes.

### Phase 1 — Provider truthfulness and reliability
Files: `server.js`, `.env.example`, `public/app.js`, `public/index.html`.
- Make `/api/media/providers/health` report provider `configured`, `freeTierKnown`, `quotaKnown`, `lastErrorCategory`, and a clear note. A configured token is not proof that the provider is reachable or has remaining quota.
- Keep `FREE_ONLY_MEDIA=true` as the V8 default. In free-only mode, do not call fal.ai, Replicate, paid Gemini/Veo, or any provider whose request may incur a charge. Only call a provider when its terms/quota actually allow the request; otherwise return a clear “quota/unavailable” status.
- Add a per-provider circuit breaker with a short cooldown after 401/403/402/429/5xx/timeouts. Do not retry the same failing provider repeatedly in a single request. Retry only transient errors, with a small capped count and jitter.
- Use a shared concurrency limit for media generation. Reject excess jobs with HTTP 429 and `Retry-After`; avoid launching 4 simultaneous provider jobs by default on a free quota.
- Add request/job IDs to structured logs; redact authorization headers, API keys, prompts containing secrets, and full uploaded image data.
- Ensure frontend says “configured” rather than “free/available” until a real successful check confirms availability.

### Phase 2 — Photo Studio (no duplicate generator)
Files: `public/index.html`, `public/app.js`, `public/styles.css`, `server.js`.
- Extend the existing Media Studio with tabs/panels: Generate, Edit Image, Variations, Compare, Export.
- Reuse `POST /api/media/image` for text-to-image and its existing candidate response.
- Add `POST /api/media/edit-image` for image-to-image editing only when a configured free provider explicitly supports image input/editing. Validate image ownership/path, MIME type, 8 MB cap, prompt length, and output MIME. If no supported free provider exists, disable the action and explain why rather than faking an edit.
- Add a client-side before/after slider and local crop/resize/download tools that do not require an AI provider.
- Add aspect-ratio presets, output dimensions, seed display/reuse when supported, favorites, and “use as video starting frame” using the existing `imageFile` video input.
- Do not claim true background removal or AI upscaling unless a real supported model is configured. Offer local browser crop/resize as non-AI tools.

### Phase 3 — Video Studio
Files: `server.js`, `public/index.html`, `public/app.js`, `public/styles.css`.
- Keep existing `POST /api/media/video`, `GET /api/media/video/:jobId`, video-jobs listing, cancel and retry routes.
- Add `GET /api/media/video-jobs/:jobId` only if the current route cannot provide the required job details; otherwise reuse the existing route.
- Add job stage labels (queued, preparing, generating, downloading, saving, done, failed, cancelled), elapsed time, provider/model, failure reason and a retry action.
- Persist a provider-safe error code separately from the human message; do not save API secrets or raw upstream headers.
- Add output preview, download, copy prompt, regenerate, and use-result-as-source actions.
- Add optional clip joining only if an installed/available media tool such as FFmpeg is detected. Otherwise show “clip joining unavailable on this install”; do not silently download binaries or assume FFmpeg exists.
- No ComfyUI/local video requirement.

### Phase 4 — Creator Workspace
Files: `server.js`, `public/library.html`, `public/app.js`, `public/styles.css`, DB migration section in `server.js`.
- Extend existing Creator Library rather than create a second library. Add tags, project grouping, favorite filter, type filter, date filter and search.
- Add `projects` table and nullable `project_id` on media records through a versioned SQLite migration. Migration must be additive, idempotent, and backed up first.
- Add project CRUD routes with session ownership checks. Do not expose another user's project/media.
- Add export-manifest JSON for a project; ZIP export only when an approved ZIP library is added and file paths are strictly validated.
- Add per-user storage usage and retention settings; keep current cleanup behavior as default unless the user changes it.

### Phase 5 — Client-ready polish and security
Files: `server.js`, `public/admin.html`, `public/admin-pro.js`, `public/admin-pro-ui.js`, `public/styles.css`, `.env.example`, build docs.
- Add accessibility labels, keyboard navigation, loading/empty/error states, reduced-motion support and responsive mobile layout.
- Admin dashboard should show aggregate provider health, queue counts, failure categories, disk usage and rate-limit events; never show API key values.
- Verify all media/share/download endpoints enforce ownership or signed, expiring share tokens.
- Add CSRF protection where cookie-authenticated state-changing routes need it; set secure cookie flags for HTTPS production; rate-limit OTP/admin/login and upload routes.
- Add automated tests for auth, image route validation, video job lifecycle, share expiry/revocation, ownership checks and free-only provider selection.
- Update `V7.7_UPDATE.md` into `V8_UPDATE.md`, update install/build docs, then build a new EXE only after the source smoke tests pass.

## Exact files to change
- `server.js`: provider router/health, image-edit route, concurrency/circuit-breaker, project schema/migrations, project CRUD, security tests hooks.
- `public/index.html`: add Photo Studio panels and project controls inside the existing app layout; do not add a second Media Studio.
- `public/app.js`: wire the new panels to existing media/history/video APIs; add UI state and error handling; avoid duplicate listeners.
- `public/styles.css`: styles for panels, comparison slider, filters, job stages and mobile layout.
- `public/library.html`: extend the current Creator Library filters/project view.
- `.env.example`: safe defaults and documented provider flags; never copy real `.env` values.
- `package.json` / `package-lock.json`: change only if a new dependency is genuinely needed (e.g. ZIP export); avoid unnecessary packages.
- `V8_UPDATE.md`, `INSTALL.txt`, `BUILD_DESKTOP.md`: document new behavior and known free-tier limitations.

## API additions proposed (only these are new)
- `POST /api/media/edit-image` — optional; enabled only when a free image-edit model is genuinely configured.
- `GET /api/projects` — list current user's projects.
- `POST /api/projects` — create project.
- `PATCH /api/projects/:id` — rename/update project.
- `DELETE /api/projects/:id` — delete project metadata; require explicit confirmation and define what happens to associated media.
- `POST /api/projects/:id/media` — assign current user's media to a project.
- `GET /api/projects/:id/export-manifest` — JSON manifest of owned assets.

Do not add new routes for media history, image candidate generation, video queue, retry, cancel, sharing, prompt versions, favorites, or prompt search; those already exist.

## Verification checklist
- `node --check server.js`
- `npm install` only if dependencies changed; otherwise `npm ci` from lockfile.
- Start app and verify `/api/media/providers/health` returns no secrets.
- With `FREE_ONLY_MEDIA=true`, confirm no paid provider function is called even when paid keys exist in `.env`.
- Verify a missing/exhausted provider returns a clear error without claiming unlimited/free access.
- Verify image candidates, upload limits, image-to-video, job status, retry/cancel and GIF/MP4 previews.
- Verify history, project ownership, share expiry/revocation, admin authorization and cleanup retention.
- Verify desktop packaging with the new files and no accidental `.env`/database inclusion.

## Free-tier reality
Free API plans are limited and can change. Hugging Face documents Inference Providers as pay-as-you-go and notes included credits depend on plan; do not assume a token means free unlimited generation. Gemini's free tier applies only to specific models/features and does not imply free Veo video. For dependable ₹0 operation, the app should clearly report unavailable/exhausted free quota and preserve the user's work rather than silently switch to paid providers.
