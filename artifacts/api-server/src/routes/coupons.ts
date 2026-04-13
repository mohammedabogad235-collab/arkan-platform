import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, couponsTable, usersTable } from "@workspace/db";

const router: IRouter = Router();

async function isAdmin(req: any): Promise<boolean> {
  const session = req.session as Record<string, unknown> | undefined;
  const userId = session?.userId as number | undefined;
  if (!userId) return false;
  // Fast path: role stored in session at login
  if (session?.role === "admin") return true;
  // Fallback: look up role in DB (for older sessions without role)
  const [user] = await db.select({ role: usersTable.role }).from(usersTable).where(eq(usersTable.id, userId));
  return user?.role === "admin";
}

function formatCoupon(c: typeof couponsTable.$inferSelect) {
  return {
    ...c,
    expiresAt: c.expiresAt ? c.expiresAt.toISOString() : null,
    createdAt: c.createdAt.toISOString(),
  };
}

router.get("/coupons", async (req, res): Promise<void> => {
  if (!await isAdmin(req)) {
    res.status(403).json({ error: "غير مصرح" });
    return;
  }
  const coupons = await db.select().from(couponsTable).orderBy(couponsTable.id);
  res.json(coupons.map(formatCoupon));
});

router.post("/coupons", async (req, res): Promise<void> => {
  if (!await isAdmin(req)) {
    res.status(403).json({ error: "غير مصرح" });
    return;
  }

  const body = req.body as {
    code?: string;
    discountType?: string;
    discountValue?: number;
    minOrderAmount?: number | null;
    maxUses?: number | null;
    isActive?: boolean;
    expiresAt?: string | null;
  };

  if (!body.code || !body.discountValue || !body.discountType) {
    res.status(400).json({ error: "الكود ونوع الخصم وقيمته مطلوبة" });
    return;
  }

  const code = body.code.trim().toUpperCase();
  const existing = await db.select().from(couponsTable).where(eq(couponsTable.code, code));
  if (existing.length > 0) {
    res.status(409).json({ error: "هذا الكود موجود مسبقاً" });
    return;
  }

  const [coupon] = await db.insert(couponsTable).values({
    code,
    discountType: body.discountType,
    discountValue: body.discountValue,
    minOrderAmount: body.minOrderAmount ?? null,
    maxUses: body.maxUses ?? null,
    isActive: body.isActive ?? true,
    expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
  }).returning();

  res.status(201).json(formatCoupon(coupon));
});

router.put("/coupons/:id", async (req, res): Promise<void> => {
  if (!await isAdmin(req)) {
    res.status(403).json({ error: "غير مصرح" });
    return;
  }

  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "معرف غير صالح" });
    return;
  }

  const body = req.body as Partial<{
    isActive: boolean;
    maxUses: number | null;
    expiresAt: string | null;
    discountValue: number;
    minOrderAmount: number | null;
  }>;

  const updateData: Record<string, unknown> = {};
  if (body.isActive !== undefined) updateData.isActive = body.isActive;
  if (body.maxUses !== undefined) updateData.maxUses = body.maxUses;
  if (body.expiresAt !== undefined) updateData.expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
  if (body.discountValue !== undefined) updateData.discountValue = body.discountValue;
  if (body.minOrderAmount !== undefined) updateData.minOrderAmount = body.minOrderAmount;

  const [coupon] = await db.update(couponsTable).set(updateData).where(eq(couponsTable.id, id)).returning();
  if (!coupon) {
    res.status(404).json({ error: "الكوبون غير موجود" });
    return;
  }

  res.json(formatCoupon(coupon));
});

router.delete("/coupons/:id", async (req, res): Promise<void> => {
  if (!await isAdmin(req)) {
    res.status(403).json({ error: "غير مصرح" });
    return;
  }

  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "معرف غير صالح" });
    return;
  }

  await db.delete(couponsTable).where(eq(couponsTable.id, id));
  res.json({ success: true });
});

router.post("/coupons/validate", async (req, res): Promise<void> => {
  try {
    const body = req.body as { code?: string; orderAmount?: number };
    if (!body.code) {
      res.status(400).json({ valid: false, error: "الكود مطلوب" });
      return;
    }

    const code = body.code.trim().toUpperCase();
    const [coupon] = await db.select().from(couponsTable).where(eq(couponsTable.code, code));

    if (!coupon) {
      res.status(404).json({ valid: false, error: "الكود غير موجود" });
      return;
    }

    if (!coupon.isActive) {
      res.status(400).json({ valid: false, error: "هذا الكود غير مفعّل، تواصل مع الإدارة" });
      return;
    }

    if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) {
      res.status(400).json({ valid: false, error: "انتهت صلاحية هذا الكود" });
      return;
    }

    if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) {
      res.status(400).json({ valid: false, error: "تم استنفاد هذا الكود بالكامل" });
      return;
    }

    if (coupon.minOrderAmount && body.orderAmount && body.orderAmount < coupon.minOrderAmount) {
      res.status(400).json({ valid: false, error: `الحد الأدنى للطلب ${coupon.minOrderAmount} لاستخدام هذا الكود` });
      return;
    }

    let discountAmount = 0;
    if (coupon.discountType === "percentage") {
      discountAmount = ((body.orderAmount ?? 0) * coupon.discountValue) / 100;
    } else {
      discountAmount = coupon.discountValue;
    }

    res.json({
      valid: true,
      coupon: formatCoupon(coupon),
      discountAmount: Math.round(discountAmount),
    });
  } catch (err: any) {
    res.status(500).json({ valid: false, error: "حدث خطأ أثناء التحقق من الكود، حاول مرة أخرى" });
  }
});

export default router;
