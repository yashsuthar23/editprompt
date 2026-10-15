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
  function getTheme() { return safeGet(THEME_KEY, "dark") === "light" ? "light" : "dark"; }
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
  applyTheme(getTheme());
  applyAccent(getAccent(getTheme()));

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
          try { localStorage.setItem(THEME_KEY, stored); } catch (_) {}
        }
        applyTheme(getTheme());
        applyAccent(getAccent(getTheme()));
      }, 0);
    });
  } else if (target) {
    var toggle = document.createElement("button");
    toggle.type = "button"; toggle.className = "ep-icon-button ep-theme-toggle";
    toggle.setAttribute("data-ep-theme-toggle", ""); toggle.innerHTML = getTheme() === "light" ? moon : sun;
    toggle.addEventListener("click", function () {
      var next = getTheme() === "light" ? "dark" : "light";
      try { localStorage.setItem(THEME_KEY, next); } catch (_) {}
      applyTheme(next);
      applyAccent(getAccent(next));
    });
    target.appendChild(toggle);
  }

  if (target && !document.getElementById("epSettingsWrap")) {
    var wrap = document.createElement("div"); wrap.id = "epSettingsWrap"; wrap.className = "ep-settings-wrap";
    var settings = document.createElement("button"); settings.type = "button"; settings.className = "ep-icon-button ep-settings-button";
    settings.innerHTML = gear; settings.setAttribute("aria-label", "Appearance settings"); settings.title = "Appearance settings";
    settings.setAttribute("aria-expanded", "false"); settings.setAttribute("aria-controls", "epAppearancePanel");
    var panel = document.createElement("div"); panel.id = "epAppearancePanel"; panel.className = "ep-appearance-panel"; panel.hidden = true;
    panel.innerHTML = '<div class="ep-settings-title">Appearance</div><div class="ep-settings-label">Theme</div><div class="ep-theme-options"><button type="button" data-ep-set-theme="light">☼ <span>Light</span></button><button type="button" data-ep-set-theme="dark">☾ <span>Dark</span></button></div><div class="ep-settings-label">Accent color</div><div class="ep-accent-options" role="group" aria-label="Accent color">' + accents.map(function (x) { return '<button type="button" data-ep-accent="' + x.value + '" title="' + x.name + '" aria-label="' + x.name + ' accent" style="--swatch:' + x.value + '"></button>'; }).join("") + '</div><p class="ep-settings-note">Applies across EditPrompt on this browser.</p>';
    wrap.appendChild(settings); wrap.appendChild(panel); target.appendChild(wrap);
    settings.addEventListener("click", function (e) { e.stopPropagation(); var open = panel.hidden; panel.hidden = !open; settings.setAttribute("aria-expanded", String(open)); });
    panel.addEventListener("click", function (e) { e.stopPropagation(); });
    panel.querySelectorAll("[data-ep-set-theme]").forEach(function (b) { b.addEventListener("click", function () { var t = b.getAttribute("data-ep-set-theme"); try { localStorage.setItem(THEME_KEY, t); } catch (_) {} applyTheme(t); applyAccent(getAccent(t)); panel.querySelectorAll("[data-ep-set-theme]").forEach(function (x) { x.classList.toggle("active", x === b); }); }); });
    panel.querySelectorAll("[data-ep-accent]").forEach(function (b) { b.addEventListener("click", function () { applyAccent(b.getAttribute("data-ep-accent")); }); });
    document.addEventListener("click", function () { panel.hidden = true; settings.setAttribute("aria-expanded", "false"); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") { panel.hidden = true; settings.setAttribute("aria-expanded", "false"); } });
    applyAccent(getAccent(getTheme()));
    panel.querySelectorAll("[data-ep-set-theme]").forEach(function (b) { b.classList.toggle("active", b.getAttribute("data-ep-set-theme") === getTheme()); });
  }
})();
