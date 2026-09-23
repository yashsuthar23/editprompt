// Admin Pro: Razorpay refunds, coupons, abandoned checkouts, banner / maintenance / feature flags, DB backups.
import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";

export function initAdminPro(db, baseDir) {
  db.exec(`
CREATE TABLE IF NOT EXISTS coupons(
  code TEXT PRIMARY KEY, kind TEXT NOT NULL, value INTEGER NOT NULL,
  max_uses INTEGER NOT NULL DEFAULT 0, expires_at TEXT,
  active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS checkout_orders(
  order_id TEXT PRIMARY KEY, user_id INTEGER, product_id TEXT, amount INTEGER NOT NULL,
  coupon TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS refunds(
  id INTEGER PRIMARY KEY AUTOINCREMENT, purchase_id INTEGER NOT NULL, refund_id TEXT,
  amount INTEGER NOT NULL, reason TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS site_settings(k TEXT PRIMARY KEY, v TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS support_messages(
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT NOT NULL, topic TEXT NOT NULL DEFAULT 'General',
  message TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS product_overrides(id TEXT PRIMARY KEY, name TEXT NOT NULL, price INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS email_optout(email TEXT PRIMARY KEY);
CREATE TABLE IF NOT EXISTS broadcasts(id INTEGER PRIMARY KEY AUTOINCREMENT, subject TEXT NOT NULL, segment TEXT NOT NULL, sent INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
  `);
  const hits = new Map();

  const getSet = (k, d = "") => db.prepare("SELECT v FROM site_settings WHERE k=?").get(k)?.v ?? d;
  const setSet = (k, v) =>
    db.prepare("INSERT INTO site_settings(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v").run(k, String(v));

  const couponUses = (code) =>
    db.prepare(
      "SELECT COUNT(*) n FROM checkout_orders c JOIN purchases p ON p.order_id=c.order_id AND p.status IN ('paid','refunded') WHERE c.coupon=?",
    ).get(code).n;

  // Returns {amount} (paise) or {error}. Razorpay minimum is 100 paise.
  function quote(code, price) {
    code = String(code || "").trim().toUpperCase();
    if (!code) return { amount: price, off: 0 };
    const c = db.prepare("SELECT * FROM coupons WHERE code=?").get(code);
    if (!c || !c.active) return { error: "Invalid coupon code." };
    if (c.expires_at && Date.parse(c.expires_at) < Date.now()) return { error: "This coupon has expired." };
    if (c.max_uses && couponUses(code) >= c.max_uses) return { error: "This coupon has reached its limit." };
    const off = c.kind === "percent" ? Math.floor((price * c.value) / 100) : c.value * 100;
    const amount = Math.max(100, price - off);
    return { amount, off: price - amount, coupon: code };
  }

  const logCheckout = (orderId, userId, productId, amount, coupon) =>
    db.prepare("INSERT OR IGNORE INTO checkout_orders(order_id,user_id,product_id,amount,coupon) VALUES(?,?,?,?,?)")
      .run(orderId, userId, productId, amount, coupon || null);

  const paidAmount = (orderId, fallback) =>
    db.prepare("SELECT amount FROM checkout_orders WHERE order_id=?").get(orderId)?.amount ?? fallback;

  // Maintenance mode and feature flag gate for public API routes.
  const gate = (req, res, next) => {
    const p = req.originalUrl.split("?")[0];
    if (p.startsWith("/api/admin") || p === "/api/site-status" || p === "/api/config" || p === "/api/contact" || p === "/api/unsubscribe" || p === "/api/product-prices") return next();
    if (getSet("maintenance") === "1")
      return res.status(503).json({ error: "We are doing a quick maintenance. Please try again soon." });
    if (getSet("media_off") === "1" && req.method === "POST" && p.startsWith("/api/media/"))
      return res.status(503).json({ error: "Media generation is paused for now. Please try again later." });
    next();
  };

  // Daily automatic backup, last 7 kept.
  const backupDir = path.join(baseDir, "backups");
  function backupNow() {
    fs.mkdirSync(backupDir, { recursive: true });
    const file = path.join(backupDir, `editprompt-${new Date().toISOString().slice(0, 10)}.db`);
    if (!fs.existsSync(file)) db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
    fs.readdirSync(backupDir).filter((f) => f.endsWith(".db")).sort().reverse().slice(7)
      .forEach((f) => fs.unlinkSync(path.join(backupDir, f)));
  }
  try { backupNow(); } catch (e) { console.warn("Backup failed:", e.message); }
  setInterval(() => { try { backupNow(); } catch {} }, 6 * 3600_000).unref();

  const SEG = {
    all: "1=1",
    buyers: "u.id IN (SELECT user_id FROM purchases WHERE status='paid' AND amount>0)",
    nonbuyers: "u.id NOT IN (SELECT user_id FROM purchases WHERE status='paid' AND amount>0)",
    inactive: "u.id NOT IN (SELECT user_id FROM prompt_history WHERE created_at>datetime('now','-30 days') UNION SELECT user_id FROM media_history WHERE created_at>datetime('now','-30 days'))",
  };
  const recipients = (seg) => db.prepare(`SELECT u.name,u.email FROM users u WHERE ${SEG[seg] || SEG.all}
      AND lower(u.email) NOT IN (SELECT lower(email) FROM blocked_emails) AND lower(u.email) NOT IN (SELECT email FROM email_optout)`).all();
  const secret = () => process.env.SESSION_SECRET || "dev";
  const unsubToken = (e) => crypto.createHmac("sha256", secret()).update(e.toLowerCase()).digest("hex").slice(0, 32);

  function mount({ app, requireAdmin, logAdmin, products, razorpayKeys, razorpayReady, mailer }) {
    for (const r of db.prepare("SELECT * FROM product_overrides").all()) if (products[r.id]) Object.assign(products[r.id], { name: r.name, price: r.price });

    app.get("/api/product-prices", (req, res) => res.json(Object.fromEntries(Object.entries(products).map(([k, v]) => [k, v.price / 100]))));

    app.get("/api/admin/products", requireAdmin, (req, res) =>
      res.json({ products: Object.entries(products).map(([id, p]) => ({ id, name: p.name, price: p.price / 100, file: p.file,
        sales: db.prepare("SELECT COUNT(*) n FROM purchases WHERE product_id=? AND status='paid' AND amount>0").get(id).n })) }));

    app.post("/api/admin/products", requireAdmin, (req, res) => {
      const id = String(req.body?.id || ""), name = String(req.body?.name || "").trim().slice(0, 80), price = Math.round(Number(req.body?.price) * 100);
      if (!products[id]) return res.status(404).json({ error: "Unknown product." });
      if (!name || !(price >= 100 && price <= 10_000_000)) return res.status(400).json({ error: "Enter a name and a price between ₹1 and ₹100000." });
      db.prepare("INSERT INTO product_overrides(id,name,price) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, price=excluded.price").run(id, name, price);
      logAdmin("product_edit", id, `${name} ₹${price / 100} (was ₹${products[id].price / 100})`);
      Object.assign(products[id], { name, price });
      res.json({ ok: true });
    });

    app.get("/api/admin/funnel", requireAdmin, (req, res) => {
      const n = (q) => db.prepare(q).get().n;
      res.json({ users: n("SELECT COUNT(*) n FROM users"), generated: n("SELECT COUNT(DISTINCT user_id) n FROM prompt_history"),
        checkout: n("SELECT COUNT(DISTINCT user_id) n FROM checkout_orders"), paid: n("SELECT COUNT(DISTINCT user_id) n FROM purchases WHERE status='paid' AND amount>0") });
    });

    // ---- Email broadcast (with unsubscribe + opt-out list) ----
    app.get("/api/admin/broadcast", requireAdmin, (req, res) =>
      res.json({ counts: Object.fromEntries(Object.keys(SEG).map((k) => [k, recipients(k).length])), smtp: Boolean(mailer),
        history: db.prepare("SELECT * FROM broadcasts ORDER BY id DESC LIMIT 10").all() }));

    app.post("/api/admin/broadcast", requireAdmin, (req, res) => {
      if (!mailer) return res.status(503).json({ error: "SMTP is not configured in .env, so emails cannot be sent." });
      const subject = String(req.body?.subject || "").trim().slice(0, 150), body = String(req.body?.body || "").trim().slice(0, 5000), seg = req.body?.segment;
      if (!subject || body.length < 10) return res.status(400).json({ error: "Enter a subject and a message." });
      const site = (process.env.SITE_URL || "").replace(/\/$/, "");
      const list = req.body?.test ? [{ name: "Admin", email: process.env.ADMIN_EMAIL }] : recipients(seg).slice(0, 500);
      if (!list.length) return res.status(400).json({ error: "No recipients in this segment." });
      const from = process.env.SMTP_FROM || process.env.SMTP_USER;
      let sent = 0;
      const bid = req.body?.test ? 0 : Number(db.prepare("INSERT INTO broadcasts(subject,segment) VALUES(?,?)").run(subject, String(seg)).lastInsertRowid);
      logAdmin(req.body?.test ? "broadcast_test" : "broadcast", String(seg || "test"), `${subject} (${list.length})`);
      res.json({ ok: true, queued: list.length });
      (async () => {
        for (const r of list) {
          const link = `${site}/api/unsubscribe?e=${encodeURIComponent(r.email)}&t=${unsubToken(r.email)}`;
          try {
            await mailer.sendMail({ from, to: r.email, subject, text: `Hi ${r.name || "there"},\n\n${body}\n\n--\nEditPrompt\nUnsubscribe: ${link}`, headers: { "List-Unsubscribe": `<${link}>` } });
            sent++;
          } catch (e) { console.warn("Broadcast mail failed:", e.message); }
          await new Promise((ok) => setTimeout(ok, 300));
        }
        if (bid) db.prepare("UPDATE broadcasts SET sent=? WHERE id=?").run(sent, bid);
      })();
    });

    app.get("/api/unsubscribe", (req, res) => {
      const e = String(req.query.e || "").toLowerCase(), t = String(req.query.t || "");
      const ok = e && t.length === 32 && crypto.timingSafeEqual(Buffer.from(t), Buffer.from(unsubToken(e)));
      if (ok) db.prepare("INSERT OR IGNORE INTO email_optout(email) VALUES(?)").run(e);
      res.status(ok ? 200 : 400).type("html").send(`<meta name=viewport content="width=device-width"><body style="font:16px system-ui;padding:40px;text-align:center">${ok ? "You have been unsubscribed. You will not get marketing emails from EditPrompt." : "This unsubscribe link is not valid."}</body>`);
    });

    app.get("/api/site-status", (req, res) =>
      res.json({ banner: { on: getSet("banner_on") === "1", text: getSet("banner_text") }, maintenance: getSet("maintenance") === "1" }));

    app.post("/api/coupon/check", (req, res) => {
      const p = products[req.body?.productId];
      if (!p) return res.status(400).json({ error: "Invalid product." });
      const q = quote(req.body?.code, p.price);
      if (q.error) return res.status(400).json({ error: q.error });
      res.json({ amount: q.amount / 100, off: q.off / 100 });
    });

    // ---- Public contact form -> support inbox ----
    app.post("/api/contact", (req, res) => {
      const now = Date.now(), h = (hits.get(req.ip) || []).filter((t) => now - t < 3600_000);
      if (h.length >= 5) return res.status(429).json({ error: "Too many messages. Please try again in an hour." });
      const b = req.body || {}, name = String(b.name || "").trim().slice(0, 80), email = String(b.email || "").trim().slice(0, 120);
      const message = String(b.message || "").trim().slice(0, 2000), topic = ["General", "Download", "Account", "Payment", "Refund"].includes(b.topic) ? b.topic : "General";
      if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || message.length < 10)
        return res.status(400).json({ error: "Please enter your name, a valid email and a message (at least 10 characters)." });
      hits.set(req.ip, [...h, now]);
      db.prepare("INSERT INTO support_messages(name,email,topic,message) VALUES(?,?,?,?)").run(name, email, topic, message);
      res.json({ ok: true });
    });

    app.get("/api/admin/support", requireAdmin, (req, res) =>
      res.json({ rows: db.prepare("SELECT * FROM support_messages ORDER BY (status='open') DESC, id DESC LIMIT 200").all() }));

    app.post("/api/admin/support/status", requireAdmin, (req, res) => {
      const st = req.body?.status === "open" ? "open" : "closed";
      db.prepare("UPDATE support_messages SET status=? WHERE id=?").run(st, Number(req.body?.id));
      logAdmin("support_" + st, String(req.body?.id), "");
      res.json({ ok: true });
    });

    // ---- Refunds (real Razorpay refund API) ----
    app.post("/api/admin/refund", requireAdmin, async (req, res) => {
      try {
        const row = db.prepare(
          "SELECT p.*, u.email FROM purchases p JOIN users u ON u.id=p.user_id WHERE p.id=?",
        ).get(Number(req.body?.purchaseId));
        if (!row || row.status !== "paid" || row.amount <= 0)
          return res.status(400).json({ error: "Only paid orders with an amount can be refunded." });
        if (!razorpayReady()) return res.status(503).json({ error: "Razorpay keys are not configured." });
        const done = db.prepare("SELECT COALESCE(SUM(amount),0) n FROM refunds WHERE purchase_id=?").get(row.id).n;
        const remaining = row.amount - done;
        const reason = String(req.body?.reason || "").trim().slice(0, 200);
        const amt = req.body?.amount ? Math.round(Number(req.body.amount) * 100) : remaining;
        if (!(amt > 0 && amt <= remaining)) return res.status(400).json({ error: `Refund must be between ₹1 and ₹${remaining / 100}.` });
        const { keyId, keySecret } = razorpayKeys();
        const rp = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(row.payment_id)}/refund`, {
          method: "POST",
          headers: { Authorization: "Basic " + Buffer.from(`${keyId}:${keySecret}`).toString("base64"), "Content-Type": "application/json" },
          body: JSON.stringify({ amount: amt, notes: { reason, purchaseId: String(row.id) } }),
        });
        const out = await rp.json();
        if (!rp.ok) return res.status(502).json({ error: out?.error?.description || "Razorpay refused the refund." });
        db.prepare("INSERT INTO refunds(purchase_id,refund_id,amount,reason) VALUES(?,?,?,?)").run(row.id, out.id, amt, reason);
        const full = amt === remaining;
        if (full) db.prepare("UPDATE purchases SET status='refunded' WHERE id=?").run(row.id);
        logAdmin("refund", row.email, `₹${amt / 100} ${full ? "full" : "partial"} (order #${row.id}) ${reason}`);
        res.json({ ok: true, full, refundId: out.id });
      } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Refund failed." });
      }
    });

    // ---- Coupons ----
    app.get("/api/admin/coupons", requireAdmin, (req, res) =>
      res.json({ coupons: db.prepare("SELECT * FROM coupons ORDER BY created_at DESC").all().map((c) => ({ ...c, used: couponUses(c.code) })) }));

    app.post("/api/admin/coupons", requireAdmin, (req, res) => {
      const code = String(req.body?.code || "").trim().toUpperCase();
      const kind = req.body?.kind === "flat" ? "flat" : "percent";
      const value = Math.floor(Number(req.body?.value));
      if (!/^[A-Z0-9_-]{3,20}$/.test(code)) return res.status(400).json({ error: "Code: 3-20 letters/numbers." });
      if (!(value > 0) || (kind === "percent" && value > 90)) return res.status(400).json({ error: "Percent must be 1-90; flat must be above 0." });
      const exp = req.body?.expiresAt ? new Date(req.body.expiresAt).toISOString() : null;
      try {
        db.prepare("INSERT INTO coupons(code,kind,value,max_uses,expires_at) VALUES(?,?,?,?,?)")
          .run(code, kind, value, Math.max(0, Math.floor(Number(req.body?.maxUses) || 0)), exp);
      } catch { return res.status(400).json({ error: "That code already exists." }); }
      logAdmin("coupon_create", code, `${kind} ${value}`);
      res.json({ ok: true });
    });

    app.post("/api/admin/coupons/toggle", requireAdmin, (req, res) => {
      const code = String(req.body?.code || "").toUpperCase();
      db.prepare("UPDATE coupons SET active=1-active WHERE code=?").run(code);
      logAdmin("coupon_toggle", code, "");
      res.json({ ok: true });
    });

    // ---- Abandoned checkouts: order created but never paid ----
    app.get("/api/admin/abandoned", requireAdmin, (req, res) =>
      res.json({
        rows: db.prepare(
          `SELECT c.order_id, c.product_id, c.amount, c.coupon, c.created_at, u.name, u.email
           FROM checkout_orders c LEFT JOIN users u ON u.id=c.user_id
           WHERE c.created_at < datetime('now','-20 minutes')
             AND NOT EXISTS (SELECT 1 FROM purchases p WHERE p.order_id=c.order_id)
           ORDER BY c.created_at DESC LIMIT 200`).all(),
      }));

    // ---- Site controls ----
    app.get("/api/admin/site-controls", requireAdmin, (req, res) =>
      res.json({ bannerOn: getSet("banner_on") === "1", bannerText: getSet("banner_text"), maintenance: getSet("maintenance") === "1", mediaOff: getSet("media_off") === "1" }));

    app.post("/api/admin/site-controls", requireAdmin, (req, res) => {
      const b = req.body || {};
      setSet("banner_on", b.bannerOn ? 1 : 0);
      setSet("banner_text", String(b.bannerText || "").slice(0, 200));
      setSet("maintenance", b.maintenance ? 1 : 0);
      setSet("media_off", b.mediaOff ? 1 : 0);
      logAdmin("site_controls", "", `banner=${!!b.bannerOn} maintenance=${!!b.maintenance} mediaOff=${!!b.mediaOff}`);
      res.json({ ok: true });
    });

    // ---- Database backup download ----
    app.get("/api/admin/backup", requireAdmin, (req, res) => {
      const tmp = path.join(os.tmpdir(), `ep-backup-${Date.now()}.db`);
      try {
        db.exec(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`);
        logAdmin("backup_download", "", "");
        res.download(tmp, `editprompt-${new Date().toISOString().slice(0, 10)}.db`, () => fs.unlink(tmp, () => {}));
      } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Backup failed." });
      }
    });
  }

  return { gate, quote, logCheckout, paidAmount, mount };
}
