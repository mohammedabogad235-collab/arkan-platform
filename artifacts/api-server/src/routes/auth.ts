import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { RegisterBody } from "@workspace/api-zod";
import * as crypto from "crypto";

const router: IRouter = Router();

function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password + "arkan-pwd-salt-2024").digest("hex");
}

function sanitizeUser(user: typeof usersTable.$inferSelect) {
  return {
    id: user.id,
    fullName: user.fullName,
    phone: user.phone,
    email: user.email,
    username: user.username,
    role: user.role,
    permissions: user.permissions ? JSON.parse(user.permissions) : [],
    isActive: user.isActive,
    createdAt: user.createdAt.toISOString(),
  };
}

router.post("/auth/register", async (req, res): Promise<void> => {
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { fullName, phone, email, password } = parsed.data;

  const existingPhone = await db.select().from(usersTable).where(eq(usersTable.phone, phone));
  if (existingPhone.length > 0) {
    res.status(409).json({ error: "رقم الهاتف مسجل من قبل", field: "phone" });
    return;
  }

  const existingEmail = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (existingEmail.length > 0) {
    res.status(409).json({ error: "هذا البريد مسجل من قبل", field: "email" });
    return;
  }

  // Auto-generate a unique username from phone digits
  const username = "u_" + phone.replace(/\D/g, "") + "_" + Date.now().toString().slice(-4);

  const passwordHash = hashPassword(password);
  const [user] = await db.insert(usersTable).values({
    fullName,
    phone,
    email,
    username,
    passwordHash,
    role: "client",
  }).returning();

  // Only set session if there's no existing admin session
  const existingUserId = (req.session as Record<string, unknown>).userId as number | undefined;
  if (!existingUserId) {
    (req.session as Record<string, unknown>).userId = user.id;
  } else {
    // Check if existing session is an admin — if so, don't overwrite it
    const [existingUser] = await db.select().from(usersTable).where(eq(usersTable.id, existingUserId));
    if (!existingUser || existingUser.role !== "admin") {
      (req.session as Record<string, unknown>).userId = user.id;
    }
  }

  res.status(201).json({ user: sanitizeUser(user), message: "تم إنشاء الحساب بنجاح" });
});

router.post("/auth/login", async (req, res): Promise<void> => {
  const { identifier, password } = req.body as { identifier?: string; password?: string };

  if (!identifier || !password) {
    res.status(400).json({ error: "رقم الهاتف أو البريد وكلمة المرور مطلوبان" });
    return;
  }

  const passwordHash = hashPassword(password);
  const trimmed = identifier.trim();

  // Try phone, then email, then username
  let [user] = await db.select().from(usersTable).where(eq(usersTable.phone, trimmed));
  if (!user) {
    [user] = await db.select().from(usersTable).where(eq(usersTable.email, trimmed));
  }
  if (!user) {
    [user] = await db.select().from(usersTable).where(eq(usersTable.username, trimmed));
  }

  if (!user || user.passwordHash !== passwordHash) {
    res.status(401).json({ error: "البيانات غير صحيحة، تحقق من رقم الهاتف أو البريد وكلمة المرور" });
    return;
  }

  if (!user.isActive) {
    res.status(403).json({ error: "تم تعطيل هذا الحساب، تواصل مع المدير" });
    return;
  }

  (req.session as Record<string, unknown>).userId = user.id;
  (req.session as Record<string, unknown>).role = user.role;

  res.json({ user: sanitizeUser(user), message: "تم تسجيل الدخول بنجاح" });
});

router.post("/auth/verify-phone", async (req, res): Promise<void> => {
  const { phone } = req.body as { phone?: string };
  if (!phone) {
    res.status(400).json({ error: "رقم الجوال مطلوب" });
    return;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.phone, phone.trim()));
  if (!user) {
    res.status(404).json({ error: "لا يوجد حساب مسجل بهذا الرقم" });
    return;
  }
  res.json({ found: true, username: user.username });
});

router.post("/auth/reset-password-by-phone", async (req, res): Promise<void> => {
  const { phone, newPassword } = req.body as { phone?: string; newPassword?: string };
  if (!phone || !newPassword) {
    res.status(400).json({ error: "رقم الجوال وكلمة المرور الجديدة مطلوبان" });
    return;
  }
  if (newPassword.length < 6) {
    res.status(400).json({ error: "كلمة المرور يجب أن تكون 6 أحرف على الأقل" });
    return;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.phone, phone.trim()));
  if (!user) {
    res.status(404).json({ error: "لا يوجد حساب مسجل بهذا الرقم" });
    return;
  }
  await db.update(usersTable)
    .set({ passwordHash: hashPassword(newPassword) })
    .where(eq(usersTable.id, user.id));
  res.json({ message: "تم تغيير كلمة المرور بنجاح" });
});

router.post("/auth/logout", async (req, res): Promise<void> => {
  req.session.destroy(() => {
    res.json({ message: "تم تسجيل الخروج بنجاح" });
  });
});

router.get("/auth/me", async (req, res): Promise<void> => {
  const userId = (req.session as Record<string, unknown>).userId as number | undefined;
  if (!userId) {
    res.status(401).json({ error: "غير مصرح" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) {
    res.status(401).json({ error: "المستخدم غير موجود" });
    return;
  }

  res.json(sanitizeUser(user));
});

export default router;
