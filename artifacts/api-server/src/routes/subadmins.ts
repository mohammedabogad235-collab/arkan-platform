import { Router, type IRouter } from "express";
import { eq, and, ne } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import * as crypto from "crypto";

const router: IRouter = Router();

function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password + "arkan-pwd-salt-2024").digest("hex");
}

function isAdmin(req: any): boolean {
  return req.session?.role === "admin";
}

function sanitizeSubAdmin(user: typeof usersTable.$inferSelect) {
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

router.get("/subadmins", async (req, res): Promise<void> => {
  if (!isAdmin(req)) { res.status(403).json({ error: "غير مصرح" }); return; }
  const list = await db.select().from(usersTable)
    .where(eq(usersTable.role, "subadmin"))
    .orderBy(usersTable.createdAt);
  res.json(list.map(sanitizeSubAdmin));
});

router.post("/subadmins", async (req, res): Promise<void> => {
  if (!isAdmin(req)) { res.status(403).json({ error: "غير مصرح" }); return; }

  const { fullName, phone, email, username, password, permissions } = req.body as Record<string, any>;
  if (!fullName || !phone || !email || !username || !password) {
    res.status(400).json({ error: "جميع الحقول مطلوبة" }); return;
  }
  if (password.length < 6) {
    res.status(400).json({ error: "كلمة المرور يجب أن تكون 6 أحرف على الأقل" }); return;
  }

  const [existingUsername] = await db.select().from(usersTable).where(eq(usersTable.username, username));
  if (existingUsername) { res.status(409).json({ error: "اسم المستخدم مستخدم بالفعل" }); return; }

  const [existingEmail] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (existingEmail) { res.status(409).json({ error: "البريد الإلكتروني مستخدم بالفعل" }); return; }

  const [existingPhone] = await db.select().from(usersTable).where(eq(usersTable.phone, phone));
  if (existingPhone) { res.status(409).json({ error: "رقم الهاتف مستخدم بالفعل" }); return; }

  const perms = Array.isArray(permissions) ? permissions : [];
  const [newUser] = await db.insert(usersTable).values({
    fullName, phone, email, username,
    passwordHash: hashPassword(password),
    role: "subadmin",
    permissions: JSON.stringify(perms),
    isActive: true,
  }).returning();

  res.status(201).json(sanitizeSubAdmin(newUser));
});

router.patch("/subadmins/:id", async (req, res): Promise<void> => {
  if (!isAdmin(req)) { res.status(403).json({ error: "غير مصرح" }); return; }

  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "معرّف غير صالح" }); return; }

  const { permissions, password, fullName, phone, email } = req.body as Record<string, any>;
  const updates: Record<string, any> = {};

  if (Array.isArray(permissions)) updates.permissions = JSON.stringify(permissions);
  if (password && password.length >= 6) updates.passwordHash = hashPassword(password);
  if (fullName) updates.fullName = fullName;
  if (phone) updates.phone = phone;
  if (email) updates.email = email;

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "لا توجد بيانات للتحديث" }); return;
  }

  const [updated] = await db.update(usersTable).set(updates)
    .where(and(eq(usersTable.id, id), eq(usersTable.role, "subadmin")))
    .returning();

  if (!updated) { res.status(404).json({ error: "المشرف الفرعي غير موجود" }); return; }
  res.json(sanitizeSubAdmin(updated));
});

router.patch("/subadmins/:id/toggle", async (req, res): Promise<void> => {
  if (!isAdmin(req)) { res.status(403).json({ error: "غير مصرح" }); return; }

  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "معرّف غير صالح" }); return; }

  const [current] = await db.select().from(usersTable)
    .where(and(eq(usersTable.id, id), eq(usersTable.role, "subadmin")));
  if (!current) { res.status(404).json({ error: "المشرف الفرعي غير موجود" }); return; }

  const [updated] = await db.update(usersTable)
    .set({ isActive: !current.isActive })
    .where(eq(usersTable.id, id))
    .returning();

  res.json(sanitizeSubAdmin(updated));
});

router.delete("/subadmins/:id", async (req, res): Promise<void> => {
  if (!isAdmin(req)) { res.status(403).json({ error: "غير مصرح" }); return; }

  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "معرّف غير صالح" }); return; }

  const [deleted] = await db.delete(usersTable)
    .where(and(eq(usersTable.id, id), eq(usersTable.role, "subadmin")))
    .returning();

  if (!deleted) { res.status(404).json({ error: "المشرف الفرعي غير موجود" }); return; }
  res.sendStatus(204);
});

export default router;
