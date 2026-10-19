/* Mobile header menu: shows a hamburger on small screens and toggles the main nav links. */
(function () {
  "use strict";
  var header = document.querySelector(".nav");
  var nav = header && header.querySelector("nav");
  if (!header || !nav || header.querySelector(".nav-toggle")) return;

  var btn = document.createElement("button");
  btn.type = "button";
  btn.className = "nav-toggle";
  btn.setAttribute("aria-label", "Open menu");
  btn.setAttribute("aria-expanded", "false");
  btn.innerHTML = '<span></span><span></span><span></span>';
  header.insertBefore(btn, header.querySelector(".right") || null);

  function setOpen(open) {
    header.classList.toggle("nav-open", open);
    document.body.classList.toggle("ep-menu-open", open);
    btn.setAttribute("aria-expanded", open ? "true" : "false");
    btn.setAttribute("aria-label", open ? "Close menu" : "Open menu");
  }

  btn.addEventListener("click", function () {
    setOpen(!header.classList.contains("nav-open"));
  });

  nav.addEventListener("click", function (e) {
    if (e.target.closest("a")) setOpen(false);
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") setOpen(false);
  });
})();
