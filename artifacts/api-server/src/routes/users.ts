import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { GetUserParams, DeleteUserParams } from "@workspace/api-zod";
import * as crypto from "crypto";

function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password + "arkan-pwd-salt-2024").digest("hex");
}

const router: IRouter = Router();

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

router.get("/users", async (_req, res): Promise<void> => {
  const users = await db.select().from(usersTable).orderBy(usersTable.createdAt);
  res.json(users.map(sanitizeUser));
});

router.get("/users/:id", async (req, res): Promise<void> => {
  const params = GetUserParams.safeParse({ id: parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, params.data.id));
  if (!user) {
    res.status(404).json({ error: "المستخدم غير موجود" });
    return;
  }

  res.json(sanitizeUser(user));
});

router.patch("/users/:id/role", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "معرّف غير صالح" }); return; }

  const { role } = req.body as { role?: string };
  if (role !== "admin" && role !== "user") {
    res.status(400).json({ error: "الصلاحية يجب أن تكون admin أو user" }); return;
  }

  const [user] = await db.update(usersTable).set({ role }).where(eq(usersTable.id, id)).returning();
  if (!user) { res.status(404).json({ error: "المستخدم غير موجود" }); return; }

  res.json(sanitizeUser(user));
});

router.patch("/admin/change-password", async (req, res): Promise<void> => {
  const session = (req as any).session;
  const userId = session?.userId;
  if (!userId) { res.status(401).json({ error: "غير مصرح" }); return; }

  const { newPassword } = req.body as { newPassword?: string };
  if (!newPassword || newPassword.length < 6) {
    res.status(400).json({ error: "كلمة المرور يجب أن تكون 6 أحرف على الأقل" }); return;
  }

  const hashed = hashPassword(newPassword);
  const [user] = await db.update(usersTable).set({ passwordHash: hashed }).where(eq(usersTable.id, userId)).returning();
  if (!user) { res.status(404).json({ error: "المستخدم غير موجود" }); return; }

  res.json({ success: true });
});

router.post("/admin/create-admin", async (req, res): Promise<void> => {
  const { fullName, phone, email, username, password } = req.body as Record<string, string>;
  if (!fullName || !phone || !email || !username || !password) {
    res.status(400).json({ error: "جميع الحقول مطلوبة" }); return;
  }
  if (password.length < 6) {
    res.status(400).json({ error: "كلمة المرور يجب أن تكون 6 أحرف على الأقل" }); return;
  }

  const [existing] = await db.select().from(usersTable).where(eq(usersTable.username, username));
  if (existing) { res.status(409).json({ error: "اسم المستخدم مستخدم بالفعل" }); return; }

  const hashed = hashPassword(password);

  const [newUser] = await db.insert(usersTable).values({ fullName, phone, email, username, passwordHash: hashed, role: "admin" }).returning();
  res.status(201).json(sanitizeUser(newUser));
});

router.delete("/users/:id", async (req, res): Promise<void> => {
  const params = DeleteUserParams.safeParse({ id: parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [user] = await db.delete(usersTable).where(eq(usersTable.id, params.data.id)).returning();
  if (!user) {
    res.status(404).json({ error: "المستخدم غير موجود" });
    return;
  }

  res.sendStatus(204);
});

export default router;
