/* Login card helpers: Log in / Sign up switch, password field (eye + strength meter), Support form. */
(function () {
  function $(id) { return document.getElementById(id); }

  var COPY = {
    "login-password": ["Welcome back", "Sign in with your email and password."],
    "login-code":     ["Welcome back", "We'll email you a 6-digit code \u2014 no password needed."],
    "signup":         ["Create your account", "Join EditPrompt in seconds \u2014 create a password, then verify your email."]
  };
  var METHOD_LABEL = { password: "Email me a code instead", code: "Use password instead" };

  function card() { return $("loginCard"); }
  function copyKey(c) { return c.dataset.mode === "signup" ? "signup" : "login-" + (c.dataset.method || "password"); }

  function render(c, animate) {
    var key = copyKey(c);
    var title = $("lgTitleText");
    var sub = $("lgSubText");
    var apply = function () {
      if (title) { title.textContent = COPY[key][0]; title.classList.remove("is-swap"); }
      if (sub) { sub.textContent = COPY[key][1]; sub.classList.remove("is-swap"); }
    };
    if (!animate) return apply();
    if (title) title.classList.add("is-swap");
    if (sub) sub.classList.add("is-swap");
    setTimeout(apply, 150);

    var pw = $("password");
    if (pw) pw.setAttribute("autocomplete", c.dataset.mode === "signup" ? "new-password" : "current-password");
    var mb = $("lgMethodBtn");
    if (mb) mb.textContent = METHOD_LABEL[c.dataset.method || "password"];
  }

  function resetPassword() {
    var pw = $("password");
    if (pw) { pw.value = ""; pw.type = "password"; }
    var eye = $("lgEyeBtn");
    if (eye) { eye.setAttribute("aria-pressed", "false"); eye.setAttribute("aria-label", "Show password"); }
    updateMeter();
  }

  function setMode(mode) {
    var c = card();
    if (!c || (mode !== "login" && mode !== "signup") || c.dataset.mode === mode) return;
    c.dataset.mode = mode;
    c.querySelectorAll(".lg-tab").forEach(function (t) {
      t.setAttribute("aria-selected", t.dataset.mode === mode ? "true" : "false");
    });
    resetPassword();
    render(c, true);
  }
  window.epSetLoginMode = setMode;

  function setMethod(method) {
    var c = card();
    if (!c || (method !== "password" && method !== "code") || c.dataset.method === method) return;
    c.dataset.method = method;
    resetPassword();
    render(c, true);
  }
  window.epSetLoginMethod = setMethod;

  /* ---- password strength (shown while signing up) ---- */
  var LEVELS = ["", "Weak", "Fair", "Good", "Strong"];
  function strength(p) {
    if (!p) return 0;
    var score = 0;
    if (p.length >= 8) score++;
    if (p.length >= 12) score++;
    if (/[a-z]/.test(p) && /[A-Z]/.test(p)) score++;
    if (/\d/.test(p)) score++;
    if (/[^A-Za-z0-9]/.test(p)) score++;
    if (p.length < 8) return 1;
    return Math.min(4, Math.max(2, score - 1));
  }
  function updateMeter() {
    var m = $("lgMeter"), t = $("lgMeterText"), pw = $("password");
    if (!m || !pw) return;
    var lvl = strength(pw.value);
    m.setAttribute("data-level", String(lvl));
    if (t) t.textContent = LEVELS[lvl];
  }
  document.addEventListener("input", function (e) {
    if (e.target && e.target.id === "password") updateMeter();
  });

  /* ---- clicks: tabs, inline links, eye, method switch ---- */
  document.addEventListener("click", function (e) {
    var t = e.target.closest && e.target.closest("[data-mode]:not(#loginCard)");
    if (t && t.closest("#loginCard")) { setMode(t.dataset.mode); return; }

    if (e.target.closest && e.target.closest("#lgMethodBtn")) {
      var c = card();
      if (c) setMethod(c.dataset.method === "password" ? "code" : "password");
      return;
    }

    var eye = e.target.closest && e.target.closest("#lgEyeBtn");
    if (eye) {
      var pw = $("password");
      if (!pw) return;
      var show = pw.type === "password";
      pw.type = show ? "text" : "password";
      eye.setAttribute("aria-pressed", show ? "true" : "false");
      eye.setAttribute("aria-label", show ? "Hide password" : "Show password");
      pw.focus();
    }
  });

/* ---- Support: send a login / sign-up problem to the admin (shows in Admin > Notifications) ---- */
  function show(id, on) { var el = $(id); if (el) el.classList.toggle("hide", !on); }

  function openSupport() {
    ["loginStep1", "loginStep2", "loginStepAdmin"].forEach(function (id) { show(id, false); });
    show("loginStepSupport", true);
    var status = $("supStatus"); if (status) { status.textContent = ""; status.removeAttribute("data-state"); }
    if ($("supName") && !$("supName").value) $("supName").value = ($("name") && $("name").value) || "";
    if ($("supEmail") && !$("supEmail").value) $("supEmail").value = ($("email") && $("email").value) || "";
    var note = $("supNote");
    if (note) {
      if (window.epLastLoginError) {
        note.hidden = false;
        note.textContent = "We'll also send the error you saw: \u201C" + window.epLastLoginError + "\u201D";
      } else {
        note.hidden = true;
      }
    }
  }

  function closeSupport() {
    show("loginStepSupport", false);
    show("loginStep1", true);
  }

  function sendSupport() {
    var name = ($("supName").value || "").trim();
    var email = ($("supEmail").value || "").trim();
    var msg = ($("supMsg").value || "").trim();
    var status = $("supStatus");
    function say(t, state) { status.textContent = t; status.setAttribute("data-state", state || ""); }

    if (!name) return say("Please enter your name.", "err");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return say("Please enter a valid email address.", "err");
    if (msg.length < 10) return say("Please write a little more detail (at least 10 characters).", "err");

    var card = $("loginCard");
    var details = "[Login / Sign-up help]\n" + msg +
      "\n\n---\nMode: " + ((card && card.dataset.mode) || "login") +
      "\nLast error: " + (window.epLastLoginError || "none") +
      "\nPage: " + location.pathname +
      "\nBrowser: " + String(navigator.userAgent || "").slice(0, 140);

    var btn = $("supSendBtn");
    btn.disabled = true; say("Sending\u2026");

    fetch("/api/contact", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name, email: email, topic: "Account", message: details.slice(0, 1990) })
    })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (d) {
          if (!r.ok) throw new Error(d.error || "Could not send. Please try again.");
        });
      })
      .then(function () {
        $("supMsg").value = "";
        say("Thanks! Our admin has been notified and will reply by email.", "ok");
      })
      .catch(function (err) { say(err.message, "err"); })
      .then(function () { btn.disabled = false; });
  }

  document.addEventListener("click", function (e) {
    var t = e.target;
    if (!t.closest) return;
    if (t.closest("#lgSupportLink")) { e.preventDefault(); openSupport(); }
    else if (t.closest("#supBackBtn")) closeSupport();
    else if (t.closest("#supSendBtn")) sendSupport();
  });

  document.addEventListener("keydown", function (e) {
    if (e.key !== "Enter") return;
    var id = e.target && e.target.id;
    if (id === "name" || id === "email") {
      e.preventDefault();
      var c = card();
      var passOpen = c && (c.dataset.mode === "signup" || c.dataset.method === "password");
      if (id === "email" && passOpen) { var p = $("password"); if (p) p.focus(); return; }
      if (id === "name") { var em = $("email"); if (em) em.focus(); return; }
      var go = $("sendOtpBtn");
      if (go && !go.disabled) go.click();
    } else if (id === "password") {
      e.preventDefault();
      var pg = $("passGoBtn");
      if (pg && !pg.disabled) pg.click();
    }
  });
})();
