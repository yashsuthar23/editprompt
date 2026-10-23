// Mobile number login with Firebase Phone Auth.
// Firebase sends the SMS and checks the code. The server then verifies the
// Firebase ID token and starts the normal EditPrompt session.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth,
  RecaptchaVerifier,
  signInWithPhoneNumber,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

// These values are public (they are shipped to every browser).
const firebaseConfig = {
  apiKey: "AIzaSyBwaeGvt0K_jrqG9Z7VHxeL2K3imgfLWR0",
  authDomain: "editprompt-cd906.firebaseapp.com",
  projectId: "editprompt-cd906",
  storageBucket: "editprompt-cd906.firebasestorage.app",
  messagingSenderId: "161524027792",
  appId: "1:161524027792:web:dea20ffddb9d0eb8112315",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

let confirmation = null;
let verifier = null;
let pendingPhone = "";
let pendingName = "";

const $ = (id) => document.getElementById(id);

function say(message) {
  if (typeof window.toast === "function") window.toast(message);
  else alert(message);
}

// "98765 43210", "09876543210" -> +919876543210. Full +CC numbers also accepted.
function toE164(raw) {
  const cleaned = String(raw || "").replace(/[\s\-().]/g, "");
  if (!cleaned) return null;
  if (/^\+\d{8,15}$/.test(cleaned)) return cleaned;
  const local = cleaned.replace(/^0+/, "");
  if (/^[6-9]\d{9}$/.test(local)) return `+91${local}`;
  return null;
}

function maskPhone(phone) {
  return `•••••• ${phone.slice(-4)}`;
}

function friendlyError(err) {
  const code = err?.code || "";
  const map = {
    "auth/invalid-phone-number": "Mobile number is not valid.",
    "auth/too-many-requests": "Too many attempts. Please try again later.",
    "auth/quota-exceeded": "SMS limit reached for now. Please try later.",
    "auth/invalid-verification-code": "Wrong code. Please check and try again.",
    "auth/code-expired": "Code expired. Please request a new one.",
    "auth/operation-not-allowed": "Mobile login is not enabled yet. Use email.",
    "auth/unauthorized-domain": "This site domain is not allowed in Firebase.",
    "auth/missing-verification-code": "Enter the 6-digit code.",
  };
  return map[code] || err?.message || "Something went wrong. Please try again.";
}

function showStep(step) {
  // step: "email" | "phone1" | "phone2"
  $("loginStep1")?.classList.toggle("hide", step !== "email");
  $("loginStep2")?.classList.add("hide");
  $("phoneStep1")?.classList.toggle("hide", step !== "phone1");
  $("phoneStep2")?.classList.toggle("hide", step !== "phone2");
}

function resetPhoneForm() {
  confirmation = null;
  pendingPhone = "";
  pendingName = "";
  if ($("phoneOtp")) $("phoneOtp").value = "";
  showStep("email");
}

function getVerifier() {
  if (!verifier) {
    // Empty the container first: a leftover reCAPTCHA widget makes Firebase refuse
    // to render a second one ("reCAPTCHA has already been rendered in this element").
    const container = $("recaptchaContainer");
    if (container) container.innerHTML = "";

    verifier = new RecaptchaVerifier(auth, "recaptchaContainer", {
      size: "invisible",
    });
  }
  return verifier;
}

function resetVerifier() {
  try {
    verifier?.clear();
  } catch {}
  verifier = null;

  const container = $("recaptchaContainer");
  if (container) container.innerHTML = "";
}

async function sendPhoneCode(resend = false) {
  if (!resend) {
    pendingName = $("phoneName")?.value.trim() || "";

    const phone = toE164($("phoneNumber")?.value);

    if (!phone) {
      return say("Enter a valid mobile number, e.g. 98765 43210");
    }

    pendingPhone = phone;
  }

  const button = $(resend ? "resendPhoneCodeBtn" : "sendPhoneCodeBtn");

  if (button) button.disabled = true;

  try {
    confirmation = await signInWithPhoneNumber(
      auth,
      pendingPhone,
      getVerifier(),
    );

    showStep("phone2");

    if ($("phoneHint")) {
      $("phoneHint").textContent = `Code sent to ${maskPhone(pendingPhone)}`;
    }

    if ($("phoneOtp")) {
      $("phoneOtp").value = "";
      $("phoneOtp").focus();
    }

    say(resend ? "Code resent" : "Code sent");
  } catch (err) {
    console.error("[phone] send failed:", err);
    resetVerifier();
    say(friendlyError(err));
  } finally {
    if (button) button.disabled = false;
  }
}

async function verifyPhoneCode() {
  const code = $("phoneOtp")?.value.trim() || "";

  if (!/^\d{6}$/.test(code)) {
    return say("Enter the 6-digit code");
  }

  if (!confirmation) {
    return say("Please request a new code first");
  }

  const button = $("verifyPhoneCodeBtn");

  if (button) button.disabled = true;

  try {
    const credential = await confirmation.confirm(code);

    const idToken = await credential.user.getIdToken();

    await window.apiRequest("/api/auth/firebase-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken, name: pendingName }),
    });

    // Our own session cookie is used from here; drop the Firebase browser session.
    await auth.signOut();

    resetVerifier();
    resetPhoneForm();

    window.closeLoginModal?.();
    await window.refreshUser?.();

    say("Logged in ✓");
  } catch (err) {
    console.error("[phone] verify failed:", err);
    say(friendlyError(err));
  } finally {
    if (button) button.disabled = false;
  }
}

$("showPhoneLoginBtn")?.addEventListener("click", () => showStep("phone1"));

$("backToEmailBtn")?.addEventListener("click", () => {
  resetVerifier();
  resetPhoneForm();
});

$("sendPhoneCodeBtn")?.addEventListener("click", () => sendPhoneCode(false));

$("resendPhoneCodeBtn")?.addEventListener("click", () => sendPhoneCode(true));

$("verifyPhoneCodeBtn")?.addEventListener("click", verifyPhoneCode);

$("phoneOtp")?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") verifyPhoneCode();
});

// Start clean every time the login popup is closed.
$("closeLogin")?.addEventListener("click", () => {
  setTimeout(() => {
    resetVerifier();
    resetPhoneForm();
  }, 0);
});