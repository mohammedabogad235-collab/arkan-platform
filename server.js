"use strict";
const express = require("express");
const session = require("express-session");
const ConnectPg = require("connect-pg-simple");
const { Pool } = require("pg");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");

// ── Load .env manually ────────────────────────────────────────────────────────
const envPath = path.join(__dirname, ".env");
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, "utf8").split(/\r?\n/).forEach(line => {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim();
  });
}

const DATABASE_URL = process.env.DATABASE_URL;
const SESSION_SECRET = process.env.SESSION_SECRET || "arkan-secret-2024";
const PORT = parseInt(process.env.PORT || "3000", 10);

if (!DATABASE_URL) {
  console.error("[خطأ] DATABASE_URL غير موجود في ملف .env");
  process.exit(1);
}

// ── DB Pool ───────────────────────────────────────────────────────────────────
const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function q(sql, params = []) {
  const client = await pool.connect();
  try { return (await client.query(sql, params)).rows; }
  finally { client.release(); }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function hash(pwd) {
  return crypto.createHash("sha256").update(pwd + "arkan-pwd-salt-2024").digest("hex");
}

function safeUser(u) {
  return { id: u.id, fullName: u.full_name, phone: u.phone, email: u.email, username: u.username, role: u.role, createdAt: u.created_at };
}

async function enrichOrder(o) {
  const [user] = await q("SELECT * FROM users WHERE id=$1", [o.user_id]);
  let pkg = null, pm = null;
  if (o.package_id) {
    const [p] = await q("SELECT * FROM packages WHERE id=$1", [o.package_id]);
    if (p) pkg = { id: p.id, name: p.name, priceEgp: p.price_egp, priceSar: p.price_sar };
  }
  if (o.payment_method_id) {
    const [m] = await q("SELECT * FROM payment_methods WHERE id=$1", [o.payment_method_id]);
    if (m) pm = { id: m.id, name: m.name, details: m.details };
  }
  return {
    id: o.id, userId: o.user_id,
    siteName: o.site_name, siteType: o.site_type, details: o.details,
    packageId: o.package_id, customBudget: o.custom_budget, currency: o.currency,
    paymentMethodId: o.payment_method_id, status: o.status,
    depositPaid: o.deposit_paid, finalPaid: o.final_paid,
    totalAmount: o.total_amount, depositPercentage: o.deposit_percentage,
    notes: o.notes, couponCode: o.coupon_code, discountAmount: o.discount_amount,
    receiptUrl: o.receipt_url, finalReceiptUrl: o.final_receipt_url, deliveredUrl: o.delivered_url,
    createdAt: o.created_at, updatedAt: o.updated_at,
    user: user ? safeUser(user) : null, package: pkg, paymentMethod: pm,
  };
}

// ── Express ───────────────────────────────────────────────────────────────────
const app = express();
app.set("trust proxy", 1);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PgStore = ConnectPg(session);
app.use(session({
  store: new PgStore({ pool, tableName: "session", createTableIfMissing: true }),
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, secure: false, maxAge: 30 * 24 * 60 * 60 * 1000, sameSite: "lax" },
}));

// ── Middleware ────────────────────────────────────────────────────────────────
async function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: "يجب تسجيل الدخول أولاً" });
  next();
}

async function requireAdmin(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: "غير مصرح" });
  if (req.session.role === "admin") return next();
  const rows = await q("SELECT role FROM users WHERE id=$1", [req.session.userId]);
  if (rows[0]?.role === "admin") { req.session.role = "admin"; return next(); }
  return res.status(403).json({ error: "غير مصرح" });
}

// ══════════════════════════════════════════════════════════════════════════════
// AUTH
// ══════════════════════════════════════════════════════════════════════════════
app.post("/api/auth/register", async (req, res) => {
  try {
    const { fullName, phone, email, username, password } = req.body;
    if (!fullName || !phone || !email || !username || !password)
      return res.status(400).json({ error: "جميع الحقول مطلوبة" });
    const ex = await q("SELECT id FROM users WHERE username=$1 OR email=$2", [username, email]);
    if (ex.length) return res.status(409).json({ error: "اسم المستخدم أو البريد مستخدم بالفعل" });
    const [u] = await q(
      "INSERT INTO users(full_name,phone,email,username,password_hash,role) VALUES($1,$2,$3,$4,$5,'client') RETURNING *",
      [fullName, phone, email, username, hash(password)]
    );
    if (!req.session.userId) { req.session.userId = u.id; req.session.role = u.role; }
    res.status(201).json({ user: safeUser(u), message: "تم إنشاء الحساب بنجاح" });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const [u] = await q("SELECT * FROM users WHERE username=$1", [username]);
    if (!u || u.password_hash !== hash(password))
      return res.status(401).json({ error: "اسم المستخدم أو كلمة المرور غير صحيحة" });
    req.session.userId = u.id;
    req.session.role = u.role;
    res.json({ user: safeUser(u), message: "تم تسجيل الدخول بنجاح" });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/auth/logout", (req, res) => {
  req.session.destroy(() => res.json({ message: "تم تسجيل الخروج بنجاح" }));
});

app.get("/api/auth/me", async (req, res) => {
  try {
    if (!req.session.userId) return res.status(401).json({ error: "غير مصرح" });
    const [u] = await q("SELECT * FROM users WHERE id=$1", [req.session.userId]);
    if (!u) return res.status(401).json({ error: "المستخدم غير موجود" });
    res.json(safeUser(u));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════════════════════
// USERS
// ══════════════════════════════════════════════════════════════════════════════
app.get("/api/users", requireAdmin, async (req, res) => {
  const rows = await q("SELECT * FROM users ORDER BY created_at");
  res.json(rows.map(safeUser));
});

app.get("/api/users/:id", requireAdmin, async (req, res) => {
  const [u] = await q("SELECT * FROM users WHERE id=$1", [req.params.id]);
  if (!u) return res.status(404).json({ error: "المستخدم غير موجود" });
  res.json(safeUser(u));
});

app.patch("/api/users/:id/role", requireAdmin, async (req, res) => {
  const { role } = req.body;
  if (!["admin", "client"].includes(role))
    return res.status(400).json({ error: "الصلاحية يجب أن تكون admin أو client" });
  const [u] = await q("UPDATE users SET role=$1 WHERE id=$2 RETURNING *", [role, req.params.id]);
  if (!u) return res.status(404).json({ error: "المستخدم غير موجود" });
  res.json(safeUser(u));
});

app.patch("/api/admin/change-password", requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const [u] = await q("SELECT * FROM users WHERE id=$1", [req.session.userId]);
    if (!u || u.password_hash !== hash(currentPassword))
      return res.status(401).json({ error: "كلمة المرور الحالية غير صحيحة" });
    await q("UPDATE users SET password_hash=$1 WHERE id=$2", [hash(newPassword), req.session.userId]);
    res.json({ message: "تم تغيير كلمة المرور بنجاح" });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete("/api/users/:id", requireAdmin, async (req, res) => {
  await q("DELETE FROM users WHERE id=$1", [req.params.id]);
  res.sendStatus(204);
});

// ══════════════════════════════════════════════════════════════════════════════
// PACKAGES
// ══════════════════════════════════════════════════════════════════════════════
function fmtPkg(p) {
  return { id: p.id, name: p.name, description: p.description, priceEgp: p.price_egp, priceSar: p.price_sar, features: p.features, isActive: p.is_active, createdAt: p.created_at };
}

app.get("/api/packages", async (req, res) => {
  const rows = await q("SELECT * FROM packages ORDER BY id");
  res.json(rows.map(fmtPkg));
});

app.post("/api/packages", requireAdmin, async (req, res) => {
  try {
    const { name, description, priceEgp, priceSar, features, isActive } = req.body;
    const [p] = await q(
      "INSERT INTO packages(name,description,price_egp,price_sar,features,is_active) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",
      [name, description || "", priceEgp || 0, priceSar || 0, typeof features === "string" ? features : JSON.stringify(features || []), isActive !== false]
    );
    res.status(201).json(fmtPkg(p));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch("/api/packages/:id", requireAdmin, async (req, res) => {
  try {
    const { name, description, priceEgp, priceSar, features, isActive } = req.body;
    const fields = [], vals = [];
    if (name !== undefined) { fields.push(`name=$${vals.push(name)}`); }
    if (description !== undefined) { fields.push(`description=$${vals.push(description)}`); }
    if (priceEgp !== undefined) { fields.push(`price_egp=$${vals.push(priceEgp)}`); }
    if (priceSar !== undefined) { fields.push(`price_sar=$${vals.push(priceSar)}`); }
    if (features !== undefined) { fields.push(`features=$${vals.push(typeof features === "string" ? features : JSON.stringify(features))}`); }
    if (isActive !== undefined) { fields.push(`is_active=$${vals.push(isActive)}`); }
    if (!fields.length) return res.status(400).json({ error: "لا توجد بيانات" });
    vals.push(req.params.id);
    const [p] = await q(`UPDATE packages SET ${fields.join(",")} WHERE id=$${vals.length} RETURNING *`, vals);
    if (!p) return res.status(404).json({ error: "الباقة غير موجودة" });
    res.json(fmtPkg(p));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete("/api/packages/:id", requireAdmin, async (req, res) => {
  const [p] = await q("DELETE FROM packages WHERE id=$1 RETURNING id", [req.params.id]);
  if (!p) return res.status(404).json({ error: "الباقة غير موجودة" });
  res.sendStatus(204);
});

// ══════════════════════════════════════════════════════════════════════════════
// PAYMENT METHODS
// ══════════════════════════════════════════════════════════════════════════════
function fmtMethod(m) {
  return { id: m.id, name: m.name, details: m.details, currency: m.currency, isActive: m.is_active, createdAt: m.created_at };
}

app.get("/api/payment-methods", async (req, res) => {
  const rows = await q("SELECT * FROM payment_methods ORDER BY id");
  res.json(rows.map(fmtMethod));
});

app.post("/api/payment-methods", requireAdmin, async (req, res) => {
  try {
    const { name, details, currency, isActive } = req.body;
    const [m] = await q(
      "INSERT INTO payment_methods(name,details,currency,is_active) VALUES($1,$2,$3,$4) RETURNING *",
      [name, details || "", currency || "both", isActive !== false]
    );
    res.status(201).json(fmtMethod(m));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch("/api/payment-methods/:id", requireAdmin, async (req, res) => {
  try {
    const { name, details, currency, isActive } = req.body;
    const fields = [], vals = [];
    if (name !== undefined) { fields.push(`name=$${vals.push(name)}`); }
    if (details !== undefined) { fields.push(`details=$${vals.push(details)}`); }
    if (currency !== undefined) { fields.push(`currency=$${vals.push(currency)}`); }
    if (isActive !== undefined) { fields.push(`is_active=$${vals.push(isActive)}`); }
    if (!fields.length) return res.status(400).json({ error: "لا توجد بيانات" });
    vals.push(req.params.id);
    const [m] = await q(`UPDATE payment_methods SET ${fields.join(",")} WHERE id=$${vals.length} RETURNING *`, vals);
    if (!m) return res.status(404).json({ error: "طريقة الدفع غير موجودة" });
    res.json(fmtMethod(m));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete("/api/payment-methods/:id", requireAdmin, async (req, res) => {
  const [m] = await q("DELETE FROM payment_methods WHERE id=$1 RETURNING id", [req.params.id]);
  if (!m) return res.status(404).json({ error: "طريقة الدفع غير موجودة" });
  res.sendStatus(204);
});

// ══════════════════════════════════════════════════════════════════════════════
// ORDERS
// ══════════════════════════════════════════════════════════════════════════════
app.get("/api/orders", requireAuth, async (req, res) => {
  try {
    let rows;
    const { userId, status } = req.query;
    if (userId) rows = await q("SELECT * FROM orders WHERE user_id=$1 ORDER BY created_at DESC", [userId]);
    else if (status) rows = await q("SELECT * FROM orders WHERE status=$1 ORDER BY created_at DESC", [status]);
    else rows = await q("SELECT * FROM orders ORDER BY created_at DESC");
    res.json(await Promise.all(rows.map(enrichOrder)));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/orders/:id", requireAuth, async (req, res) => {
  try {
    const [o] = await q("SELECT * FROM orders WHERE id=$1", [req.params.id]);
    if (!o) return res.status(404).json({ error: "الطلب غير موجود" });
    res.json(await enrichOrder(o));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/orders", requireAuth, async (req, res) => {
  try {
    const { siteName, siteType, details, packageId, customBudget, currency, paymentMethodId, couponCode } = req.body;
    let appliedCoupon = null, discountAmt = 0;
    if (couponCode) {
      const code = couponCode.trim().toUpperCase();
      const [c] = await q("SELECT * FROM coupons WHERE code=$1 AND is_active=true", [code]);
      if (c && !(c.max_uses !== null && c.used_count >= c.max_uses) && !(c.expires_at && new Date(c.expires_at) < new Date())) {
        const amount = customBudget || 0;
        if (!c.min_order_amount || amount >= c.min_order_amount) {
          appliedCoupon = code;
          discountAmt = c.discount_type === "percentage"
            ? Math.round((amount * c.discount_value) / 100) : c.discount_value;
          await q("UPDATE coupons SET used_count=used_count+1 WHERE id=$1", [c.id]);
        }
      }
    }
    const [o] = await q(
      `INSERT INTO orders(user_id,site_name,site_type,details,package_id,custom_budget,currency,payment_method_id,status,deposit_paid,final_paid,coupon_code,discount_amount)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,'pending',false,false,$9,$10) RETURNING *`,
      [req.session.userId, siteName, siteType, details || "", packageId || null,
       customBudget || null, currency || "EGP", paymentMethodId || null, appliedCoupon, discountAmt]
    );
    res.status(201).json(await enrichOrder(o));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch("/api/orders/:id", requireAuth, async (req, res) => {
  try {
    const { status, notes, depositPaid, finalPaid, totalAmount, deliveredUrl } = req.body;
    const fields = [], vals = [];
    if (status !== undefined) { fields.push(`status=$${vals.push(status)}`); }
    if (notes !== undefined) { fields.push(`notes=$${vals.push(notes)}`); }
    if (depositPaid !== undefined) { fields.push(`deposit_paid=$${vals.push(depositPaid)}`); }
    if (finalPaid !== undefined) { fields.push(`final_paid=$${vals.push(finalPaid)}`); }
    if (totalAmount !== undefined) { fields.push(`total_amount=$${vals.push(totalAmount)}`); }
    if (deliveredUrl !== undefined) { fields.push(`delivered_url=$${vals.push(deliveredUrl)}`); }
    fields.push(`updated_at=NOW()`);
    if (fields.length === 1) return res.status(400).json({ error: "لا توجد بيانات" });
    vals.push(req.params.id);
    const [o] = await q(`UPDATE orders SET ${fields.join(",")} WHERE id=$${vals.length} RETURNING *`, vals);
    if (!o) return res.status(404).json({ error: "الطلب غير موجود" });
    res.json(await enrichOrder(o));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/orders/:id/receipt", requireAuth, async (req, res) => {
  try {
    const { receiptUrl } = req.body;
    if (!receiptUrl) return res.status(400).json({ error: "رابط الإيصال مطلوب" });
    const [o] = await q("UPDATE orders SET receipt_url=$1,updated_at=NOW() WHERE id=$2 RETURNING *", [receiptUrl, req.params.id]);
    if (!o) return res.status(404).json({ error: "الطلب غير موجود" });
    res.json(await enrichOrder(o));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/orders/:id/cancel", requireAuth, async (req, res) => {
  try {
    const [o] = await q("UPDATE orders SET status='cancelled',updated_at=NOW() WHERE id=$1 RETURNING *", [req.params.id]);
    if (!o) return res.status(404).json({ error: "الطلب غير موجود" });
    res.json(await enrichOrder(o));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/orders/:id/confirm-receipt", requireAdmin, async (req, res) => {
  try {
    const [o] = await q("UPDATE orders SET status='in_progress',deposit_paid=true,updated_at=NOW() WHERE id=$1 RETURNING *", [req.params.id]);
    if (!o) return res.status(404).json({ error: "الطلب غير موجود" });
    res.json(await enrichOrder(o));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete("/api/orders/:id", requireAdmin, async (req, res) => {
  await q("DELETE FROM orders WHERE id=$1", [req.params.id]);
  res.sendStatus(204);
});

// ══════════════════════════════════════════════════════════════════════════════
// SETTINGS
// ══════════════════════════════════════════════════════════════════════════════
app.get("/api/settings", async (req, res) => {
  try {
    let [s] = await q("SELECT * FROM site_settings LIMIT 1");
    if (!s) { [s] = await q("INSERT INTO site_settings DEFAULT VALUES RETURNING *"); }
    res.json({ ...s, requireDeposit: s.require_deposit, depositPercentageValue: s.deposit_percentage_value,
      facebookUrl: s.facebook_url, instagramUrl: s.instagram_url, twitterUrl: s.twitter_url });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch("/api/settings", requireAdmin, async (req, res) => {
  try {
    let [s] = await q("SELECT id FROM site_settings LIMIT 1");
    if (!s) { [s] = await q("INSERT INTO site_settings DEFAULT VALUES RETURNING *"); }
    const map = { phone1:"phone1", phone2:"phone2", email:"email", whatsapp:"whatsapp",
      address:"address", facebookUrl:"facebook_url", instagramUrl:"instagram_url",
      twitterUrl:"twitter_url", requireDeposit:"require_deposit", depositPercentageValue:"deposit_percentage_value" };
    const fields = [], vals = [];
    for (const [k, col] of Object.entries(map)) {
      if (req.body[k] !== undefined) { fields.push(`${col}=$${vals.push(req.body[k])}`); }
    }
    if (!fields.length) return res.status(400).json({ error: "لا توجد بيانات" });
    vals.push(s.id);
    const [updated] = await q(`UPDATE site_settings SET ${fields.join(",")} WHERE id=$${vals.length} RETURNING *`, vals);
    res.json({ ...updated, requireDeposit: updated.require_deposit, depositPercentageValue: updated.deposit_percentage_value,
      facebookUrl: updated.facebook_url, instagramUrl: updated.instagram_url, twitterUrl: updated.twitter_url });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════════════════════
// TESTIMONIALS
// ══════════════════════════════════════════════════════════════════════════════
function fmtTestimonial(t) {
  return { id: t.id, clientName: t.client_name, comment: t.comment, rating: t.rating,
    imageUrl: t.image_url, isActive: t.is_active, createdAt: t.created_at };
}

app.get("/api/testimonials", async (req, res) => {
  const rows = await q("SELECT * FROM testimonials ORDER BY id");
  res.json(rows.map(fmtTestimonial));
});

app.post("/api/testimonials", requireAdmin, async (req, res) => {
  try {
    const { clientName, comment, rating, imageUrl, isActive } = req.body;
    const [t] = await q(
      "INSERT INTO testimonials(client_name,comment,rating,image_url,is_active) VALUES($1,$2,$3,$4,$5) RETURNING *",
      [clientName, comment, rating || 5, imageUrl || null, isActive !== false]
    );
    res.status(201).json(fmtTestimonial(t));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch("/api/testimonials/:id", requireAdmin, async (req, res) => {
  try {
    const { clientName, comment, rating, imageUrl, isActive } = req.body;
    const fields = [], vals = [];
    if (clientName !== undefined) { fields.push(`client_name=$${vals.push(clientName)}`); }
    if (comment !== undefined) { fields.push(`comment=$${vals.push(comment)}`); }
    if (rating !== undefined) { fields.push(`rating=$${vals.push(rating)}`); }
    if (imageUrl !== undefined) { fields.push(`image_url=$${vals.push(imageUrl)}`); }
    if (isActive !== undefined) { fields.push(`is_active=$${vals.push(isActive)}`); }
    if (!fields.length) return res.status(400).json({ error: "لا توجد بيانات" });
    vals.push(req.params.id);
    const [t] = await q(`UPDATE testimonials SET ${fields.join(",")} WHERE id=$${vals.length} RETURNING *`, vals);
    if (!t) return res.status(404).json({ error: "التقييم غير موجود" });
    res.json(fmtTestimonial(t));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete("/api/testimonials/:id", requireAdmin, async (req, res) => {
  const [t] = await q("DELETE FROM testimonials WHERE id=$1 RETURNING id", [req.params.id]);
  if (!t) return res.status(404).json({ error: "التقييم غير موجود" });
  res.sendStatus(204);
});

// ══════════════════════════════════════════════════════════════════════════════
// COUPONS
// ══════════════════════════════════════════════════════════════════════════════
function fmtCoupon(c) {
  return { id: c.id, code: c.code, discountType: c.discount_type, discountValue: c.discount_value,
    minOrderAmount: c.min_order_amount, maxUses: c.max_uses, usedCount: c.used_count,
    isActive: c.is_active, expiresAt: c.expires_at ? new Date(c.expires_at).toISOString() : null, createdAt: c.created_at };
}

app.get("/api/coupons", requireAdmin, async (req, res) => {
  const rows = await q("SELECT * FROM coupons ORDER BY id");
  res.json(rows.map(fmtCoupon));
});

app.post("/api/coupons", requireAdmin, async (req, res) => {
  try {
    const { code, discountType, discountValue, minOrderAmount, maxUses, isActive, expiresAt } = req.body;
    if (!code || !discountType || discountValue == null) return res.status(400).json({ error: "الكود والخصم مطلوبان" });
    const upper = code.trim().toUpperCase();
    const ex = await q("SELECT id FROM coupons WHERE code=$1", [upper]);
    if (ex.length) return res.status(409).json({ error: "الكود موجود مسبقاً" });
    const [c] = await q(
      "INSERT INTO coupons(code,discount_type,discount_value,min_order_amount,max_uses,is_active,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *",
      [upper, discountType, discountValue, minOrderAmount || null, maxUses || null, isActive !== false, expiresAt ? new Date(expiresAt) : null]
    );
    res.status(201).json(fmtCoupon(c));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put("/api/coupons/:id", requireAdmin, async (req, res) => {
  try {
    const { isActive, maxUses, expiresAt, discountValue, minOrderAmount } = req.body;
    const fields = [], vals = [];
    if (isActive !== undefined) { fields.push(`is_active=$${vals.push(isActive)}`); }
    if (maxUses !== undefined) { fields.push(`max_uses=$${vals.push(maxUses)}`); }
    if (expiresAt !== undefined) { fields.push(`expires_at=$${vals.push(expiresAt ? new Date(expiresAt) : null)}`); }
    if (discountValue !== undefined) { fields.push(`discount_value=$${vals.push(discountValue)}`); }
    if (minOrderAmount !== undefined) { fields.push(`min_order_amount=$${vals.push(minOrderAmount)}`); }
    if (!fields.length) return res.status(400).json({ error: "لا توجد بيانات" });
    vals.push(req.params.id);
    const [c] = await q(`UPDATE coupons SET ${fields.join(",")} WHERE id=$${vals.length} RETURNING *`, vals);
    if (!c) return res.status(404).json({ error: "الكوبون غير موجود" });
    res.json(fmtCoupon(c));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete("/api/coupons/:id", requireAdmin, async (req, res) => {
  await q("DELETE FROM coupons WHERE id=$1", [req.params.id]);
  res.json({ success: true });
});

app.post("/api/coupons/validate", requireAuth, async (req, res) => {
  try {
    const { code, orderAmount } = req.body;
    if (!code) return res.status(400).json({ error: "الكود مطلوب" });
    const upper = code.trim().toUpperCase();
    const [c] = await q("SELECT * FROM coupons WHERE code=$1", [upper]);
    if (!c) return res.status(404).json({ error: "الكود غير موجود" });
    if (!c.is_active) return res.status(400).json({ error: "الكود غير نشط" });
    if (c.expires_at && new Date(c.expires_at) < new Date()) return res.status(400).json({ error: "انتهت صلاحية الكود" });
    if (c.max_uses !== null && c.used_count >= c.max_uses) return res.status(400).json({ error: "تجاوز الكود الحد الأقصى" });
    if (c.min_order_amount && orderAmount < c.min_order_amount) return res.status(400).json({ error: `الحد الأدنى للطلب ${c.min_order_amount}` });
    const discountAmount = c.discount_type === "percentage"
      ? Math.round(((orderAmount || 0) * c.discount_value) / 100) : c.discount_value;
    res.json({ valid: true, coupon: fmtCoupon(c), discountAmount });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════════════════════
// ADMIN STATS
// ══════════════════════════════════════════════════════════════════════════════
app.get("/api/admin/stats", requireAdmin, async (req, res) => {
  try {
    const [[tu],[to],[pending],[completed],[inProg],[rev]] = await Promise.all([
      q("SELECT COUNT(*) FROM users"),
      q("SELECT COUNT(*) FROM orders"),
      q("SELECT COUNT(*) FROM orders WHERE status='pending'"),
      q("SELECT COUNT(*) FROM orders WHERE status='completed'"),
      q("SELECT COUNT(*) FROM orders WHERE status='in_progress'"),
      q("SELECT COALESCE(SUM(total_amount),0) as total FROM orders WHERE status='completed'"),
    ]);
    const recent = await q("SELECT * FROM orders ORDER BY created_at DESC LIMIT 10");
    res.json({
      totalUsers: parseInt(tu.count), totalOrders: parseInt(to.count),
      pendingOrders: parseInt(pending.count), completedOrders: parseInt(completed.count),
      inProgressOrders: parseInt(inProg.count), totalRevenue: parseFloat(rev.total),
      recentOrders: await Promise.all(recent.map(enrichOrder)),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════════════════════
// STORAGE (disabled locally — returns 501)
// ══════════════════════════════════════════════════════════════════════════════
app.post("/api/storage/uploads/request-url", (req, res) => {
  res.status(501).json({ error: "رفع الملفات غير متاح في النسخة المحلية" });
});

// ══════════════════════════════════════════════════════════════════════════════
// HEALTH
// ══════════════════════════════════════════════════════════════════════════════
app.get("/api/health", (req, res) => res.json({ status: "ok" }));

// ══════════════════════════════════════════════════════════════════════════════
// SERVE FRONTEND
// ══════════════════════════════════════════════════════════════════════════════
const frontendDist = path.resolve(__dirname, "artifacts/website-builder/dist");
const frontendIndex = path.join(frontendDist, "index.html");

if (fs.existsSync(frontendDist) && fs.existsSync(frontendIndex)) {
  app.use(express.static(frontendDist, { index: false }));
  app.get(/^(?!\/api(?:\/|$)).*/, (req, res, next) => {
    if (path.extname(req.path)) {
      return next();
    }

    return res.sendFile(frontendIndex);
  });
} else {
  console.warn("[تحذير] مجلد الواجهة المبنية غير موجود — تأكد من وجود artifacts/website-builder/dist");
  app.use((req, res) => res.status(404).send("Frontend not found. Build artifacts/website-builder first."));
}

// ══════════════════════════════════════════════════════════════════════════════
// STARTUP
// ══════════════════════════════════════════════════════════════════════════════
async function ensureAdmin() {
  const h = hash("admin123");
  const [ex] = await q("SELECT id,password_hash FROM users WHERE username='admin'");
  if (!ex) {
    await q("INSERT INTO users(full_name,phone,email,username,password_hash,role) VALUES('المدير','01000000000','admin@platform.com','admin',$1,'admin')", [h]);
    console.log("[+] تم إنشاء حساب الأدمن");
  } else if (ex.password_hash !== h) {
    await q("UPDATE users SET password_hash=$1,role='admin' WHERE username='admin'", [h]);
    console.log("[+] تم تحديث الأدمن");
  }
}

async function start() {
  try {
    await pool.query("SELECT 1");
    console.log("[✓] تم الاتصال بقاعدة البيانات");
  } catch (e) {
    console.error("[✗] فشل الاتصال بقاعدة البيانات:", e.message);
    process.exit(1);
  }
  await ensureAdmin();
  app.listen(PORT, () => {
    console.log(`\n${"=".repeat(40)}`);
    console.log(`   اركان يعمل على: http://localhost:${PORT}`);
    console.log(`${"=".repeat(40)}`);
    console.log(`   المستخدم: admin`);
    console.log(`   كلمة المرور: admin123`);
    console.log(`${"=".repeat(40)}\n`);
  });
}

start().catch(e => { console.error(e); process.exit(1); });
