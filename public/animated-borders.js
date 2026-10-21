/* EditPrompt — pause animated gradient borders when their box is off-screen.
   Saves battery and CPU on phones and long pages. Pure progressive enhancement:
   if IntersectionObserver is missing, the borders simply keep animating. */
(function () {
  if (!("IntersectionObserver" in window)) return;

  var selector = [
    ".window", ".panel", ".card", ".product", ".tool-hero", ".tool-panel",
    ".tool-card", ".resultbox", ".compare-card", ".pe-group", ".modalbox",
    ".pack-preview-dialog", ".side-card", ".sa-card", ".dl-panel",
    ".historyitem", ".mediabatch-tile", ".pack-image-card", ".float-card",
    ".statcard", ".media-card", ".v8-panel", ".adm-modal-card"
  ].join(",");

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      entry.target.classList.toggle("eb-paused", !entry.isIntersecting);
    });
  }, { rootMargin: "120px 0px" });

  function observeAll(root) {
    root.querySelectorAll(selector).forEach(function (el) {
      if (!el.dataset.ebObserved) {
        el.dataset.ebObserved = "1";
        io.observe(el);
      }
    });
  }

  observeAll(document);

  /* Pick up boxes that are added later (search results, generated items, modals). */
  var mo = new MutationObserver(function (mutations) {
    mutations.forEach(function (m) {
      m.addedNodes.forEach(function (node) {
        if (node.nodeType === 1) observeAll(node);
      });
    });
  });
  mo.observe(document.body, { childList: true, subtree: true });
})();
