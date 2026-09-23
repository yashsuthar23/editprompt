/* Public site banner + maintenance notice (controlled from Admin > Pro Tools). */
(function () {
  fetch("/api/site-status").then(function (r) { return r.json(); }).then(function (s) {
    var text = s.maintenance ? "We are doing a quick maintenance. Some features may be unavailable." : (s.banner && s.banner.on ? s.banner.text : "");
    if (!text) return;
    var d = document.createElement("div");
    d.setAttribute("role", "status");
    d.style.cssText = "position:sticky;top:0;z-index:9999;padding:9px 14px;text-align:center;font:600 14px system-ui,sans-serif;color:#fff;background:" + (s.maintenance ? "#b45309" : "#0e7490");
    d.textContent = text;
    document.body.insertBefore(d, document.body.firstChild);
  }).catch(function () {});
})();
