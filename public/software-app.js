/* Single software page: /software-app.html?app=<slug>  (also accepts #<slug>) */
(function () {
  var apps = window.SW_APPS || [], info = window.SW_INFO || {};
  var $ = function (id) { return document.getElementById(id); };
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function initials(n) {
    var w = n.replace(/^Adobe /, "").split(/\s+/);
    return (w.length > 1 ? w[0][0] + w[1][0] : n.slice(0, 2)).toUpperCase();
  }
  function tile(a) {
    var ic = el("div", "app-ic", initials(a.name));
    ic.style.background = "linear-gradient(145deg," + a.color + ",#0b0b0b)";
    var img = document.createElement("img");
    img.alt = "";
    img.onload = function () { img.classList.add("ok"); };
    img.onerror = function () { img.remove(); };
    img.src = "/img/apps/" + a.slug + ".png";
    ic.appendChild(img);
    return ic;
  }
  function row(k, v) {
    var r = el("div", "sw-row");
    r.appendChild(el("span", "sw-k", k));
    r.appendChild(el("span", "sw-v", v));
    return r;
  }

  var slug = new URLSearchParams(location.search).get("app") || decodeURIComponent(location.hash.replace(/^#/, ""));
  var a = apps.filter(function (x) { return x.slug === slug; })[0];
  var box = $("app");

  if (!a) {
    box.appendChild(el("h2", "", "Software not found"));
    box.appendChild(el("p", "muted", "This app is not in our list. Go back and pick one from the Software page."));
    var back = el("a", "btn primary", "Browse software");
    back.href = "/software.html";
    box.appendChild(back);
    return;
  }

  var d = info[a.slug] || {};
  document.title = a.name + " — Creator Software Hub | EditPrompt.in";

  var head = el("div", "sw-head");
  head.appendChild(tile(a));
  var ht = el("div");
  ht.appendChild(el("h1", "", a.name));
  ht.appendChild(el("span", "hb-price", a.price));
  head.appendChild(ht);
  box.appendChild(head);

  var meta = el("div", "app-meta");
  a.cat.forEach(function (c) { meta.appendChild(el("span", "hb-chip hb-cat", c)); });
  box.appendChild(meta);
  box.appendChild(el("p", "muted sw-desc", a.desc));

  var grid = el("div", "sw-grid");
  if (d.size) grid.appendChild(row("Download size", d.size));
  grid.appendChild(row("Platforms", a.plat.join(", ")));
  if (d.level) grid.appendChild(row("Skill level", d.level));
  if (d.best) grid.appendChild(row("Best for", d.best));
  if (d.needs) grid.appendChild(row("Needs", d.needs));
  box.appendChild(grid);

  if (d.points && d.points.length) {
    box.appendChild(el("h4", "", "Highlights"));
    var ul = el("ul", "sw-pts");
    d.points.forEach(function (p) { ul.appendChild(el("li", "", p)); });
    box.appendChild(ul);
  }

  if (a.winget) {
    box.appendChild(el("h4", "", "Install with winget (Windows)"));
    var pre = el("pre", "kit-cmd sa-cmd", "winget install -e --id " + a.winget + " --accept-package-agreements --accept-source-agreements");
    box.appendChild(pre);
  }

  /* download panel — download starts from this page, no detour through another site */
  var panel = el("div", "dl-panel");
  var act = el("div", "app-act");
  var main = el("a", "btn primary dl-main", "Download from official site \u2197");
  main.href = a.url;  /* same tab, as requested */
  act.appendChild(main);
  if (a.play) {
    var gp = el("a", "btn primary dl-main", "Get it on Google Play \u2197");
    gp.href = a.play; gp.target = "_blank"; gp.rel = "noopener noreferrer";
    act.insertBefore(gp, main);
    main.className = "btn ghost";
    main.textContent = "Official site \u2197";
  }
  var all = el("a", "btn ghost", "All software");
  all.href = "/software.html";
  act.appendChild(all);
  panel.appendChild(act);
  var note = el("p", "muted hb-tiny dl-note");
  panel.appendChild(note);
  box.appendChild(panel);

  var hint = /Paid/.test(a.price) ? "This is paid software. The official page gives you the free trial or purchase option."
    : a.plat.length === 1 && a.plat[0] === "Web" ? "This app runs in the browser, so there is nothing to install."
    : a.plat.indexOf("Windows") < 0 ? "Install it from Google Play (Android) or the App Store (iPhone) \u2014 safe, and it updates by itself."
    : "Opens the official download page for this app.";
  var webOnly = a.plat.length === 1 && a.plat[0] === "Web";
  if (webOnly) main.textContent = "Open " + a.name + " \u2197";
  note.textContent = hint + (webOnly ? "" : " Size is approximate and changes with each version.");

  if (a.plat.indexOf("Windows") > -1) {
    fetch("/api/software/" + encodeURIComponent(a.slug) + "/direct")
      .then(function (r) { return r.json(); })
      .then(function (v) {
        if (!v || !v.available) return;
        main.textContent = "Download for Windows" + (v.sizeMB ? " (" + v.sizeMB + " MB)" : "");
        main.href = "/dl/" + encodeURIComponent(a.slug);
        main.removeAttribute("target"); main.removeAttribute("rel");
        var alt = el("a", "btn ghost", "Official site \u2197");
        alt.href = a.url; alt.target = "_blank"; alt.rel = "noopener noreferrer";
        act.insertBefore(alt, all);
        note.textContent = (v.version ? "Version " + v.version + (v.released ? " \u00b7 released " + v.released : "") + " \u00b7 " : "") + "File " + v.file +
          ". The download comes straight from the developer's official server, unmodified.";
        var st = el("div", "sw-grid");
        if (v.version) st.appendChild(row("Latest version", v.version));
        st.appendChild(row("Setup file", v.file));
        if (v.sizeMB) st.appendChild(row("Setup size", v.sizeMB + " MB"));
        st.appendChild(row("Setup type", v.type || "Offline installer, Windows 64-bit"));
        panel.insertBefore(st, act);
      })
      .catch(function () {});
  }

  var isPaid = /Paid/.test(a.price);
  var isWeb = a.plat.length === 1 && a.plat[0] === "Web";
  var isPhone = a.plat.indexOf("Windows") < 0 && a.plat.indexOf("macOS") < 0 && !isWeb;
  var steps, title = "How to install";
  if (isWeb) {
    title = "How to use";
    steps = ["Click the button above \u2014 the app opens in your browser.", "Nothing to install. Sign in on the official site if it asks.", "Save or export your work before closing the tab."];
  } else if (isPhone) {
    steps = ["Tap \u201cGet it on Google Play\u201d (Android) or search the app name in the App Store (iPhone).", "Tap Install and wait for it to finish.", "Open the app and allow photo/video access when asked."];
  } else if (isPaid) {
    title = "How to get the free trial";
    steps = ["Click the button above to start the official free-trial download (or the official site opens).", "Choose Free trial and sign in or create an account on that site.", "Download and install from there (some apps install through a manager app).", "When the trial ends, buy it or switch to a free option below."];
  } else if (a.slug === "davinci-resolve") {
    title = "How to download the free version";
    steps = ["Click the button above and choose the free DaVinci Resolve (not Studio).", "Fill the short registration form on the official page.", "The download starts. Open the file and follow the installer.", "Or on Windows, run the winget command shown above \u2014 no form needed."];
  } else {
    steps = ["Click the download button above and wait for the setup file to finish.", "Open the downloaded file and follow the installer.", "Start the app from the Start menu and check the official site for updates."];
  }
  box.appendChild(el("h4", "", title));
  var ol = el("ol", "sw-pts");
  steps.forEach(function (t) { ol.appendChild(el("li", "", t)); });
  box.appendChild(ol);

  /* video guide: a specific YouTube video if a.video is set (11-character id), otherwise a YouTube search */
  box.appendChild(el("h4", "", "Video guide"));
  if (a.video && /\.(mp4|webm|mov)$/i.test(a.video)) {
    /* your own video: put the file in public/videos/ and set video:"file-name.mp4" */
    var ov = el("div", "vid-wrap");
    var vd = document.createElement("video");
    vd.controls = true; vd.preload = "metadata"; vd.playsInline = true;
    vd.setAttribute("controlsList", "nodownload");
    vd.src = "/videos/" + encodeURIComponent(a.video);
    if (a.poster) vd.poster = "/videos/" + encodeURIComponent(a.poster);
    vd.textContent = "Your browser cannot play this video.";
    ov.appendChild(vd);
    box.appendChild(ov);
  } else if (a.video && /^[\w-]{11}$/.test(a.video)) {
    var vw = el("div", "vid-wrap");
    var fr = document.createElement("iframe");
    fr.src = "https://www.youtube-nocookie.com/embed/" + a.video;
    fr.title = a.name + " video guide";
    fr.loading = "lazy";
    fr.allow = "accelerometer; encrypted-media; picture-in-picture; fullscreen";
    fr.setAttribute("allowfullscreen", "");
    vw.appendChild(fr);
    box.appendChild(vw);
  } else {
    var q = a.name + (isWeb ? " how to use tutorial" : isPaid ? " free trial download and install" : isPhone ? " app tutorial for beginners" : " how to download and install");
    var vl = el("a", "btn ghost vid-link", "\u25b6 Watch on YouTube: " + q);
    vl.href = "https://www.youtube.com/results?search_query=" + encodeURIComponent(q);
    vl.target = "_blank"; vl.rel = "noopener noreferrer";
    box.appendChild(vl);
  }

  if (isPaid) {
    var alts = apps.filter(function (x) {
      return x.slug !== a.slug && /Open source|^Free$/.test(x.price) && x.plat.indexOf("Web") < 0 &&
        x.cat.some(function (c) { return a.cat.indexOf(c) > -1; });
    }).slice(0, 4);
    if (alts.length) {
      box.appendChild(el("h4", "", "Free alternatives"));
      var au = el("ul", "quick");
      alts.forEach(function (x) {
        var li = el("li"); var lk = el("a", "", x.name);
        lk.href = "/software-app.html?app=" + encodeURIComponent(x.slug);
        li.appendChild(lk); li.appendChild(el("span", "muted hb-tiny", x.price)); au.appendChild(li);
      });
      box.appendChild(au);
    }
  }

  /* more like this */
  var rel = apps.filter(function (x) {
    return x.slug !== a.slug && x.cat.some(function (c) { return a.cat.indexOf(c) > -1; });
  }).slice(0, 6);
  if (rel.length) {
    $("more").hidden = false;
    rel.forEach(function (x) {
      var li = el("li");
      var lk = el("a", "", x.name);
      lk.href = "/software-app.html?app=" + encodeURIComponent(x.slug);
      li.appendChild(lk);
      li.appendChild(el("span", "muted hb-tiny", x.price));
      $("moreList").appendChild(li);
    });
  }
})();
