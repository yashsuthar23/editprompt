# EditPrompt.in V5 — Integrated Selling Flow

This build merges:
- V4 Node/Express + SQLite commerce starter
- Premium Cinematic AI Prompt Pack product page
- Real 120-prompt ZIP as the protected cinematic product download
- Login/session flow
- Razorpay order creation
- Server-side payment signature verification
- Purchase database record
- My Library entitlement
- Protected download

Customer flow
Homepage -> Cinematic Product Page -> Login -> ₹399 Razorpay Checkout ->
Server Verification -> Purchase Saved -> My Library -> Download real ZIP

Run
1. Install Node.js 20+
2. Extract ZIP
3. npm install
4. Copy .env.example to .env
5. Set SESSION_SECRET
6. Add Razorpay TEST credentials
7. Optional: add AI API key
8. npm start
9. Open http://localhost:3000
10. Product page: http://localhost:3000/cinematic-pack.html

Important before launch
- Test Razorpay in Test Mode first.
- Add webhook-based payment reconciliation for production reliability.
- Replace prototype name/email login with verified OTP, password, or magic-link auth.
- Protect admin routes.
- Set secure cookies behind HTTPS.
- Add Terms, Privacy, Refund/Cancellation, Contact and support information.
