/* EditPrompt global theme + accent settings. Preferences are local to this browser. */
(function () {
  "use strict";
  var THEME_KEY = "editprompt.creatorStudio.theme";
  var ACCENT_KEY_PREFIX = "editprompt.ui.accent.";
  var accents = [
    { name: "Ruby", value: "#e5233a" },
    { name: "Violet", value: "#7657f6" },
    { name: "Ocean", value: "#2878e8" },
    { name: "Teal", value: "#0d9488" },
    { name: "Amber", value: "#d97706" },
    { name: "Rose", value: "#db2777" }
  ];
  var body = document.body;
  var moon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.2 15.1A8.4 8.4 0 0 1 8.9 3.8 8.5 8.5 0 1 0 20.2 15.1Z"/></svg>';
  var sun = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/></svg>';
  var gear = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6Z"/><path d="m19.4 13.5 1.1.8-1.1 1.9-1.3-.5a7.6 7.6 0 0 1-1.5.9l-.2 1.4h-2.2l-.4-1.3a7.4 7.4 0 0 1-1.8 0l-.7 1.1-1.9-1.1.5-1.3a7.6 7.6 0 0 1-.9-1.5l-1.4-.2v-2.2l1.3-.4a7.4 7.4 0 0 1 0-1.8l-1.1-.7 1.1-1.9 1.3.5a7.6 7.6 0 0 1 1.5-.9l.2-1.4h2.2l.4 1.3a7.4 7.4 0 0 1 1.8 0l.7-1.1 1.9 1.1-.5 1.3a7.6 7.6 0 0 1 .9 1.5l1.4.2v2.2l-1.3.4a7.4 7.4 0 0 1 0 1.8Z"/></svg>';
  function safeGet(key, fallback) { try { return localStorage.getItem(key) || fallback; } catch (_) { return fallback; } }
  var MODE_KEY = "editprompt.ui.themeMode";
  var mq = window.matchMedia ? window.matchMedia("(prefers-color-scheme: light)") : null;
  function getMode() { var m = safeGet(MODE_KEY, ""); return m === "auto" ? "auto" : (safeGet(THEME_KEY, "dark") === "light" ? "light" : "dark"); }
  function getTheme() {
    if (getMode() === "auto") { var eff = mq && mq.matches ? "light" : "dark"; try { localStorage.setItem(THEME_KEY, eff); } catch (_) {} return eff; }
    return safeGet(THEME_KEY, "dark") === "light" ? "light" : "dark";
  }
  function saveTheme(v) { try { localStorage.setItem(THEME_KEY, v); localStorage.setItem(MODE_KEY, v); } catch (_) {} }
  function accentKey(theme) { return ACCENT_KEY_PREFIX + (theme || getTheme()); }
  function getAccent(theme) { return safeGet(accentKey(theme), accents[0].value); }
  function applyAccent(value) {
    var chosen = accents.find(function (x) { return x.value === value; }) || accents[0];
    body.style.setProperty("--accent", chosen.value);
    body.style.setProperty("--accent-rgb", chosen.value.match(/[\da-f]{2}/gi).map(function (x) { return parseInt(x, 16); }).join(","));
    try { localStorage.setItem(accentKey(getTheme()), chosen.value); } catch (_) {}
    document.querySelectorAll("[data-ep-accent]").forEach(function (b) {
      b.setAttribute("aria-pressed", b.getAttribute("data-ep-accent") === chosen.value ? "true" : "false");
    });
  }
  function applyTheme(theme) {
    if (body.classList.contains("ep-dark-only")) theme = "dark"; /* dark-designed pages (product packs) */
    body.setAttribute("data-ep-theme", theme);
    document.querySelectorAll("[data-ep-theme-toggle], #themeToggle").forEach(function (button) {
      button.innerHTML = theme === "light" ? moon : sun;
      button.setAttribute("aria-label", theme === "light" ? "Switch to dark mode" : "Switch to light mode");
      button.setAttribute("title", theme === "light" ? "Switch to dark mode" : "Switch to light mode");
      button.setAttribute("aria-pressed", theme === "light" ? "true" : "false");
    });
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = theme === "light" ? "#f5f7fb" : "#0f1117";
  }
  var MOTION_KEY = "editprompt.ui.reduceMotion", SIZE_KEY = "editprompt.ui.textSize", SAVED_KEY = "ep_saved_packs";
  function applyPrefs() {
    body.classList.toggle("ep-reduce-motion", safeGet(MOTION_KEY, "") === "1");
    var sz = safeGet(SIZE_KEY, "normal");
    body.classList.toggle("ep-size-small", sz === "small");
    body.classList.toggle("ep-size-large", sz === "large");
  }
  applyPrefs();
  applyTheme(getTheme());
  applyAccent(getAccent(getTheme()));
  if (mq && mq.addEventListener) mq.addEventListener("change", function () { if (getMode() === "auto") { applyTheme(getTheme()); applyAccent(getAccent(getTheme())); window.dispatchEvent(new Event("ep-theme-changed")); } });

  var existingToggle = document.getElementById("themeToggle");
  var target = document.querySelector(".nav .right") || document.querySelector("header .right");
  if (existingToggle) {
    existingToggle.classList.add("ep-icon-button", "ep-theme-toggle");
    existingToggle.addEventListener("click", function () {
      window.setTimeout(function () {
        var next = body.getAttribute("data-ep-theme") === "light" ? "dark" : "light";
        /* Existing page handlers may have toggled the theme already. */
        var stored = getTheme();
        if (body.getAttribute("data-ep-theme") === stored) {
          stored = stored === "light" ? "dark" : "light";
          saveTheme(stored);
        }
        applyTheme(getTheme());
        applyAccent(getAccent(getTheme()));
      }, 0);
    });
  }

  var navEl = document.querySelector(".nav nav");
  if (navEl && !document.getElementById("epSettingsLink")) {
        var settings = document.createElement("a"); settings.id = "epSettingsLink"; settings.href = "/settings.html"; settings.className = "ep-nav-settings"; settings.setAttribute("role", "button");
    settings.textContent = "Settings";
    settings.setAttribute("aria-expanded", "false"); settings.setAttribute("aria-controls", "epAppearancePanel");
    var panel = document.createElement("div"); panel.id = "epAppearancePanel"; panel.className = "ep-appearance-panel"; panel.hidden = true;
    panel.innerHTML = '<button type="button" class="ep-settings-close" aria-label="Close settings">✕</button><div class="ep-settings-title">Settings</div><div class="ep-settings-label">Theme</div><div class="ep-theme-options"><button type="button" data-ep-set-theme="light">☼ <span>Light</span></button><button type="button" data-ep-set-theme="dark">☾ <span>Dark</span></button></div><div class="ep-settings-label">Accent color</div><div class="ep-accent-options" role="group" aria-label="Accent color">' + accents.map(function (x) { return '<button type="button" data-ep-accent="' + x.value + '" title="' + x.name + '" aria-label="' + x.name + ' accent" style="--swatch:' + x.value + '"></button>'; }).join("") + '</div><p class="ep-settings-note">Saved on this browser only.</p>';
    var CATALOG = { cinematic: ["Cinematic AI Prompt Pack", "/cinematic-pack.html"], wedding: ["Wedding Video Prompt Pack"], ads: ["Product Ad Prompt Pack"], fashion: ["Fashion & Editorial Prompt Pack"], travel: ["Travel & Destination Prompt Pack"], automotive: ["Automotive Cinematic Prompt Pack"], realestate: ["Real Estate & Architecture Prompt Pack"], social: ["Social Media Reels Prompt Pack"], food: ["Food & Beverage Commercial Prompt Pack"] };
    var extraNames = {};
    var themeBox = panel.querySelector(".ep-theme-options");
    var autoBtn = document.createElement("button"); autoBtn.type = "button"; autoBtn.setAttribute("data-ep-set-theme", "auto"); autoBtn.innerHTML = "◐ <span>Auto</span>"; themeBox.appendChild(autoBtn);
    var note = panel.querySelector(".ep-settings-note");
    note.insertAdjacentHTML("beforebegin",
      '<div class="ep-settings-label">Saved prompt packs <span id="epSavedCount"></span></div><div id="epSavedList" class="ep-saved-list"></div>' +
      '<div class="ep-settings-label">Preferences</div>' +
      '<label class="ep-pref-row"><span>Reduce animations</span><input type="checkbox" id="epPrefMotion"></label>' +
      '<div class="ep-pref-row"><span>Page size</span><div class="ep-size-options" id="epSizeOpts"><button type="button" data-ep-size="small">A−</button><button type="button" data-ep-size="normal">A</button><button type="button" data-ep-size="large">A+</button></div></div>');
    function savedIds() { try { return JSON.parse(localStorage.getItem(SAVED_KEY) || "[]"); } catch (_) { return []; } }
    function nameOf(id) { return (CATALOG[id] && CATALOG[id][0]) || extraNames[id] || id.replace(/[-_]+/g, " "); }
    function hrefOf(id) { return (CATALOG[id] && CATALOG[id][1]) || "/pack.html?id=" + encodeURIComponent(id); }
    function renderSaved() {
      var list = panel.querySelector("#epSavedList"), ids = savedIds();
      panel.querySelector("#epSavedCount").textContent = ids.length ? "(" + ids.length + ")" : "";
      list.innerHTML = "";
      if (!ids.length) { var p = document.createElement("p"); p.className = "ep-settings-note"; p.textContent = "Nothing saved yet. Tap the ♡ on any pack to save it here."; list.appendChild(p); return; }
      ids.forEach(function (id) {
        var row = document.createElement("div"); row.className = "ep-saved-row";
        var a = document.createElement("a"); a.href = hrefOf(id); a.textContent = nameOf(id);
        var x = document.createElement("button"); x.type = "button"; x.textContent = "✕"; x.setAttribute("aria-label", "Remove " + nameOf(id) + " from saved");
        x.addEventListener("click", function () {
          var l = savedIds().filter(function (v) { return v !== id; });
          try { localStorage.setItem(SAVED_KEY, JSON.stringify(l)); } catch (_) {}
          renderSaved(); window.dispatchEvent(new Event("ep-saved-changed"));
        });
        row.appendChild(a); row.appendChild(x); list.appendChild(row);
      });
      var clr = document.createElement("button"); clr.type = "button"; clr.className = "ep-saved-clear"; clr.textContent = "Clear all saved";
      clr.addEventListener("click", function () { try { localStorage.setItem(SAVED_KEY, "[]"); } catch (_) {} renderSaved(); window.dispatchEvent(new Event("ep-saved-changed")); });
      list.appendChild(clr);
    }
    function markMode() { var m = getMode(); panel.querySelectorAll("[data-ep-set-theme]").forEach(function (x) { x.classList.toggle("active", x.getAttribute("data-ep-set-theme") === m); }); }
    function markPrefs() {
      panel.querySelector("#epPrefMotion").checked = safeGet(MOTION_KEY, "") === "1";
      var sz = safeGet(SIZE_KEY, "normal"); panel.querySelectorAll("[data-ep-size]").forEach(function (x) { x.classList.toggle("active", x.getAttribute("data-ep-size") === sz); });
    }
    panel.querySelector("#epPrefMotion").addEventListener("change", function (e) { try { localStorage.setItem(MOTION_KEY, e.target.checked ? "1" : "0"); } catch (_) {} applyPrefs(); });
    panel.querySelectorAll("[data-ep-size]").forEach(function (b) { b.addEventListener("click", function () { try { localStorage.setItem(SIZE_KEY, b.getAttribute("data-ep-size")); } catch (_) {} applyPrefs(); markPrefs(); }); });
    window.addEventListener("ep-saved-changed", renderSaved);
    window.addEventListener("ep-theme-changed", markMode);
    window.addEventListener("storage", function (e) { if (e.key === SAVED_KEY) renderSaved(); });
    renderSaved(); markPrefs();
    var namesLoaded = false;
    function loadNames() { if (namesLoaded) return; namesLoaded = true; try { fetch("/api/packs").then(function (r) { return r.ok ? r.json() : { packs: [] }; }).then(function (d) { (d.packs || []).forEach(function (p) { extraNames[p.id] = p.name; }); renderSaved(); }).catch(function () {}); } catch (_) {} }
    var backdrop = document.createElement("div"); backdrop.className = "ep-settings-backdrop"; backdrop.hidden = true;
    navEl.appendChild(settings); document.body.appendChild(backdrop); document.body.appendChild(panel);
    function setPanel(open) {
      panel.hidden = !open; backdrop.hidden = !open;
      document.body.classList.toggle("ep-settings-open", open);
      if (open) { renderSaved(); markPrefs(); markMode(); loadNames(); var f = panel.querySelector(".ep-settings-close"); if (f) f.focus(); }
    }
    panel.querySelector(".ep-settings-close").addEventListener("click", function () { setPanel(false); });
    backdrop.addEventListener("click", function () { setPanel(false); });
    
    panel.addEventListener("click", function (e) { e.stopPropagation(); });
    panel.querySelectorAll("[data-ep-set-theme]").forEach(function (b) { b.addEventListener("click", function () {
      var t = b.getAttribute("data-ep-set-theme");
      if (t === "auto") { try { localStorage.setItem(MODE_KEY, "auto"); } catch (_) {} } else { saveTheme(t); }
      applyTheme(getTheme()); applyAccent(getAccent(getTheme())); markMode();
    }); });
    panel.querySelectorAll("[data-ep-accent]").forEach(function (b) { b.addEventListener("click", function () { applyAccent(b.getAttribute("data-ep-accent")); }); });
    panel.addEventListener("click", function (e) { e.stopPropagation(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") setPanel(false); });
    applyAccent(getAccent(getTheme()));
    markMode();
  }
})();
