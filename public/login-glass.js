/* Login card helpers: Enter key on name/email sends the code, and the guest row just closes the card. */
(function () {
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Enter") return;
    var id = e.target && e.target.id;
    if (id === "name" || id === "email") {
      e.preventDefault();
      var go = document.getElementById("sendOtpBtn");
      if (go && !go.disabled) go.click();
    }
  });

  document.addEventListener("click", function (e) {
    var guest = e.target.closest && e.target.closest("#loginGuestBtn");
    if (!guest) return;
    var close = document.getElementById("closeLogin");
    if (close) close.click();
  });
})();
