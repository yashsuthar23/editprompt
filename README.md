# EditPrompt.in V4 — Commerce Starter

What is included
- Node.js + Express backend
- SQLite database
- User login starter using name + email session
- AI prompt endpoint with local fallback
- Razorpay order creation
- Server-side payment signature verification
- Purchases stored in database
- My Library page
- Download entitlement check: only paid users can access owned product files
- Admin orders page
- Creator calculators retained

Run
1. Install Node.js 20+
2. Extract ZIP
3. Open terminal in folder
4. npm install
5. Copy .env.example to .env
6. Add SESSION_SECRET and test Razorpay/API credentials
7. npm start
8. Open http://localhost:3000

Before public launch
- Replace prototype login with OTP/password/magic-link authentication
- Protect /admin.html and /api/admin/orders with admin authorization
- Use HTTPS and secure cookies in production
- Add CSRF/rate limiting/input validation
- Add Razorpay webhooks for reliable asynchronous payment confirmation
- Store orders and payment status from webhook events
- Replace sample .txt downloads with real PDF/ZIP products
- Add Privacy Policy, Terms, Refund/Cancellation Policy, Contact
- Use cloud database/storage for production if scaling beyond a single server
- Configure backups


## V7.5 Creator Platform update

Added:
- Creator Library for generated images/videos and saved prompts
- Revocable public media share links with optional expiry
- Prompt version save/restore
- Expanded creator utilities (video size, frame count, social safe-area presets, caption counter, export presets, palette helper)
- Software Hub favorites, free/Windows/Web filters and comparison selection
- 30-day default local media retention
- PUBLIC_MEDIA_BASE_URL configuration for production share links

### Local share links
Local development may return a localhost URL. That URL only works on the same machine. For another device, use a temporary tunnel or set `PUBLIC_MEDIA_BASE_URL` to your hosted HTTPS origin.

### Production
Use a persistent session store, managed database/object storage, HTTPS, signed/expiring media links, and webhook-confirmed payments before public launch.
