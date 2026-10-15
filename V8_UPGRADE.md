# EditPrompt V8 Upgrade Notes

## Added
- Private client projects with name, notes, brand accent, and project media links.
- Project CRUD and media attach/remove APIs with ownership checks.
- Project manifest export as JSON. This manifest references existing media; it does not bundle the media bytes.
- `/api/v8/status` reports safe provider configuration status without revealing secrets.
- `/workspace.html` offers the project management UI.
- `.env.example` defaults to free-only mode and disables paid/Gemini video by default.
- Package version bumped to 8.0.0.

## Existing features preserved
The existing image generation route, video queue, retry/cancel behavior, creator library, prompt history, and media sharing routes were left in place. Project attachments reference `media_history` to avoid a second media library.

## Setup
1. Back up your existing project and `editprompt.db`.
2. Copy the V8 source files over the app source (do not overwrite your actual `.env`).
3. Review `.env.example`; set `FREE_ONLY_MEDIA=true` and `PAID_VIDEO_ENABLED=false` in your actual `.env` if you require strict free-only behavior. Keep `GEMINI_VIDEO_ENABLED=false` for consistency.
4. Keep provider keys server-side only. A provider's free tier may have quotas, queues, or model restrictions; no unlimited free generation is promised.
5. Run `npm install`, `node --check server.js`, then `npm start`.
6. Log in and open `/workspace.html`.

## Important
- Do not distribute `.env`, `editprompt.db`, database backups, personal media, `node_modules`, or existing `.exe` files in a public source archive.
- The project export currently exports metadata/manifest only, not a ZIP of the actual media.
- Validate all providers and desktop packaging on the target Windows machine before release.
