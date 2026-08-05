import { Router, type IRouter } from "express";
import { eq, and, ne } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { hashPassword } from "../lib/crypto";

const router: IRouter = Router();

router.patch("/profile", async (req, res): Promise<void> => {
  const userId = req.session?.userId;
  if (!userId) { res.status(401).json({ error: "غير مسجّل الدخول" }); return; }

  const { phone, email, password } = req.body as Record<string, any>;
  const updates: Record<string, any> = {};

  if (phone && typeof phone === "string") {
    const [existing] = await db.select().from(usersTable)
      .where(and(eq(usersTable.phone, phone), ne(usersTable.id, userId)));
    if (existing) { res.status(409).json({ error: "رقم الهاتف مستخدم بالفعل" }); return; }
    updates.phone = phone;
  }

  if (email && typeof email === "string") {
    const [existing] = await db.select().from(usersTable)
      .where(and(eq(usersTable.email, email), ne(usersTable.id, userId)));
    if (existing) { res.status(409).json({ error: "البريد الإلكتروني مستخدم بالفعل" }); return; }
    updates.email = email;
  }

  if (password && typeof password === "string" && password.length >= 6) {
    updates.passwordHash = hashPassword(password);
  }

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "لا توجد بيانات للتحديث" }); return;
  }

  const [updated] = await db.update(usersTable)
    .set(updates)
    .where(eq(usersTable.id, userId))
    .returning();

  if (!updated) { res.status(404).json({ error: "المستخدم غير موجود" }); return; }

  res.json({
    id: updated.id,
    fullName: updated.fullName,
    phone: updated.phone,
    email: updated.email,
    username: updated.username,
    role: updated.role,
  });
});

export default router;
