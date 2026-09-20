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
