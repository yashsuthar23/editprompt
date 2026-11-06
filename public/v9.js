/* v9: AI error UI, simplified store, mobile tab layout */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };

  /* ---------- AI error box (shown above the output) ---------- */
  window.epClearAiError = function () {
    var box = $("aiErrorBox");
    if (box) box.remove();
  };

  window.epShowAiError = function (error, retry) {
    window.epClearAiError();
    var out = $("output");
    if (!out || !out.parentNode) return;

    var msg = (error && error.message) || "AI couldn't generate your prompt. Please try again.";
    var title = "Couldn't generate";
    if (error && error.code === "NETWORK") title = "You're offline";
    else if (error && (error.code === "AI_BUSY" || error.code === "AI_TIMEOUT")) title = "AI is busy";
    else if (error && error.status === 401) title = "Login required";

    var box = document.createElement("div");
    box.id = "aiErrorBox";
    box.className = "ai-error";
    box.setAttribute("role", "alert");

    var icon = document.createElement("div");
    icon.className = "ai-error-icon";
    icon.textContent = "⚠️";

    var body = document.createElement("div");
    body.className = "ai-error-body";
    var strong = document.createElement("strong");
    strong.textContent = title;
    var p = document.createElement("p");
    p.textContent = msg;
    body.appendChild(strong);
    body.appendChild(p);

    var actions = document.createElement("div");
    actions.className = "ai-error-actions";

    if (typeof retry === "function" && !(error && error.retryable === false)) {
      var r = document.createElement("button");
      r.type = "button";
      r.className = "primary";
      r.textContent = "Try again";
      r.onclick = function () { window.epClearAiError(); retry(); };
      actions.appendChild(r);
    }
    var d = document.createElement("button");
    d.type = "button";
    d.textContent = "Dismiss";
    d.onclick = window.epClearAiError;
    actions.appendChild(d);

    body.appendChild(actions);
    box.appendChild(icon);
    box.appendChild(body);
    out.parentNode.insertBefore(box, out);
    box.scrollIntoView({ block: "nearest", behavior: "smooth" });
  };

  /* ---------- Simplified store: 3 featured packs (new admin packs first) + ONE button ---------- */
  var store = $("store");
  if (store) {
    store.classList.add("ep-store-lite");
    var grid = store.querySelector(".store-grid");
    var btn = store.querySelector(".store-more-btn");
    var SLOTS = 3;      // cards shown on the homepage
    var MAX_NEW = 2;    // newest admin-created packs shown first

    var esc = function (v) {
      return String(v == null ? "" : v).replace(/[&<>"']/g, function (ch) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
      });
    };

    var staticCards = grid ? Array.prototype.slice.call(grid.querySelectorAll(":scope > .product")) : [];

    // "Show more" reveals the remaining featured packs in place; "Show less" collapses them again.
    var storeOpen = false;
    var storeHidden = []; // cards hidden while the store is collapsed
    var paintStoreButton = function () {
      if (!btn) return;
      btn.innerHTML = storeOpen
        ? 'Show less <span aria-hidden="true">↑</span>'
        : 'Show more <span aria-hidden="true">↓</span>';
      btn.setAttribute("aria-expanded", storeOpen ? "true" : "false");
    };
    var applyStoreState = function () {
      storeHidden.forEach(function (card) {
        card.classList.toggle("ep-store-extra", !storeOpen);
      });
      store.classList.toggle("ep-store-expanded", storeOpen);
      paintStoreButton();
    };
    if (btn) {
      btn.addEventListener("click", function (e) {
        e.preventDefault();
        storeOpen = !storeOpen;
        applyStoreState();
      });
    }

    var finish = function (newCount, totalCount, extraCards) {
      // Always keep the first static card (the Best Seller) visible
      var slots = Math.max(1, SLOTS - newCount);
      storeHidden = staticCards
        .filter(function (card, i) { return i >= slots; })
        .concat(extraCards || []);
      applyStoreState();
      var countEl = $("storePackCount");
      if (countEl) countEl.textContent = "📚 " + totalCount + " premium packs";
      store.classList.add("ep-store-ready");
    };

    // Heart (save) button: same storage + events as the other pack cards
    var SAVED_KEY = "ep_saved_packs";
    var readSaved = function () {
      try { return JSON.parse(localStorage.getItem(SAVED_KEY) || "[]"); } catch (e) { return []; }
    };
    var hearts = [];
    var makeHeart = function (p) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "pack-heart";
      b.setAttribute("aria-label", "Save " + p.name);
      var paint = function () {
        var on = readSaved().indexOf(p.id) !== -1;
        b.classList.toggle("on", on);
        b.textContent = on ? "\u2665" : "\u2661";
        b.setAttribute("aria-pressed", on ? "true" : "false");
      };
      b.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        var l = readSaved(), i = l.indexOf(p.id);
        if (i === -1) l.push(p.id); else l.splice(i, 1);
        try { localStorage.setItem(SAVED_KEY, JSON.stringify(l)); } catch (err) {}
        paint();
        window.dispatchEvent(new Event("ep-saved-changed"));
      });
      paint();
      hearts.push(paint);
      return b;
    };
    var repaintHearts = function () { hearts.forEach(function (fn) { fn(); }); };
    window.addEventListener("ep-saved-changed", repaintHearts);
    window.addEventListener("storage", function (e) { if (e.key === SAVED_KEY) repaintHearts(); });
    window.addEventListener("pageshow", repaintHearts);

    var makeCard = function (p) {
      var href = "/pack.html?id=" + encodeURIComponent(p.id);
      var card = document.createElement("div");
      card.className = "product";
      card.dataset.id = p.id;
      var cover = p.cover
        ? "style=\"background-image:url('" + esc(p.cover) + "');background-size:cover;background-position:center;background-color:#0c0c0c;display:block;aspect-ratio:16/9;\""
        : "style=\"display:block;aspect-ratio:16/9;\"";
      card.innerHTML =
        '<a class="thumb custom-pack-thumb" href="' + href + '" aria-label="' + esc(p.name) + '" ' + cover + "></a>" +
        '<div class="tag">' + esc(p.tag || "NEW") + "</div>" +
        "<h3>" + esc(p.name) + "</h3>" +
        "<p>" + esc(p.description || p.tagline || "Production-ready AI prompts.") + "</p>" +
        '<div class="pack-specs"><span>' + esc(p.count || p.promptCount || "PROMPTS") + "</span><span>PDF + ZIP</span><span>Instant access</span></div>" +
        '<div class="price">₹' + esc(p.price) + "</div>" +
        '<a class="btn primary full" href="' + href + '">Buy Now' + (p.price ? " — ₹" + esc(p.price) : "") + "</a>";
      card.style.position = "relative";
      card.appendChild(makeHeart(p));
      return card;
    };

    if (grid) {
      fetch("/api/packs", { credentials: "same-origin" })
        .then(function (r) { return r.ok ? r.json() : { packs: [] }; })
        .then(function (d) {
          var packs = (d && d.packs) || [];
          var shown = packs.slice(0, MAX_NEW);
          var rest = packs.slice(MAX_NEW);
          // Best Seller first, then the newest admin packs
          var anchor = staticCards.length ? staticCards[0].nextSibling : null;
          shown.forEach(function (p) {
            grid.insertBefore(makeCard(p), anchor);
          });
          // The remaining admin packs go to the end of the grid and stay hidden until "Show more"
          var extraCards = rest.map(function (p) {
            var card = makeCard(p);
            grid.appendChild(card);
            return card;
          });
          finish(shown.length, staticCards.length + packs.length, extraCards);
        })
        .catch(function () { finish(0, staticCards.length); });
    }
  }

  /* ---------- Mobile: one screen at a time + bottom tabs ---------- */
  var TABS = [
    { id: "create", label: "Create", ico: "✨", ids: ["generator"], hero: true },
    { id: "media",  label: "Media",  ico: "🎬", ids: ["imageVideo"] },
    { id: "tools",  label: "Tools",  ico: "🧰", ids: ["categories", "tools"] },
    { id: "store",  label: "Store",  ico: "🛍️", ids: ["store"] },
    { id: "me",     label: "Me",     ico: "👤", ids: ["dashboard"] }
  ];
  var mq = window.matchMedia("(max-width: 768px)");
  var bar = null;
  var current = "create";

  function loggedIn() {
    var lb = $("loginBtn");
    return !!lb && lb.classList.contains("hide");
  }

  function tabForId(id) {
    for (var i = 0; i < TABS.length; i++) {
      if (TABS[i].ids.indexOf(id) !== -1) return TABS[i].id;
    }
    return null;
  }

  function apply(tabId) {
    var tab = TABS.filter(function (t) { return t.id === tabId; })[0] || TABS[0];
    current = tab.id;
    var visible = {};
    tab.ids.forEach(function (id) { visible[id] = true; });

    TABS.forEach(function (t) {
      t.ids.forEach(function (id) {
        var el = $(id);
        if (el) el.classList.toggle("ep-tab-hide", !visible[id]);
      });
    });
    var hero = document.querySelector(".hero");
    if (hero) hero.classList.toggle("ep-tab-hide", !tab.hero);

    if (bar) {
      Array.prototype.forEach.call(bar.children, function (b) {
        b.classList.toggle("on", b.getAttribute("data-tab") === tab.id);
      });
    }
  }

  function select(tabId, opts) {
    if (tabId === "me" && !loggedIn()) {
      var lb = $("loginBtn");
      if (lb) lb.click();
      return;
    }
    if (tabId === "me") {
      var dash = $("dashboard");
      if (dash) dash.classList.remove("hide");
    }
    apply(tabId);
    if (!opts || opts.scroll !== false) window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function build() {
    if (bar) return;
    bar = document.createElement("nav");
    bar.className = "ep-tabbar";
    bar.setAttribute("aria-label", "Main");
    TABS.forEach(function (t) {
      var b = document.createElement("button");
      b.type = "button";
      b.setAttribute("data-tab", t.id);
      var i = document.createElement("span");
      i.className = "ico";
      i.textContent = t.ico;
      var l = document.createElement("span");
      l.textContent = t.label;
      b.appendChild(i);
      b.appendChild(l);
      b.onclick = function () { select(t.id); };
      bar.appendChild(b);
    });
    document.body.appendChild(bar);
  }

  function enable() {
    document.body.classList.add("ep-mobile");
    build();
    var hash = (location.hash || "").replace("#", "");
    select(tabForId(hash) || current, { scroll: false });
  }

  function disable() {
    document.body.classList.remove("ep-mobile");
    document.querySelectorAll(".ep-tab-hide").forEach(function (el) {
      el.classList.remove("ep-tab-hide");
    });
  }

  function sync() { if (mq.matches) enable(); else disable(); }

  // Menu / in-page links like href="#store" switch to the right tab
  document.addEventListener("click", function (e) {
    if (!mq.matches) return;
    var a = e.target.closest && e.target.closest('a[href^="#"]');
    if (!a) return;
    var id = a.getAttribute("href").slice(1);
    var t = tabForId(id);
    if (!t) return;
    e.preventDefault();
    select(t, { scroll: false });
    var el = $(id);
    if (el) setTimeout(function () { el.scrollIntoView({ behavior: "smooth", block: "start" }); }, 30);
  });

  if (mq.addEventListener) mq.addEventListener("change", sync);
  else if (mq.addListener) mq.addListener(sync);
  sync();
})();
