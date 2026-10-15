(function () {
  var apps = window.SW_APPS || [], cats = window.SW_CATS || [];
  var state = { cat: "All", q: "", filter: "all" }, kit = {}, favorites = JSON.parse(localStorage.getItem("editprompt-sw-favorites") || "{}"), compare = {};
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

  function pageUrl(a) { return "/software-app.html?app=" + encodeURIComponent(a.slug); }
  function slug(s) { return s.toLowerCase().replace(/&/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
  var alias = { "graphic-design": "Graphics & Thumbnails", "graphics": "Graphics & Thumbnails", "video": "Video Editing", "ai": "AI Video", "3d": "3D & Animation", "reels": "Reels & Shorts", "shorts": "Reels & Shorts", "wedding": "Wedding & Event", "event": "Wedding & Event", "photo": "Photo Editing", "retouch": "Photo Editing", "poster": "Poster & Social Design", "banner": "Poster & Social Design", "social": "Poster & Social Design", "multimedia": "Multimedia Suite" };
  function fromHash() {
    var h = decodeURIComponent((location.hash || "").replace(/^#/, "")).toLowerCase();
    if (alias[h]) return alias[h];
    for (var i = 0; i < cats.length; i++) if (slug(cats[i]) === h) return cats[i];
    return "All";
  }
  state.cat = fromHash();

  /* tabs */
  var tabs = $("tabs");
  ["All"].concat(cats).forEach(function (c) {
    var b = el("button", c === state.cat ? "on" : "", c);
    b.type = "button";
    b.addEventListener("click", function () {
      state.cat = c;
      history.replaceState(null, "", c === "All" ? location.pathname : "#" + slug(c));
      Array.prototype.forEach.call(tabs.children, function (x) { x.classList.toggle("on", x === b); });
      render();
    });
    tabs.appendChild(b);
  });

  $("q").addEventListener("input", function (e) { state.q = e.target.value.trim().toLowerCase(); render(); });

  function card(a) {
    var c = el("article", "app");
    c.tabIndex = 0;
    c.setAttribute("role", "button");
    c.setAttribute("aria-label", a.name + " page");
    c.addEventListener("click", function (e) { if (!e.target.closest("a, label, input, button")) location.href = pageUrl(a); });
    c.addEventListener("keydown", function (e) { if ((e.key === "Enter" || e.key === " ") && e.target === c) { e.preventDefault(); location.href = pageUrl(a); } });
    var ic = el("div", "app-ic", initials(a.name));
    ic.style.background = "linear-gradient(145deg," + a.color + ",#0b0b0b)";
    var img = document.createElement("img");
    img.alt = "";
    img.onload = function () { img.classList.add("ok"); };
    img.onerror = function () { img.remove(); };   /* drop a real logo in /img/apps/<slug>.png to override the tile */
    img.src = "/img/apps/" + a.slug + ".png";
    ic.appendChild(img);
    c.appendChild(ic);

    var body = el("div", "app-body");
    var top = el("div", "app-top");
    top.appendChild(el("h3", "", a.name));
    top.appendChild(el("span", "hb-price", a.price));
    body.appendChild(top);

    var meta = el("div", "app-meta");
    a.cat.forEach(function (x) { meta.appendChild(el("span", "hb-chip hb-cat", x)); });
    a.plat.forEach(function (x) { meta.appendChild(el("span", "hb-chip", x)); });
    body.appendChild(meta);

    var fav = el("button", "app-fav" + (favorites[a.slug] ? " on" : ""), favorites[a.slug] ? "★" : "☆");
    fav.type = "button"; fav.title = "Favorite";
    fav.addEventListener("click", function(e) {
      e.stopPropagation();
      if (favorites[a.slug]) delete favorites[a.slug]; else favorites[a.slug] = true;
      localStorage.setItem("editprompt-sw-favorites", JSON.stringify(favorites));
      render();
    });
    top.appendChild(fav);

    var compareLabel = el("label", "app-compare");
    var compareBox = document.createElement("input");
    compareBox.type = "checkbox"; compareBox.checked = !!compare[a.slug];
    compareBox.addEventListener("change", function(e) {
      e.stopPropagation();
      if (compareBox.checked) compare[a.slug] = true; else delete compare[a.slug];
      renderCompareBar();
    });
    compareLabel.appendChild(compareBox); compareLabel.appendChild(document.createTextNode(" Compare"));
    body.appendChild(el("div","muted hb-tiny", a.winget ? "✓ Windows install kit available" : "Official source"));
    body.appendChild(compareLabel);

    body.appendChild(el("p", "muted", a.desc));

    var act = el("div", "app-act");
    var dl = el("a", "btn primary", "Open page \u2192");
    dl.href = pageUrl(a);
    act.appendChild(dl);
    if (a.winget) {
      var lab = el("label", "kit-add");
      var cb = document.createElement("input");
      cb.type = "checkbox"; cb.checked = !!kit[a.slug];
      cb.addEventListener("change", function () { if (cb.checked) kit[a.slug] = a; else delete kit[a.slug]; renderKit(); });
      lab.appendChild(cb); lab.appendChild(document.createTextNode(" Add to kit"));
      act.appendChild(lab);
    }
    body.appendChild(act);
    c.appendChild(body);
    return c;
  }


  function render() {
    var list = $("list"); list.textContent = "";
    var out = apps.filter(function (a) {
      var okC = state.cat === "All" || a.cat.indexOf(state.cat) > -1;
      var hay = (a.name + " " + a.desc + " " + a.cat.join(" ")).toLowerCase();
      var okF = state.filter === "all" ||
        (state.filter === "compare" && !!compare[a.slug]) ||
        (state.filter === "free" && /free|open source|freemium/i.test(a.price)) ||
        (state.filter === "windows" && a.plat.indexOf("Windows") > -1) ||
        (state.filter === "web" && a.plat.indexOf("Web") > -1) ||
        (state.filter === "favorites" && !!favorites[a.slug]);
      return okC && okF && (!state.q || hay.indexOf(state.q) > -1);
    });
    if (!out.length) { list.appendChild(el("p", "muted empty", "No apps found. Try another word or category.")); return; }
    out.forEach(function (a) { list.appendChild(card(a)); });
  }

  function lines() {
    return Object.keys(kit).map(function (k) {
      return "winget install -e --id " + kit[k].winget + " --accept-package-agreements --accept-source-agreements";
    });
  }
  function renderKit() {
    var l = lines(), n = l.length;
    $("kitCount").textContent = n;
    $("kitCmd").textContent = n ? l.join("\n") : "Select apps to build your script…";
    $("kitCopy").disabled = $("kitBat").disabled = !n;
  }
  $("kitCopy").addEventListener("click", function () {
    var t = lines().join("\n"), b = $("kitCopy");
    (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () {
      b.textContent = "Copied ✓"; setTimeout(function () { b.textContent = "Copy commands"; }, 1500);
    }).catch(function () { window.prompt("Copy these commands:", t); });
  });
  $("kitBat").addEventListener("click", function () {
    var t = "@echo off\r\necho Installing selected creator apps...\r\n" + lines().join("\r\n") + "\r\necho Done.\r\npause\r\n";
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([t], { type: "application/octet-stream" }));
    a.download = "editprompt-creator-kit.bat";
    document.body.appendChild(a); a.click(); a.remove();
  });

  /* enhanced filters */
  document.querySelectorAll(".hub-filter").forEach(function (b) {
    b.addEventListener("click", function () {
      state.filter = b.dataset.filter || "all";
      document.querySelectorAll(".hub-filter").forEach(function (x) { x.classList.toggle("on", x === b); });
      render();
      renderCompareBar();
    });
  });

  function renderCompareBar() {
    var keys = Object.keys(compare);
    var bar = $("compareBar");
    if (!bar) return;
    bar.hidden = !keys.length;
    $("compareCount").textContent = keys.length;
    $("compareBtn").disabled = keys.length < 2;
  }
  $("clearCompare")?.addEventListener("click", function(){ compare={}; renderCompareBar(); render(); });
  $("compareBtn")?.addEventListener("click", function(){
    var selected = apps.filter(function(a){ return !!compare[a.slug]; });
    if (selected.length < 2) return;
    if (selected.length > 4) return alert("Compare up to 4 apps.");
    var modal = $("compareModal"), head = $("compareHead"), body = $("compareBody");
    if (!modal || !head || !body) return;
    head.innerHTML = "<tr><th>Feature</th>" + selected.map(a=>"<th>"+escapeHtml(a.name)+"</th>").join("") + "</tr>";
    var rows = [
      ["Price", a=>a.price],
      ["Platforms", a=>a.plat.join(", ")],
      ["Categories", a=>a.cat.slice(0,4).join(", ")],
      ["Windows install kit", a=>a.winget ? "Available" : "Official source"],
      ["Website", a=>a.url]
    ];
    body.innerHTML = rows.map(r=>"<tr><td>"+escapeHtml(r[0])+"</td>"+selected.map(a=>"<td>"+escapeHtml(r[1](a))+"</td>").join("")+"</tr>").join("");
    modal.hidden = false;
  });
  $("closeCompare")?.addEventListener("click", function(){ $("compareModal").hidden = true; });
  $("compareModal")?.addEventListener("click", function(e){ if (e.target === $("compareModal")) $("compareModal").hidden = true; });
  function escapeHtml(v){ return String(v ?? "").replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c];}); }

  /* quick picks */
  var quick = $("quick");
  ["davinci-resolve", "vn-editor", "inshot", "kdenlive", "canva", "audacity"].forEach(function (s) {
    var a = apps.filter(function (x) { return x.slug === s; })[0]; if (!a) return;
    var li = el("li"); var lk = el("a", "", a.name); lk.href = pageUrl(a);
    li.appendChild(lk); li.appendChild(el("span", "muted hb-tiny", a.price)); quick.appendChild(li);
  });

  window.addEventListener("hashchange", function () {
    state.cat = fromHash();
    Array.prototype.forEach.call(tabs.children, function (x) { x.classList.toggle("on", x.textContent === state.cat); });
    render();
  });
  render(); renderKit(); renderCompareBar();
})();
