/* EditPrompt shared UI enhancements (public pages).
   1. Alternating left/right entrance animation for card groups.
   2. Show more / Show less for long lists marked with data-ep-collapse="N".
   3. Show more / Show less for long pack descriptions (.product > p).
   4. Hire Me panel (#hireMeBtn opens #hireModal).
   Each feature does nothing when its markup is not on the page.      */
(function () {
  "use strict";

  var root = document.documentElement;
  var reduceMotion = !!(window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  function indexInParent(el) {
    var siblings = el.parentElement ? el.parentElement.children : [];
    return Array.prototype.indexOf.call(siblings, el);
  }

  /* ---------- 1. Alternating left/right entrance animation ---------- */

  var REVEAL_GROUPS = [
    "#store .store-grid > .product",
    "#packsGrid > .product",
    ".dev-list > li",
    ".categorygrid > button",
    "#tools .three > .card"
  ];
  var revealObserver = null;

  function cleanupReveal(el) {
    el.classList.remove("ep-reveal", "ep-from-left", "ep-from-right", "ep-in");
    el.style.transitionDelay = "";
  }

  function finishReveal(el) {
    var done = false;
    function end(ev) {
      if (done) return;
      if (ev && ev.target !== el) return;
      done = true;
      el.removeEventListener("transitionend", end);
      cleanupReveal(el);
    }
    el.addEventListener("transitionend", end);
    // Fallback so a missed transitionend never leaves classes behind.
    setTimeout(function () { end(); }, 1400);
  }

  function onIntersect(entries, observer) {
    var hits = [];
    entries.forEach(function (entry) {
      if (entry.isIntersecting) hits.push(entry.target);
    });
    if (!hits.length) return;

    // Enter in page order so a row of cards arrives one after another.
    hits.sort(function (a, b) {
      return (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1;
    });
    hits.forEach(function (el, k) {
      observer.unobserve(el);
      el.style.transitionDelay = Math.min(k * 120, 480) + "ms";
      requestAnimationFrame(function () { el.classList.add("ep-in"); });
      finishReveal(el);
    });
  }

  function setupReveal() {
    if (reduceMotion || !("IntersectionObserver" in window)) return;
    if (!revealObserver) {
      root.classList.add("ep-anim");
      revealObserver = new IntersectionObserver(onIntersect, {
        threshold: 0.12,
        rootMargin: "0px 0px -6% 0px"
      });
    }
    REVEAL_GROUPS.forEach(function (selector) {
      document.querySelectorAll(selector).forEach(function (el) {
        if (el.__epReveal) return;
        el.__epReveal = true;
        // Even positions come from the left, odd positions from the right.
        var dir = indexInParent(el) % 2 === 0 ? "ep-from-left" : "ep-from-right";
        el.classList.add("ep-reveal", dir);
        revealObserver.observe(el);
      });
    });
  }

  /* ---------- 2. Show more / Show less for long lists ---------- */

  function applyCollapse(state) {
    var box = state.box;
    var visible = [];
    Array.prototype.forEach.call(box.children, function (child) {
      if (child.classList.contains("is-hidden")) {
        // Filtered out by the page itself; never keep it collapsed.
        if (child.classList.contains("ep-collapsed")) child.classList.remove("ep-collapsed");
      } else {
        visible.push(child);
      }
    });

    visible.forEach(function (child, i) {
      var want = !state.open && i >= state.limit;
      if (child.classList.contains("ep-collapsed") !== want) {
        child.classList.toggle("ep-collapsed", want);
      }
    });

    state.btn.hidden = !(visible.length > state.limit);
    state.btn.textContent = state.open ? "Show less" : "Show more";
    state.btn.setAttribute("aria-expanded", state.open ? "true" : "false");
  }

  function setupCollapsers() {
    document.querySelectorAll("[data-ep-collapse]").forEach(function (box) {
      if (box.__epCollapse || !box.parentNode) return;

      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn ghost ep-more-btn";
      btn.hidden = true;

      var state = {
        box: box,
        btn: btn,
        open: false,
        limit: Math.max(1, parseInt(box.getAttribute("data-ep-collapse"), 10) || 6)
      };
      btn.addEventListener("click", function () {
        state.open = !state.open;
        applyCollapse(state);
      });

      box.parentNode.insertBefore(btn, box.nextSibling);
      box.__epCollapse = state;

      // Re-apply when the page re-renders the list or filters it.
      // Only re-apply the collapse here. Description measuring is driven by ResizeObserver,
      // so this observer never reacts to the class changes measuring itself makes.
      new MutationObserver(function () { applyCollapse(state); }).observe(box, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["class"]
      });
      applyCollapse(state);
    });
  }

  /* ---------- 3. Show more / Show less for long descriptions ---------- */

  var CLAMP_MIN_CHARS = 120;

  function measureDescription(p) {
    var st = p.__epDesc;
    if (!st) return;
    if (st.open) {
      st.btn.hidden = false;
      return;
    }
    // Not rendered yet (hidden tab, collapsed card): measure once it is shown.
    if (!p.getClientRects().length) return;
    p.classList.add("ep-clamp");
    var overflowing = p.scrollHeight > p.clientHeight + 1;
    st.btn.hidden = !overflowing;
    if (!overflowing) p.classList.remove("ep-clamp");
  }

  function setupDescriptions() {
    document.querySelectorAll(".product > p").forEach(function (p) {
      if (p.__epDesc) return;
      if ((p.textContent || "").trim().length < CLAMP_MIN_CHARS) return;

      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "ep-desc-btn";
      btn.textContent = "Show more";
      btn.hidden = true;

      p.__epDesc = { open: false, btn: btn };
      btn.addEventListener("click", function () {
        var st = p.__epDesc;
        st.open = !st.open;
        btn.textContent = st.open ? "Show less" : "Show more";
        btn.setAttribute("aria-expanded", st.open ? "true" : "false");
        p.classList.toggle("ep-clamp", !st.open);
      });

      p.parentNode.insertBefore(btn, p.nextSibling);
      measureDescription(p);
      if (descResizeObserver) descResizeObserver.observe(p);
    });
  }

  // Re-measure a description whenever its box changes (card shown, tab opened, width changed).
  var descResizeObserver = ("ResizeObserver" in window)
    ? new ResizeObserver(function (entries) {
        entries.forEach(function (entry) { measureDescription(entry.target); });
      })
    : null;

  function measureAllDescriptions() {
    document.querySelectorAll(".product > p").forEach(measureDescription);
  }

  /* ---------- 4. Hire Me panel ---------- */

  function setupHire() {
    var modal = document.getElementById("hireModal");
    var trigger = document.getElementById("hireMeBtn");
    if (!modal || !trigger || modal.__epHire) return;
    modal.__epHire = true;

    var lastFocus = null;
    var closeTimer = 0;

    function focusable() {
      return Array.prototype.slice.call(
        modal.querySelectorAll("a[href], button:not([disabled])")
      ).filter(function (el) { return el.offsetParent !== null; });
    }

    function open() {
      clearTimeout(closeTimer);
      lastFocus = document.activeElement;
      modal.hidden = false;
      document.body.classList.add("ep-modal-open");
      requestAnimationFrame(function () {
        modal.classList.add("is-open");
        var first = modal.querySelector(".ep-hire-close");
        if (first) first.focus();
      });
    }

    function close() {
      modal.classList.remove("is-open");
      document.body.classList.remove("ep-modal-open");
      closeTimer = setTimeout(function () { modal.hidden = true; }, 180);
      if (lastFocus && typeof lastFocus.focus === "function") lastFocus.focus();
    }

    trigger.addEventListener("click", open);

    modal.addEventListener("click", function (e) {
      if (!e.target.closest) return;
      if (e.target.closest("[data-ep-hire-close]")) close();
      // Opening an email link: close the panel behind it.
      else if (e.target.closest('.ep-hire-actions a, a[href^="mailto:"]')) close();
    });

    document.addEventListener("keydown", function (e) {
      if (modal.hidden) return;
      if (e.key === "Escape") {
        close();
        return;
      }
      if (e.key !== "Tab") return;
      var items = focusable();
      if (!items.length) return;
      var first = items[0];
      var last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    });
  }

  /* ---------- Boot ---------- */

  function runAll() {
    setupReveal();
    setupCollapsers();
    setupDescriptions();
    measureAllDescriptions();
  }

  var scheduled = 0;
  function scheduleRun() {
    if (scheduled) return;
    scheduled = requestAnimationFrame(function () {
      scheduled = 0;
      runAll();
    });
  }

  function init() {
    setupHire();
    runAll();

    if ("MutationObserver" in window) {
      new MutationObserver(scheduleRun).observe(document.body, {
        childList: true,
        subtree: true
      });
    }

    if (!descResizeObserver) {
      var resizeTimer = 0;
      window.addEventListener("resize", function () {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(measureAllDescriptions, 150);
      });
    }

    // The homepage store toggles cards on click; re-measure afterwards.
    document.addEventListener("click", function (e) {
      if (e.target.closest && e.target.closest(".store-more-btn")) {
        setTimeout(measureAllDescriptions, 60);
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
