import express from "express";
import dotenv from "dotenv";
import crypto from "crypto";
import path from "path";
import fs from "fs";
import session from "express-session";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "url";
import nodemailer from "nodemailer";
import { initAdminPro } from "./admin-pro.js";
import { mountSoftwareDownloads } from "./software-dl.js";

dotenv.config();

const app = express();

let __filename;

try {
  __filename = fileURLToPath(import.meta.url);
} catch {
  __filename = process.execPath;
}

const __dirname = path.dirname(__filename);

// ============================================================
// SECURITY
// ============================================================

app.disable("x-powered-by");
app.set("trust proxy", 1);

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");

  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()",
  );

  // same-origin would cut the link to Razorpay's payment popup (bank / UPI / 3-D Secure page),
  // leaving a blank about:blank window and a payment that never reaches the site.
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin-allow-popups");

  next();
});

app.use(
  express.json({
    limit: "1mb",
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  }),
);

const isProduction = process.env.NODE_ENV === "production";
const cookieSecure = String(process.env.COOKIE_SECURE || (isProduction ? "true" : "false")).toLowerCase() === "true";

if (
  isProduction &&
  (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32)
) {
  throw new Error(
    "SESSION_SECRET must be set to a random value of at least 32 characters in production.",
  );
}

app.use((req, res, next) => {
  if (
    isProduction &&
    ["POST", "PUT", "PATCH", "DELETE"].includes(req.method) &&
    req.path.startsWith("/api/") &&
    req.path !== "/api/webhooks/razorpay"
  ) {
    const origin = req.get("origin");
    const host = `${req.protocol}://${req.get("host")}`;

    if (origin && origin !== host) {
      return res.status(403).json({
        error: "Cross-origin request blocked.",
      });
    }
  }

  next();
});

app.use(
  session({
    secret: process.env.SESSION_SECRET || "dev-secret-change-me",

    resave: false,

    saveUninitialized: false,

    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: cookieSecure,
      maxAge: 1000 * 60 * 60 * 24 * 7,
    },
  }),
);

app.use(
  express.static(path.join(__dirname, "public"), {
    maxAge: isProduction ? "1h" : 0,
  }),
);

// ============================================================
// RATE LIMIT
// ============================================================

const requestBuckets = new Map();

function rateLimit({
  windowMs = 60_000,
  max = 30,
  message = "Too many requests. Please try again shortly.",
} = {}) {
  return (req, res, next) => {
    const now = Date.now();
    const key = `${req.ip}:${req.path}`;

    const bucket = requestBuckets.get(key);

    if (!bucket || now - bucket.start >= windowMs) {
      requestBuckets.set(key, {
        start: now,
        count: 1,
      });

      return next();
    }

    bucket.count++;

    if (bucket.count > max) {
      return res.status(429).json({
        error: message,
      });
    }

    next();
  };
}

setInterval(() => {
  const cutoff = Date.now() - 10 * 60_000;

  for (const [key, bucket] of requestBuckets) {
    if (bucket.start < cutoff) {
      requestBuckets.delete(key);
    }
  }
}, 5 * 60_000).unref();

// ============================================================
// DATABASE
// ============================================================

const db = new DatabaseSync(path.join(__dirname, "editprompt.db"));

db.exec("PRAGMA journal_mode = WAL");

db.exec("PRAGMA foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS purchases(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  product_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  payment_id TEXT NOT NULL,
  amount INTEGER NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, product_id, payment_id),
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS otps(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  otp_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  consumed INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS prompt_history(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  subject TEXT NOT NULL,
  prompt TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'local-fallback',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS media_history(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  kind TEXT NOT NULL,
  prompt TEXT NOT NULL,
  file TEXT NOT NULL,
  model TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS video_jobs(
  id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
  prompt TEXT NOT NULL, provider TEXT NOT NULL DEFAULT 'auto', model TEXT NOT NULL DEFAULT '',
  aspect_ratio TEXT NOT NULL DEFAULT '16:9', duration_seconds INTEGER NOT NULL DEFAULT 8,
  fps INTEGER NOT NULL DEFAULT 24, camera_motion TEXT NOT NULL DEFAULT 'Natural',
  motion_strength TEXT NOT NULL DEFAULT 'Medium', from_image INTEGER NOT NULL DEFAULT 0,
  image_json TEXT, file TEXT, error TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS favorites(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  prompt_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id,prompt_id),
  FOREIGN KEY(user_id) REFERENCES users(id),
  FOREIGN KEY(prompt_id) REFERENCES prompt_history(id) ON DELETE CASCADE
);
`);

try {
  db.exec("ALTER TABLE otps ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0");
} catch {}

const pro = initAdminPro(db, __dirname);
app.use("/api", pro.gate);

// ============================================================
// BLOCKED EMAILS (permanent block list managed from admin panel)
// ============================================================

db.exec(`
CREATE TABLE IF NOT EXISTS blocked_emails(
  email TEXT PRIMARY KEY,
  shown_email TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`);

// Audit trail of everything the admin does (block, unblock, grant, revoke, login).
db.exec(`
CREATE TABLE IF NOT EXISTS admin_log(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT NOT NULL,
  target TEXT NOT NULL DEFAULT '',
  detail TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`);

function logAdmin(action, target = "", detail = "") {
  try {
    db.prepare(
      "INSERT INTO admin_log(action, target, detail) VALUES(?,?,?)",
    ).run(
      String(action).slice(0, 40),
      String(target || "").slice(0, 200),
      String(detail || "").slice(0, 300),
    );
  } catch (err) {
    console.error("Admin log failed:", err.message);
  }
}

// One key per real mailbox: gmail ignores dots and +tags, so a+1@gmail.com
// and a.@gmail.com cannot be used to get around a block.
function canonicalEmail(email) {
  const e = String(email || "").trim().toLowerCase();
  const at = e.lastIndexOf("@");

  if (at < 1) return e;

  let local = e.slice(0, at);
  let domain = e.slice(at + 1);

  if (domain === "googlemail.com") domain = "gmail.com";

  if (domain === "gmail.com") {
    local = local.split("+")[0].replace(/\./g, "");
  }

  return `${local}@${domain}`;
}

function isEmailBlocked(email) {
  return Boolean(
    db
      .prepare("SELECT 1 FROM blocked_emails WHERE email=?")
      .get(canonicalEmail(email)),
  );
}

const BLOCKED_MESSAGE =
  "This email has been blocked. Contact support if you think this is a mistake.";

// A user who gets blocked while logged in is signed out on their next request.
app.use("/api", (req, res, next) => {
  if (req.session && req.session.userId) {
    const u = db
      .prepare("SELECT email FROM users WHERE id=?")
      .get(req.session.userId);

    if (!u || isEmailBlocked(u.email)) {
      delete req.session.userId;
    }
  }

  next();
});

// ============================================================
// RAZORPAY KEYS
// ============================================================

// Values pasted into .env often carry stray spaces or quotes. Clean them once here.
function cleanEnv(name) {
  return String(process.env[name] || "")
    .trim()
    .replace(/^["']|["']$/g, "")
    .trim();
}

function razorpayKeys() {
  return {
    keyId: cleanEnv("RAZORPAY_KEY_ID"),
    keySecret: cleanEnv("RAZORPAY_KEY_SECRET"),
  };
}

// Which key is missing, in plain words (empty string when everything is set).
function razorpayProblem() {
  const { keyId, keySecret } = razorpayKeys();

  if (!keyId && !keySecret) return "RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are both empty";
  if (!keyId) return "RAZORPAY_KEY_ID is empty";
  if (!keySecret) return "RAZORPAY_KEY_SECRET is empty";
  if (!/^rzp_(test|live)_/.test(keyId)) return "RAZORPAY_KEY_ID should start with rzp_test_ or rzp_live_";

  return "";
}

const razorpayReady = () => !razorpayProblem();

if (!razorpayReady()) {
  console.warn(
    `Razorpay checkout is OFF: ${razorpayProblem()}. Add it to .env and restart the server.`,
  );
}

// ============================================================
// PRODUCTS
// ============================================================

const products = {
  cinematic: {
    name: "Cinematic AI Prompt Pack",
    price: 39900,
    file: "EditPrompt_Cinematic_AI_Prompt_Pack_120.zip",
  },

  wedding: {
    name: "Wedding Video Prompt Pack",
    price: 29900,
    file: "wedding-pack.txt",
  },

  ads: {
    name: "Product Ad Prompt Pack",
    price: 49900,
    file: "ads-pack.txt",
  },
};

// ============================================================
// SMTP
// ============================================================

const smtpConfigured = Boolean(
  process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS,
);

const mailer = smtpConfigured
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: Number(process.env.SMTP_PORT) === 465,

      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    })
  : null;

// ============================================================
// BUSINESS CONFIG
// ============================================================

const BUSINESS_NAME = process.env.BUSINESS_NAME || "EditPrompt";

const BUSINESS_EMAIL = process.env.SUPPORT_EMAIL || "support@editprompt.in";

const BUSINESS_GSTIN = process.env.BUSINESS_GSTIN || "";

const SITE_URL = process.env.SITE_URL || "https://editprompt.in";

// ============================================================
// HELPERS
// ============================================================

function hashOtp(otp) {
  return crypto.createHash("sha256").update(otp).digest("hex");
}

function escapeHtml(value) {
  return String(value || "").replace(
    /[&<>'"]/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#39;",
        '"': "&quot;",
      })[char],
  );
}

function email_masked(email) {
  return email;
}

// ============================================================
// EMAIL SHELL
// ============================================================

function emailShell(title, bodyHtml, { footerNote } = {}) {
  return `<!doctype html>
<html lang="en">

<head>

<meta charset="utf-8">

<meta
name="viewport"
content="width=device-width,initial-scale=1"
>

<title>${escapeHtml(title)}</title>

</head>

<body
style="
margin:0;
padding:0;
background:#0e0e0e;
font-family:Arial,Helvetica,sans-serif;
"
>

<div
style="
max-width:560px;
margin:0 auto;
padding:32px 20px;
"
>

<table
role="presentation"
width="100%"
style="
background:linear-gradient(145deg,#1b1b1b,#141414);
border:1px solid #303030;
border-radius:16px;
overflow:hidden;
"
>

<tr>

<td
style="
padding:26px 30px;
border-bottom:1px solid #303030;
"
>

<table
role="presentation"
width="100%"
>

<tr>

<td style="width:42px;">

<div
style="
width:38px;
height:38px;
border-radius:10px;
background:#e52329;
color:#fff;
font-weight:800;
font-size:14px;
text-align:center;
line-height:38px;
"
>
EP
</div>

</td>

<td style="padding-left:10px;">

<span
style="
color:#f5f2ec;
font-weight:800;
font-size:16px;
"
>
EditPrompt
</span>

<br>

<span
style="
color:#9f9990;
font-size:11px;
"
>
AI tools for video creators
</span>

</td>

</tr>

</table>

</td>

</tr>

<tr>

<td style="padding:30px;">

${bodyHtml}

</td>

</tr>

<tr>

<td
style="
padding:18px 30px;
border-top:1px solid #303030;
color:#777;
font-size:11px;
"
>

${
  footerNote ||
  `${escapeHtml(BUSINESS_NAME)} • Need help? <a href="mailto:${escapeHtml(
    BUSINESS_EMAIL,
  )}" style="color:#e9d8bb;">${escapeHtml(BUSINESS_EMAIL)}</a>`
}

</td>

</tr>

</table>

<p
style="
text-align:center;
color:#555;
font-size:11px;
margin-top:18px;
"
>
© ${new Date().getFullYear()} ${escapeHtml(
    BUSINESS_NAME,
  )}. This is an automated email.
</p>

</div>

</body>

</html>`;
}

// ============================================================
// SEND EMAIL
// ============================================================

async function sendEmail({ to, subject, text, html }) {
  if (mailer) {
    await mailer.sendMail({
      from: `"${BUSINESS_NAME}" <${
        process.env.SMTP_FROM || process.env.SMTP_USER
      }>`,
      to,
      subject,
      text,
      html,
    });
  } else {
    console.log(
      `[dev] Email to ${email_masked(to)} — "${subject}" (SMTP not configured)`,
    );
  }
}

// ============================================================
// OTP EMAIL
// ============================================================

async function sendOtpEmail(email, name, otp) {
  const subject = "Your EditPrompt.in login code";

  const text = `Hi ${name},

Your login code is: ${otp}

This code expires in 10 minutes.

If you did not request this, you can ignore this email.`;

  const html = emailShell(
    subject,
    `
<p
style="
color:#f5f2ec;
font-size:16px;
margin:0 0 10px;
"
>
Hi ${escapeHtml(name)},
</p>

<p
style="
color:#bbb;
font-size:14px;
line-height:1.6;
margin:0 0 22px;
"
>
Use the code below to log in to your EditPrompt account.
It expires in
<b style="color:#e9d8bb;">
10 minutes
</b>.
</p>

<div
style="
background:#101010;
border:1px solid #333;
border-radius:12px;
padding:20px;
text-align:center;
margin-bottom:22px;
"
>

<span
style="
font-size:32px;
letter-spacing:10px;
font-weight:800;
color:#e9d8bb;
"
>
${otp}
</span>

</div>

<p
style="
color:#777;
font-size:12px;
line-height:1.6;
"
>
If you did not request this code, you can safely ignore this email.
</p>
`,
  );

  if (mailer) {
    await sendEmail({
      to: email,
      subject,
      text,
      html,
    });
  } else {
    console.log(`[dev] OTP for ${email}: ${otp}`);
  }
}

// ============================================================
// PURCHASE EMAIL
// ============================================================

async function sendPurchaseEmail({
  email,
  name,
  product,
  amount,
  orderId,
  paymentId,
  purchaseId,
}) {
  const rupees = (amount / 100).toFixed(2);

  const subject = `Your receipt — ${product.name} (₹${rupees})`;

  const invoiceUrl = `${SITE_URL}/api/invoice/${purchaseId}`;

  const text = `Hi ${name},

Thanks for your purchase of "${product.name}" for ₹${rupees}.

Order: ${orderId}
Payment: ${paymentId}

Download:
${SITE_URL}/library.html

Invoice:
${invoiceUrl}

— ${BUSINESS_NAME}`;

  const html = emailShell(
    subject,
    `
<p
style="
color:#f5f2ec;
font-size:16px;
margin:0 0 10px;
"
>
Hi ${escapeHtml(name)},
</p>

<p
style="
color:#bbb;
font-size:14px;
line-height:1.6;
margin:0 0 20px;
"
>
Thanks for your purchase — payment verified and your product is unlocked in
<b style="color:#e9d8bb;">
My Library
</b>.
</p>

<table
role="presentation"
width="100%"
style="
background:#101010;
border:1px solid #2d2d2d;
border-radius:12px;
margin-bottom:20px;
"
>

<tr>

<td
style="
padding:16px 18px;
border-bottom:1px solid #262626;
color:#9f9990;
font-size:12px;
"
>
ITEM
</td>

<td
style="
padding:16px 18px;
border-bottom:1px solid #262626;
color:#f5f2ec;
font-size:13px;
text-align:right;
"
>
${escapeHtml(product.name)}
</td>

</tr>

<tr>

<td
style="
padding:12px 18px;
color:#9f9990;
font-size:12px;
"
>
AMOUNT PAID
</td>

<td
style="
padding:12px 18px;
color:#e9d8bb;
font-size:16px;
font-weight:800;
text-align:right;
"
>
₹${rupees}
</td>

</tr>

<tr>

<td
style="
padding:0 18px 14px;
color:#666;
font-size:11px;
"
>
Order ID
</td>

<td
style="
padding:0 18px 14px;
color:#888;
font-size:11px;
text-align:right;
"
>
${escapeHtml(orderId)}
</td>

</tr>

<tr>

<td
style="
padding:0 18px 14px;
color:#666;
font-size:11px;
"
>
Payment ID
</td>

<td
style="
padding:0 18px 14px;
color:#888;
font-size:11px;
text-align:right;
"
>
${escapeHtml(paymentId)}
</td>

</tr>

</table>

<table
role="presentation"
width="100%"
>

<tr>

<td style="padding-right:8px;">

<a
href="${SITE_URL}/library.html"
style="
display:block;
text-align:center;
background:#e52329;
color:#fff;
text-decoration:none;
font-weight:800;
font-size:13px;
border-radius:10px;
padding:13px 0;
"
>
Open My Library
</a>

</td>

<td style="padding-left:8px;">

<a
href="${invoiceUrl}"
style="
display:block;
text-align:center;
background:#1b1b1b;
border:1px solid #333;
color:#eee;
text-decoration:none;
font-weight:700;
font-size:13px;
border-radius:10px;
padding:13px 0;
"
>
View Invoice
</a>

</td>

</tr>

</table>
`,
  );

  await sendEmail({
    to: email,
    subject,
    text,
    html,
  });
}

// ============================================================
// AUTH
// ============================================================

function requireLogin(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({
      error: "Please log in first.",
    });
  }

  next();
}

// ------------------------------------------------------------
// ADMIN LOGIN (separate from the customer OTP login)
// Set ADMIN_EMAIL and ADMIN_PASSWORD_HASH (or ADMIN_PASSWORD) in .env
// ------------------------------------------------------------

const ADMIN_SESSION_MS = 12 * 60 * 60 * 1000;

function adminConfigured() {
  return Boolean(
    (process.env.ADMIN_EMAIL || "").trim() &&
      ((process.env.ADMIN_PASSWORD_HASH || "").trim() ||
        process.env.ADMIN_PASSWORD),
  );
}

function safeEqual(a, b) {
  const ha = crypto.createHash("sha256").update(String(a)).digest();
  const hb = crypto.createHash("sha256").update(String(b)).digest();

  return crypto.timingSafeEqual(ha, hb);
}

function verifyAdminPassword(password) {
  const hash = (process.env.ADMIN_PASSWORD_HASH || "").trim();

  if (hash.startsWith("scrypt:")) {
    const [, saltHex, keyHex] = hash.split(":");

    if (!saltHex || !keyHex) return false;

    const expected = Buffer.from(keyHex, "hex");

    const derived = crypto.scryptSync(
      String(password),
      Buffer.from(saltHex, "hex"),
      expected.length,
    );

    return crypto.timingSafeEqual(derived, expected);
  }

  if (process.env.ADMIN_PASSWORD) {
    return safeEqual(password, process.env.ADMIN_PASSWORD);
  }

  return false;
}

function isAdminSession(req) {
  return Boolean(
    req.session &&
      req.session.isAdmin &&
      Date.now() - Number(req.session.adminAt || 0) < ADMIN_SESSION_MS,
  );
}

function requireAdmin(req, res, next) {
  if (!isAdminSession(req)) {
    return res.status(401).json({
      error: "Admin login required.",
    });
  }

  next();
}

if (!adminConfigured()) {
  console.warn(
    "Admin login is not set up. Add ADMIN_EMAIL and ADMIN_PASSWORD (or ADMIN_PASSWORD_HASH) to .env.",
  );
}

// ============================================================
// GEMINI AI
// ============================================================

function hasUsableGeminiKey() {
  const key = process.env.GEMINI_API_KEY || "";

  return key.length > 20;
}

function getGeminiModel() {
  return process.env.AI_MODEL || "gemini-2.5-flash";
}

async function callGemini({
  systemInstruction,
  input,
  maxOutputTokens = 1500,
  temperature = 0.7,
}) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("Gemini API key is missing.");
  }

  const model = getGeminiModel();

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model,
  )}:generateContent`;

  const response = await fetch(url, {
    method: "POST",

    headers: {
      "Content-Type": "application/json",

      "x-goog-api-key": apiKey,
    },

    body: JSON.stringify({
      systemInstruction: {
        parts: [
          {
            text: systemInstruction,
          },
        ],
      },

      contents: [
        {
          role: "user",

          parts: [
            {
              text: input,
            },
          ],
        },
      ],

      generationConfig: {
        temperature,
        maxOutputTokens,
      },
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    console.error("Gemini API error:", data);

    throw new Error(data?.error?.message || "Gemini API request failed.");
  }

  const text =
    data?.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || "")
      .join("")
      .trim() || "";

  if (!text) {
    throw new Error("Gemini returned no text.");
  }

  return text;
}

// ============================================================
// AI PROMPT CLEANER
// ============================================================

// ------------------------------------------------------------
// HINGLISH / HINDI / GUJARATI INPUT DETECTION
// Users often type the Subject (and other free-text fields) in
// Devanagari, Gujarati script, or Roman-script Hinglish/Gujlish.
// Gemini is told to silently translate this into professional
// English inside the final prompt. When no Gemini key is
// configured, the local fallback cannot translate, so we flag it
// for the frontend instead of silently returning untranslated text.
// ------------------------------------------------------------
const INDIC_SCRIPT_RE = /[\u0900-\u097F\u0A80-\u0AFF]/; // Devanagari + Gujarati blocks

// Common Hinglish/Gujlish romanized words — a lightweight heuristic,
// not a full detector. False negatives are fine (Gemini still gets
// the translation instruction regardless of this check).
const ROMANIZED_HINTS_RE =
  /\b(hu|hun|chhe|che|karo|karva|karava|maru|tamara|thi|sathi|nathi|joiye|mate|banavo|dekhao|hai|kar|karo|krupya|kripya|aur|nahi|kaise|wala|wali)\b/i;

function looksLikeHinglishOrIndic(text) {
  const value = String(text || "");
  if (!value.trim()) return false;
  return INDIC_SCRIPT_RE.test(value) || ROMANIZED_HINTS_RE.test(value);
}

function cleanGeneratedPrompt(text) {
  let output = String(text || "").trim();

  // Remove markdown fences
  output = output
    .replace(/^```(?:text|markdown)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  // Remove accidental repeated words
  output = output.replace(/\b([A-Za-z][A-Za-z'-]*)(\s+\1\b)+/gi, "$1");

  // Remove repeated punctuation
  output = output
    .replace(/,{2,}/g, ",")
    .replace(/\.{3,}/g, "...")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;:])/g, "$1");

  const sections = [
    "Scene:",
    "Visual Style:",
    "Camera:",
    "Lighting:",
    "Mood:",
    "Environment:",
    "Subject Movement:",
    "Audio:",
    "Quality:",
    "Negative Prompt:",
  ];

  for (const section of sections) {
    const regex = new RegExp(`\\n?${section}\\s*`, "gi");

    output = output.replace(regex, `\n\n${section}\n`);
  }

  return output.replace(/\n{3,}/g, "\n\n").trim();
}

// ============================================================
// PROMPT HELPERS
// ============================================================

function toList(value, fallback) {
  let list;

  if (Array.isArray(value)) {
    list = value.map((item) => String(item || "").trim()).filter(Boolean);
  } else if (typeof value === "string") {
    list = value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  } else {
    list = [];
  }

  return list.length ? list : [fallback];
}

// Optional advanced fields: a clean list (max 6 items, 80 chars each) or [].
function optionalList(value, max = 6) {
  const raw = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];

  return [
    ...new Set(
      raw
        .map((item) => String(item || "").trim().slice(0, 80))
        .filter(Boolean),
    ),
  ].slice(0, max);
}

function optionalText(value, max = 300) {
  return String(value || "").trim().slice(0, max);
}

function joinNatural(list) {
  return list.join(", ");
}

// ============================================================
// LOCAL PROMPT
// ============================================================

function localPrompt({
  preset,
  targetModel,
  subject,
  style,
  ratio,
  camera,
  lighting,
  mood,
  duration,
  lens,
  fps,
  environment,
  movement,
  negative,
  shotType,
  cameraAngle,
  composition,
  focus,
  motionSpeed,
  colorGrade,
  filmLook,
  timeOfDay,
  weather,
  sound,
  character,
  extras,
}) {
  const styles = toList(style, "Cinematic");

  const cameras = toList(camera, "Slow push-in");

  const lightings = toList(lighting, "Warm cinematic");

  const moods = toList(mood, "Premium and confident");

  const durationText = duration || "8 seconds";

  const ratioText = ratio || "9:16 Vertical";

  const fpsText = fps || "24 fps";

  const lensText = lens || "35mm lens";

  const environmentText =
    environment || "Detailed realistic environment with natural depth";

  const movementText =
    movement || "Subtle natural movement with believable physics";

  const negativeText =
    negative ||
    "flicker, warping, duplicate objects, text artifacts, deformed hands, unnatural camera jumps";

  // Optional advanced settings are folded into the matching section.
  const listLine = (label, list) =>
    list && list.length ? `\n${label}: ${joinNatural(list)}.` : "";

  const textLine = (label, text) => (text ? `\n${label}: ${text}.` : "");

  const sceneBlock =
    String(subject || "").trim() +
    textLine("Character and wardrobe", character) +
    textLine("Extra details", extras);

  const styleBlock =
    joinNatural(styles) +
    listLine("Color grading", colorGrade) +
    listLine("Film look", filmLook);

  const cameraBlock =
    `${joinNatural(cameras)}, captured with a ${lensText}.` +
    listLine("Shot type", shotType) +
    listLine("Camera angle", cameraAngle) +
    listLine("Composition", composition) +
    listLine("Focus", focus) +
    listLine("Motion speed", motionSpeed);

  const environmentBlock =
    environmentText +
    listLine("Time of day", timeOfDay) +
    listLine("Weather and atmosphere", weather);

  const audioBlock =
    sound && sound.length ? `\n\nAudio:\n${joinNatural(sound)}` : "";

  return `Create a ${durationText} ${styles[0].toLowerCase()} AI video in ${ratioText} format at ${fpsText}.

Scene:
${sceneBlock}

Visual Style:
${styleBlock}

Camera:
${cameraBlock}

Lighting:
${joinNatural(lightings)}

Mood:
${joinNatural(moods)}

Environment:
${environmentBlock}

Subject Movement:
${movementText}${audioBlock}

Quality:
Photorealistic, stable identity, realistic anatomy, natural motion, detailed textures, cinematic depth of field, realistic lighting, smooth movement, temporal consistency and professional color grading.

Negative Prompt:
${negativeText}`;
}

// ============================================================
// CONFIG
// ============================================================

app.get("/api/config", (req, res) => {
  res.json({
    // Only sent when BOTH keys are present, so the site never opens a checkout that cannot work.
    razorpayKeyId: razorpayReady() ? razorpayKeys().keyId : "",


    aiEnabled: hasUsableGeminiKey(),

    aiProvider: "gemini",

    aiModel: getGeminiModel(),

    mediaEnabled: mediaEnabled(),

    mediaProvider: mediaProviderLabel(),
    mediaProviders: mediaProviderSummary(),

    imageModel: hasUsableHFToken() ? (process.env.HF_IMAGE_MODEL || "black-forest-labs/FLUX.1-schnell") : (hasUsablePollinationsKey() ? (process.env.POLLINATIONS_IMAGE_MODEL || "flux") : getImageModel()),

    videoModel: hasUsableHFToken() ? (process.env.HF_VIDEO_MODEL || "Wan-AI/Wan2.2-TI2V-5B") : (hasUsablePollinationsKey() ? (process.env.POLLINATIONS_VIDEO_MODEL || "veo") : getVideoModel()),

    loggedIn: Boolean(req.session.userId),
  });
});

// ============================================================
// OTP REQUEST
// ============================================================

app.post(
  "/api/auth/request-otp",

  rateLimit({
    windowMs: 60_000,
    max: 5,

    message: "Too many code requests. Please wait a minute.",
  }),

  async (req, res) => {
    try {
      const { name, email, customer } = req.body || {};

      // The site owner types the admin email in the normal login box:
      // instead of emailing a code, ask the popup for the admin password.
      if (
        email &&
        !customer &&
        adminConfigured() &&
        String(email).trim().toLowerCase() ===
          process.env.ADMIN_EMAIL.trim().toLowerCase()
      ) {
        return res.json({
          admin: true,
        });
      }

      if (!name || !name.trim()) {
        return res.status(400).json({
          error: "Enter your name.",
        });
      }

      if (!email || !email.includes("@")) {
        return res.status(400).json({
          error: "Enter a valid email.",
        });
      }

      const cleanEmail = email.trim().toLowerCase();

      if (isEmailBlocked(cleanEmail)) {
        return res.status(403).json({
          error: BLOCKED_MESSAGE,
        });
      }

      const recent = db
        .prepare(
          `
          SELECT created_at
          FROM otps
          WHERE email=?
          ORDER BY id DESC
          LIMIT 1
          `,
        )
        .get(cleanEmail);

      if (recent && Date.now() - recent.created_at < 45 * 1000) {
        return res.status(429).json({
          error: "Please wait a few seconds before requesting another code.",
        });
      }

      const otp = String(crypto.randomInt(100000, 1000000));

      const now = Date.now();

      db.prepare(
        `
        INSERT INTO otps
        (
          email,
          name,
          otp_hash,
          expires_at,
          created_at
        )
        VALUES(?,?,?,?,?)
        `,
      ).run(cleanEmail, name.trim(), hashOtp(otp), now + 10 * 60 * 1000, now);

      await sendOtpEmail(cleanEmail, name.trim(), otp);

      const payload = {
        sent: true,

        message: smtpConfigured
          ? "Code sent to your email."
          : "SMTP not configured — check the server console for your code.",
      };

      if (!smtpConfigured && process.env.NODE_ENV !== "production") {
        payload.devOtp = otp;
      }

      res.json(payload);
    } catch (err) {
      console.error(err);

      res.status(500).json({
        error: "Could not send login code.",
      });
    }
  },
);

// ============================================================
// OTP VERIFY
// ============================================================

app.post(
  "/api/auth/verify-otp",

  rateLimit({
    windowMs: 60_000,
    max: 12,

    message: "Too many verification attempts. Please wait a minute.",
  }),

  (req, res) => {
    try {
      const { email, otp } = req.body || {};

      if (!email || !otp) {
        return res.status(400).json({
          error: "Enter the code sent to your email.",
        });
      }

      const cleanEmail = email.trim().toLowerCase();

      if (isEmailBlocked(cleanEmail)) {
        return res.status(403).json({
          error: BLOCKED_MESSAGE,
        });
      }

      const row = db
        .prepare(
          `
          SELECT *
          FROM otps
          WHERE email=?
          AND consumed=0
          ORDER BY id DESC
          LIMIT 1
          `,
        )
        .get(cleanEmail);

      if (!row) {
        return res.status(400).json({
          error: "Request a new code first.",
        });
      }

      if (Date.now() > row.expires_at) {
        return res.status(400).json({
          error: "Code expired. Request a new one.",
        });
      }

      if (Number(row.attempts || 0) >= 5) {
        return res.status(429).json({
          error: "Too many incorrect attempts. Request a new code.",
        });
      }

      const a = Buffer.from(hashOtp(String(otp).trim()));

      const b = Buffer.from(row.otp_hash);

      if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
        db.prepare(
          `
          UPDATE otps
          SET attempts=attempts+1
          WHERE id=?
          `,
        ).run(row.id);

        return res.status(400).json({
          error: "Incorrect code.",
        });
      }

      db.prepare(
        `
        UPDATE otps
        SET consumed=1
        WHERE id=?
        `,
      ).run(row.id);

      let user = db
        .prepare(
          `
          SELECT *
          FROM users
          WHERE email=?
          `,
        )
        .get(cleanEmail);

      if (!user) {
        const info = db
          .prepare(
            `
            INSERT INTO users
            (name,email)
            VALUES(?,?)
            `,
          )
          .run(row.name, cleanEmail);

        user = db
          .prepare(
            `
            SELECT *
            FROM users
            WHERE id=?
            `,
          )
          .get(info.lastInsertRowid);
      } else if (user.name !== row.name) {
        db.prepare(
          `
          UPDATE users
          SET name=?
          WHERE id=?
          `,
        ).run(row.name, user.id);

        user = {
          ...user,
          name: row.name,
        };
      }

      req.session.userId = user.id;

      req.session.save((saveError) => {
        if (saveError) {
          console.error("Session save error:", saveError);
          return res.status(500).json({ error: "Login session could not be saved. Please try again." });
        }

        res.json({
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
          },
        });
      });
    } catch (err) {
      console.error(err);

      res.status(500).json({
        error: "Verification failed.",
      });
    }
  },
);

// ============================================================
// LOGOUT
// ============================================================

app.post("/api/auth/logout", (req, res) => {
  if (isAdminSession(req)) {
    // Only sign the customer out; keep the admin panel session.
    delete req.session.userId;

    return req.session.save(() =>
      res.json({
        ok: true,
      }),
    );
  }

  req.session.destroy(() =>
    res.json({
      ok: true,
    }),
  );
});

// ============================================================
// CURRENT USER
// ============================================================

app.get("/api/me", (req, res) => {
  if (!req.session.userId) {
    return res.json({
      user: null,
    });
  }

  const user = db
    .prepare(
      `
        SELECT
          id,
          name,
          email,
          created_at
        FROM users
        WHERE id=?
        `,
    )
    .get(req.session.userId);

  res.json({
    user,
  });
});

// ============================================================
// LIBRARY
// ============================================================

app.get("/api/library", requireLogin, (req, res) => {
  const rows = db
    .prepare(
      `
        SELECT
          purchases.id,
          purchases.product_id,
          purchases.amount,
          purchases.created_at
        FROM purchases
        WHERE user_id=?
        AND status='paid'
        ORDER BY purchases.created_at DESC
        `,
    )
    .all(req.session.userId);

  res.json({
    items: rows.map((row) => ({
      ...row,

      name: products[row.product_id]?.name || row.product_id,

      download: `/api/download/${row.product_id}`,

      invoice: `/api/invoice/${row.id}`,
    })),
  });
});

// ============================================================
// INVOICE
// ============================================================

app.get("/api/invoice/:purchaseId", (req, res, next) => {
  if (req.session.userId || isAdminSession(req)) return next();

  return res.status(401).json({
    error: "Please log in first.",
  });
}, (req, res) => {
  const purchase = db
    .prepare(
      `
        SELECT
          purchases.*,
          users.name,
          users.email
        FROM purchases
        JOIN users
          ON users.id=purchases.user_id
        WHERE purchases.id=?
        `,
    )
    .get(req.params.purchaseId);

  if (!purchase) {
    return res.status(404).send("Invoice not found.");
  }

  const isOwner =
    Boolean(req.session.userId) &&
    purchase.user_id === req.session.userId;

  const isAdmin = isAdminSession(req);

  if (!isOwner && !isAdmin) {
    return res.status(403).send("You do not have access to this invoice.");
  }

  const product = products[purchase.product_id];

  const rupees = (purchase.amount / 100).toFixed(2);

  const date = new Date(purchase.created_at).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  res.send(`
<!doctype html>

<html>

<head>

<meta charset="utf-8">

<meta
name="viewport"
content="width=device-width,initial-scale=1"
>

<title>
Invoice #${purchase.id} — ${escapeHtml(BUSINESS_NAME)}
</title>

<style>

:root{
  --ivory:#e9d8bb;
  --red:#e52329;
  --border:#303030
}

*{
  box-sizing:border-box
}

body{
  margin:0;
  background:#0e0e0e;
  color:#f5f2ec;
  font-family:Arial,Helvetica,sans-serif;
  padding:40px 16px
}

.sheet{
  max-width:680px;
  margin:0 auto;
  background:linear-gradient(145deg,#1b1b1b,#141414);
  border:1px solid var(--border);
  border-radius:18px;
  padding:40px
}

.top{
  display:flex;
  justify-content:space-between;
  align-items:flex-start;
  border-bottom:1px solid var(--border);
  padding-bottom:24px;
  margin-bottom:24px
}

.brand{
  display:flex;
  gap:10px;
  align-items:center
}

.logo{
  width:38px;
  height:38px;
  border-radius:10px;
  background:var(--red);
  display:grid;
  place-items:center;
  font-weight:800
}

.status{
  background:#123a1c;
  color:#7be79a;
  border:1px solid #1d5c30;
  border-radius:999px;
  padding:6px 12px;
  font-size:11px;
  font-weight:700;
  letter-spacing:.05em
}

h1{
  font-size:22px;
  margin:0 0 4px
}

.muted{
  color:#9f9990;
  font-size:12px
}

table{
  width:100%;
  border-collapse:collapse;
  margin:22px 0
}

td{
  padding:12px 0;
  border-bottom:1px solid #262626;
  font-size:14px
}

td.r{
  text-align:right
}

.total td{
  border-bottom:0;
  padding-top:16px;
  font-size:18px;
  font-weight:800;
  color:var(--ivory)
}

.grid{
  display:grid;
  grid-template-columns:1fr 1fr;
  gap:18px;
  margin-top:18px
}

.grid div b{
  display:block;
  font-size:11px;
  color:#9f9990;
  letter-spacing:.08em;
  margin-bottom:4px
}

.foot{
  margin-top:30px;
  padding-top:18px;
  border-top:1px solid var(--border);
  color:#777;
  font-size:11px;
  line-height:1.7
}

.printbtn{
  display:inline-block;
  margin-top:26px;
  background:var(--red);
  color:#fff;
  border:0;
  border-radius:10px;
  padding:12px 18px;
  font-weight:700;
  cursor:pointer;
  font-size:13px
}

@media print{

  .printbtn{
    display:none
  }

  body{
    background:#fff;
    color:#111
  }

  .sheet{
    border:0;
    background:#fff
  }

  td,
  .muted,
  .foot{
    color:#333
  }

}

</style>

</head>

<body>

<div class="sheet">

<div class="top">

<div class="brand">

<div class="logo">
EP
</div>

<div>

<h1>
${escapeHtml(BUSINESS_NAME)}
</h1>

<div class="muted">
Invoice / Payment Receipt
</div>

</div>

</div>

<span class="status">
PAID
</span>

</div>

<div class="grid">

<div>

<b>
BILLED TO
</b>

${escapeHtml(purchase.name)}

<br>

<span class="muted">
${escapeHtml(purchase.email)}
</span>

</div>

<div>

<b>
INVOICE
</b>

#${purchase.id}

<br>

<span class="muted">
${escapeHtml(date)}
</span>

</div>

<div>

<b>
ORDER ID
</b>

<span class="muted">
${escapeHtml(purchase.order_id)}
</span>

</div>

<div>

<b>
PAYMENT ID
</b>

<span class="muted">
${escapeHtml(purchase.payment_id)}
</span>

</div>

${
  BUSINESS_GSTIN
    ? `
<div>

<b>
GSTIN
</b>

<span class="muted">
${escapeHtml(BUSINESS_GSTIN)}
</span>

</div>
`
    : ""
}

</div>

<table>

<tr>

<td>

<b>
${escapeHtml(product?.name || purchase.product_id)}
</b>

<br>

<span class="muted">
Digital download — one-time purchase
</span>

</td>

<td class="r">
₹${rupees}
</td>

</tr>

<tr class="total">

<td>
Total Paid
</td>

<td class="r">
₹${rupees}
</td>

</tr>

</table>

<button
class="printbtn"
onclick="window.print()"
>
Print / Save as PDF
</button>

<div class="foot">

${escapeHtml(BUSINESS_NAME)}

•

${escapeHtml(BUSINESS_EMAIL)}

${BUSINESS_GSTIN ? ` • GSTIN ${escapeHtml(BUSINESS_GSTIN)}` : ""}

<br>

This is a computer-generated receipt for a digital product and does not require a signature.

</div>

</div>

</body>

</html>
`);
});

// ============================================================
// DOWNLOAD
// ============================================================

app.get("/api/download/:productId", requireLogin, (req, res) => {
  const productId = req.params.productId;

  const product = products[productId];

  if (!product) {
    return res.status(404).send("Product not found.");
  }

  const purchase = db
    .prepare(
      `
        SELECT id
        FROM purchases
        WHERE user_id=?
        AND product_id=?
        AND status='paid'
        ORDER BY id DESC
        LIMIT 1
        `,
    )
    .get(req.session.userId, productId);

  if (!purchase) {
    return res.status(403).send("You do not own this product.");
  }

  const filePath = path.join(__dirname, "downloads", product.file);

  if (!fs.existsSync(filePath)) {
    return res.status(404).send("Download file missing.");
  }

  res.download(filePath, product.file);
});

// ============================================================
// AI VIDEO PROMPT GENERATOR
// ============================================================

app.post(
  "/api/generate",

  rateLimit({
    windowMs: 60_000,
    max: 20,

    message: "Generation limit reached. Please wait a moment.",
  }),

  async (req, res) => {
    const {
      preset,
      targetModel,
      subject,
      style,
      ratio,
      camera,
      lighting,
      mood,
      duration,
      lens,
      fps,
      environment,
      movement,
      negative,
      shotType,
      cameraAngle,
      composition,
      focus,
      motionSpeed,
      colorGrade,
      filmLook,
      timeOfDay,
      weather,
      sound,
      character,
      extras,
    } = req.body || {};

    if (String(subject || "").length > 5000) {
      return res.status(400).json({
        error: "Subject description is too long.",
      });
    }

    // No subject typed? Use a random scene so a prompt is still created.
    const subjectText =
      String(subject || "").trim().length >= 3
        ? String(subject).trim()
        : mediaPromptOrDefault("");

    const inputData = {
      preset: String(preset || "custom").trim(),

      targetModel: String(targetModel || "general").trim(),

      subject: subjectText,

      style,
      ratio,
      camera,
      lighting,
      mood,
      duration,
      lens,
      fps,
      environment: String(environment || "").trim(),

      movement: String(movement || "").trim(),

      negative: String(negative || "").trim(),

      shotType: optionalList(shotType),
      cameraAngle: optionalList(cameraAngle),
      composition: optionalList(composition),
      focus: optionalList(focus),
      motionSpeed: optionalList(motionSpeed),
      colorGrade: optionalList(colorGrade),
      filmLook: optionalList(filmLook),
      timeOfDay: optionalList(timeOfDay),
      weather: optionalList(weather),
      sound: optionalList(sound),
      character: optionalText(character),
      extras: optionalText(extras),
    };

    let prompt;
    let mode;

    // ========================================================
    // GEMINI
    // ========================================================

    if (hasUsableGeminiKey()) {
      try {
        const styles = toList(style, "Cinematic");

        const cameras = toList(camera, "Slow push-in");

        const lightings = toList(lighting, "Warm cinematic");

        const moods = toList(mood, "Premium and confident");

        // Advanced settings are only sent when the user actually chose them.
        const advancedInput = [
          ["Shot Type", inputData.shotType],
          ["Camera Angle", inputData.cameraAngle],
          ["Composition", inputData.composition],
          ["Focus and Depth of Field", inputData.focus],
          ["Motion Speed", inputData.motionSpeed],
          ["Color Grading", inputData.colorGrade],
          ["Film Look", inputData.filmLook],
          ["Time of Day", inputData.timeOfDay],
          ["Weather and Atmosphere", inputData.weather],
          ["Sound and Audio", inputData.sound],
          ["Character and Wardrobe", inputData.character],
          ["Extra Details", inputData.extras],
        ]
          .filter(([, value]) =>
            Array.isArray(value) ? value.length : Boolean(value),
          )
          .map(
            ([label, value]) =>
              `${label}:\n${Array.isArray(value) ? value.join(", ") : value}`,
          )
          .join("\n\n");

        const userInput = `
Creator Preset:
${inputData.preset}

Optimize For:
${inputData.targetModel}

Subject:
${inputData.subject}

Style:
${styles.join(", ")}

Aspect Ratio:
${ratio || "9:16 Vertical"}

Camera:
${cameras.join(", ")}

Lens:
${lens || "35mm lens"}

Lighting:
${lightings.join(", ")}

Duration:
${duration || "8 seconds"}

Frame Rate:
${fps || "24 fps"}

Mood:
${moods.join(", ")}

Environment:
${environment || "Detailed realistic environment with natural depth"}

Subject Movement:
${movement || "Subtle natural movement with believable physics"}

Negative Prompt:
${
  negative ||
  "flicker, warping, duplicate objects, text artifacts, deformed hands, unnatural camera jumps"
}
${advancedInput ? `\n${advancedInput}\n` : ""}`;

        const systemInstruction = `
You are a senior cinematic AI video prompt engineer specializing in
Veo, Kling, Runway, Sora, Pika, Luma and modern text-to-video systems.

Your job is to transform the user's settings into ONE production-ready
AI video generation prompt.

IMPORTANT:

1. Preserve the user's exact subject and core idea.
2. Never replace the subject with a different concept.
3. Combine all selected styles naturally without repeating words.
4. Combine multiple camera movements into ONE believable camera sequence.
5. Make camera movement physically possible.
6. Describe realistic subject motion and environmental motion.
7. Maintain consistent identity, clothing, objects and geometry.
8. Include realistic lighting, shadows and reflections.
9. Use the selected lens to describe perspective and depth of field.
10. Respect the requested aspect ratio, duration and frame rate.
11. Add cinematic composition and professional visual detail.
12. Include temporal continuity from beginning to end.
13. Avoid random scene changes.
14. Avoid unnecessary adjectives and repeated phrases.
15. Do not invent unrelated characters, products or locations.
16. Do not add dialogue unless the user explicitly asks for it.
17. Do not add text, logos or UI elements unless explicitly requested.
18. Make the final result directly usable in an AI video generator.
19. Return ONLY the final prompt.
20. Do NOT explain your changes.
21. Do NOT use markdown code fences.
22. Do NOT repeat the same adjective or phrase unnecessarily.
23. Do NOT use contradictory camera movements.
24. Do NOT change the requested duration, ratio or FPS.
25. Keep the prompt visually detailed but practical.
26. The user's Subject or other fields may be written in Hindi
    (Devanagari), Gujarati script, or romanized Hinglish/Gujlish
    (Hindi or Gujarati typed in English letters, e.g. "shaam ma
    chai pi rahi chhe"). Silently read and fully understand this
    text and write the ENTIRE final prompt in professional English
    only. Preserve the exact meaning, setting and intent — never
    guess a different scene. Never leave any Hindi/Gujarati words
    or Hinglish/Gujlish phrases in the output.

TARGET OPTIMIZATION:

If Optimize For is a specific AI video model, adapt wording to that
model while keeping the user's scene unchanged.

If Optimize For is General, create a model-neutral professional prompt.

CREATOR PRESET:

Use the preset only as creative guidance. Never allow it to override
the user's actual subject.

CAMERA:

Describe camera position, framing, movement speed, perspective,
lens characteristics and continuity as one coherent sequence.

LIGHTING:

Describe the source, direction, softness, shadows, reflections and
color temperature.

SUBJECT MOVEMENT:

Describe the primary action, secondary environmental movement,
realistic physics, timing and continuity.

QUALITY:

Include photorealistic detail, realistic anatomy, stable identity,
coherent geometry, natural motion, cinematic depth of field,
realistic textures, professional color grading and temporal consistency.

ADVANCED SETTINGS (only when the user provided them):

Every advanced setting the user selected MUST appear in the final prompt.
- Shot Type, Camera Angle, Composition, Focus and Depth of Field and
  Motion Speed belong inside the Camera section.
- Color Grading and Film Look belong inside the Visual Style section.
- Time of Day and Weather and Atmosphere belong inside the Environment section.
- Character and Wardrobe and Extra Details belong inside the Scene section.
  Keep the character's look identical from start to end.
- Sound and Audio goes in an extra "Audio:" section placed right after
  Subject Movement. Add the Audio section ONLY when Sound and Audio is provided.
  If Sound and Audio is provided, do not add spoken dialogue.
Settings that were not provided must be left out. Do not invent them.

The final prompt MUST use exactly these sections:

Scene:
Visual Style:
Camera:
Lighting:
Mood:
Environment:
Subject Movement:
Audio: (only when Sound and Audio is provided)
Quality:
Negative Prompt:
`;

        prompt = await callGemini({
          systemInstruction,

          input: `Create the final AI video prompt from these settings:\n\n${userInput}`,

          maxOutputTokens: 1800,

          temperature: 0.65,
        });

        prompt = cleanGeneratedPrompt(prompt);

        mode = "ai-gemini";
      } catch (err) {
        console.error(
          "Gemini generate failed, using local fallback:",
          err.message,
        );

        prompt = localPrompt(inputData);

        prompt = cleanGeneratedPrompt(prompt);

        mode = "local-fallback";
      }
    } else {
      prompt = localPrompt(inputData);

      prompt = cleanGeneratedPrompt(prompt);

      mode = "local-fallback";
    }

    // ========================================================
    // HISTORY
    // ========================================================

    let historyId = null;

    if (req.session.userId) {
      const info = db
        .prepare(
          `
          INSERT INTO prompt_history
          (
            user_id,
            subject,
            prompt,
            mode
          )
          VALUES(?,?,?,?)
          `,
        )
        .run(req.session.userId, inputData.subject, prompt, mode);

      historyId = Number(info.lastInsertRowid);
    }

    // Local fallback is plain template text and cannot translate —
    // only Gemini mode actually converts Hindi/Gujarati/Hinglish
    // input into English. Tell the frontend so it can nudge the
    // user instead of silently shipping untranslated text.
    const languageNote =
      mode === "local-fallback" && looksLikeHinglishOrIndic(inputData.subject)
        ? "Hindi/Gujarati/Hinglish text detected in your Subject. Automatic English translation needs AI mode (GEMINI_API_KEY) — this local-fallback prompt kept your original wording as typed."
        : null;

    res.json({
      prompt,
      mode,
      historyId,
      ...(languageNote ? { languageNote } : {}),
    });
  },
);

// ============================================================
// IMPROVE PROMPT
// ============================================================

app.post(
  "/api/improve",

  rateLimit({
    windowMs: 60_000,
    max: 10,

    message: "Too many improvement requests. Please wait a moment.",
  }),

  async (req, res) => {
    const { prompt, targetModel = "general" } = req.body || {};

    if (!prompt || String(prompt).trim().length < 20) {
      return res.status(400).json({
        error: "Generate a prompt before improving it.",
      });
    }

    if (String(prompt).length > 12000) {
      return res.status(400).json({
        error: "Prompt is too long.",
      });
    }

    let improved = "";
    let mode = "local-improve";

    // ========================================================
    // GEMINI IMPROVE
    // ========================================================

    if (hasUsableGeminiKey()) {
      try {
        const systemInstruction = `
You are a senior AI video prompt editor.

Improve the user's existing AI video prompt for:

${targetModel}

Your goal is to make the prompt more production-ready for modern
AI video generators.

RULES:

1. Preserve the original subject.
2. Preserve the original concept and intent.
3. Do not replace the main character, product or environment.
4. Improve cinematic specificity.
5. Improve camera continuity.
6. Improve realistic motion.
7. Improve lighting consistency.
8. Improve composition.
9. Improve environment details.
10. Improve lens and depth-of-field language.
11. Improve temporal consistency.
12. Remove unnecessary repetition.
13. Fix contradictory instructions.
14. Make the prompt easier for AI video generators to understand.
15. Do not add unrelated concepts.
16. Do not add dialogue unless already requested.
17. Do not add text or logos unless requested.
18. Keep the requested duration, aspect ratio and FPS.
19. Return ONLY the improved prompt.
20. Do not add explanations.
21. Do not use markdown code blocks.
22. If any part of the prompt is in Hindi (Devanagari), Gujarati
    script, or romanized Hinglish/Gujlish, silently translate it
    into professional English while preserving the exact meaning.
    The improved prompt must be entirely in English.

Use exactly these sections:

Scene:
Visual Style:
Camera:
Lighting:
Mood:
Environment:
Subject Movement:
Quality:
Negative Prompt:
`;

        improved = await callGemini({
          systemInstruction,

          input: String(prompt).trim(),

          maxOutputTokens: 1800,

          temperature: 0.65,
        });

        improved = cleanGeneratedPrompt(improved);

        mode = "ai-gemini-improved";
      } catch (err) {
        console.error("Gemini improve failed:", err.message);
      }
    }

    // ========================================================
    // LOCAL FALLBACK
    // ========================================================

    if (!improved) {
      improved = String(prompt)
        .trim()
        .replace(
          /Create a (\d+ seconds?) /i,
          "Create a $1 highly polished cinematic ",
        );

      if (!/Consistency:/i.test(improved)) {
        improved += `

Consistency:
Maintain stable subject identity, realistic anatomy, coherent object geometry, continuous lighting and physically plausible motion throughout the shot.`;
      }

      improved = cleanGeneratedPrompt(improved);
    }

    // ========================================================
    // HISTORY
    // ========================================================

    let historyId = null;

    if (req.session.userId) {
      const subject =
        String(improved)
          .split("\n")
          .find((line) => line.trim() && !line.trim().endsWith(":"))
          ?.slice(0, 180) || "Improved AI video prompt";

      const info = db
        .prepare(
          `
          INSERT INTO prompt_history
          (
            user_id,
            subject,
            prompt,
            mode
          )
          VALUES(?,?,?,?)
          `,
        )
        .run(req.session.userId, subject, improved, mode);

      historyId = Number(info.lastInsertRowid);
    }

    res.json({
      prompt: improved,
      mode,
      historyId,
    });
  },
);

// ============================================================
// DASHBOARD
// ============================================================

app.get("/api/dashboard", requireLogin, (req, res) => {
  const userId = req.session.userId;

  const user = db
    .prepare(
      `
        SELECT
          id,
          name,
          email,
          created_at
        FROM users
        WHERE id=?
        `,
    )
    .get(userId);

  const purchases = db
    .prepare(
      `
        SELECT
          COUNT(*) AS count,
          COALESCE(SUM(amount),0) AS total
        FROM purchases
        WHERE user_id=?
        AND status='paid'
        `,
    )
    .get(userId);

  const prompts = db
    .prepare(
      `
        SELECT
          COUNT(*) AS count
        FROM prompt_history
        WHERE user_id=?
        `,
    )
    .get(userId);

  const favorites = db
    .prepare(
      `
        SELECT
          COUNT(*) AS count
        FROM favorites
        WHERE user_id=?
        `,
    )
    .get(userId);

  const recent = db
    .prepare(
      `
        SELECT
          ph.id,
          ph.subject,
          ph.prompt,
          ph.mode,
          ph.created_at,

          CASE
            WHEN f.id IS NULL THEN 0
            ELSE 1
          END AS favorite

        FROM prompt_history ph

        LEFT JOIN favorites f
          ON f.prompt_id=ph.id
          AND f.user_id=?

        WHERE ph.user_id=?

        ORDER BY ph.id DESC

        LIMIT 6
        `,
    )
    .all(userId, userId);

  res.json({
    user,

    stats: {
      purchases: purchases.count,

      promptCount: prompts.count,

      favorites: favorites.count,

      spent: purchases.total / 100,
    },

    recent,
  });
});

// ============================================================
// PROMPTS
// ============================================================

app.get("/api/prompts", requireLogin, (req, res) => {
  const rows = db
    .prepare(
      `
        SELECT
          ph.id,
          ph.subject,
          ph.prompt,
          ph.mode,
          ph.created_at,

          CASE
            WHEN f.id IS NULL THEN 0
            ELSE 1
          END AS favorite

        FROM prompt_history ph

        LEFT JOIN favorites f
          ON f.prompt_id=ph.id
          AND f.user_id=?

        WHERE ph.user_id=?

        ORDER BY ph.id DESC

        LIMIT 100
        `,
    )
    .all(req.session.userId, req.session.userId);

  res.json({
    items: rows,
  });
});

// ============================================================
// FAVORITE
// ============================================================

app.post("/api/prompts/:id/favorite", requireLogin, (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({
      error: "Invalid prompt ID.",
    });
  }

  const owned = db
    .prepare(
      `
        SELECT id
        FROM prompt_history
        WHERE id=?
        AND user_id=?
        `,
    )
    .get(id, req.session.userId);

  if (!owned) {
    return res.status(404).json({
      error: "Prompt not found.",
    });
  }

  const exists = db
    .prepare(
      `
        SELECT id
        FROM favorites
        WHERE user_id=?
        AND prompt_id=?
        `,
    )
    .get(req.session.userId, id);

  if (exists) {
    db.prepare(
      `
        DELETE FROM favorites
        WHERE id=?
        `,
    ).run(exists.id);

    return res.json({
      favorite: false,
    });
  }

  db.prepare(
    `
      INSERT OR IGNORE INTO favorites
      (user_id,prompt_id)
      VALUES(?,?)
      `,
  ).run(req.session.userId, id);

  res.json({
    favorite: true,
  });
});

// ============================================================
// FAVORITES
// ============================================================

app.get("/api/favorites", requireLogin, (req, res) => {
  const rows = db
    .prepare(
      `
        SELECT
          ph.id,
          ph.subject,
          ph.prompt,
          ph.mode,
          ph.created_at,
          1 AS favorite

        FROM favorites f

        JOIN prompt_history ph
          ON ph.id=f.prompt_id

        WHERE f.user_id=?

        ORDER BY f.id DESC

        LIMIT 100
        `,
    )
    .all(req.session.userId);

  res.json({
    items: rows,
  });
});

// ============================================================
// DELETE PROMPT
// ============================================================

app.delete("/api/prompts/:id", requireLogin, (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({
      error: "Invalid prompt ID.",
    });
  }

  const result = db
    .prepare(
      `
        DELETE FROM prompt_history
        WHERE id=?
        AND user_id=?
        `,
    )
    .run(id, req.session.userId);

  if (!result.changes) {
    return res.status(404).json({
      error: "Prompt not found.",
    });
  }

  res.json({
    deleted: true,
  });
});

// ============================================================
// RAZORPAY CREATE ORDER
// ============================================================

app.post("/api/create-order", requireLogin, async (req, res) => {
  try {
    const { productId } = req.body || {};

    const product = products[productId];

    if (!product) {
      return res.status(400).json({
        error: "Invalid product.",
      });
    }

    const quote = pro.quote(req.body?.couponCode, product.price);

    if (quote.error) {
      return res.status(400).json({ error: quote.error });
    }

    const { keyId, keySecret } = razorpayKeys();

    if (!razorpayReady()) {
      console.error(`Checkout blocked: ${razorpayProblem()}.`);

      return res.status(503).json({
        error:
          "Payments are not available right now. Please try again in a little while or contact support.",
      });
    }

    const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");

    const rp = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",

      headers: {
        Authorization: `Basic ${auth}`,

        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        amount: quote.amount,

        currency: "INR",

        receipt: `ep_${Date.now()}`,

        notes: {
          productId,

          productName: product.name,

          userId: String(req.session.userId),
        },
      }),
    });

    const order = await rp.json();

    if (!rp.ok) {
      console.error(
        `Razorpay order error (HTTP ${rp.status}):`,
        order?.error?.description || order,
      );

      if (rp.status === 401) {
        console.error(
          "Razorpay rejected the keys. Check that RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are a matching pair from the same mode (both test or both live).",
        );
      }

      return res.status(502).json({
        error: "Could not start the payment. Please try again in a moment.",
      });
    }

    pro.logCheckout(order.id, req.session.userId, productId, order.amount, quote.coupon);

    res.json({
      orderId: order.id,

      amount: order.amount,

      currency: order.currency,

      productName: product.name,

      keyId,

      productId,
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: "Order creation failed.",
    });
  }
});

// ============================================================
// RAZORPAY VERIFY PAYMENT
// ============================================================

app.post("/api/verify-payment", requireLogin, (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      productId,
    } = req.body || {};

    if (
      !razorpay_order_id ||
      !razorpay_payment_id ||
      !razorpay_signature ||
      !productId
    ) {
      return res.status(400).json({
        verified: false,

        error: "Missing payment fields.",
      });
    }

    const product = products[productId];

    if (!product) {
      return res.status(400).json({
        verified: false,

        error: "Invalid product.",
      });
    }

    const secret = razorpayKeys().keySecret;

    if (!secret) {
      console.error("Payment verification blocked: RAZORPAY_KEY_SECRET is empty.");

      return res.status(503).json({
        verified: false,

        error:
          "Payment could not be verified right now. If money was deducted, contact support with your payment ID.",
      });
    }

    const expected = crypto
      .createHmac("sha256", secret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    const a = Buffer.from(expected);

    const b = Buffer.from(razorpay_signature);

    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return res.status(400).json({
        verified: false,

        error: "Invalid signature.",
      });
    }

    db.prepare(
      `
        INSERT OR IGNORE INTO purchases
        (
          user_id,
          product_id,
          order_id,
          payment_id,
          amount,
          status
        )
        VALUES(?,?,?,?,?,'paid')
        `,
    ).run(
      req.session.userId,
      productId,
      razorpay_order_id,
      razorpay_payment_id,
      pro.paidAmount(razorpay_order_id, product.price),
    );

    res.json({
      verified: true,

      message: "Payment verified and product added to your library.",
    });

    // ======================================================
    // RECEIPT EMAIL
    // ======================================================

    const purchase = db
      .prepare(
        `
          SELECT *
          FROM purchases
          WHERE user_id=?
          AND product_id=?
          AND payment_id=?
          `,
      )
      .get(req.session.userId, productId, razorpay_payment_id);

    const buyer = db
      .prepare(
        `
          SELECT
            name,
            email
          FROM users
          WHERE id=?
          `,
      )
      .get(req.session.userId);

    if (purchase && buyer) {
      sendPurchaseEmail({
        email: buyer.email,

        name: buyer.name,

        product,

        amount: purchase.amount,

        orderId: razorpay_order_id,

        paymentId: razorpay_payment_id,

        purchaseId: purchase.id,
      }).catch((err) => console.error("Purchase email failed:", err.message));
    }
  } catch (err) {
    console.error(err);

    res.status(500).json({
      verified: false,

      error: "Payment verification failed.",
    });
  }
});

// ============================================================
// RAZORPAY WEBHOOK
// ============================================================

app.post("/api/webhooks/razorpay", (req, res) => {
  try {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;

    const signature = req.headers["x-razorpay-signature"];

    if (!secret) {
      return res.status(503).json({
        error: "Webhook secret not configured.",
      });
    }

    if (!signature || !req.rawBody) {
      return res.status(400).json({
        error: "Missing signature or body.",
      });
    }

    const expected = crypto
      .createHmac("sha256", secret)
      .update(req.rawBody)
      .digest("hex");

    const a = Buffer.from(expected);

    const b = Buffer.from(String(signature));

    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return res.status(400).json({
        error: "Invalid webhook signature.",
      });
    }

    const event = req.body;

    if (event.event === "payment.captured") {
      const payment = event.payload?.payment?.entity;

      if (payment) {
        const productId = payment.notes?.productId;

        const userId = payment.notes?.userId;

        const product = products[productId];

        if (product && userId) {
          db.prepare(
            `
              INSERT OR IGNORE INTO purchases
              (
                user_id,
                product_id,
                order_id,
                payment_id,
                amount,
                status
              )
              VALUES(?,?,?,?,?,'paid')
              `,
          ).run(
            Number(userId),
            productId,
            payment.order_id,
            payment.id,
            pro.paidAmount(payment.order_id, product.price),
          );

          const purchase = db
            .prepare(
              `
                SELECT *
                FROM purchases
                WHERE user_id=?
                AND product_id=?
                AND payment_id=?
                `,
            )
            .get(Number(userId), productId, payment.id);

          const buyer = db
            .prepare(
              `
                SELECT
                  name,
                  email
                FROM users
                WHERE id=?
                `,
            )
            .get(Number(userId));

          if (purchase && buyer) {
            sendPurchaseEmail({
              email: buyer.email,

              name: buyer.name,

              product,

              amount: purchase.amount,

              orderId: payment.order_id,

              paymentId: payment.id,

              purchaseId: purchase.id,
            }).catch((err) =>
              console.error("Purchase email failed (webhook):", err.message),
            );
          }
        }
      }
    }

    res.json({
      received: true,
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: "Webhook processing failed.",
    });
  }
});

// ============================================================
// ADMIN STATS
// ============================================================

// Day boundaries in the admin's own timezone (default IST, UTC+5:30).
// Override with ADMIN_TZ_OFFSET_MIN in .env (minutes from UTC).
const tzRaw = process.env.ADMIN_TZ_OFFSET_MIN;
const ADMIN_TZ_MIN =
  tzRaw !== undefined && tzRaw !== "" && Number.isFinite(Number(tzRaw))
    ? Math.trunc(Number(tzRaw))
    : 330;
const TZ_MOD = `${ADMIN_TZ_MIN >= 0 ? "+" : "-"}${Math.abs(ADMIN_TZ_MIN)} minutes`;

function adminDay(daysAgo = 0) {
  return new Date(Date.now() + ADMIN_TZ_MIN * 60_000 - daysAgo * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

const dayOf = (col) => `date(${col}, '${TZ_MOD}')`;

// Real money orders only. Free access given from the admin panel has amount 0.
const REAL_PAID = "status='paid' AND amount>0";

function dailySeries(table, valueSql, extraWhere, days) {
  const rows = db
    .prepare(
      `
      SELECT ${dayOf("created_at")} AS d, ${valueSql} AS v
      FROM ${table}
      WHERE ${dayOf("created_at")} >= ? ${extraWhere ? "AND " + extraWhere : ""}
      GROUP BY d
      `,
    )
    .all(adminDay(days - 1));

  const map = new Map(rows.map((r) => [r.d, Number(r.v)]));

  return Array.from({ length: days }, (_, i) => {
    const date = adminDay(days - 1 - i);
    return { date, value: map.get(date) || 0 };
  });
}

app.get("/api/admin/stats", requireAdmin, (req, res) => {
  const one = (sql, ...args) => db.prepare(sql).get(...args);

  const DAYS = 30;
  const today = adminDay(0);
  const from7 = adminDay(6);
  const from30 = adminDay(29);

  const users = one("SELECT COUNT(*) AS n FROM users").n;

  const orders = one(`SELECT COUNT(*) AS n FROM purchases WHERE ${REAL_PAID}`).n;

  const revenueSince = (from) =>
    one(
      `SELECT COALESCE(SUM(amount),0) AS n FROM purchases
       WHERE ${REAL_PAID} AND ${dayOf("created_at")} >= ?`,
      from,
    ).n;

  const revenue = one(
    `SELECT COALESCE(SUM(amount),0) AS n FROM purchases WHERE ${REAL_PAID}`,
  ).n;

  const payingUsers = one(
    `SELECT COUNT(DISTINCT user_id) AS n FROM purchases WHERE ${REAL_PAID}`,
  ).n;

  const signupsSince = (from) =>
    one(`SELECT COUNT(*) AS n FROM users WHERE ${dayOf("created_at")} >= ?`, from).n;

  const activeSince = (from) =>
    one(
      `SELECT COUNT(DISTINCT user_id) AS n FROM (
         SELECT user_id, created_at FROM prompt_history
         UNION ALL
         SELECT user_id, created_at FROM media_history
       ) WHERE ${dayOf("created_at")} >= ?`,
      from,
    ).n;

  const mediaByKind = Object.fromEntries(
    db
      .prepare("SELECT kind, COUNT(*) AS n FROM media_history GROUP BY kind")
      .all()
      .map((r) => [r.kind, r.n]),
  );

  const images = Number(mediaByKind.image || 0);
  const videos = Object.entries(mediaByKind)
    .filter(([k]) => k !== "image")
    .reduce((sum, [, n]) => sum + Number(n), 0);

  const soldRows = db
    .prepare(
      `SELECT product_id, COUNT(*) AS sales, COALESCE(SUM(amount),0) AS revenue
       FROM purchases WHERE ${REAL_PAID} GROUP BY product_id`,
    )
    .all();

  const soldMap = new Map(soldRows.map((r) => [r.product_id, r]));

  const byProduct = [
    ...Object.entries(products).map(([id, p]) => ({
      id,
      name: p.name,
      price: p.price / 100,
      sales: soldMap.get(id)?.sales || 0,
      revenue: (soldMap.get(id)?.revenue || 0) / 100,
    })),
    ...soldRows
      .filter((r) => !products[r.product_id])
      .map((r) => ({
        id: r.product_id,
        name: r.product_id,
        price: 0,
        sales: r.sales,
        revenue: r.revenue / 100,
      })),
  ];

  const topUsers = db
    .prepare(
      `
      SELECT * FROM (
        SELECT
          u.id, u.name, u.email,
          (SELECT COUNT(*) FROM prompt_history h WHERE h.user_id=u.id) AS prompts,
          (SELECT COUNT(*) FROM media_history m WHERE m.user_id=u.id) AS media
        FROM users u
      )
      WHERE prompts + media > 0
      ORDER BY prompts + media DESC
      LIMIT 5
      `,
    )
    .all();

  const promptModes = db
    .prepare("SELECT mode, COUNT(*) AS n FROM prompt_history GROUP BY mode ORDER BY n DESC")
    .all();

  const recentUsers = db
    .prepare(
      `
        SELECT id, name, email, created_at
        FROM users
        ORDER BY id DESC
        LIMIT 8
        `,
    )
    .all();

  res.json({
    stats: {
      users,
      orders,
      revenue: revenue / 100,
      prompts: one("SELECT COUNT(*) AS n FROM prompt_history").n,
      products: Object.keys(products).length,
      blocked: one("SELECT COUNT(*) AS n FROM blocked_emails").n,

      signupsToday: signupsSince(today),
      signups7: signupsSince(from7),
      active7: activeSince(from7),
      revenueToday: revenueSince(today) / 100,
      revenue7: revenueSince(from7) / 100,
      revenue30: revenueSince(from30) / 100,
      avgOrder: orders ? revenue / orders / 100 : 0,
      payingUsers,
      conversion: users ? Math.round((payingUsers / users) * 1000) / 10 : 0,
      images,
      videos,
      granted: one(
        "SELECT COUNT(*) AS n FROM purchases WHERE status='paid' AND amount=0",
      ).n,
    },

    series: {
      signups: dailySeries("users", "COUNT(*)", "", DAYS),
      revenue: dailySeries(
        "purchases",
        "COALESCE(SUM(amount),0) / 100.0",
        REAL_PAID,
        DAYS,
      ),
      prompts: dailySeries("prompt_history", "COUNT(*)", "", DAYS),
      media: dailySeries("media_history", "COUNT(*)", "", DAYS),
    },

    byProduct,
    topUsers,
    promptModes,
    recentUsers,
  });
});

// ============================================================
// ADMIN ORDERS
// ============================================================

app.get("/api/admin/orders", requireAdmin, (req, res) => {
  const rows = db
    .prepare(
      `
        SELECT
          purchases.*,
          users.name,
          users.email

        FROM purchases

        JOIN users
          ON users.id=purchases.user_id

        ORDER BY purchases.id DESC

        LIMIT 500
        `,
    )
    .all();

  res.json({
    orders: rows,
  });
});

// ============================================================
// ADMIN LOGIN / LOGOUT / SESSION
// ============================================================

app.post(
  "/api/admin/login",

  rateLimit({
    windowMs: 15 * 60_000,
    max: 8,

    message: "Too many admin login attempts. Try again in 15 minutes.",
  }),

  (req, res) => {
    if (!adminConfigured()) {
      return res.status(503).json({
        error:
          "Admin login is not set up. Add ADMIN_EMAIL and ADMIN_PASSWORD to .env and restart the server.",
      });
    }

    const { email, password } = req.body || {};

    const emailOk = safeEqual(
      String(email || "").trim().toLowerCase(),
      process.env.ADMIN_EMAIL.trim().toLowerCase(),
    );

    const passwordOk = verifyAdminPassword(String(password || ""));

    if (!emailOk || !passwordOk) {
      console.warn(`Admin login failed from ${req.ip}`);

      logAdmin("login_failed", req.ip, `email tried: ${String(email || "").slice(0, 80)}`);

      return res.status(401).json({
        error: "Incorrect email or password.",
      });
    }

    const previousUserId = req.session.userId;

    req.session.regenerate((regenError) => {
      if (regenError) {
        console.error(regenError);

        return res.status(500).json({
          error: "Could not start admin session.",
        });
      }

      req.session.isAdmin = true;
      req.session.adminAt = Date.now();

      if (previousUserId) req.session.userId = previousUserId;

      req.session.save((saveError) => {
        if (saveError) {
          console.error(saveError);

          return res.status(500).json({
            error: "Could not save admin session.",
          });
        }

        logAdmin("login", req.ip, "");

        res.json({
          ok: true,
          email: process.env.ADMIN_EMAIL.trim().toLowerCase(),
        });
      });
    });
  },
);

app.get("/api/admin/me", (req, res) => {
  const admin = isAdminSession(req);

  res.json({
    admin,
    email: admin ? process.env.ADMIN_EMAIL.trim().toLowerCase() : null,
    configured: adminConfigured(),
  });
});

app.post("/api/admin/logout", (req, res) => {
  delete req.session.isAdmin;
  delete req.session.adminAt;

  req.session.save(() =>
    res.json({
      ok: true,
    }),
  );
});

// ============================================================
// ADMIN USERS + BLOCK LIST
// ============================================================

app.get("/api/admin/users", requireAdmin, (req, res) => {
  const rows = db
    .prepare(
      `
        SELECT
          u.id,
          u.name,
          u.email,
          u.created_at,

          (SELECT COUNT(*)
             FROM purchases p
            WHERE p.user_id=u.id AND p.status='paid') AS paid_orders,

          (SELECT COALESCE(SUM(amount),0)
             FROM purchases p
            WHERE p.user_id=u.id AND p.status='paid') AS paid_amount,

          (SELECT COUNT(*)
             FROM prompt_history h
            WHERE h.user_id=u.id) AS prompts

        FROM users u
        ORDER BY u.id DESC
        LIMIT 2000
        `,
    )
    .all();

  const blocked = new Set(
    db
      .prepare("SELECT email FROM blocked_emails")
      .all()
      .map((row) => row.email),
  );

  res.json({
    users: rows.map((row) => ({
      ...row,
      blocked: blocked.has(canonicalEmail(row.email)),
    })),
  });
});

app.get("/api/admin/blocked", requireAdmin, (req, res) => {
  const rows = db
    .prepare(
      `
        SELECT
          shown_email AS email,
          reason,
          created_at
        FROM blocked_emails
        ORDER BY created_at DESC, rowid DESC
        `,
    )
    .all();

  res.json({
    blocked: rows,
  });
});

app.post("/api/admin/block", requireAdmin, (req, res) => {
  const typed = String(req.body?.email || "")
    .trim()
    .toLowerCase();

  const reason = String(req.body?.reason || "")
    .trim()
    .slice(0, 200);

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(typed)) {
    return res.status(400).json({
      error: "Enter a valid email address.",
    });
  }

  const key = canonicalEmail(typed);

  if (
    process.env.ADMIN_EMAIL &&
    key === canonicalEmail(process.env.ADMIN_EMAIL)
  ) {
    return res.status(400).json({
      error: "You cannot block the admin email.",
    });
  }

  db.prepare(
    `
    INSERT INTO blocked_emails(email, shown_email, reason)
    VALUES(?,?,?)
    ON CONFLICT(email) DO UPDATE SET
      shown_email=excluded.shown_email,
      reason=excluded.reason
    `,
  ).run(key, typed, reason);

  // Any login code that is still waiting for this address is now useless.
  db.prepare("UPDATE otps SET consumed=1 WHERE email=?").run(typed);

  logAdmin("block", typed, reason);

  res.json({
    ok: true,
    email: typed,
  });
});

app.post("/api/admin/unblock", requireAdmin, (req, res) => {
  const typed = String(req.body?.email || "")
    .trim()
    .toLowerCase();

  if (!typed) {
    return res.status(400).json({
      error: "Email is required.",
    });
  }

  db.prepare("DELETE FROM blocked_emails WHERE email=?").run(
    canonicalEmail(typed),
  );

  logAdmin("unblock", typed, "");

  res.json({
    ok: true,
  });
});

// ============================================================
// ADMIN: USER DETAIL, ORDER ACTIONS, ACTIVITY, SYSTEM, AUDIT LOG
// ============================================================

app.get("/api/admin/users/:id", requireAdmin, (req, res) => {
  const id = Number(req.params.id);

  const user = db
    .prepare("SELECT id, name, email, created_at FROM users WHERE id=?")
    .get(id);

  if (!user) {
    return res.status(404).json({ error: "User not found." });
  }

  const blockRow = db
    .prepare("SELECT reason, created_at FROM blocked_emails WHERE email=?")
    .get(canonicalEmail(user.email));

  const purchases = db
    .prepare(
      `SELECT id, product_id, order_id, payment_id, amount, status, created_at
       FROM purchases WHERE user_id=? ORDER BY id DESC`,
    )
    .all(id)
    .map((row) => ({
      ...row,
      product_name: products[row.product_id]?.name || row.product_id,
      granted: row.amount === 0,
    }));

  const prompts = db
    .prepare(
      `SELECT id, subject, prompt, mode, created_at
       FROM prompt_history WHERE user_id=? ORDER BY id DESC LIMIT 15`,
    )
    .all(id)
    .map((row) => ({ ...row, prompt: String(row.prompt).slice(0, 500) }));

  const media = db
    .prepare(
      `SELECT id, kind, prompt, file, model, created_at
       FROM media_history WHERE user_id=? ORDER BY id DESC LIMIT 12`,
    )
    .all(id)
    .map((row) => ({
      ...row,
      prompt: String(row.prompt).slice(0, 300),
      url: fs.existsSync(path.join(MEDIA_DIR, path.basename(row.file)))
        ? `/api/media/file/${encodeURIComponent(row.file)}`
        : null,
    }));

  const totals = db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM prompt_history WHERE user_id=?) AS prompts,
         (SELECT COUNT(*) FROM media_history WHERE user_id=?) AS media,
         (SELECT COUNT(*) FROM favorites WHERE user_id=?) AS favorites`,
    )
    .get(id, id, id);

  res.json({
    user: {
      ...user,
      blocked: Boolean(blockRow),
      block_reason: blockRow?.reason || "",
    },
    totals,
    purchases,
    prompts,
    media,
    products: Object.entries(products).map(([pid, p]) => ({
      id: pid,
      name: p.name,
    })),
  });
});

// Give a user a product for free (support, giveaways, replacing a failed payment).
app.post("/api/admin/grant", requireAdmin, (req, res) => {
  const userId = Number(req.body?.userId);
  const productId = String(req.body?.productId || "");

  const user = db
    .prepare("SELECT id, email FROM users WHERE id=?")
    .get(userId);

  if (!user) {
    return res.status(404).json({ error: "User not found." });
  }

  const product = products[productId];

  if (!product) {
    return res.status(400).json({ error: "Choose a valid product." });
  }

  const owned = db
    .prepare(
      "SELECT id FROM purchases WHERE user_id=? AND product_id=? AND status='paid'",
    )
    .get(userId, productId);

  if (owned) {
    return res.status(400).json({ error: "This user already owns that product." });
  }

  db.prepare(
    `INSERT INTO purchases(user_id, product_id, order_id, payment_id, amount, status)
     VALUES(?,?,?,?,0,'paid')`,
  ).run(userId, productId, "admin-grant", `admin-grant-${Date.now()}`);

  logAdmin("grant", user.email, product.name);

  res.json({ ok: true });
});

// Turn access off (refund abuse, chargeback) or back on again. Money is never
// moved here: refund the payment inside the Razorpay dashboard.
app.post("/api/admin/order-status", requireAdmin, (req, res) => {
  const purchaseId = Number(req.body?.purchaseId);
  const action = String(req.body?.action || "");

  if (!["revoke", "restore"].includes(action)) {
    return res.status(400).json({ error: "Unknown action." });
  }

  const row = db
    .prepare(
      `SELECT purchases.id, purchases.status, purchases.product_id, users.email
       FROM purchases JOIN users ON users.id=purchases.user_id
       WHERE purchases.id=?`,
    )
    .get(purchaseId);

  if (!row) {
    return res.status(404).json({ error: "Order not found." });
  }

  const from = action === "revoke" ? "paid" : "revoked";
  const to = action === "revoke" ? "revoked" : "paid";

  if (row.status !== from) {
    return res.status(400).json({
      error: `Only ${from} orders can be ${action === "revoke" ? "revoked" : "restored"}.`,
    });
  }

  db.prepare("UPDATE purchases SET status=? WHERE id=?").run(to, purchaseId);

  logAdmin(
    action,
    row.email,
    `${products[row.product_id]?.name || row.product_id} (order #${row.id})`,
  );

  res.json({ ok: true });
});

// ============================================================
// ADMIN: DELETE USERS, BULK ACTIONS, EDIT USER, CONTENT MODERATION
// ============================================================

// Every deleted account is copied here first (including its paid orders), so
// accounting / GST / refund records are never lost when a user is removed.
db.exec(`
CREATE TABLE IF NOT EXISTS deleted_users(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  original_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  joined_at TEXT NOT NULL DEFAULT '',
  paid_orders INTEGER NOT NULL DEFAULT 0,
  paid_amount INTEGER NOT NULL DEFAULT 0,
  purchases_json TEXT NOT NULL DEFAULT '[]',
  prompts_count INTEGER NOT NULL DEFAULT 0,
  media_count INTEGER NOT NULL DEFAULT 0,
  blocked INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`);

function isAdminEmail(email) {
  return Boolean(
    (process.env.ADMIN_EMAIL || "").trim() &&
      canonicalEmail(email) === canonicalEmail(process.env.ADMIN_EMAIL),
  );
}

function blockEmailNow(typedEmail, reason = "") {
  const typed = String(typedEmail || "").trim().toLowerCase();

  db.prepare(
    `
    INSERT INTO blocked_emails(email, shown_email, reason)
    VALUES(?,?,?)
    ON CONFLICT(email) DO UPDATE SET
      shown_email=excluded.shown_email,
      reason=excluded.reason
    `,
  ).run(canonicalEmail(typed), typed, String(reason || "").slice(0, 200));

  db.prepare("UPDATE otps SET consumed=1 WHERE lower(email)=?").run(typed);
}

// Generated images / videos live on disk. Remove a file only when no other
// history row still points at it.
function removeMediaFileIfUnused(file) {
  const stored = String(file || "");
  const name = path.basename(stored);

  if (!name) return;

  const stillUsed = db
    .prepare("SELECT 1 FROM media_history WHERE file=? LIMIT 1")
    .get(stored);

  if (stillUsed) return;

  try {
    fs.unlinkSync(path.join(MEDIA_DIR, name));
  } catch {}
}

// Removes a user and everything that belongs to them. Runs in one transaction:
// either the whole account disappears or nothing changes.
function deleteUserAccount(userId, { alsoBlock = false, reason = "" } = {}) {
  const user = db
    .prepare("SELECT id, name, email, created_at FROM users WHERE id=?")
    .get(userId);

  if (!user) return null;

  const purchases = db
    .prepare(
      `SELECT product_id, order_id, payment_id, amount, status, created_at
       FROM purchases WHERE user_id=? ORDER BY id`,
    )
    .all(userId)
    .map((row) => ({
      ...row,
      product_name: products[row.product_id]?.name || row.product_id,
    }));

  const paid = purchases.filter((p) => p.status === "paid" && p.amount > 0);

  const files = db
    .prepare("SELECT file FROM media_history WHERE user_id=?")
    .all(userId)
    .map((row) => row.file);

  const promptsCount = db
    .prepare("SELECT COUNT(*) AS n FROM prompt_history WHERE user_id=?")
    .get(userId).n;

  db.exec("BEGIN IMMEDIATE");

  try {
    db.prepare(
      `INSERT INTO deleted_users
       (original_id, name, email, joined_at, paid_orders, paid_amount,
        purchases_json, prompts_count, media_count, blocked)
       VALUES(?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      user.id,
      user.name,
      user.email,
      user.created_at,
      paid.length,
      paid.reduce((sum, p) => sum + Number(p.amount || 0), 0),
      JSON.stringify(purchases),
      promptsCount,
      files.length,
      alsoBlock ? 1 : 0,
    );

    db.prepare("DELETE FROM favorites WHERE user_id=?").run(userId);
    db.prepare("DELETE FROM prompt_history WHERE user_id=?").run(userId);
    db.prepare("DELETE FROM media_history WHERE user_id=?").run(userId);
    db.prepare("DELETE FROM purchases WHERE user_id=?").run(userId);
    db.prepare("DELETE FROM otps WHERE lower(email)=?").run(
      String(user.email).toLowerCase(),
    );
    db.prepare("DELETE FROM users WHERE id=?").run(userId);

    if (alsoBlock) blockEmailNow(user.email, reason || "Account deleted by admin");

    db.exec("COMMIT");
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch {}

    throw err;
  }

  // Files are removed only after the database change is safely committed.
  for (const file of files) removeMediaFileIfUnused(file);

  return {
    user,
    paidOrders: paid.length,
    prompts: promptsCount,
    media: files.length,
  };
}

// ---- delete one user (admin must type the user's email to confirm) ----
app.post("/api/admin/delete-user", requireAdmin, (req, res) => {
  const userId = Number(req.body?.userId);

  const user = db
    .prepare("SELECT id, email FROM users WHERE id=?")
    .get(userId);

  if (!user) {
    return res.status(404).json({ error: "User not found." });
  }

  const typed = String(req.body?.confirmEmail || "").trim().toLowerCase();

  if (typed !== String(user.email).trim().toLowerCase()) {
    return res.status(400).json({
      error: "Type the user's email exactly to confirm the deletion.",
    });
  }

  const alsoBlock = Boolean(req.body?.alsoBlock) && !isAdminEmail(user.email);

  try {
    const result = deleteUserAccount(userId, { alsoBlock });

    logAdmin(
      "delete_user",
      result.user.email,
      `${result.paidOrders} paid orders, ${result.prompts} prompts, ${result.media} media${alsoBlock ? ", email blocked" : ""}`,
    );

    res.json({ ok: true, ...result, blocked: alsoBlock });
  } catch (err) {
    console.error("Delete user failed:", err);

    res.status(500).json({ error: "Could not delete this user. Nothing was changed." });
  }
});

// ---- delete many users ----
app.post("/api/admin/delete-users", requireAdmin, (req, res) => {
  if (String(req.body?.confirm || "") !== "DELETE") {
    return res.status(400).json({ error: 'Type DELETE to confirm.' });
  }

  const ids = [
    ...new Set(
      (Array.isArray(req.body?.ids) ? req.body.ids : [])
        .map(Number)
        .filter((n) => Number.isInteger(n) && n > 0),
    ),
  ];

  if (!ids.length) {
    return res.status(400).json({ error: "Select at least one user." });
  }

  if (ids.length > 100) {
    return res.status(400).json({ error: "Delete at most 100 users at a time." });
  }

  const alsoBlock = Boolean(req.body?.alsoBlock);

  let deleted = 0;
  let paidOrders = 0;
  const failed = [];

  for (const id of ids) {
    try {
      const row = db.prepare("SELECT email FROM users WHERE id=?").get(id);

      if (!row) {
        failed.push({ id, error: "Not found" });
        continue;
      }

      const block = alsoBlock && !isAdminEmail(row.email);
      const result = deleteUserAccount(id, { alsoBlock: block });

      deleted += 1;
      paidOrders += result.paidOrders;

      logAdmin(
        "delete_user",
        result.user.email,
        `bulk: ${result.paidOrders} paid orders, ${result.prompts} prompts, ${result.media} media${block ? ", email blocked" : ""}`,
      );
    } catch (err) {
      console.error("Bulk delete failed for user", id, err);
      failed.push({ id, error: "Could not delete" });
    }
  }

  res.json({ ok: true, deleted, paidOrders, failed });
});

// ---- block / unblock many users ----
app.post("/api/admin/block-users", requireAdmin, (req, res) => {
  const ids = [
    ...new Set(
      (Array.isArray(req.body?.ids) ? req.body.ids : [])
        .map(Number)
        .filter((n) => Number.isInteger(n) && n > 0),
    ),
  ].slice(0, 200);

  const reason = String(req.body?.reason || "").trim().slice(0, 200);
  const unblock = Boolean(req.body?.unblock);

  if (!ids.length) {
    return res.status(400).json({ error: "Select at least one user." });
  }

  let changed = 0;
  let skipped = 0;

  for (const id of ids) {
    const row = db.prepare("SELECT email FROM users WHERE id=?").get(id);

    if (!row || (!unblock && isAdminEmail(row.email))) {
      skipped += 1;
      continue;
    }

    if (unblock) {
      db.prepare("DELETE FROM blocked_emails WHERE email=?").run(
        canonicalEmail(row.email),
      );
      logAdmin("unblock", row.email, "bulk");
    } else {
      blockEmailNow(row.email, reason);
      logAdmin("block", row.email, reason || "bulk");
    }

    changed += 1;
  }

  res.json({ ok: true, changed, skipped });
});

// ---- fix a user's name or email (support requests, typos) ----
app.post("/api/admin/update-user", requireAdmin, (req, res) => {
  const userId = Number(req.body?.userId);

  const user = db
    .prepare("SELECT id, name, email FROM users WHERE id=?")
    .get(userId);

  if (!user) {
    return res.status(404).json({ error: "User not found." });
  }

  const name = String(req.body?.name ?? user.name).trim().slice(0, 80);
  const email = String(req.body?.email ?? user.email).trim().toLowerCase();

  if (!name) {
    return res.status(400).json({ error: "Name cannot be empty." });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) {
    return res.status(400).json({ error: "Enter a valid email address." });
  }

  if (email !== user.email) {
    const taken = db
      .prepare("SELECT id FROM users WHERE lower(email)=? AND id<>?")
      .get(email, userId);

    if (taken) {
      return res.status(400).json({
        error: "Another account already uses that email.",
      });
    }

    if (isEmailBlocked(email)) {
      return res.status(400).json({
        error: "That email is on the block list. Unblock it first.",
      });
    }
  }

  if (name === user.name && email === user.email) {
    return res.json({ ok: true, unchanged: true });
  }

  db.prepare("UPDATE users SET name=?, email=? WHERE id=?").run(name, email, userId);

  const changes = [];
  if (name !== user.name) changes.push(`name: ${user.name} → ${name}`);
  if (email !== user.email) changes.push(`email: ${user.email} → ${email}`);

  logAdmin("edit_user", email, changes.join("; "));

  res.json({ ok: true });
});

// ---- remove one prompt or one generated image/video (moderation) ----
app.post("/api/admin/delete-prompt", requireAdmin, (req, res) => {
  const id = Number(req.body?.id);

  const row = db
    .prepare(
      `SELECT h.id, h.subject, u.email
       FROM prompt_history h JOIN users u ON u.id=h.user_id WHERE h.id=?`,
    )
    .get(id);

  if (!row) {
    return res.status(404).json({ error: "Prompt not found." });
  }

  db.prepare("DELETE FROM favorites WHERE prompt_id=?").run(id);
  db.prepare("DELETE FROM prompt_history WHERE id=?").run(id);

  logAdmin("delete_prompt", row.email, String(row.subject || "").slice(0, 120));

  res.json({ ok: true });
});

app.post("/api/admin/delete-media", requireAdmin, (req, res) => {
  const id = Number(req.body?.id);

  const row = db
    .prepare(
      `SELECT m.id, m.file, m.kind, u.email
       FROM media_history m JOIN users u ON u.id=m.user_id WHERE m.id=?`,
    )
    .get(id);

  if (!row) {
    return res.status(404).json({ error: "Media not found." });
  }

  db.prepare("DELETE FROM media_history WHERE id=?").run(id);
  removeMediaFileIfUnused(row.file);

  logAdmin("delete_media", row.email, `${row.kind}: ${path.basename(row.file)}`);

  res.json({ ok: true });
});

// ---- archive of deleted accounts ----
app.get("/api/admin/deleted", requireAdmin, (req, res) => {
  const rows = db
    .prepare(
      `SELECT id, original_id, name, email, joined_at, paid_orders, paid_amount,
              purchases_json, prompts_count, media_count, blocked, deleted_at
       FROM deleted_users ORDER BY id DESC LIMIT 1000`,
    )
    .all()
    .map((row) => {
      let purchases = [];

      try {
        purchases = JSON.parse(row.purchases_json);
      } catch {}

      const { purchases_json, ...rest } = row;

      return { ...rest, blocked: Boolean(row.blocked), purchases };
    });

  res.json({
    deleted: rows,
    totalPaid: rows.reduce((sum, r) => sum + Number(r.paid_amount || 0), 0),
  });
});

// ---- permanently erase one entry from the deleted-users archive ----
app.post("/api/admin/erase-deleted", requireAdmin, (req, res) => {
  const id = Number(req.body?.id);

  const row = db
    .prepare(
      "SELECT id, email, paid_orders, paid_amount FROM deleted_users WHERE id=?",
    )
    .get(id);

  if (!row) {
    return res.status(404).json({ error: "Record not found." });
  }

  const typed = String(req.body?.confirmEmail || "").trim().toLowerCase();

  if (typed !== String(row.email).trim().toLowerCase()) {
    return res.status(400).json({
      error: "Type the email exactly to confirm.",
    });
  }

  db.prepare("DELETE FROM deleted_users WHERE id=?").run(id);

  logAdmin(
    "erase_record",
    row.email,
    `${row.paid_orders} paid orders (${Number(row.paid_amount || 0) / 100} INR) erased from archive`,
  );

  res.json({ ok: true });
});

app.get("/api/admin/activity", requireAdmin, (req, res) => {
  const prompts = db
    .prepare(
      `SELECT h.id, h.subject, h.prompt, h.mode, h.created_at, u.id AS user_id, u.name, u.email
       FROM prompt_history h JOIN users u ON u.id=h.user_id
       ORDER BY h.id DESC LIMIT 100`,
    )
    .all()
    .map((row) => ({
      ...row,
      subject: String(row.subject).slice(0, 200),
      prompt: String(row.prompt).slice(0, 700),
    }));

  const media = db
    .prepare(
      `SELECT m.id, m.kind, m.prompt, m.file, m.model, m.created_at, u.id AS user_id, u.name, u.email
       FROM media_history m JOIN users u ON u.id=m.user_id
       ORDER BY m.id DESC LIMIT 60`,
    )
    .all()
    .map((row) => ({
      ...row,
      prompt: String(row.prompt).slice(0, 400),
      url: fs.existsSync(path.join(MEDIA_DIR, path.basename(row.file)))
        ? `/api/media/file/${encodeURIComponent(row.file)}`
        : null,
    }));

  res.json({ prompts, media });
});

app.get("/api/admin/log", requireAdmin, (req, res) => {
  const rows = db
    .prepare(
      "SELECT id, action, target, detail, created_at FROM admin_log ORDER BY id DESC LIMIT 100",
    )
    .all();

  res.json({ log: rows });
});

// Shows which features are configured. Never returns any secret value.
app.get("/api/admin/system", requireAdmin, (req, res) => {
  const has = (name) => Boolean(String(process.env[name] || "").trim());
  const secret = String(process.env.SESSION_SECRET || "");

  const checks = [
    {
      label: "Admin login",
      ok: adminConfigured(),
      note: adminConfigured() ? "Configured" : "Set ADMIN_EMAIL and ADMIN_PASSWORD_HASH",
    },
    {
      label: "Email sending (SMTP)",
      ok: smtpConfigured,
      note: smtpConfigured ? "OTP + purchase emails work" : "OTP login and receipts will not be sent",
    },
    {
      label: "Razorpay payments",
      ok: razorpayReady(),
      note: razorpayReady()
        ? razorpayKeys().keyId.startsWith("rzp_live")
          ? "Live keys"
          : "Test keys"
        : `${razorpayProblem()}. Buy button shows an error until this is fixed.`,
    },
    {
      label: "Razorpay webhook",
      ok: has("RAZORPAY_WEBHOOK_SECRET"),
      note: has("RAZORPAY_WEBHOOK_SECRET")
        ? "Secret set"
        : "Missing: paid users may not get access if the browser closes early",
    },
    {
      label: "Gemini AI",
      ok: hasUsableGeminiKey(),
      note: hasUsableGeminiKey() ? "Key present" : "No key: prompts use the local fallback",
    },
    {
      label: "Hugging Face (free media)",
      ok: has("HF_TOKEN"),
      note: has("HF_TOKEN") ? "Token present" : "No token",
    },
    {
      label: "Session secret",
      ok: secret.length >= 32 && secret !== "dev-secret-change-me",
      note:
        secret.length >= 32 && secret !== "dev-secret-change-me"
          ? "Strong"
          : "Use a random value of 32+ characters",
    },
    {
      label: "Production mode",
      ok: isProduction,
      note: isProduction ? "NODE_ENV=production" : "Development mode",
    },
    {
      label: "Secure cookies",
      ok: cookieSecure,
      note: cookieSecure ? "Enabled" : "Off (fine on localhost, required on HTTPS)",
    },
    {
      label: "Site URL",
      ok: has("SITE_URL"),
      note: has("SITE_URL") ? String(process.env.SITE_URL) : "SITE_URL not set",
    },
  ];

  const fileSize = (file) => {
    try {
      return fs.statSync(file).size;
    } catch {
      return 0;
    }
  };

  const dbFile = path.join(__dirname, "editprompt.db");
  const dbBytes =
    fileSize(dbFile) + fileSize(`${dbFile}-wal`) + fileSize(`${dbFile}-shm`);

  let mediaFiles = 0;
  let mediaBytes = 0;

  try {
    for (const name of fs.readdirSync(MEDIA_DIR)) {
      mediaFiles += 1;
      mediaBytes += fileSize(path.join(MEDIA_DIR, name));
    }
  } catch {}

  const count = (table) =>
    db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;

  res.json({
    checks,
    info: {
      node: process.version,
      uptimeSeconds: Math.round(process.uptime()),
      environment: isProduction ? "production" : "development",
      timezoneOffsetMinutes: ADMIN_TZ_MIN,
      dbBytes,
      mediaFiles,
      mediaBytes,
      mediaTtlHours: Number(process.env.MEDIA_TTL_HOURS || 48),
      rows: {
        users: count("users"),
        purchases: count("purchases"),
        prompts: count("prompt_history"),
        media: count("media_history"),
        favorites: count("favorites"),
        blocked: count("blocked_emails"),
      },
    },
  });
});

// ============================================================
// AI MEDIA STUDIO  (Image + Video generation)
// ============================================================

const MEDIA_DIR = path.join(__dirname, "media");

try {
  fs.mkdirSync(MEDIA_DIR, { recursive: true });
} catch {}

const GENAI_BASE = "https://generativelanguage.googleapis.com/v1beta";

function getImageModel() {
  return process.env.IMAGE_MODEL || "gemini-2.5-flash-image";
}

function getVideoModel() {
  return process.env.VIDEO_MODEL || "veo-3.1-fast-generate-preview";
}

function hasUsableGeminiVideoKey() {
  return hasUsableGeminiKey() && String(process.env.GEMINI_VIDEO_ENABLED || "true").toLowerCase() !== "false";
}

function hasUsablePollinationsKey() {
  const key = process.env.POLLINATIONS_API_KEY || "";
  return key.length > 5;
}

function hasLocalMediaConfig() {
  return Boolean(process.env.COMFYUI_URL);
}

function hasUsableHFToken() {
  return String(process.env.HF_TOKEN || "").trim().startsWith("hf_");
}

function freeOnlyMediaMode() {
  return String(process.env.FREE_ONLY_MEDIA || "true").toLowerCase() !== "false";
}

function mediaEnabled() {
  return hasUsableHFToken() || hasUsablePollinationsKey() || hasLocalMediaConfig() || (!freeOnlyMediaMode() && (hasUsableGeminiKey() || hasUsableGeminiVideoKey()));
}

function mediaProviderLabel() {
  const providers = [];
  if (hasLocalMediaConfig()) providers.push("local-free");
  if (hasUsableHFToken()) providers.push("huggingface-provider");
  if (hasUsablePollinationsKey()) providers.push("pollinations");
  if (!freeOnlyMediaMode() && hasUsableGeminiVideoKey()) providers.push("gemini-veo");
  return providers.join(" → ") || "none";
}

function mediaProviderSummary() {
  return {
    freeMode: freeOnlyMediaMode(),
    local: hasLocalMediaConfig(),
    huggingface: hasUsableHFToken(),
    pollinations: hasUsablePollinationsKey(),
    geminiConfigured: hasUsableGeminiKey(),
    geminiVideoConfigured: hasUsableGeminiVideoKey(),
    gemini: !freeOnlyMediaMode() && hasUsableGeminiVideoKey(),
    label: mediaProviderLabel(),
  };
}


// Provider diagnostics: never spends remote credits. Only checks local ComfyUI reachability.
app.get("/api/media/providers/health", async (req, res) => {
  const result = {
    freeMode: freeOnlyMediaMode(),
    local: { configured: hasLocalMediaConfig(), reachable: false, note: "Not configured" },
    huggingface: { configured: hasUsableHFToken(), reachable: null, note: hasUsableHFToken() ? "Token configured; credit balance is not queried" : "Token not configured" },
    pollinations: { configured: hasUsablePollinationsKey(), reachable: null, note: hasUsablePollinationsKey() ? "Key configured; balance is not queried" : "Key not configured" },
    gemini: { configured: hasUsableGeminiKey(), enabled: !freeOnlyMediaMode() && hasUsableGeminiVideoKey(), reachable: null, note: hasUsableGeminiKey() ? (!freeOnlyMediaMode() ? "API key configured for Veo video" : "Configured but paid media mode is disabled (set FREE_ONLY_MEDIA=false)") : "API key not configured" },
  };

  if (result.local.configured) {
    try {
      const base = String(process.env.COMFYUI_URL).replace(/\/$/, "");
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2500);
      const response = await fetch(`${base}/system_stats`, { signal: controller.signal });
      clearTimeout(timer);
      result.local.reachable = response.ok;
      result.local.note = response.ok ? "ComfyUI is running" : `ComfyUI returned HTTP ${response.status}`;
    } catch (error) {
      result.local.reachable = false;
      result.local.note = "ComfyUI is configured but not reachable. Start ComfyUI.";
    }
  }

  const available = [];
  if (result.local.reachable) available.push("local");
  if (result.huggingface.configured) available.push("huggingface");
  if (result.pollinations.configured) available.push("pollinations");
  if (result.gemini.enabled) available.push("gemini");

  res.json({ ...result, available, recommended: available[0] || null });
});

// Aspect ratio helpers -----------------------------------------

const IMAGE_RATIOS = [
  "1:1",
  "2:3",
  "3:2",
  "3:4",
  "4:3",
  "4:5",
  "5:4",
  "9:16",
  "16:9",
  "21:9",
];

function normalizeRatio(value) {
  // "9:16 Vertical" -> "9:16"
  const match = String(value || "").match(/(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)/);

  if (!match) return "";

  return `${match[1]}:${match[2]}`;
}

function imageAspectRatio(value) {
  const ratio = normalizeRatio(value);

  if (IMAGE_RATIOS.includes(ratio)) return ratio;

  // 2.39:1 and other cinematic ratios fall back to the closest supported one
  if (ratio === "2.39:1") return "21:9";

  return "9:16";
}

function videoAspectRatio(value) {
  const ratio = normalizeRatio(value);

  if (ratio === "9:16" || ratio === "4:5" || ratio === "2:3") return "9:16";

  return "16:9";
}

function videoDuration(value) {
  const seconds = parseInt(String(value || "8"), 10);

  if (!Number.isFinite(seconds)) return 8;

  // Veo currently supports 4, 6 or 8 second clips
  if (seconds <= 4) return 4;
  if (seconds <= 6) return 6;

  return 8;
}

// Media file helpers -------------------------------------------

function extensionForMime(mimeType) {
  const type = String(mimeType || "").toLowerCase();

  if (type.includes("jpeg") || type.includes("jpg")) return "jpg";
  if (type.includes("webp")) return "webp";
  if (type.includes("mp4")) return "mp4";

  return "png";
}

function saveMediaBuffer(buffer, mimeType) {
  const ext = extensionForMime(mimeType);
  const name = `${crypto.randomUUID()}.${ext}`;

  fs.writeFileSync(path.join(MEDIA_DIR, name), buffer);

  return name;
}

function readMediaFile(name) {
  const safe = path.basename(String(name || ""));
  const full = path.join(MEDIA_DIR, safe);

  if (!fs.existsSync(full)) return null;

  return {
    name: safe,
    buffer: fs.readFileSync(full),
  };
}

function recordMedia({ userId, kind, prompt, file, model }) {
  if (!userId) return null;

  try {
    const info = db
      .prepare(
        `
        INSERT INTO media_history
        (user_id, kind, prompt, file, model)
        VALUES(?,?,?,?,?)
        `,
      )
      .run(userId, kind, String(prompt || "").slice(0, 4000), file, model);

    return Number(info.lastInsertRowid);
  } catch (err) {
    console.error("Media history insert failed:", err.message);

    return null;
  }
}

// Old files are removed so the disk does not fill up
function cleanupMedia() {
  const maxAgeMs = Number(process.env.MEDIA_TTL_HOURS || 48) * 3600_000;
  const now = Date.now();

  try {
    for (const name of fs.readdirSync(MEDIA_DIR)) {
      const full = path.join(MEDIA_DIR, name);

      try {
        if (now - fs.statSync(full).mtimeMs > maxAgeMs) fs.unlinkSync(full);
      } catch {}
    }
  } catch {}
}

cleanupMedia();
setInterval(cleanupMedia, 3600_000).unref?.();

// Pollinations + local ComfyUI fallback ------------------------

const POLLINATIONS_BASE = process.env.POLLINATIONS_BASE_URL || "https://gen.pollinations.ai";

function pollinationsHeaders() {
  const key = process.env.POLLINATIONS_API_KEY;
  return key ? { Authorization: `Bearer ${key}` } : {};
}

function imageDimensions(ratio) {
  const map = {
    "1:1": [1024, 1024],
    "2:3": [832, 1248],
    "3:2": [1248, 832],
    "3:4": [896, 1152],
    "4:3": [1152, 896],
    "4:5": [896, 1120],
    "5:4": [1120, 896],
    "9:16": [768, 1365],
    "16:9": [1365, 768],
    "21:9": [1536, 659],
  };
  return map[ratio] || map["9:16"];
}

async function generateImageWithPollinations({ prompt, aspectRatio }) {
  if (!hasUsablePollinationsKey()) throw new Error("Pollinations API key is not configured.");

  const model = process.env.POLLINATIONS_IMAGE_MODEL || "flux";
  const [width, height] = imageDimensions(aspectRatio);
  const url = new URL(`${POLLINATIONS_BASE}/image/${encodeURIComponent(prompt)}`);
  url.searchParams.set("model", model);
  url.searchParams.set("width", String(width));
  url.searchParams.set("height", String(height));
  url.searchParams.set("nologo", "true");

  const response = await fetch(url, {
    headers: pollinationsHeaders(),
    signal: AbortSignal.timeout(Number(process.env.POLLINATIONS_TIMEOUT_MS || 120000)),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Pollinations image failed (${response.status}): ${text.slice(0, 300)}`);
  }

  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    mimeType: response.headers.get("content-type") || "image/jpeg",
    model: `pollinations:${model}`,
  };
}

function localWorkflowPath(kind) {
  return path.resolve(
    __dirname,
    process.env[kind === "image" ? "COMFYUI_IMAGE_WORKFLOW" : "COMFYUI_VIDEO_WORKFLOW"] ||
      `local-workflows/${kind}.json`,
  );
}

function replaceWorkflowPlaceholders(value, replacements) {
  if (typeof value === "string") {
    let out = value;
    for (const [key, replacement] of Object.entries(replacements)) {
      out = out.split(`{{${key}}}`).join(String(replacement ?? ""));
    }
    return out;
  }
  if (Array.isArray(value)) return value.map((item) => replaceWorkflowPlaceholders(item, replacements));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, replaceWorkflowPlaceholders(item, replacements)]),
    );
  }
  return value;
}

async function comfyRequest(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(Number(process.env.COMFYUI_REQUEST_TIMEOUT_MS || 30000)),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`ComfyUI request failed (${response.status}): ${text.slice(0, 500)}`);
  }
  return response;
}

async function generateWithComfyUI({ kind, prompt, aspectRatio, durationSeconds, image }) {
  if (!hasLocalMediaConfig()) throw new Error("Local ComfyUI is not configured.");

  const workflowFile = localWorkflowPath(kind);
  if (!fs.existsSync(workflowFile)) {
    throw new Error(`Local ${kind} workflow not found: ${path.relative(__dirname, workflowFile)}`);
  }

  const workflow = JSON.parse(fs.readFileSync(workflowFile, "utf8"));
  const [width, height] = imageDimensions(aspectRatio);
  const replacements = {
    PROMPT: prompt,
    WIDTH: width,
    HEIGHT: height,
    DURATION: durationSeconds,
    FPS: Number(process.env.LOCAL_VIDEO_FPS || 24),
  };

  if (image?.buffer) {
    const inputDir = process.env.COMFYUI_INPUT_DIR;
    if (!inputDir) throw new Error("COMFYUI_INPUT_DIR is required for local image-to-video fallback.");
    fs.mkdirSync(inputDir, { recursive: true });
    const imageName = `editprompt-${crypto.randomUUID()}.png`;
    fs.writeFileSync(path.join(inputDir, imageName), image.buffer);
    replacements.IMAGE_FILE = imageName;
  }

  const payload = replaceWorkflowPlaceholders(workflow, replacements);
  const base = process.env.COMFYUI_URL.replace(/\/$/, "");
  const clientId = crypto.randomUUID();

  const start = await comfyRequest(`${base}/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: payload, client_id: clientId }),
  });
  const started = await start.json();
  const promptId = started?.prompt_id;
  if (!promptId) throw new Error(started?.error?.message || "ComfyUI did not return a prompt id.");

  const timeoutMs = Number(process.env.LOCAL_MEDIA_TIMEOUT_MS || 20 * 60_000);
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const historyResponse = await comfyRequest(`${base}/history/${encodeURIComponent(promptId)}`);
    const history = await historyResponse.json();
    const record = history?.[promptId];
    if (!record) continue;

    if (record.status?.status_str === "error" || record.status?.completed === false && record.status?.messages?.some?.((m) => String(m).includes("error"))) {
      throw new Error("ComfyUI workflow failed. Check the ComfyUI console for the node error.");
    }

    const outputs = Object.values(record.outputs || {});
    for (const output of outputs) {
      const candidates = [
        ...(output.images || []),
        ...(output.gifs || []),
        ...(output.videos || []),
      ];
      if (!candidates.length) continue;
      const item = candidates[0];
      const view = new URL(`${base}/view`);
      view.searchParams.set("filename", item.filename);
      if (item.subfolder) view.searchParams.set("subfolder", item.subfolder);
      if (item.type) view.searchParams.set("type", item.type);

      const fileResponse = await comfyRequest(view.toString());
      const mime = fileResponse.headers.get("content-type") || (kind === "video" ? "video/mp4" : "image/png");
      return {
        buffer: Buffer.from(await fileResponse.arrayBuffer()),
        mimeType: mime,
        model: `local:comfyui:${kind}`,
      };
    }
  }

  throw new Error(`Local ${kind} generation timed out after ${Math.round(timeoutMs / 60000)} minutes.`);
}

async function generateImageWithHuggingFace({ prompt, aspectRatio }) {
  if (!hasUsableHFToken()) throw new Error("Hugging Face token is not configured.");
  const model = process.env.HF_IMAGE_MODEL || "black-forest-labs/FLUX.1-schnell";
  // The old hf-inference endpoint no longer serves FLUX (HTTP 410). Route through the
  // Inference Providers client instead: "auto" picks a partner provider that hosts the model.
  const provider = String(process.env.HF_IMAGE_PROVIDER || "auto").trim().toLowerCase();

  let InferenceClient;
  try {
    ({ InferenceClient } = await import("@huggingface/inference"));
  } catch {
    throw new Error("Hugging Face image needs the client package. Run: npm install");
  }

  const client = new InferenceClient(process.env.HF_TOKEN);
  let blob;
  try {
    blob = await client.textToImage(
      { provider, model, inputs: prompt },
      { outputType: "blob", signal: AbortSignal.timeout(Number(process.env.HF_TIMEOUT_MS || 180000)) },
    );
  } catch (error) {
    throw new Error(`Hugging Face image failed (provider ${provider}, model ${model}): ${String(error.message || error).slice(0, 500)}`);
  }
  return {
    buffer: Buffer.from(await blob.arrayBuffer()),
    mimeType: blob.type || "image/jpeg",
    model: `huggingface:${provider}:${model}`,
  };
}

async function generateImageWithProviders({ prompt, aspectRatio }) {
  const errors = [];
  // Local ComfyUI is genuinely free when it runs on the user's own machine.
  if (hasLocalMediaConfig()) {
    try { return await generateWithComfyUI({ kind: "image", prompt, aspectRatio }); }
    catch (error) { errors.push(`Local: ${error.message}`); console.error(errors.at(-1)); }
  }
  if (hasUsableHFToken()) {
    try { return await generateImageWithHuggingFace({ prompt, aspectRatio }); }
    catch (error) { errors.push(`Hugging Face: ${error.message}`); console.error(errors.at(-1)); }
  }
  if (!freeOnlyMediaMode() && hasUsablePollinationsKey()) {
    try { return await generateImageWithPollinations({ prompt, aspectRatio }); }
    catch (error) { errors.push(`Pollinations: ${error.message}`); console.error(errors.at(-1)); }
  }
  if (!freeOnlyMediaMode() && hasUsableGeminiKey()) {
    try { return await generateImageWithGemini({ prompt, aspectRatio }); }
    catch (error) { errors.push(`Gemini: ${error.message}`); console.error(errors.at(-1)); }
  }
  throw new Error(errors.join(" | ") || "No image generation provider is configured. Add local ComfyUI or a provider token.");
}

function friendlyVideoProviderError(provider, error) {
  const message = String(error?.message || error || "Unknown error");
  const lower = message.toLowerCase();

  if (provider === "huggingface" && (lower.includes("depleted your monthly included credits") || lower.includes("purchase pre-paid credits") || lower.includes("402"))) {
    return "Hugging Face free video credits are exhausted. No charge was made by EditPrompt. Configure Local ComfyUI for free generation or use a paid video provider.";
  }

  if (provider === "pollinations" && (lower.includes("insufficient balance") || lower.includes("payment_required") || lower.includes("402"))) {
    return "Pollinations balance is 0, so this video request cannot run. Configure Local ComfyUI for free generation or add a funded Pollinations account.";
  }

  if (provider === "gemini" && (lower.includes("quota") || lower.includes("billing") || lower.includes("payment"))) {
    return "Gemini video generation requires an available API quota/billing setup for the selected Veo model.";
  }

  if (provider === "local" && (lower.includes("econnrefused") || lower.includes("fetch failed") || lower.includes("comfyui"))) {
    return "Local ComfyUI is configured but not reachable. Start ComfyUI and verify COMFYUI_URL (default: http://127.0.0.1:8188).";
  }

  return message;
}

async function generateVideoWithHuggingFace({ prompt, durationSeconds, image }) {
  if (!hasUsableHFToken()) throw new Error("Hugging Face token is not configured.");
  const provider = String(process.env.HF_VIDEO_PROVIDER || "").trim().toLowerCase();

  // Hugging Face's own hf-inference has no video. Video runs through partner
  // providers (fal-ai, replicate, novita...) billed to HF credits; "auto" lets HF pick one.
  if (provider === "hf-inference") {
    throw new Error(
      "hf-inference does not offer video generation. Set HF_VIDEO_PROVIDER=auto or fal-ai in .env (uses your Hugging Face credits).",
    );
  }
  const useProvider = provider || "auto";

  let InferenceClient;
  try {
    ({ InferenceClient } = await import("@huggingface/inference"));
  } catch {
    throw new Error("Hugging Face video needs the client package. Run: npm install");
  }

  const client = new InferenceClient(process.env.HF_TOKEN);
  const signal = AbortSignal.timeout(Number(process.env.HF_VIDEO_TIMEOUT_MS || 900000));
  let blob, model;

  if (image && image.data) {
    // Animate Image: start from the picture the user already generated.
    model = process.env.HF_I2V_MODEL || "Wan-AI/Wan2.1-I2V-14B-720P";
    const imageBlob = new Blob([Buffer.from(image.data, "base64")], { type: image.mimeType || "image/png" });
    blob = await client.imageToVideo(
      { provider: useProvider, model, inputs: imageBlob, parameters: { prompt } },
      { signal },
    );
  } else {
    model = process.env.HF_VIDEO_MODEL || "Wan-AI/Wan2.2-TI2V-5B";
    blob = await client.textToVideo({ provider: useProvider, model, inputs: prompt }, { signal });
  }

  return {
    buffer: Buffer.from(await blob.arrayBuffer()),
    mimeType: blob.type || "video/mp4",
    model: `huggingface:${useProvider}:${model}`,
  };
}

async function generateVideoWithPollinations({ prompt, durationSeconds }) {
  if (!hasUsablePollinationsKey()) throw new Error("Pollinations API key is not configured.");
  const model = process.env.POLLINATIONS_VIDEO_MODEL || "veo";
  const url = new URL(`${POLLINATIONS_BASE}/video/${encodeURIComponent(prompt)}`);
  url.searchParams.set("model", model);
  url.searchParams.set("duration", String(durationSeconds));
  const response = await fetch(url, { headers: pollinationsHeaders(), signal: AbortSignal.timeout(Number(process.env.POLLINATIONS_VIDEO_TIMEOUT_MS || 15 * 60_000)) });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Pollinations video failed (${response.status}): ${text.slice(0, 300)}`);
  }
  return { buffer: Buffer.from(await response.arrayBuffer()), mimeType: response.headers.get("content-type") || "video/mp4", model: `pollinations:${model}` };
}

// Gemini image generation --------------------------------------

async function generateImageWithGemini({ prompt, aspectRatio }) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) throw new Error("Gemini API key is missing.");

  // If the configured model is unavailable on this key, try known alternatives
  const candidates = [
    getImageModel(),
    "gemini-2.5-flash-image",
    "gemini-2.0-flash-preview-image-generation",
  ].filter((model, index, list) => model && list.indexOf(model) === index);

  let lastError = "Image generation failed.";

  for (const model of candidates) {
    const response = await fetch(
      `${GENAI_BASE}/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },

        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: prompt }],
            },
          ],

          generationConfig: {
            responseModalities: ["IMAGE"],
            imageConfig: { aspectRatio },
          },
        }),
      },
    );

    const data = await response.json();

    if (!response.ok) {
      lastError = data?.error?.message || "Image generation failed.";

      console.error(`Image model ${model} failed:`, lastError);

      // Only keep trying when the model itself is the problem
      if (response.status === 404 || response.status === 400) continue;

      throw new Error(lastError);
    }

    const parts = data?.candidates?.[0]?.content?.parts || [];
    const imagePart = parts.find((part) => part.inlineData?.data);

    if (!imagePart) {
      lastError =
        data?.promptFeedback?.blockReason
          ? "The prompt was blocked by safety filters. Try rewording it."
          : "The model returned no image.";

      continue;
    }

    return {
      buffer: Buffer.from(imagePart.inlineData.data, "base64"),
      mimeType: imagePart.inlineData.mimeType || "image/png",
      model,
    };
  }

  throw new Error(lastError);
}

// Veo video generation -----------------------------------------

async function startVideoJob({ prompt, aspectRatio, durationSeconds, image }) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) throw new Error("Gemini API key is missing.");

  const model = getVideoModel();

  const instance = { prompt };

  if (image?.data) {
    instance.image = {
      inlineData: {
        mimeType: image.mimeType || "image/png",
        data: image.data,
      },
    };
  }

  const response = await fetch(
    `${GENAI_BASE}/models/${encodeURIComponent(model)}:predictLongRunning`,
    {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },

      body: JSON.stringify({
        instances: [instance],

        parameters: {
          aspectRatio,
          durationSeconds,
          resolution: process.env.VEO_RESOLUTION || "720p",
          numberOfVideos: 1,

          personGeneration:
            process.env.VEO_PERSON_GENERATION ||
            (image?.data ? "allow_adult" : "allow_all"),
        },
      }),
    },
  );

  const data = await response.json();

  if (!response.ok || !data?.name) {
    const message = data?.error?.message || "Could not start video generation.";

    console.error("Veo start failed:", message);

    throw new Error(message);
  }

  return { operationName: data.name, model };
}

async function pollVideoJob(operationName) {
  const apiKey = process.env.GEMINI_API_KEY;

  const response = await fetch(`${GENAI_BASE}/${operationName}`, {
    headers: { "x-goog-api-key": apiKey },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.error?.message || "Could not check video status.");
  }

  if (!data.done) return { done: false };

  if (data.error) {
    throw new Error(data.error.message || "Video generation failed.");
  }

  const sample =
    data?.response?.generateVideoResponse?.generatedSamples?.[0] ||
    data?.response?.generatedSamples?.[0];

  const uri = sample?.video?.uri;

  const inline = sample?.video?.videoBytes || sample?.video?.inlineData?.data;

  if (inline) {
    return { done: true, buffer: Buffer.from(inline, "base64") };
  }

  if (!uri) {
    throw new Error(
      "Video generation finished but no file was returned. It may have been blocked by safety filters.",
    );
  }

  const fileResponse = await fetch(uri, {
    headers: { "x-goog-api-key": apiKey },
    redirect: "follow",
  });

  if (!fileResponse.ok) {
    throw new Error("Could not download the generated video.");
  }

  return {
    done: true,
    buffer: Buffer.from(await fileResponse.arrayBuffer()),
  };
}

// Persistent video jobs: SQLite survives a server restart.
const videoJobs = new Map();

function persistVideoJob(job) {
  const now = Date.now();
  db.prepare(`INSERT INTO video_jobs
    (id,user_id,status,prompt,provider,model,aspect_ratio,duration_seconds,fps,camera_motion,motion_strength,from_image,image_json,file,error,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET status=excluded.status,model=excluded.model,file=excluded.file,error=excluded.error,updated_at=excluded.updated_at`).run(
      job.id,job.userId,job.status||'pending',job.prompt,job.provider||'auto',job.model||'',job.aspectRatio||'16:9',job.durationSeconds||8,job.fps||24,job.cameraMotion||'Natural',job.motionStrength||'Medium',job.fromImage?1:0,job.image?JSON.stringify(job.image):null,job.file||null,job.error||null,job.createdAt||now,now);
}

function loadVideoJob(id) {
  const r=db.prepare('SELECT * FROM video_jobs WHERE id=?').get(id); if(!r)return null;
  const job={id:r.id,userId:r.user_id,status:r.status,prompt:r.prompt,provider:r.provider,model:r.model,aspectRatio:r.aspect_ratio,durationSeconds:r.duration_seconds,fps:r.fps,cameraMotion:r.camera_motion,motionStrength:r.motion_strength,fromImage:Boolean(r.from_image),image:r.image_json?JSON.parse(r.image_json):null,file:r.file,error:r.error,createdAt:r.created_at,updatedAt:r.updated_at};
  videoJobs.set(id,job); return job;
}

function pruneVideoJobs() {
  const cutoff=Date.now()-48*3600_000;
  db.prepare('DELETE FROM video_jobs WHERE updated_at < ?').run(cutoff);
  for(const [id,job] of videoJobs) if(job.updatedAt<cutoff) videoJobs.delete(id);
}

// ============================================================
// MEDIA ROUTES
// ============================================================

// Serve generated files
app.get("/api/media/file/:name", (req, res) => {
  const file = readMediaFile(req.params.name);

  if (!file) {
    return res.status(404).json({ error: "File not found or expired." });
  }

  const ext = path.extname(file.name).slice(1).toLowerCase();

  const mime =
    ext === "mp4"
      ? "video/mp4"
      : ext === "jpg"
        ? "image/jpeg"
        : ext === "webp"
          ? "image/webp"
          : "image/png";

  res.setHeader("Content-Type", mime);
  res.setHeader("Cache-Control", "private, max-age=86400");

  if (req.query.download) {
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="editprompt-${file.name}"`,
    );
  }

  res.send(file.buffer);
});

// ---------------- AUTO PROMPT ----------------
// If a request arrives with no prompt (or only a word or two), the server
// still produces a good one so image / video generation always works.

const DEFAULT_MEDIA_PROMPTS = [
  "A cinematic character walking through a rain-lit city street at night, neon reflections on wet pavement, shallow depth of field, slow push-in camera, moody film look",
  "A luxury product rotating on a polished marble pedestal, soft golden studio lighting, crisp reflections, premium commercial advertisement style",
  "A sweeping aerial shot over misty green mountains at sunrise, golden light breaking through clouds, ultra-detailed, calm and majestic atmosphere",
  "A beautiful Indian wedding couple sharing a quiet moment under warm festival lights, soft bokeh, romantic cinematic colour grade",
  "A futuristic city skyline at dusk with flying vehicles and glowing neon signs, rich atmosphere, wide cinematic frame",
  "A close-up of steaming masala chai being poured into a glass cup on a rainy window sill, cosy warm lighting, shallow depth of field",
];

function mediaPromptOrDefault(raw) {
  const text = String(raw || "").trim();

  if (text.length >= 10) return text;

  if (!text) {
    return DEFAULT_MEDIA_PROMPTS[
      Math.floor(Math.random() * DEFAULT_MEDIA_PROMPTS.length)
    ];
  }

  return `A cinematic, highly detailed shot of ${text}, dramatic lighting, shallow depth of field, professional colour grading`;
}

// ---------------- IMAGE ----------------

app.post(
  "/api/media/image",

  requireLogin,

  rateLimit({
    windowMs: 300_000,
    max: 12,

    message: "Image generation limit reached. Please wait a few minutes.",
  }),

  async (req, res) => {
    if (!mediaEnabled()) {
      return res.status(503).json({
        error: "Media generation is not configured on this server.",
      });
    }

    // An empty or very short prompt never blocks generation.
    const prompt = mediaPromptOrDefault(req.body?.prompt);

    if (prompt.length > 8000) {
      return res.status(400).json({ error: "Prompt is too long." });
    }

    const aspectRatio = imageAspectRatio(req.body?.ratio);

    try {
      const result = await generateImageWithProviders({ prompt, aspectRatio });

      const file = saveMediaBuffer(result.buffer, result.mimeType);

      recordMedia({
        userId: req.session.userId,
        kind: "image",
        prompt,
        file,
        model: result.model,
      });

      res.json({
        kind: "image",
        file,
        url: `/api/media/file/${file}`,
        downloadUrl: `/api/media/file/${file}?download=1`,
        aspectRatio,
        model: result.model,
      });
    } catch (error) {
      console.error("Image generation error:", error.message);

      res.status(502).json({
        error: error.message || "Image generation failed.",
      });
    }
  },
);

// ---------------- VIDEO (start) ----------------

app.post(
  "/api/media/video",

  requireLogin,

  rateLimit({
    windowMs: 600_000,
    max: 6,

    message: "Video generation limit reached. Please wait a few minutes.",
  }),

  async (req, res) => {
    if (!mediaEnabled()) {
      return res.status(503).json({
        error: "Media generation is not configured on this server.",
      });
    }

    // An empty or very short prompt never blocks generation.
    const prompt = mediaPromptOrDefault(req.body?.prompt);

    if (prompt.length > 8000) {
      return res.status(400).json({ error: "Prompt is too long." });
    }

    const aspectRatio = videoAspectRatio(req.body?.ratio);
    const durationSeconds = videoDuration(req.body?.duration);
    const fps = [24,30,60].includes(Number(req.body?.fps)) ? Number(req.body.fps) : 24;
    const cameraMotion = String(req.body?.cameraMotion || 'Natural').slice(0,40);
    const motionStrength = String(req.body?.motionStrength || 'Medium').slice(0,20);

    // Optional starting frame: an image created earlier in this flow
    let image = null;

    if (req.body?.imageFile) {
      const source = readMediaFile(req.body.imageFile);

      if (!source) {
        return res.status(400).json({
          error: "That image has expired. Generate the image again.",
        });
      }

      const ext = path.extname(source.name).slice(1).toLowerCase();

      image = {
        data: source.buffer.toString("base64"),

        mimeType:
          ext === "jpg"
            ? "image/jpeg"
            : ext === "webp"
              ? "image/webp"
              : "image/png",
      };
    }

    try {
      pruneVideoJobs();
      const jobId = crypto.randomUUID();

      const job = { id: jobId, provider: "auto",
        prompt: `${prompt}\nCamera motion: ${cameraMotion}. Motion strength: ${motionStrength}. FPS: ${fps}.`,
        userId: req.session.userId, createdAt: Date.now(), updatedAt: Date.now(), status: "pending",
        file: null, model: "", error: null, fromImage: Boolean(image), aspectRatio, durationSeconds, fps,
        cameraMotion, motionStrength, image };
      videoJobs.set(jobId, job);
      persistVideoJob(job);

      res.json({
        jobId,
        status: "pending",
        aspectRatio,
        durationSeconds,
        fps,
        cameraMotion,
        motionStrength,
        model: mediaProviderLabel(),
        estimatedSeconds: image ? 150 : 120,
      });
    } catch (error) {
      console.error("Video start error:", error.message);

      res.status(502).json({
        error: error.message || "Could not start video generation.",
      });
    }
  },
);

// ---------------- VIDEO (status) ----------------

app.get("/api/media/video/:jobId", requireLogin, async (req, res) => {
  const job = videoJobs.get(req.params.jobId) || loadVideoJob(req.params.jobId);

  if (!job || job.userId !== req.session.userId) {
    return res.status(404).json({ error: "Job not found." });
  }

  if (job.file) {
    return res.json({
      status: "done",
      kind: "video",
      model: job.model || "unknown",
      provider: job.provider || "auto",
      file: job.file,
      url: `/api/media/file/${job.file}`,
      downloadUrl: `/api/media/file/${job.file}?download=1`,
    });
  }

  if (job.error) {
    return res.status(502).json({ status: "failed", error: job.error, model: job.model || "unknown" });
  }

  try {
    // Gemini/Veo is an asynchronous provider. Once started, poll the same
    // operation instead of submitting a new paid request on every frontend poll.
    if (job.provider === "gemini" && job.operationName) {
      const operation = await pollVideoJob(job.operationName);
      if (!operation.done) {
        job.status = "processing";
        job.updatedAt = Date.now();
        persistVideoJob(job);
        return res.json({
          status: "processing",
          provider: "gemini",
          model: job.model || getVideoModel(),
        });
      }

      const file = saveMediaBuffer(operation.buffer, "video/mp4");
      job.file = file;
      job.status = "done";
      job.updatedAt = Date.now();
      persistVideoJob(job);
      recordMedia({ userId: job.userId, kind: job.fromImage ? "image-to-video" : "video", prompt: job.prompt, file, model: job.model || getVideoModel() });
      return res.json({
        status: "done",
        kind: "video",
        model: job.model || getVideoModel(),
        provider: "gemini",
        file,
        url: `/api/media/file/${file}`,
        downloadUrl: `/api/media/file/${file}?download=1`,
      });
    }

    // Provider router: Gemini Veo first when explicitly enabled, then local,
    // Hugging Face, and Pollinations. Failed/empty-credit providers are caught
    // so another configured provider can be tried automatically.
    let result;
    let model;
    const errors = [];

    if (!freeOnlyMediaMode() && hasUsableGeminiVideoKey()) {
      try {
        const started = await startVideoJob({
          prompt: job.prompt,
          aspectRatio: job.aspectRatio,
          durationSeconds: job.durationSeconds,
          image: job.image,
        });
        job.provider = "gemini";
        job.operationName = started.operationName;
        job.model = started.model;
        job.status = "processing";
        job.updatedAt = Date.now();
        persistVideoJob(job);
        return res.json({ status: "processing", provider: "gemini", model: started.model });
      } catch (error) {
        errors.push(`Gemini: ${friendlyVideoProviderError("gemini", error)}`);
      }
    }

    if (hasLocalMediaConfig()) {
      try {
        result = await generateWithComfyUI({ kind: "video", prompt: job.prompt, aspectRatio: job.aspectRatio, durationSeconds: job.durationSeconds, image: job.image });
        model = result.model;
        job.provider = "local";
      } catch (error) {
        errors.push(`Local: ${friendlyVideoProviderError("local", error)}`);
      }
    }

    if (!result && hasUsableHFToken()) {
      try {
        result = await generateVideoWithHuggingFace({ prompt: job.prompt, durationSeconds: job.durationSeconds, image: job.image });
        model = result.model;
        job.provider = "huggingface";
      } catch (error) {
        errors.push(`Hugging Face: ${friendlyVideoProviderError("huggingface", error)}`);
      }
    }

    if (!result && !freeOnlyMediaMode() && hasUsablePollinationsKey()) {
      try {
        result = await generateVideoWithPollinations({ prompt: job.prompt, durationSeconds: job.durationSeconds });
        model = result.model;
        job.provider = "pollinations";
      } catch (error) {
        errors.push(`Pollinations: ${friendlyVideoProviderError("pollinations", error)}`);
      }
    }

    if (!result) {
      throw new Error(
        errors.join(" | ") ||
        "No video provider is currently available. For ₹0-cost generation, start Local ComfyUI with a compatible video workflow. Remote providers may require credits or billing."
      );
    }

    const file = saveMediaBuffer(result.buffer, result.mimeType || "video/mp4");
    job.file = file;
    job.model = model || result.model || "unknown";
    job.status = "done";
    job.updatedAt = Date.now();
    persistVideoJob(job);

    recordMedia({
      userId: job.userId,
      kind: job.fromImage ? "image-to-video" : "video",
      prompt: job.prompt,
      file,
      model: job.model,
    });

    res.json({
      status: "done",
      kind: "video",
      file,
      model: job.model,
      provider: job.provider || "auto",
      url: `/api/media/file/${file}`,
      downloadUrl: `/api/media/file/${file}?download=1`,
    });
  } catch (error) {
    console.error("Video poll error:", error.message);

    job.error = error.message || "Video generation failed.";
    job.status = "failed";
    job.updatedAt = Date.now();
    persistVideoJob(job);

    res.status(502).json({ status: "failed", error: job.error });
  }
});

// ---------------- MEDIA HISTORY ----------------

app.get("/api/media/history", requireLogin, (req, res) => {
  const rows = db
    .prepare(
      `
      SELECT id, kind, prompt, file, model, created_at
      FROM media_history
      WHERE user_id = ?
      ORDER BY id DESC
      LIMIT 24
      `,
    )
    .all(req.session.userId);

  const items = rows
    .filter((row) => fs.existsSync(path.join(MEDIA_DIR, row.file)))
    .map((row) => ({
      ...row,
      url: `/api/media/file/${row.file}`,
      downloadUrl: `/api/media/file/${row.file}?download=1`,
    }));

  res.json({ items });
});

// ============================================================
// FRONTEND FALLBACK
// ============================================================

pro.mount({ app, requireAdmin, logAdmin, products, razorpayKeys, razorpayReady, mailer });

mountSoftwareDownloads(app);

app.get("/admin", (req, res) => {
  res.set("X-Robots-Tag", "noindex, nofollow");
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

app.get("*", (req, res) =>
  res.sendFile(path.join(__dirname, "public", "index.html")),
);

// ============================================================
// SERVER
// ============================================================

const port = Number(process.env.PORT || 3000);

if (mailer && String(process.env.SMTP_VERIFY_ON_START || "true").toLowerCase() !== "false") {
  mailer.verify().then(() => {
    console.log("SMTP connection: OK");
  }).catch((error) => {
    console.error("SMTP connection: FAILED:", error.message);
  });
}

app.listen(port, () => {
  console.log(`EditPrompt V7 running at http://localhost:${port}`);

  console.log(`AI Provider: Gemini`);

  console.log(`AI Model: ${getGeminiModel()}`);

  console.log(
    `AI Status: ${
      hasUsableGeminiKey() ? "Gemini API configured" : "Local fallback"
    }`,
  );
});
