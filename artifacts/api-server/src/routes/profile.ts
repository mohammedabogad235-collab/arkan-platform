import { Router, type IRouter } from "express";
import { eq, and, ne } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { hashPassword } from "../lib/crypto";
import { logger } from "../lib/logger";

const router: IRouter = Router();

function normalizeFcmToken(raw: unknown): string | null | undefined {
  const token =
    raw === null
      ? null
      : typeof raw === "string"
        ? raw.trim()
        : undefined;

  if (token === undefined) return undefined;
  if (typeof token === "string" && token.length < 20) return undefined;
  return token;
}

async function saveFcmToken(req: any, res: any): Promise<void> {
  const userId = (req.session as any)?.userId;
  if (!userId) {
    res.status(401).json({ error: "غير مسجّل الدخول" });
    return;
  }

  const normalizedToken = normalizeFcmToken((req.body as any)?.token);
  if (normalizedToken === undefined) {
    res.status(400).json({ error: "token مطلوب (string أو null)" });
    return;
  }

  try {
    const [updated] = await db
      .update(usersTable)
      .set({ fcmToken: normalizedToken } as any)
      .where(eq(usersTable.id, userId))
      .returning({ id: usersTable.id, fcmToken: usersTable.fcmToken });

    if (!updated) {
      res.status(404).json({ error: "المستخدم غير موجود" });
      return;
    }

    res.json({ success: true, fcmToken: updated.fcmToken ?? null });
  } catch (error) {
    logger.error({ err: error, userId }, "Failed to update FCM token");
    res.status(500).json({ error: "حدث خطأ أثناء حفظ التوكن" });
  }
}

router.patch("/profile", async (req, res): Promise<void> => {
  const userId = (req.session as any)?.userId;
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

/**
 * POST /profile/fcm-token
 * حفظ/تحديث توكن FCM الخاص بجهاز المستخدم الحالي (يُستدعى عند تشغيل التطبيق/تسجيل الدخول)
 *
 * body:
 *  - token: string | null  (يمكن إرسال null لمسح التوكن عند تسجيل الخروج)
 */
router.post("/profile/fcm-token", async (req, res): Promise<void> => {
  await saveFcmToken(req, res);
});

/**
 * POST /save-fcm-token
 * Endpoint مطابق للطلب: حفظ توكن جهاز المستخدم الحالي.
 * ملاحظة: نُبقي أيضاً endpoint القديم /profile/fcm-token لتفادي كسر الواجهة الحالية.
 */
router.post("/save-fcm-token", async (req, res): Promise<void> => {
  await saveFcmToken(req, res);
});

export default router;
