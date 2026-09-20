/* Shared header behaviour for pages other than the homepage: active link + Login/Logout state. */
(function () {
  var login = document.getElementById("loginBtn"), logout = document.getElementById("logoutBtn");
  if (!login || !logout) return;

  var path = location.pathname.replace(/\/+$/, "");
  Array.prototype.forEach.call(document.querySelectorAll(".nav nav a"), function (a) {
    var u = new URL(a.getAttribute("href"), location.origin);
    if (u.hash) return;
    if (u.pathname.replace(/\/+$/, "") === path) a.classList.add("active");
  });

  function show(user) {
    login.classList.toggle("hide", !!user);
    logout.classList.toggle("hide", !user);
  }

  fetch("/api/me", { headers: { Accept: "application/json" }, credentials: "same-origin" })
    .then(function (r) { return r.ok ? r.json() : {}; })
    .then(function (d) { show(d && d.user); })
    .catch(function () { show(null); });

  login.addEventListener("click", function () { location.href = "/?login=1"; });

  logout.addEventListener("click", function () {
    logout.disabled = true;
    fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" })
      .catch(function () {})
      .then(function () { logout.disabled = false; show(null); });
  });
})();
