# EditPrompt.in — V6 Launch Checklist

## Fixed in this build
- [x] Replaced prototype name+email login with real **email OTP login**: `/api/auth/request-otp` emails a 6-digit code (via SMTP, or logs to console in dev if SMTP isn't configured) and `/api/auth/verify-otp` checks it before creating the session. Codes expire in 10 minutes, are stored hashed, and are rate-limited to one request per 45 seconds per email.
- [x] Replaced `better-sqlite3` with Node's built-in `node:sqlite` — no more native compilation. This was causing `npm install` to fail on Windows with `node-gyp`/Visual Studio errors. Now `npm install` needs zero build tools on any OS. Requires **Node.js 22.5 or newer** (check with `node -v`). You'll see a one-line `ExperimentalWarning: SQLite is an experimental feature` in the console when the server starts — this is expected and harmless.
- [x] `requireAdmin` middleware was referenced but never defined — server crashed on boot. Now implemented (checks logged-in user's email against `ADMIN_EMAILS`).
- [x] `/api/webhooks/razorpay` now implemented with HMAC signature verification and auto-records `payment.captured` events as a fallback to client-side verification.
- [x] Legal/contact pages filled with placeholder business info (`support@editprompt.in`, business name "EditPrompt", Mon–Sat 10AM–7PM IST) — **replace with your real details.**
- [x] Removed `eval()` in the aspect-ratio tool on the homepage (replaced with a safe lookup map).
- [x] Verified end-to-end locally: login, session, library, admin allowlist, and webhook signature rejection all behave correctly.

## Required before public launch
- [ ] Set SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS in `.env` so OTP codes actually email out (any provider works — Gmail with an app password, Resend, SendGrid, Zoho Mail, etc.). Without SMTP set, codes only print to the server console — fine for local testing, not for real users.
- [ ] Replace the placeholder support email / business name / hours in `public/contact.html`, `privacy.html`, `refund.html` if different from the defaults above.
- [ ] Use a long random SESSION_SECRET.
- [ ] Add Razorpay live credentials only after Test Mode passes.
- [ ] Set RAZORPAY_WEBHOOK_SECRET in `.env` and point your Razorpay dashboard webhook at `https://yourdomain/api/webhooks/razorpay` (event: `payment.captured`).
- [ ] Set ADMIN_EMAILS to the owner/admin email(s).
- [ ] Replace prototype name/email session login with verified email OTP, password, or magic-link authentication.
- [ ] Deploy behind HTTPS.
- [ ] Configure secure production cookies.
- [ ] Test successful, failed, cancelled and duplicate payment scenarios.
- [ ] Test My Library entitlement and protected ZIP download.
- [ ] Back up the SQLite database, or move to a managed database before meaningful scale.
- [ ] Review Privacy, Terms and Refund wording for your actual business.
- [ ] Add real support contact information.
- [ ] Submit sitemap after the domain is live.

## Current V6
- Premium product page
- ₹399 Razorpay checkout flow
- Server-side signature verification
- Razorpay webhook endpoint starter
- SQLite purchases
- My Library
- Protected real 120-prompt ZIP
- Admin email allowlist guard
- Privacy / Terms / Refund / Contact pages
- robots.txt + sitemap.xml
