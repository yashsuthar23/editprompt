/* Creator Studio — workspace navigation.
   Builds the tool sidebar from [data-tool] sections, shows one tool at a time,
   and keeps the URL hash in sync so tools can be bookmarked / shared. */
(function () {
  "use strict";
  var layout = document.getElementById("spLayout");
  var side = document.getElementById("spSide");
  if (!layout || !side) return;

  var GROUP_ORDER = ["Image", "Video & Social", "Audio", "Library"];
  var DEFAULT_TOOL = "photo-editor";
  var ALIASES = { creatorLabTools: "background-remover", "creator-lab": "background-remover", imageOptimizer: "image-optimizer" };
  var ICONS = {
    "photo-editor": '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="1.6"/><path d="m4 18 5-5 4 4 3-3 4 4"/>',
    "image-optimizer": '<path d="M4 14v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/><path d="M12 4v10"/><path d="m8 10 4 4 4-4"/>',
    "background-remover": '<path d="M12 3 3 8l9 5 9-5-9-5Z"/><path d="m3 13 9 5 9-5"/>',
    "object-remover": '<path d="m15 4 5 5-9.5 9.5H6L4 16.5 15 4Z"/><path d="M10 19h10"/>',
    "social-brief": '<rect x="6" y="2.5" width="12" height="19" rx="3"/><path d="M10 18h4"/><path d="m11 8 3 2-3 2V8Z"/>',
    "shot-list": '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9h18M8 5v4M16 5v4M7 13h6M7 16h4"/>',
    "video-timeline": '<path d="M3 7h6v10H3zM11 9h5v6h-5zM18 6h3v12h-3z"/>',
    "voice-subtitles": '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M7 12h4M13 12h4M7 15h6"/>',
    "speech-to-text": '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
    "voice-recorder": '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3" fill="currentColor"/>',
    "library": '<path d="M4 5h6v14H4zM12 5h4v14h-4zM18 7l2 .6-3.4 11.8-2-.6L18 7Z"/>',
    "prompt-marketplace": '<path d="M4 8h16l-1.2 11a2 2 0 0 1-2 1.8H7.2a2 2 0 0 1-2-1.8L4 8Z"/><path d="M8 8V6a4 4 0 0 1 8 0v2"/>',
    "ai-video": '<path d="M5 4v16l14-8L5 4Z"/>'
  };
  function icon(id) { return '<span class="sp-ico" aria-hidden="true"><svg viewBox="0 0 24 24">' + (ICONS[id] || ICONS["photo-editor"]) + "</svg></span>"; }
  function esc(t) { var d = document.createElement("div"); d.textContent = t == null ? "" : String(t); return d.innerHTML; }

  var panels = Array.prototype.slice.call(document.querySelectorAll("[data-tool]"));
  var byId = {};
  panels.forEach(function (p) { byId[p.getAttribute("data-tool")] = p; });

  // ---- build the sidebar ----
  var groups = {};
  panels.forEach(function (p) {
    var g = p.getAttribute("data-group") || "More";
    (groups[g] = groups[g] || []).push(p);
  });
  var order = GROUP_ORDER.filter(function (g) { return groups[g]; }).concat(Object.keys(groups).filter(function (g) { return GROUP_ORDER.indexOf(g) < 0; }));
  var html = "";
  order.forEach(function (g) {
    html += '<div class="sp-group" role="group" aria-label="' + esc(g) + '"><div class="sp-group-label">' + esc(g) + "</div>";
    groups[g].forEach(function (p) {
      var id = p.getAttribute("data-tool");
      var badge = p.getAttribute("data-badge");
      html += '<button type="button" class="sp-item" data-go="' + esc(id) + '" aria-controls="' + esc(id) + '">' + icon(id) +
        '<span class="sp-txt"><b>' + esc(p.getAttribute("data-title")) + (badge ? '<span class="sp-tag">' + esc(badge) + "</span>" : "") +
        "</b><small>" + esc(p.getAttribute("data-desc")) + "</small></span></button>";
    });
    html += "</div>";
  });
  html += '<div class="sp-group" role="group" aria-label="AI Studio"><div class="sp-group-label">AI Studio</div>' +
    '<a class="sp-item" href="/#imageVideo">' + icon("ai-video") + '<span class="sp-txt"><b>Image to Video<span class="sp-tag">AI</span></b><small>Animate a photo in AI Studio</small></span></a></div>';
  side.innerHTML = html;
  layout.classList.add("sp-js");

  // ---- switching ----
  var current = null;
  function resolve(raw) {
    var id = String(raw || "").replace(/^#/, "");
    id = ALIASES[id] || id;
    return byId[id] ? id : null;
  }
  function show(id, opts) {
    opts = opts || {};
    if (!byId[id]) id = DEFAULT_TOOL;
    panels.forEach(function (p) { p.classList.toggle("sp-active", p.getAttribute("data-tool") === id); });
    Array.prototype.forEach.call(side.querySelectorAll("[data-go]"), function (b) {
      var on = b.getAttribute("data-go") === id;
      if (on) b.setAttribute("aria-current", "true"); else b.removeAttribute("aria-current");
      if (on && opts.scrollNav && side.scrollWidth > side.clientWidth) { b.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" }); }
    });
    var title = byId[id].getAttribute("data-title");
    document.title = title + " — Creator Studio — EditPrompt";
    if (opts.updateHash !== false && current !== null) {
      try { history.replaceState(null, "", "#" + id); } catch (_) { /* file:// etc. */ }
    }
    if (opts.scrollTop && window.matchMedia("(max-width: 900px)").matches) {
      var top = layout.getBoundingClientRect().top + window.scrollY - 70;
      if (window.scrollY > top) window.scrollTo({ top: top, behavior: "smooth" });
    }
    current = id;
    // canvases inside a previously hidden panel may need a layout pass
    try { window.dispatchEvent(new Event("resize")); } catch (_) {}
  }
  side.addEventListener("click", function (e) {
    var b = e.target.closest("[data-go]");
    if (b) show(b.getAttribute("data-go"), { scrollNav: true, scrollTop: true });
  });
  window.addEventListener("hashchange", function () {
    var id = resolve(location.hash);
    if (id) show(id, { updateHash: false, scrollNav: true });
  });

  var params = new URLSearchParams(location.search);
  show(resolve(location.hash) || resolve(params.get("tool")) || DEFAULT_TOOL, { updateHash: false, scrollNav: false });

  // ---- small extras ----
  var tol = document.getElementById("bgTolerance"), tolOut = document.getElementById("bgTolValue");
  if (tol && tolOut) tol.addEventListener("input", function () { tolOut.textContent = tol.value; });
})();
