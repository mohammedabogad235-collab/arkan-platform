import { Router, type IRouter } from "express";
import { eq, and, sql } from "drizzle-orm";
import { db, ordersTable, usersTable, packagesTable, paymentMethodsTable, siteSettingsTable, couponsTable } from "@workspace/db";
import {
  CreateOrderBody,
  UpdateOrderBody,
  GetOrderParams,
  UpdateOrderParams,
  DeleteOrderParams,
  ListOrdersQueryParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

async function enrichOrder(order: typeof ordersTable.$inferSelect) {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, order.userId));
  let pkg = null;
  let paymentMethod = null;

  if (order.packageId) {
    const [p] = await db.select().from(packagesTable).where(eq(packagesTable.id, order.packageId));
    if (p) pkg = { id: p.id, name: p.name, priceEgp: p.priceEgp, priceSar: p.priceSar };
  }

  if (order.paymentMethodId) {
    const [pm] = await db.select().from(paymentMethodsTable).where(eq(paymentMethodsTable.id, order.paymentMethodId));
    if (pm) paymentMethod = { id: pm.id, name: pm.name, details: pm.details };
  }

  return {
    ...order,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    user: user ? {
      id: user.id,
      fullName: user.fullName,
      phone: user.phone,
      email: user.email,
      username: user.username,
      role: user.role,
      createdAt: user.createdAt.toISOString(),
    } : null,
    package: pkg,
    paymentMethod,
  };
}

router.get("/orders", async (req, res): Promise<void> => {
  const queryParams = ListOrdersQueryParams.safeParse(req.query);
  
  let orders;
  if (queryParams.success && queryParams.data.userId) {
    orders = await db.select().from(ordersTable).where(eq(ordersTable.userId, queryParams.data.userId)).orderBy(ordersTable.createdAt);
  } else if (queryParams.success && queryParams.data.status) {
    orders = await db.select().from(ordersTable).where(eq(ordersTable.status, queryParams.data.status)).orderBy(ordersTable.createdAt);
  } else {
    orders = await db.select().from(ordersTable).orderBy(ordersTable.createdAt);
  }

  const enriched = await Promise.all(orders.map(enrichOrder));
  res.json(enriched);
});

router.post("/orders", async (req, res): Promise<void> => {
  const sessionUserId = (req.session as Record<string, unknown>).userId as number | undefined;
  if (!sessionUserId) {
    res.status(401).json({ error: "يجب تسجيل الدخول أولاً" });
    return;
  }

  const parsed = CreateOrderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [settings] = await db.select().from(siteSettingsTable).limit(1);
  const depositPct = settings?.depositPercentageValue ?? 50;

  // Validate coupon if provided
  let appliedCouponCode: string | null = null;
  let appliedDiscountAmount: number | null = null;
  const couponCodeRaw = (parsed.data as any).couponCode as string | undefined;
  if (couponCodeRaw) {
    const code = couponCodeRaw.trim().toUpperCase();
    const [coupon] = await db.select().from(couponsTable).where(eq(couponsTable.code, code));
    if (coupon && coupon.isActive && !(coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) && !(coupon.expiresAt && new Date(coupon.expiresAt) < new Date())) {
      const orderAmount = (parsed.data as any).totalAmount ?? 0;
      if (!coupon.minOrderAmount || orderAmount >= coupon.minOrderAmount) {
        appliedCouponCode = code;
        if (coupon.discountType === "percentage") {
          appliedDiscountAmount = Math.round((orderAmount * coupon.discountValue) / 100);
        } else {
          appliedDiscountAmount = coupon.discountValue;
        }
        await db.update(couponsTable).set({ usedCount: sql`${couponsTable.usedCount} + 1` }).where(eq(couponsTable.id, coupon.id));
      }
    }
  }

  const [order] = await db.insert(ordersTable).values({
    userId: sessionUserId,
    ...parsed.data,
    status: "pending",
    depositPercentage: depositPct,
    ...(appliedCouponCode ? { couponCode: appliedCouponCode, discountAmount: appliedDiscountAmount } : {}),
  }).returning();

  const enriched = await enrichOrder(order);
  res.status(201).json(enriched);
});

router.get("/orders/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = GetOrderParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, params.data.id));
  if (!order) {
    res.status(404).json({ error: "الطلب غير موجود" });
    return;
  }

  const enriched = await enrichOrder(order);
  res.json(enriched);
});

router.patch("/orders/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = UpdateOrderParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateOrderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updateData: Record<string, unknown> = {};
  if (parsed.data.status != null) updateData.status = parsed.data.status;
  if (parsed.data.depositPaid != null) updateData.depositPaid = parsed.data.depositPaid;
  if (parsed.data.finalPaid != null) updateData.finalPaid = parsed.data.finalPaid;
  if (parsed.data.notes != null) updateData.notes = parsed.data.notes;
  if (parsed.data.totalAmount != null) updateData.totalAmount = parsed.data.totalAmount;
  if (parsed.data.depositPercentage != null) updateData.depositPercentage = parsed.data.depositPercentage;
  if (parsed.data.deliveredUrl !== undefined) updateData.deliveredUrl = parsed.data.deliveredUrl;

  const [order] = await db.update(ordersTable).set(updateData).where(eq(ordersTable.id, params.data.id)).returning();
  if (!order) {
    res.status(404).json({ error: "الطلب غير موجود" });
    return;
  }

  const enriched = await enrichOrder(order);
  res.json(enriched);
});

router.post("/orders/:id/receipt", async (req, res): Promise<void> => {
  const session = req.session as { userId?: number } | undefined;
  if (!session?.userId) {
    res.status(401).json({ error: "يجب تسجيل الدخول أولاً" });
    return;
  }

  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "معرف الطلب غير صالح" });
    return;
  }

  const body = req.body as { receiptUrl?: unknown };
  if (typeof body.receiptUrl !== "string" || !body.receiptUrl) {
    res.status(400).json({ error: "رابط الإيصال مطلوب" });
    return;
  }

  const [order] = await db.update(ordersTable)
    .set({ receiptUrl: body.receiptUrl })
    .where(eq(ordersTable.id, id))
    .returning();

  if (!order) {
    res.status(404).json({ error: "الطلب غير موجود" });
    return;
  }

  const enriched = await enrichOrder(order);
  res.json(enriched);
});

router.post("/orders/:id/apply-coupon", async (req, res): Promise<void> => {
  const session = req.session as { userId?: number } | undefined;
  if (!session?.userId) {
    res.status(401).json({ error: "يجب تسجيل الدخول أولاً" });
    return;
  }

  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "معرف الطلب غير صالح" });
    return;
  }

  const body = req.body as { code?: string };
  if (!body.code) {
    res.status(400).json({ error: "كود الكوبون مطلوب" });
    return;
  }

  // Verify order belongs to user
  const [existingOrder] = await db.select().from(ordersTable)
    .where(and(eq(ordersTable.id, id), eq(ordersTable.userId, session.userId)));
  if (!existingOrder) {
    res.status(404).json({ error: "الطلب غير موجود" });
    return;
  }

  if (existingOrder.couponCode) {
    res.status(409).json({ error: "تم تطبيق كوبون على هذا الطلب مسبقاً" });
    return;
  }

  const code = body.code.trim().toUpperCase();
  const [coupon] = await db.select().from(couponsTable).where(eq(couponsTable.code, code));

  if (!coupon || !coupon.isActive) {
    res.status(400).json({ error: "الكود غير صحيح أو غير نشط" });
    return;
  }

  if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) {
    res.status(400).json({ error: "انتهت صلاحية هذا الكود" });
    return;
  }

  if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) {
    res.status(400).json({ error: "تجاوز هذا الكود الحد الأقصى للاستخدام" });
    return;
  }

  const orderAmount = existingOrder.totalAmount ? Number(existingOrder.totalAmount) : 0;
  if (coupon.minOrderAmount && orderAmount && orderAmount < coupon.minOrderAmount) {
    res.status(400).json({ error: `الحد الأدنى للطلب هو ${coupon.minOrderAmount} لاستخدام هذا الكود` });
    return;
  }

  let discountAmount = 0;
  if (coupon.discountType === "percentage") {
    discountAmount = Math.round((orderAmount * coupon.discountValue) / 100);
  } else {
    discountAmount = coupon.discountValue;
  }

  await db.update(couponsTable).set({ usedCount: sql`${couponsTable.usedCount} + 1` }).where(eq(couponsTable.id, coupon.id));
  const [order] = await db.update(ordersTable)
    .set({ couponCode: code, discountAmount })
    .where(eq(ordersTable.id, id))
    .returning();

  const enriched = await enrichOrder(order);
  res.json(enriched);
});

router.post("/orders/:id/final-receipt", async (req, res): Promise<void> => {
  const session = req.session as { userId?: number } | undefined;
  if (!session?.userId) {
    res.status(401).json({ error: "يجب تسجيل الدخول أولاً" });
    return;
  }

  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "معرف الطلب غير صالح" });
    return;
  }

  const body = req.body as { receiptUrl?: unknown };
  if (typeof body.receiptUrl !== "string" || !body.receiptUrl) {
    res.status(400).json({ error: "رابط الإيصال مطلوب" });
    return;
  }

  const [order] = await db.update(ordersTable)
    .set({ finalReceiptUrl: body.receiptUrl })
    .where(eq(ordersTable.id, id))
    .returning();

  if (!order) {
    res.status(404).json({ error: "الطلب غير موجود" });
    return;
  }

  const enriched = await enrichOrder(order);
  res.json(enriched);
});

router.post("/orders/:id/cancel", async (req, res): Promise<void> => {
  const session = req.session as { userId?: number } | undefined;
  if (!session?.userId) {
    res.status(401).json({ error: "يجب تسجيل الدخول أولاً" });
    return;
  }

  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "معرف الطلب غير صالح" });
    return;
  }

  const [existing] = await db.select().from(ordersTable).where(
    and(eq(ordersTable.id, id), eq(ordersTable.userId, session.userId))
  );

  if (!existing) {
    res.status(404).json({ error: "الطلب غير موجود" });
    return;
  }

  if (existing.status === "cancelled") {
    res.status(400).json({ error: "الطلب ملغى بالفعل" });
    return;
  }

  if (existing.status === "completed") {
    res.status(400).json({ error: "لا يمكن إلغاء طلب مكتمل" });
    return;
  }

  const [order] = await db.update(ordersTable)
    .set({ status: "cancelled" })
    .where(eq(ordersTable.id, id))
    .returning();

  const enriched = await enrichOrder(order);
  res.json(enriched);
});

router.post("/orders/:id/confirm-receipt", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "معرف الطلب غير صالح" });
    return;
  }

  const [order] = await db.update(ordersTable)
    .set({ status: "in_progress", depositPaid: true })
    .where(eq(ordersTable.id, id))
    .returning();

  if (!order) {
    res.status(404).json({ error: "الطلب غير موجود" });
    return;
  }

  const enriched = await enrichOrder(order);
  res.json(enriched);
});

router.delete("/orders/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = DeleteOrderParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [order] = await db.delete(ordersTable).where(eq(ordersTable.id, params.data.id)).returning();
  if (!order) {
    res.status(404).json({ error: "الطلب غير موجود" });
    return;
  }

  res.sendStatus(204);
});

export default router;
