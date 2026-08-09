import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import {
  createCouponInputSchema,
  db,
  couponsTable,
  updateCouponInputSchema,
  usersTable,
  validateCouponInputSchema,
} from "@workspace/db";
import { asyncHandler } from "../lib/http";
import { logger } from "../lib/logger"; // إضافة التتبع لمعرفة أي خطأ صامت

const router: IRouter = Router();

// تحديث شامل لدالة التحقق لتدعم الـ Token والـ Session وتسمح للمشرفين الفرعيين
async function isAdmin(req: any): Promise<boolean> {
  const role = req.session?.role || req.user?.role;
  const userId = req.session?.userId || req.user?.id || req.user?.userId;

  if (role === "admin" || role === "subadmin") return true;
  if (!userId) return false;
  
  const [user] = await db.select({ role: usersTable.role }).from(usersTable).where(eq(usersTable.id, userId));
  return user?.role === "admin" || user?.role === "subadmin";
}

function normalizeCouponCode(code: string): string {
  return code.trim().toUpperCase();
}

function formatCoupon(c: typeof couponsTable.$inferSelect) {
  return {
    ...c,
    expiresAt: c.expiresAt ? c.expiresAt.toISOString() : null,
    createdAt: c.createdAt.toISOString(),
  };
}

function isCouponExpired(coupon: typeof couponsTable.$inferSelect): boolean {
  return Boolean(coupon.expiresAt && coupon.expiresAt.getTime() < Date.now());
}

function calculateDiscountAmount(coupon: typeof couponsTable.$inferSelect, orderAmount = 0): number {
  const rawDiscount =
    coupon.discountType === "percentage"
      ? (orderAmount * coupon.discountValue) / 100
      : coupon.discountValue;

  return Math.min(orderAmount, Math.max(0, Math.round(rawDiscount * 100) / 100));
}

function validateCouponAvailability(
  coupon: typeof couponsTable.$inferSelect,
  orderAmount?: number,
): string | null {
  if (!coupon.isActive) {
    return "هذا الكود غير مفعّل، تواصل مع الإدارة";
  }

  if (isCouponExpired(coupon)) {
    return "عذراً، انتهت صلاحية هذا الكود";
  }

  if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) {
    return "تم استنفاد الحد الأقصى لاستخدام هذا الكود";
  }

  if (typeof orderAmount === "number" && coupon.minOrderAmount !== null && orderAmount < coupon.minOrderAmount) {
    return `الحد الأدنى للطلب ${coupon.minOrderAmount} لاستخدام هذا الكود`;
  }

  return null;
}

router.get("/coupons", asyncHandler(async (req, res): Promise<void> => {
  if (!await isAdmin(req)) {
    res.status(403).json({ error: "غير مصرح لك بعرض الكوبونات" });
    return;
  }
  const coupons = await db.select().from(couponsTable).orderBy(couponsTable.id);
  res.json(coupons.map(formatCoupon));
}));

router.post("/coupons", asyncHandler(async (req, res): Promise<void> => {
  if (!await isAdmin(req)) {
    res.status(403).json({ error: "غير مصرح لك بإنشاء كوبونات" });
    return;
  }

  const parsed = createCouponInputSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? parsed.error.message });
    return;
  }

  const code = normalizeCouponCode(parsed.data.code);
  const existing = await db.select({ id: couponsTable.id }).from(couponsTable).where(eq(couponsTable.code, code));
  if (existing.length > 0) {
    res.status(409).json({ error: "كود الخصم هذا موجود مسبقاً، يرجى اختيار كود آخر" });
    return;
  }

  try {
    const [coupon] = await db.insert(couponsTable).values({
      code,
      discountType: parsed.data.discountType,
      discountValue: parsed.data.discountValue,
      minOrderAmount: parsed.data.minOrderAmount ?? null,
      maxUses: parsed.data.maxUses ?? null,
      isActive: parsed.data.isActive ?? true,
      expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
    }).returning();

    res.status(201).json(formatCoupon(coupon));
  } catch (error: any) {
    logger.error("Error creating coupon:", error);
    res.status(500).json({ error: "حدث خطأ في الخادم أثناء إنشاء الكوبون" });
  }
}));

router.put("/coupons/:id", asyncHandler(async (req, res): Promise<void> => {
  if (!await isAdmin(req)) {
    res.status(403).json({ error: "غير مصرح لك بتعديل الكوبونات" });
    return;
  }

  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "معرف الكوبون غير صالح" });
    return;
  }

  const [existingCoupon] = await db.select().from(couponsTable).where(eq(couponsTable.id, id));
  if (!existingCoupon) {
    res.status(404).json({ error: "الكوبون غير موجود" });
    return;
  }

  const parsed = updateCouponInputSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? parsed.error.message });
    return;
  }

  const updateData: Partial<typeof couponsTable.$inferInsert> = {};
  if (parsed.data.code !== undefined) updateData.code = normalizeCouponCode(parsed.data.code);
  if (parsed.data.discountType !== undefined) updateData.discountType = parsed.data.discountType;
  if (parsed.data.discountValue !== undefined) updateData.discountValue = parsed.data.discountValue;
  if (parsed.data.minOrderAmount !== undefined) updateData.minOrderAmount = parsed.data.minOrderAmount ?? null;
  if (parsed.data.maxUses !== undefined) updateData.maxUses = parsed.data.maxUses ?? null;
  if (parsed.data.isActive !== undefined) updateData.isActive = parsed.data.isActive;
  if (parsed.data.expiresAt !== undefined) {
    updateData.expiresAt = parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null;
  }

  if (
    updateData.maxUses !== undefined
    && updateData.maxUses !== null
    && updateData.maxUses < existingCoupon.usedCount
  ) {
    res.status(400).json({ error: "عدد مرات الاستخدام الأقصى لا يمكن أن يكون أقل من الاستخدام الحالي" });
    return;
  }

  if (updateData.code && updateData.code !== existingCoupon.code) {
    const [duplicateCode] = await db
      .select({ id: couponsTable.id })
      .from(couponsTable)
      .where(eq(couponsTable.code, updateData.code));
    if (duplicateCode) {
      res.status(409).json({ error: "كود الخصم الجديد مستخدم مسبقاً" });
      return;
    }
  }

  try {
    const [coupon] = await db.update(couponsTable).set(updateData).where(eq(couponsTable.id, id)).returning();
    if (!coupon) {
      res.status(404).json({ error: "الكوبون غير موجود" });
      return;
    }

    res.json(formatCoupon(coupon));
  } catch (error: any) {
    logger.error("Error updating coupon:", error);
    res.status(500).json({ error: "حدث خطأ أثناء تحديث الكوبون" });
  }
}));

router.delete("/coupons/:id", asyncHandler(async (req, res): Promise<void> => {
  if (!await isAdmin(req)) {
    res.status(403).json({ error: "غير مصرح لك بحذف الكوبونات" });
    return;
  }

  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "معرف غير صالح" });
    return;
  }

  try {
    await db.delete(couponsTable).where(eq(couponsTable.id, id));
    res.json({ success: true });
  } catch (error: any) {
    logger.error("Error deleting coupon:", error);
    res.status(500).json({ error: "حدث خطأ أثناء حذف الكوبون" });
  }
}));

router.post("/coupons/validate", asyncHandler(async (req, res): Promise<void> => {
  const parsed = validateCouponInputSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ valid: false, error: parsed.error.issues[0]?.message ?? parsed.error.message });
    return;
  }

  const code = normalizeCouponCode(parsed.data.code);
  const [coupon] = await db.select().from(couponsTable).where(eq(couponsTable.code, code));

  if (!coupon) {
    res.status(404).json({ valid: false, error: "كود الخصم غير موجود أو غير صحيح" });
    return;
  }

  const availabilityError = validateCouponAvailability(coupon, parsed.data.orderAmount);
  if (availabilityError) {
    res.status(400).json({ valid: false, error: availabilityError });
    return;
  }

  res.json({
    valid: true,
    coupon: formatCoupon(coupon),
    discountAmount: calculateDiscountAmount(coupon, parsed.data.orderAmount ?? 0),
  });
}));

export default router;