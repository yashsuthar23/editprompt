/* Login card helpers: Log in / Sign up switch (with animation) and Enter key. */
(function () {
  var COPY = {
    login:  ["Welcome back", "Sign in to your account \u2014 we'll email you a 6-digit code, no password needed."],
    signup: ["Create your account", "Join EditPrompt in seconds \u2014 we'll email you a 6-digit code to verify."]
  };

  function setMode(mode) {
    var card = document.getElementById("loginCard");
    if (!card || (mode !== "login" && mode !== "signup") || card.dataset.mode === mode) return;
    card.dataset.mode = mode;

    card.querySelectorAll(".lg-tab").forEach(function (t) {
      t.setAttribute("aria-selected", t.dataset.mode === mode ? "true" : "false");
    });

    var title = document.getElementById("lgTitleText");
    var sub = document.getElementById("lgSubText");
    if (title) title.classList.add("is-swap");
    if (sub) sub.classList.add("is-swap");
    setTimeout(function () {
      if (title) { title.textContent = COPY[mode][0]; title.classList.remove("is-swap"); }
      if (sub) { sub.textContent = COPY[mode][1]; sub.classList.remove("is-swap"); }
    }, 150);
  }
  window.epSetLoginMode = setMode;

  document.addEventListener("click", function (e) {
    var t = e.target.closest && e.target.closest("[data-mode]");
    if (t && t.closest("#loginCard")) setMode(t.dataset.mode);
  });

  /* ---- Support: send a login / sign-up problem to the admin (shows in Admin > Notifications) ---- */
  function $(id) { return document.getElementById(id); }
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
      var go = document.getElementById("sendOtpBtn");
      if (go && !go.disabled) go.click();
    }
  });
})();
