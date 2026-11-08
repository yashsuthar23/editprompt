/* "Explore More Software": search + category chips over a short list of official-website cards. */
(function () {
  var APPS = [
    { n: "DaVinci Resolve", d: "Video editing, color grading and post-production.", c: "video", t: "Free version available", u: "https://www.blackmagicdesign.com/products/davinciresolve", i: "DR", col: "#7c5cff" },
    { n: "OBS Studio", d: "Screen recording and live streaming.", c: "video", t: "Free / Open Source", u: "https://obsproject.com/", i: "OBS", col: "#302e31" },
    { n: "GIMP", d: "Image editing, retouching and photo manipulation.", c: "photo", t: "Free / Open Source", u: "https://www.gimp.org/", i: "GIMP", col: "#8a6a3b" },
    { n: "Krita", d: "Digital painting, illustration and creative artwork.", c: "design", t: "Free / Open Source", u: "https://krita.org/", i: "Kr", col: "#e0399b" },
    { n: "Inkscape", d: "Vector artwork, logos, posters and illustrations.", c: "design", t: "Free / Open Source", u: "https://inkscape.org/", i: "Ink", col: "#3a3a3a" },
    { n: "Audacity", d: "Audio recording, editing and voice cleanup.", c: "audio", t: "Free / Open Source", u: "https://www.audacityteam.org/", i: "Au", col: "#1e6fe0" },
    { n: "Shotcut", d: "Video editing for a wide range of formats.", c: "video", t: "Free / Open Source", u: "https://shotcut.org/", i: "Sc", col: "#0e7fb0" },
    { n: "7-Zip", d: "File compression and archive management.", c: "utilities", t: "Free / Open Source", u: "https://www.7-zip.org/", i: "7z", col: "#222222" }
  ];
  var CATS = { video: "Video Editing", photo: "Photo Editing", design: "Graphic Design", audio: "Audio", utilities: "Utilities" };
  var EXT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17L17 7M8 7h9v9"/></svg>';

  var grid = document.getElementById("sdGrid");
  if (!grid) return;
  var input = document.getElementById("sdQ");
  var empty = document.getElementById("sdEmpty");
  var chips = document.querySelectorAll(".sd-chip");
  var cat = "all";

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text) e.textContent = text;
    return e;
  }

  function render() {
    var q = (input.value || "").trim().toLowerCase();
    grid.textContent = "";
    var shown = 0;

    APPS.forEach(function (a) {
      if (cat !== "all" && a.c !== cat) return;
      if (q && (a.n + " " + a.d + " " + CATS[a.c]).toLowerCase().indexOf(q) === -1) return;
      shown++;

      var card = el("a", "sd-card");
      card.href = a.u;
      card.target = "_blank";
      card.rel = "noopener noreferrer";
      card.style.setProperty("--c", a.col);
      card.setAttribute("aria-label", a.n + " official website");

      var top = el("div", "sd-top");
      top.appendChild(el("span", "sd-ico", a.i));
      top.appendChild(el("h3", "sd-name", a.n));
      card.appendChild(top);
      card.appendChild(el("p", "sd-desc", a.d));
      card.appendChild(el("span", "sd-tag", a.t));

      var link = el("span", "sd-link", "Official website ");
      link.insertAdjacentHTML("beforeend", EXT);
      card.appendChild(link);

      grid.appendChild(card);
    });

    empty.hidden = shown !== 0;
  }

  chips.forEach(function (chip) {
    chip.addEventListener("click", function () {
      cat = chip.getAttribute("data-cat");
      chips.forEach(function (c) { c.setAttribute("aria-pressed", c === chip ? "true" : "false"); });
      render();
    });
  });
  input.addEventListener("input", render);
  render();
})();
