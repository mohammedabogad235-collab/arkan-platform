import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { RegisterBody, LoginBody } from "@workspace/api-zod";
import * as crypto from "crypto";

const router: IRouter = Router();

function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password + process.env.SESSION_SECRET).digest("hex");
}

function sanitizeUser(user: typeof usersTable.$inferSelect) {
  return {
    id: user.id,
    fullName: user.fullName,
    phone: user.phone,
    email: user.email,
    username: user.username,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
  };
}

router.post("/auth/register", async (req, res): Promise<void> => {
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { fullName, phone, email, username, password } = parsed.data;

  const existing = await db.select().from(usersTable).where(eq(usersTable.username, username));
  if (existing.length > 0) {
    res.status(409).json({ error: "اسم المستخدم مستخدم بالفعل" });
    return;
  }

  const existingEmail = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (existingEmail.length > 0) {
    res.status(409).json({ error: "البريد الإلكتروني مستخدم بالفعل" });
    return;
  }

  const passwordHash = hashPassword(password);
  const [user] = await db.insert(usersTable).values({
    fullName,
    phone,
    email,
    username,
    passwordHash,
    role: "client",
  }).returning();

  (req.session as Record<string, unknown>).userId = user.id;

  res.status(201).json({ user: sanitizeUser(user), message: "تم إنشاء الحساب بنجاح" });
});

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { username, password } = parsed.data;
  const passwordHash = hashPassword(password);

  const [user] = await db.select().from(usersTable).where(eq(usersTable.username, username));

  if (!user || user.passwordHash !== passwordHash) {
    res.status(401).json({ error: "اسم المستخدم أو كلمة المرور غير صحيحة" });
    return;
  }

  (req.session as Record<string, unknown>).userId = user.id;

  res.json({ user: sanitizeUser(user), message: "تم تسجيل الدخول بنجاح" });
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
