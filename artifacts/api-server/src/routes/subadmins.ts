import { Router, type IRouter } from "express";
import { eq, and, ne } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { hashPassword } from "../lib/crypto";
import { asyncHandler, getErrorMessage } from "../lib/http";
import { normalizeEmail } from "../lib/otp";
import { logger } from "../lib/logger"; // إضافة الـ logger لتتبع الأخطاء

const router: IRouter = Router();

// جعلنا الصلاحيات تقبل أي قيمة نصية صحيحة عشان لو الفرانك إند (Frontend) بعت صلاحيات جديدة ما يتمسحش
function safeParsePermissions(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

// تحديث قوي للتحقق من الأدمن (يدعم الـ Session والـ JWT/Tokens)
async function isAdmin(req: any): Promise<boolean> {
  const role = req.session?.role || req.user?.role;
  const userId = req.session?.userId || req.user?.id || req.user?.userId;
  
  if (role === "admin") return true;
  if (!userId) return false;
  
  const [user] = await db.select({ role: usersTable.role }).from(usersTable).where(eq(usersTable.id, userId));
  return user?.role === "admin";
}

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeOptionalText(value: unknown): string | null {
  const trimmed = normalizeText(value);
  return trimmed.length > 0 ? trimmed : null;
}

// إلغاء القيود الصارمة على أسماء الصلاحيات للسماح بأي صلاحية مبرمجة في الواجهة
function normalizePermissions(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(
    value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
  )];
}

function sanitizeSubAdmin(user: typeof usersTable.$inferSelect) {
  return {
    id: user.id,
    fullName: user.fullName,
    phone: user.phone,
    email: user.email,
    username: user.username,
    role: user.role,
    permissions: safeParsePermissions(user.permissions),
    isActive: user.isActive,
    createdAt: user.createdAt.toISOString(),
  };
}

async function ensureUniqueSubadminFields(options: {
  username?: string;
  email?: string | null;
  phone?: string | null;
  excludeUserId?: number;
}): Promise<string | null> {
  if (options.username) {
    const [existingUsername] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.username, options.username));
    if (existingUsername && existingUsername.id !== options.excludeUserId) {
      return "اسم المستخدم مستخدم بالفعل في حساب آخر";
    }
  }

  if (options.email) {
    const [existingEmail] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, options.email));
    if (existingEmail && existingEmail.id !== options.excludeUserId) {
      return "البريد الإلكتروني مستخدم بالفعل في حساب آخر";
    }
  }

  if (options.phone) {
    const [existingPhone] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.phone, options.phone));
    if (existingPhone && existingPhone.id !== options.excludeUserId) {
      return "رقم الهاتف مستخدم بالفعل في حساب آخر";
    }
  }

  return null;
}

router.get("/subadmins", asyncHandler(async (req, res): Promise<void> => {
  if (!await isAdmin(req)) { res.status(403).json({ error: "غير مصرح لك بعرض هذه البيانات" }); return; }
  const list = await db.select().from(usersTable)
    .where(eq(usersTable.role, "subadmin"))
    .orderBy(usersTable.createdAt);
  res.json(list.map(sanitizeSubAdmin));
}));

router.post("/subadmins", asyncHandler(async (req, res): Promise<void> => {
  if (!await isAdmin(req)) { res.status(403).json({ error: "غير مصرح لك بإضافة مشرفين" }); return; }

  const fullName = normalizeText(req.body?.fullName);
  const username = normalizeText(req.body?.username);
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  const permissions = normalizePermissions(req.body?.permissions);
  const phone = normalizeOptionalText(req.body?.phone);
  const email = normalizeOptionalText(req.body?.email);

  if (!fullName || !username || !password) {
    res.status(400).json({ error: "الاسم، اسم المستخدم، وكلمة المرور بيانات مطلوبة" }); return;
  }
  if (password.length < 6) {
    res.status(400).json({ error: "كلمة المرور يجب أن تكون 6 أحرف على الأقل" }); return;
  }

  const normalizedUsername = username.toLowerCase();
  const normalizedEmail = email ? normalizeEmail(email) : null;
  
  const conflictError = await ensureUniqueSubadminFields({
    username: normalizedUsername,
    email: normalizedEmail,
    phone,
  });
  
  if (conflictError) {
    res.status(409).json({ error: conflictError }); return;
  }

  const uniqueId = `${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  const finalPhone = phone ?? `sub_${uniqueId}`;
  const finalEmail = normalizedEmail ?? `${normalizedUsername}_${uniqueId}@subadmin.internal`;

  try {
    // استخدمنا Promise.resolve لتجنب مشاكل الـ Async في دالة التشفير
    const hashedPassword = await Promise.resolve(hashPassword(password));

    const [newUser] = await db.insert(usersTable).values({
      fullName,
      phone: finalPhone,
      email: finalEmail,
      username: normalizedUsername,
      passwordHash: hashedPassword,
      role: "subadmin",
      permissions: JSON.stringify(permissions),
      isActive: true,
      isVerified: true,
    }).returning();

    res.status(201).json(sanitizeSubAdmin(newUser));
  } catch (error: any) {
    // اصطياد أخطاء قاعدة البيانات لتجنب تعليق السيرفر
    console.error("Error creating sub-admin:", error);
    res.status(500).json({ error: "حدث خطأ في السيرفر أثناء إنشاء المشرف", details: error.message });
  }
}));

router.patch("/subadmins/:id", asyncHandler(async (req, res): Promise<void> => {
  if (!await isAdmin(req)) { res.status(403).json({ error: "غير مصرح لك بتعديل المشرفين" }); return; }

  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "معرّف المشرف غير صالح" }); return; }

  const [currentUser] = await db.select().from(usersTable)
    .where(and(eq(usersTable.id, id), eq(usersTable.role, "subadmin")));
  if (!currentUser) { res.status(404).json({ error: "المشرف الفرعي غير موجود" }); return; }

  const updates: Record<string, any> = {};
  const permissions = req.body?.permissions;
  const password = typeof req.body?.password === "string" ? req.body.password.trim() : "";
  const fullName = normalizeOptionalText(req.body?.fullName);
  const phone = normalizeOptionalText(req.body?.phone);
  const email = normalizeOptionalText(req.body?.email);

  if (Array.isArray(permissions)) updates.permissions = JSON.stringify(normalizePermissions(permissions));
  if (password) {
    if (password.length < 6) { res.status(400).json({ error: "كلمة المرور يجب أن تكون 6 أحرف على الأقل" }); return; }
    updates.passwordHash = await Promise.resolve(hashPassword(password));
  }
  if (fullName) updates.fullName = fullName;
  if (phone) updates.phone = phone;
  if (email) updates.email = normalizeEmail(email);

  if (updates.email || updates.phone) {
    const conflictError = await ensureUniqueSubadminFields({
      email: updates.email ?? null,
      phone: updates.phone ?? null,
      excludeUserId: id,
    });
    if (conflictError) {
      res.status(409).json({ error: conflictError }); return;
    }
  }

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "لا توجد بيانات جديدة للتحديث" }); return;
  }

  try {
    const [updated] = await db.update(usersTable).set(updates)
      .where(and(eq(usersTable.id, id), eq(usersTable.role, "subadmin")))
      .returning();

    if (!updated) { res.status(404).json({ error: "المشرف الفرعي غير موجود" }); return; }
    res.json(sanitizeSubAdmin(updated));
  } catch (error: any) {
    console.error("Error updating sub-admin:", error);
    res.status(500).json({ error: "حدث خطأ أثناء حفظ التعديلات", details: error.message });
  }
}));

router.patch("/subadmins/:id/toggle", asyncHandler(async (req, res): Promise<void> => {
  if (!await isAdmin(req)) { res.status(403).json({ error: "غير مصرح" }); return; }

  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "معرّف غير صالح" }); return; }

  const [current] = await db.select().from(usersTable)
    .where(and(eq(usersTable.id, id), eq(usersTable.role, "subadmin")));
  if (!current) { res.status(404).json({ error: "المشرف الفرعي غير موجود" }); return; }

  const [updated] = await db.update(usersTable)
    .set({ isActive: !current.isActive })
    .where(eq(usersTable.id, id))
    .returning();

  res.json(sanitizeSubAdmin(updated));
}));

router.delete("/subadmins/:id", asyncHandler(async (req, res): Promise<void> => {
  if (!await isAdmin(req)) { res.status(403).json({ error: "غير مصرح" }); return; }

  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "معرّف غير صالح" }); return; }

  const [deleted] = await db.delete(usersTable)
    .where(and(eq(usersTable.id, id), eq(usersTable.role, "subadmin")))
    .returning();

  if (!deleted) { res.status(404).json({ error: "المشرف الفرعي غير موجود" }); return; }
  res.sendStatus(204);
}));

export default router;