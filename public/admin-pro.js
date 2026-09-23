/* Admin Pro Tools tab: refunds, coupons, abandoned checkouts, site controls, backup. */
(function () {
  var bar = document.querySelector(".adm-tab-btn") && document.querySelector(".adm-tab-btn").parentNode;
  var ref = document.getElementById("tab-overview");
  if (!bar || !ref) return;

  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var inr = function (p) { return "₹" + (p / 100).toLocaleString("en-IN"); };
  function api(url, body) {
    return fetch(url, { method: body ? "POST" : "GET", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { if (!r.ok) throw new Error(d.error || "Request failed"); return d; }); });
  }

  var st = document.createElement("style");
  st.textContent = "#tab-pro:not(.adm-hide){display:grid;gap:22px;padding-top:20px;padding-bottom:40px}#tab-pro .panel{padding:22px 24px;margin:0}#tab-pro h3{margin:0 0 6px;font-size:18px}#tab-pro .muted{margin:0 0 14px;line-height:1.5}#tab-pro .adm-tools{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:14px 0}#tab-pro .adm-tools label{display:flex;gap:8px;align-items:center}#tab-pro table{width:100%;border-collapse:collapse;margin-top:8px}#tab-pro th,#tab-pro td{padding:11px 14px;text-align:left;vertical-align:top;border-bottom:1px solid rgba(255,255,255,.08)}#tab-pro th{font-size:12px;letter-spacing:.04em;text-transform:uppercase;opacity:.7}#tab-pro .pro-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:14px;margin-top:10px}#tab-pro .pro-kpi{padding:16px;border:1px solid rgba(255,255,255,.1);border-radius:14px}#tab-pro .pro-kpi b{display:block;font-size:26px}#tab-pro .pro-kpi span{font-size:13px;opacity:.7}#tab-pro textarea.adm-input{width:100%;min-height:110px;resize:vertical}#tab-pro .btn+.btn,#tab-pro .btn+a.btn{margin-left:6px}";
  document.head.appendChild(st);
  var btn = document.createElement("button");
  btn.className = "adm-tab-btn"; btn.type = "button"; btn.setAttribute("role", "tab"); btn.dataset.proTab = "1"; btn.textContent = "Pro Tools";
  bar.appendChild(btn);

  var panel = document.createElement("div");
  panel.id = "tab-pro"; panel.setAttribute("role", "tabpanel"); panel.className = "adm-hide";
  panel.innerHTML =
    '<div class="panel"><h3>Conversion funnel</h3><p class="muted">Where visitors drop off, from signup to payment.</p><div id="proFunnel"></div></div>' +
    '<div class="panel"><h3>Products &amp; pricing</h3><p class="muted">Price changes apply to checkout immediately and update the price text on the product page.</p><div id="proProducts"></div></div>' +
    '<div class="panel"><h3>Email broadcast</h3><p class="muted">Every email includes an unsubscribe link. Blocked and unsubscribed users are skipped automatically.</p>' +
    '<div class="adm-tools"><select id="bcSeg" class="adm-input"></select><input id="bcSubject" class="adm-input grow" maxlength="150" placeholder="Subject" /></div>' +
    '<textarea id="bcBody" class="adm-input" maxlength="5000" placeholder="Write your message…"></textarea>' +
    '<div class="adm-tools"><button id="bcTest" class="btn ghost small" type="button">Send test to me</button><button id="bcSend" class="btn small" type="button">Send to segment</button><span id="bcMsg" class="muted" style="margin:0"></span></div><div id="proBc"></div></div>' +
    '<div class="panel"><h3>Support inbox</h3><p class="muted">Messages from the public contact form.</p><div id="proSupport"></div></div>' +
    '<div class="panel"><h3>Refunds</h3><p class="muted">Refunds go through Razorpay and remove access on a full refund.</p><div id="proRefunds"></div></div>' +
    '<div class="panel"><h3>Coupons</h3><p class="muted">Share a link like <code>/index.html?coupon=DIWALI</code> on the product page to apply a code automatically.</p>' +
    '<div class="adm-tools"><input id="cpCode" class="adm-input" placeholder="CODE" maxlength="20" />' +
    '<select id="cpKind" class="adm-input"><option value="percent">% off</option><option value="flat">₹ off</option></select>' +
    '<input id="cpValue" class="adm-input" type="number" min="1" placeholder="Value" style="width:90px" />' +
    '<input id="cpMax" class="adm-input" type="number" min="0" placeholder="Max uses (0 = ∞)" style="width:140px" />' +
    '<input id="cpExp" class="adm-input" type="date" /><button id="cpAdd" class="btn small" type="button">Create</button></div><div id="proCoupons"></div></div>' +
    '<div class="panel"><h3>Abandoned checkouts</h3><p class="muted">Payment started more than 20 minutes ago and never completed.</p><div id="proAband"></div></div>' +
    '<div class="panel"><h3>Site controls</h3>' +
    '<div class="adm-tools"><input id="scText" class="adm-input grow" maxlength="200" placeholder="Announcement banner text (e.g. Diwali sale: use code DIWALI)" />' +
    '<label><input id="scBanner" type="checkbox" /> Show banner</label></div>' +
    '<div class="adm-tools"><label><input id="scMaint" type="checkbox" /> Maintenance mode (blocks the public API; admin keeps working)</label></div>' +
    '<div class="adm-tools"><label><input id="scMedia" type="checkbox" /> Pause media generation</label></div>' +
    '<div class="adm-tools"><button id="scSave" class="btn small" type="button">Save</button>' +
    '<a class="btn ghost small" href="/api/admin/backup">Download database backup</a><span id="scMsg" class="muted"></span></div></div>';
  ref.parentNode.insertBefore(panel, ref);

  var $ = function (id) { return document.getElementById(id); };
  var loaded = false;

  function show() {
    document.querySelectorAll('[role="tabpanel"]').forEach(function (p) { p.classList.add("adm-hide"); });
    document.querySelectorAll(".adm-tab-btn").forEach(function (b) { b.classList.remove("active"); b.setAttribute("aria-selected", "false"); });
    panel.classList.remove("adm-hide"); btn.classList.add("active"); btn.setAttribute("aria-selected", "true");
    if (!loaded) { loaded = true; loadAll(); }
  }
  bar.addEventListener("click", function (e) {
    var b = e.target.closest(".adm-tab-btn");
    if (!b) return;
    if (b === btn) show(); else { panel.classList.add("adm-hide"); btn.classList.remove("active"); }
  });

  function table(head, rows) {
    if (!rows.length) return '<p class="muted">Nothing here yet.</p>';
    return '<div style="overflow-x:auto"><table class="adm-table"><thead><tr>' + head.map(function (h) { return "<th>" + h + "</th>"; }).join("") + "</tr></thead><tbody>" + rows.join("") + "</tbody></table></div>";
  }

  function loadRefunds() {
    api("/api/admin/orders").then(function (d) {
      var paid = (d.orders || []).filter(function (o) { return o.status === "paid" && o.amount > 0; }).slice(0, 50);
      $("proRefunds").innerHTML = table(["#", "Customer", "Product", "Amount", "Date", ""], paid.map(function (o) {
        return "<tr><td>" + o.id + "</td><td>" + esc(o.name) + '<br><span class="muted">' + esc(o.email) + "</span></td><td>" + esc(o.product_id) + "</td><td>" + inr(o.amount) + "</td><td>" + esc(String(o.created_at).slice(0, 10)) + '</td><td><button class="btn ghost small" data-refund="' + o.id + '" data-amt="' + o.amount / 100 + '">Refund</button></td></tr>';
      }));
    }).catch(function (e) { $("proRefunds").textContent = e.message; });
  }
  $("proRefunds").addEventListener("click", function (e) {
    var id = e.target.dataset && e.target.dataset.refund;
    if (!id) return;
    var amt = prompt("Refund amount in ₹ (max " + e.target.dataset.amt + "). Leave as is for a full refund:", e.target.dataset.amt);
    if (amt === null) return;
    var reason = prompt("Reason for the refund (saved in the audit log):", "");
    if (reason === null) return;
    if (!confirm("Refund ₹" + amt + " to the customer? This cannot be undone.")) return;
    api("/api/admin/refund", { purchaseId: Number(id), amount: amt, reason: reason }).then(function (r) { alert(r.full ? "Full refund done. Access removed." : "Partial refund done."); loadRefunds(); }).catch(function (er) { alert(er.message); });
  });

  function loadCoupons() {
    api("/api/admin/coupons").then(function (d) {
      $("proCoupons").innerHTML = table(["Code", "Discount", "Used", "Expires", "Status", ""], d.coupons.map(function (c) {
        return "<tr><td><b>" + esc(c.code) + "</b></td><td>" + (c.kind === "percent" ? c.value + "%" : "₹" + c.value) + "</td><td>" + c.used + (c.max_uses ? " / " + c.max_uses : "") + "</td><td>" + esc(c.expires_at ? c.expires_at.slice(0, 10) : "Never") + "</td><td>" + (c.active ? "Active" : "Off") + '</td><td><button class="btn ghost small" data-cp="' + esc(c.code) + '">' + (c.active ? "Disable" : "Enable") + "</button></td></tr>";
      }));
    }).catch(function (e) { $("proCoupons").textContent = e.message; });
  }
  $("proCoupons").addEventListener("click", function (e) {
    var code = e.target.dataset && e.target.dataset.cp;
    if (code) api("/api/admin/coupons/toggle", { code: code }).then(loadCoupons);
  });
  $("cpAdd").addEventListener("click", function () {
    api("/api/admin/coupons", { code: $("cpCode").value, kind: $("cpKind").value, value: $("cpValue").value, maxUses: $("cpMax").value, expiresAt: $("cpExp").value })
      .then(function () { $("cpCode").value = ""; $("cpValue").value = ""; loadCoupons(); }).catch(function (e) { alert(e.message); });
  });

  function loadAband() {
    api("/api/admin/abandoned").then(function (d) {
      $("proAband").innerHTML = table(["Customer", "Product", "Amount", "Coupon", "Started", ""], d.rows.map(function (r) {
        var mail = r.email ? '<a class="btn ghost small" href="mailto:' + esc(r.email) + "?subject=" + encodeURIComponent("Complete your EditPrompt purchase") + '">Email</a>' : "";
        return "<tr><td>" + esc(r.name || "Unknown") + '<br><span class="muted">' + esc(r.email || "") + "</span></td><td>" + esc(r.product_id) + "</td><td>" + inr(r.amount) + "</td><td>" + esc(r.coupon || "") + "</td><td>" + esc(r.created_at) + "</td><td>" + mail + "</td></tr>";
      }));
    }).catch(function (e) { $("proAband").textContent = e.message; });
  }

  function loadControls() {
    api("/api/admin/site-controls").then(function (s) { $("scText").value = s.bannerText; $("scBanner").checked = s.bannerOn; $("scMaint").checked = s.maintenance; $("scMedia").checked = s.mediaOff; });
  }
  $("scSave").addEventListener("click", function () {
    api("/api/admin/site-controls", { bannerText: $("scText").value, bannerOn: $("scBanner").checked, maintenance: $("scMaint").checked, mediaOff: $("scMedia").checked })
      .then(function () { $("scMsg").textContent = "Saved."; setTimeout(function () { $("scMsg").textContent = ""; }, 2500); }).catch(function (e) { alert(e.message); });
  });

  function loadSupport() {
    api("/api/admin/support").then(function (d) {
      $("proSupport").innerHTML = table(["From", "Topic", "Message", "Date", ""], d.rows.map(function (r) {
        var open = r.status === "open";
        return "<tr><td>" + esc(r.name) + '<br><span class="muted">' + esc(r.email) + "</span></td><td>" + esc(r.topic) + '</td><td style="max-width:360px;white-space:pre-wrap">' + esc(r.message) + "</td><td>" + esc(String(r.created_at).slice(0, 16)) + '</td><td><a class="btn ghost small" href="mailto:' + esc(r.email) + "?subject=" + encodeURIComponent("Re: " + r.topic + " - EditPrompt Support") + '">Reply</a> <button class="btn ghost small" data-sup="' + r.id + '" data-st="' + (open ? "closed" : "open") + '">' + (open ? "Close" : "Reopen") + "</button></td></tr>";
      }));
    }).catch(function (e) { $("proSupport").textContent = e.message; });
  }
  $("proSupport").addEventListener("click", function (e) {
    var id = e.target.dataset && e.target.dataset.sup;
    if (id) api("/api/admin/support/status", { id: Number(id), status: e.target.dataset.st }).then(loadSupport);
  });

  function loadFunnel() {
    api("/api/admin/funnel").then(function (f) {
      var steps = [["Signed up", f.users], ["Generated a prompt", f.generated], ["Started checkout", f.checkout], ["Paid", f.paid]];
      $("proFunnel").innerHTML = '<div class="pro-kpis">' + steps.map(function (s, i) {
        var pct = i && steps[i - 1][1] ? Math.round((s[1] / steps[i - 1][1]) * 100) + "% of previous" : "&nbsp;";
        return '<div class="pro-kpi"><b>' + s[1] + "</b>" + s[0] + "<br><span>" + pct + "</span></div>";
      }).join("") + "</div>";
    }).catch(function (e) { $("proFunnel").textContent = e.message; });
  }
  function loadProducts() {
    api("/api/admin/products").then(function (d) {
      $("proProducts").innerHTML = table(["Product", "Price (₹)", "Sales", ""], d.products.map(function (p) {
        return '<tr><td><input class="adm-input" data-pn="' + p.id + '" value="' + esc(p.name) + '" style="min-width:240px"></td><td><input class="adm-input" type="number" min="1" data-pp="' + p.id + '" value="' + p.price + '" style="width:110px"></td><td>' + p.sales + '</td><td><button class="btn small" data-psave="' + p.id + '">Save</button></td></tr>';
      }));
    }).catch(function (e) { $("proProducts").textContent = e.message; });
  }
  $("proProducts").addEventListener("click", function (e) {
    var id = e.target.dataset && e.target.dataset.psave;
    if (!id) return;
    var name = $("proProducts").querySelector('[data-pn="' + id + '"]').value, price = $("proProducts").querySelector('[data-pp="' + id + '"]').value;
    if (!confirm("Change " + id + " to ₹" + price + "?")) return;
    api("/api/admin/products", { id: id, name: name, price: price }).then(function () { alert("Saved."); loadProducts(); }).catch(function (er) { alert(er.message); });
  });
  var segNames = { all: "All users", buyers: "Buyers", nonbuyers: "Non-buyers", inactive: "Inactive 30 days" };
  function loadBroadcast() {
    api("/api/admin/broadcast").then(function (d) {
      $("bcSeg").innerHTML = Object.keys(segNames).map(function (k) { return '<option value="' + k + '">' + segNames[k] + " (" + d.counts[k] + ")</option>"; }).join("");
      $("proBc").innerHTML = (d.smtp ? "" : '<p class="muted">SMTP is not configured, so sending is disabled.</p>') + (d.history.length ? table(["Subject", "Segment", "Sent", "Date"], d.history.map(function (h) { return "<tr><td>" + esc(h.subject) + "</td><td>" + esc(h.segment) + "</td><td>" + h.sent + "</td><td>" + esc(String(h.created_at).slice(0, 16)) + "</td></tr>"; })) : "");
    }).catch(function (e) { $("proBc").textContent = e.message; });
  }
  function bc(test) {
    var body = { subject: $("bcSubject").value, body: $("bcBody").value, segment: $("bcSeg").value, test: test };
    if (!test && !confirm("Send this email to the selected segment? This cannot be undone.")) return;
    api("/api/admin/broadcast", body).then(function (r) { $("bcMsg").textContent = "Queued " + r.queued + " email(s)."; setTimeout(loadBroadcast, 4000); }).catch(function (e) { alert(e.message); });
  }
  $("bcTest").addEventListener("click", function () { bc(true); });
  $("bcSend").addEventListener("click", function () { bc(false); });

  function loadAll() { loadFunnel(); loadProducts(); loadBroadcast(); loadSupport(); loadRefunds(); loadCoupons(); loadAband(); loadControls(); }
})();
