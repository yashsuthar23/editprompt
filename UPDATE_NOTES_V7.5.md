# EditPrompt V7.5 update

This ZIP contains the updated source code only.

## Before replacing your current local project
Keep a backup of:
- `.env`
- `editprompt.db`
- `media/`
- any local generated files

The distribution ZIP intentionally does NOT include `.env`, `.git`, `node_modules`, database backups, or generated media.

## New V7.5 features
- Creator Library for generated images/videos and saved prompts
- Revocable media share links with optional 7-day expiry
- Public share URL support via `PUBLIC_MEDIA_BASE_URL`
- Prompt version save/restore
- Expanded Creator Tools
- Software Hub free/Windows/Web/Favorites/Compare filters
- Software comparison dialog
- 30-day default local media retention
- Package version 7.5.0

## Run
1. Copy your existing `.env` into the project root.
2. Copy your existing `editprompt.db` if you want to keep local users/history.
3. Install dependencies:
   `npm install`
4. Check:
   `node --check server.js`
5. Start:
   `npm start`

## Local sharing
A localhost share URL only works on the same computer. For another device during development, use a tunnel. For production, set:
`PUBLIC_MEDIA_BASE_URL=https://editprompt.in`

## Production still required
Before public launch, use:
- persistent session storage
- managed database
- object/cloud media storage
- HTTPS
- secure signed/expiring media links
- reliable Razorpay webhook processing
- CSRF protection
- production logging/monitoring
