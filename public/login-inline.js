/* Opens the EditPrompt login popup on the CURRENT page (no redirect to the homepage).
   Used by pages that do not already ship the login modal (settings, contact, terms, software, ...). */
(function () {
  var loaded = null;

  function loadModal() {
    if (loaded) return loaded;
    loaded = fetch("/login-modal.html", { credentials: "same-origin" })
      .then(function (r) { return r.text(); })
      .then(function (html) {
        if (!document.getElementById("loginModal")) {
          var wrap = document.createElement("div");
          wrap.innerHTML = html.trim();
          document.body.appendChild(wrap.firstElementChild);
        }
        return new Promise(function (resolve, reject) {
          var s = document.createElement("script");
          s.src = "/app.js";
          s.onload = resolve;
          s.onerror = reject;
          document.body.appendChild(s);
        });
      });
    return loaded;
  }

  function openLogin() {
    loadModal().then(function () {
      if (typeof window.openLoginModal === "function") window.openLoginModal();
      watchForLogin();
    }).catch(function () { location.href = "/?login=1"; });
  }

  /* When the popup closes after a successful sign-in, refresh this page so the
     navbar and account details show the signed-in user. */
  function watchForLogin() {
    var modal = document.getElementById("loginModal");
    if (!modal || modal.dataset.epWatch) return;
    modal.dataset.epWatch = "1";
    var wasOpen = true;
    new MutationObserver(function () {
      var open = modal.classList.contains("show");
      if (!open && wasOpen) {
        fetch("/api/me", { credentials: "same-origin" })
          .then(function (r) { return r.ok ? r.json() : {}; })
          .then(function (d) { if (d && d.user) location.reload(); });
      }
      wasOpen = open;
    }).observe(modal, { attributes: true, attributeFilter: ["class"] });
  }

  window.epOpenLogin = openLogin;

  var btn = document.getElementById("loginBtn");
  if (btn) btn.addEventListener("click", function (e) { e.preventDefault(); openLogin(); });
})();
