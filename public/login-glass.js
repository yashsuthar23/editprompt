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
