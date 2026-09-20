# Login + Free Media Fix

## Local login
- `COOKIE_SECURE=false` for `http://localhost:3000` session cookies.
- OTP verification keeps the session.
- `DEV_OTP=true` in development: if SMTP is missing or delivery fails, the OTP is returned in the login response and shown in the UI. This lets local testing continue without email delivery.
- For real email delivery, fill `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and `SMTP_FROM` in `.env`.

## Free media fallback
- Pollinations is still supported when `POLLINATIONS_API_KEY` is configured.
- Hugging Face Inference Providers are now supported through `HF_TOKEN`.
- Image fallback: `black-forest-labs/FLUX.1-schnell`.
- Video fallback: `Wan-AI/Wan2.1-T2V-1.3B` through the configured HF provider.
- `FREE_ONLY_MEDIA=true` prevents local/Gemini paid fallbacks.
- No automatic top-up is implemented. Hugging Face free monthly credits are limited; when unavailable/exhausted, generation returns an error rather than silently switching to a paid provider.

## Run
```powershell
npm install
npm start
```

For a local test, after requesting an OTP, the 6-digit code will appear in the OTP step if SMTP is not working.

For the packaged EXE, rebuild after installing dependencies:
```powershell
npm run build:exe
```
