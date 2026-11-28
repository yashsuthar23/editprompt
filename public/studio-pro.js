/* Creator Studio — workspace navigation.
   Builds the tool sidebar from [data-tool] sections, shows one tool at a time,
   and keeps the URL hash in sync so tools can be bookmarked / shared. */
(function () {
  "use strict";
  var layout = document.getElementById("spLayout");
  var side = document.getElementById("spSide");
  if (!layout || !side) return;

  var GROUP_ORDER = ["Workspace", "Image", "Video & Social", "Audio", "Library"];
  var DEFAULT_TOOL = "overview";
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
    "overview": '<rect x="3" y="3" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="2"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2"/>',
    "social-resizer": '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 16V8h8"/><path d="m8 16 8-8"/>',
    "color-tools": '<path d="M12 3a9 9 0 1 0 0 18c1.4 0 2-1 2-2s-.8-1.6-.8-2.6c0-1 .8-1.8 1.9-1.8H17a4 4 0 0 0 4-4C21 6.6 17 3 12 3Z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="15" cy="7.5" r="1"/>',
    "frame-grabber": '<path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/><circle cx="12" cy="12" r="3"/>',
    "audio-trimmer": '<path d="M4 12h2M8 8v8M12 5v14M16 8v8M20 12h-2"/>',
    "caption-toolkit": '<path d="M4 6h16M4 12h10M4 18h14"/>',
    "image-cleaner": '<path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.500 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-4"/>',
    "ai-video": '<path d="M5 4v16l14-8L5 4Z"/>'
  };
  function icon(id) { return '<span class="sp-ico" aria-hidden="true"><svg viewBox="0 0 24 24">' + (ICONS[id] || ICONS["photo-editor"]) + "</svg></span>"; }
  function esc(t) { var d = document.createElement("div"); d.textContent = t == null ? "" : String(t); return d.innerHTML; }

  // ---- "All tools" overview, built from the tool metadata ----
  var main = layout.querySelector(".sp-main");
  var ov = document.createElement("section");
  ov.className = "tool-panel sp-overview"; ov.id = "overview";
  ov.setAttribute("data-tool", "overview"); ov.setAttribute("data-title", "All Tools"); ov.setAttribute("data-group", "Workspace"); ov.setAttribute("data-desc", "Everything in one place");
  var cards = "";
  Array.prototype.slice.call(document.querySelectorAll("[data-tool]")).forEach(function (p) {
    var id = p.getAttribute("data-tool"), badge = p.getAttribute("data-badge");
    cards += '<button type="button" class="sp-tile" data-go="' + esc(id) + '">' + icon(id) + '<span class="sp-txt"><b>' + esc(p.getAttribute("data-title")) +
      (badge ? '<span class="sp-tag">' + esc(badge) + "</span>" : "") + "</b><small>" + esc(p.getAttribute("data-desc")) + "</small></span></button>";
  });
  ov.innerHTML = '<span class="pill">Workspace</span><h2>All tools</h2><p class="muted">Pick a tool to get started. Everything runs in your browser, so your files stay on your device.</p><div class="sp-tiles">' + cards + "</div>" +
    '<a class="sp-tile sp-tile-wide" href="/#imageVideo">' + icon("ai-video") + '<span class="sp-txt"><b>AI Image to Video<span class="sp-tag">AI</span></b><small>Animate a photo with AI in AI Studio</small></span></a>';
  main.insertBefore(ov, main.firstChild);

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
  side.innerHTML = '<div class="sp-sheet-head"><span class="sp-grab" aria-hidden="true"></span><b>All tools</b><button type="button" class="sp-sheet-close" aria-label="Close tool list">✕</button></div>' + html;
  layout.classList.add("sp-js");
  // Mobile: compact tool bar (current tool + prev/next) that opens the tool list as a bottom sheet.
  var mbar = document.createElement("div"); mbar.className = "sp-mbar";
  mbar.innerHTML = '<button type="button" class="sp-mstep" data-step="-1" aria-label="Previous tool">‹</button>' +
    '<button type="button" class="sp-mcur" aria-haspopup="dialog" aria-expanded="false"><span class="sp-mico"></span><span class="sp-mname"></span><span class="sp-mtag"></span><span class="sp-mchev" aria-hidden="true">▾</span></button>' +
    '<button type="button" class="sp-mstep" data-step="1" aria-label="Next tool">›</button>';
  layout.insertBefore(mbar, layout.firstChild);
  var backdrop = document.createElement("div"); backdrop.className = "sp-backdrop"; backdrop.hidden = true; layout.appendChild(backdrop);
  function openSheet() { side.classList.add("is-open"); backdrop.hidden = false; document.body.classList.add("sp-lock"); mbar.querySelector(".sp-mcur").setAttribute("aria-expanded", "true"); var cur = side.querySelector("[aria-current]"); if (cur) cur.scrollIntoView({ block: "center" }); }
  function closeSheet() { side.classList.remove("is-open"); backdrop.hidden = true; document.body.classList.remove("sp-lock"); mbar.querySelector(".sp-mcur").setAttribute("aria-expanded", "false"); }
  mbar.querySelector(".sp-mcur").addEventListener("click", function () { if (side.classList.contains("is-open")) closeSheet(); else openSheet(); });
  backdrop.addEventListener("click", closeSheet); side.querySelector(".sp-sheet-close").addEventListener("click", closeSheet);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && side.classList.contains("is-open")) closeSheet(); });
  mbar.addEventListener("click", function (e) {
    var st = e.target.closest("[data-step]"); if (!st) return;
    var ids = Array.prototype.map.call(side.querySelectorAll("[data-go]"), function (b) { return b.getAttribute("data-go"); }), i = ids.indexOf(current);
    show(ids[(i + Number(st.getAttribute("data-step")) + ids.length) % ids.length], { scrollNav: true, scrollTop: true });
  });

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
    var badgeTxt = byId[id].getAttribute("data-badge");
    mbar.querySelector(".sp-mico").innerHTML = icon(id).replace('class="sp-ico"', 'class="sp-ico sp-ico-sm"');
    mbar.querySelector(".sp-mname").textContent = title;
    mbar.querySelector(".sp-mtag").textContent = badgeTxt || ""; mbar.querySelector(".sp-mtag").hidden = !badgeTxt;
    if (typeof closeSheet === "function") closeSheet();
    document.title = title + " — Creator Studio — EditPrompt";
    if (opts.updateHash !== false && current !== null) {
      try { history.replaceState(null, "", "#" + id); } catch (_) { /* file:// etc. */ }
    }
    if (opts.scrollTop && window.matchMedia("(max-width: 900px)").matches) {
      var top = layout.getBoundingClientRect().top + window.scrollY - 64;
      if (window.scrollY > top) window.scrollTo({ top: top, behavior: "smooth" });
    }
    current = id;
    // canvases inside a previously hidden panel may need a layout pass
    try { window.dispatchEvent(new Event("resize")); } catch (_) {}
  }
  layout.addEventListener("click", function (e) {
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
