import { Router, type IRouter } from "express";
import { and, eq, or, desc } from "drizzle-orm";
import {
  couponsTable,
  db,
  ordersTable,
  packagesTable,
  paymentMethodsTable,
  siteSettingsTable,
  usersTable,
  messagesTable,
  notificationsTable,
} from "@workspace/db";
import { Api } from "@workspace/api-zod";
import {
  sendOrderCompletedEmail,
  sendOrderInProgressPaymentDetailsEmail,
  sendOrderPaymentApprovedEmail,
  sendOrderPhaseEmail,
  sendOrderReceiptAcceptedEmail,
  sendOrderReceiptUploadedEmail,
  sendOrderReceivedEmail,
  sendOrderStatusUpdateEmail,
  sendChatReplyEmail,
} from "../lib/mailer";
import { asyncHandler } from "../lib/http";
import { logger } from "../lib/logger";

const router: IRouter = Router();

function normalizeCouponCode(code: string): string {
  return code.trim().toUpperCase();
}

function isCouponExpired(coupon: typeof couponsTable.$inferSelect): boolean {
  return Boolean(coupon.expiresAt && coupon.expiresAt.getTime() < Date.now());
}

function calculateCouponDiscountAmount(coupon: typeof couponsTable.$inferSelect, amount: number): number {
  const rawDiscount =
    coupon.discountType === "percentage"
      ? (amount * coupon.discountValue) / 100
      : coupon.discountValue;

  return Math.min(amount, Math.max(0, Math.round(rawDiscount * 100) / 100));
}

async function recalculateOrderCoupon(
  order: typeof ordersTable.$inferSelect,
  nextAmount: number | null | undefined,
  nextCouponCode?: string | null,
): Promise<{ couponCode: string | null; discountAmount: number | null }> {
  const rawCouponCode =
    nextCouponCode !== undefined
      ? nextCouponCode
      : order.couponCode;
  const normalizedCouponCode = rawCouponCode ? normalizeCouponCode(rawCouponCode) : null;

  if (!normalizedCouponCode) {
    return {
      couponCode: null,
      discountAmount: nextAmount != null ? order.discountAmount ?? null : null,
    };
  }

  if (nextAmount == null || nextAmount <= 0) {
    return {
      couponCode: normalizedCouponCode,
      discountAmount: 0,
    };
  }

  const [coupon] = await db.select().from(couponsTable).where(eq(couponsTable.code, normalizedCouponCode));
  if (!coupon || !coupon.isActive || isCouponExpired(coupon)) {
    return {
      couponCode: normalizedCouponCode,
      discountAmount: 0,
    };
  }

  if (coupon.minOrderAmount !== null && nextAmount < coupon.minOrderAmount) {
    return {
      couponCode: normalizedCouponCode,
      discountAmount: 0,
    };
  }

  return {
    couponCode: normalizedCouponCode,
    discountAmount: calculateCouponDiscountAmount(coupon, nextAmount),
  };
}

async function resolveNotificationPaymentMethod(order: typeof ordersTable.$inferSelect) {
  if (order.paymentMethodId != null) {
    const [selectedMethod] = await db.select().from(paymentMethodsTable).where(eq(paymentMethodsTable.id, order.paymentMethodId));
    if (selectedMethod) {
      return selectedMethod;
    }
  }

  const methods = await db.select().from(paymentMethodsTable).where(eq(paymentMethodsTable.isActive, true));
  return methods.find((method) => method.currency === order.currency || method.currency === "both") ?? null;
}

export function getSession(req: any): { userId?: number; role?: string } {
  const sessionRole = req.session?.role || req.user?.role;
  const sessionUserId = req.session?.userId || req.user?.id || req.user?.userId;
  
  return {
    userId: sessionUserId as number | undefined,
    role: sessionRole as string | undefined,
  };
}

async function isAdmin(req: any): Promise<boolean> {
  const { userId, role } = getSession(req);
  if (!userId) return false;
  if (role === "admin" || role === "subadmin") return true;
  const [user] = await db
    .select({ role: usersTable.role })
    .from(usersTable)
    .where(eq(usersTable.id, userId));
  return user?.role === "admin" || user?.role === "subadmin";
}

function parseStoredPermissions(value: unknown): string[] {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed)
        ? parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
        : [];
    } catch {
      return [];
    }
  }

  return [];
}

async function checkPermission(req: any, permission: "canViewMessages" | "canReplyMessages"): Promise<boolean> {
  const { userId, role } = getSession(req);
  if (!userId) return false;
  if (role === "admin") return true; 
  if (role === "subadmin") {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    const storedPermissions = parseStoredPermissions((user as any)?.permissions);
    const permissionAliases = permission === "canViewMessages"
      ? ["view_messages", "messages"]
      : ["reply_messages"];

    return Boolean((user as any)?.[permission]) || permissionAliases.some((alias) => storedPermissions.includes(alias));
  }
  return false;
}

function formatUser(u: typeof usersTable.$inferSelect) {
  return {
    id: u.id,
    fullName: u.fullName,
    phone: u.phone,
    email: u.email,
    username: u.username,
    role: u.role,
    createdAt: u.createdAt.toISOString(),
  };
}

function formatOrderRow(row: {
  order: typeof ordersTable.$inferSelect;
  user: typeof usersTable.$inferSelect;
  pkg?: typeof packagesTable.$inferSelect | null;
  pm?: typeof paymentMethodsTable.$inferSelect | null;
}) {
  const o = row.order;
  return {
    id: o.id,
    userId: o.userId,
    siteName: o.siteName,
    siteType: o.siteType,
    details: o.details,
    packageId: o.packageId ?? null,
    customBudget: o.customBudget ?? null,
    currency: o.currency,
    paymentMethodId: o.paymentMethodId ?? null,
    status: o.status,
    depositPaid: o.depositPaid,
    finalPaid: o.finalPaid,
    totalAmount: o.totalAmount ?? null,
    depositPercentage: o.depositPercentage ?? 50,
    notes: o.notes ?? null,
    adminNotes: (o as any).adminNotes ?? null,
    createdAt: o.createdAt.toISOString(),
    updatedAt: o.updatedAt.toISOString(),
    transferAccount: (o as any).transferAccount ?? null,
    accountName: (o as any).accountName ?? null,
    transferAmount: (o as any).transferAmount ?? null,
    deliveredUrl: (o as any).deliveredUrl ?? null,
    couponCode: (o as any).couponCode ?? null,
    discountAmount: (o as any).discountAmount ?? null,
    user: formatUser(row.user),
    package: row.pkg
      ? { id: row.pkg.id, name: row.pkg.name, priceEgp: row.pkg.priceEgp, priceSar: row.pkg.priceSar }
      : null,
    paymentMethod: row.pm ? { id: row.pm.id, name: row.pm.name, details: row.pm.details } : null,
  };
}

async function loadOrderWithRelations(orderId: number) {
  const rows = await db
    .select({
      order: ordersTable,
      user: usersTable,
      pkg: packagesTable,
      pm: paymentMethodsTable,
    })
    .from(ordersTable)
    .leftJoin(usersTable, eq(ordersTable.userId, usersTable.id))
    .leftJoin(packagesTable, eq(ordersTable.packageId, packagesTable.id))
    .leftJoin(paymentMethodsTable, eq(ordersTable.paymentMethodId, paymentMethodsTable.id))
    .where(eq(ordersTable.id, orderId));

  const row = rows[0];
  if (!row || !row.user) return null;
  return formatOrderRow({
    order: row.order,
    user: row.user,
    pkg: row.pkg ?? null,
    pm: row.pm ?? null,
  });
}

async function getOrCreateSettings() {
  const rows = await db.select().from(siteSettingsTable).limit(1);
  if (rows.length > 0) return rows[0];
  const [row] = await db.insert(siteSettingsTable).values({}).returning();
  return row;
}

async function notifySafely(label: string, task: () => Promise<void>, context?: Record<string, unknown>) {
  try {
    await task();
  } catch (error) {
    logger.error({ err: error, ...context }, label);
  }
}

function hasSubmittedTransferDetails(order: {
  transferAccount?: string | null;
  accountName?: string | null;
  transferAmount?: string | null;
}) {
  return [order.transferAccount, order.accountName, order.transferAmount].every(
    (value) => typeof value === "string" && value.trim().length > 0,
  );
}

function getOrderStatusLabel(status: string): string {
  const statusMap: Record<string, string> = {
    pending: "قيد الانتظار",
    started: "بدأ التنفيذ",
    in_progress: "قيد التنفيذ",
    completed: "مكتمل",
    cancelled: "ملغي",
    refunded: "مسترجع",
  };
  return statusMap[status] || status;
}

// GET /orders
router.get("/orders", async (req, res): Promise<void> => {
  const parsed = Api.ListOrdersQueryParams.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const admin = await isAdmin(req);
  const { userId: sessionUserId } = getSession(req);
  if (!sessionUserId) { res.status(401).json({ error: "غير مصرح" }); return; }

  const where: any[] = [];
  const requestedUserId = parsed.data.userId ?? null;
  const requestedStatus = parsed.data.status ?? null;

  if (admin) {
    if (requestedUserId != null) where.push(eq(ordersTable.userId, requestedUserId));
  } else {
    where.push(eq(ordersTable.userId, sessionUserId));
  }
  if (requestedStatus != null) where.push(eq(ordersTable.status, requestedStatus));

  const rows = await db
    .select({ order: ordersTable, user: usersTable, pkg: packagesTable, pm: paymentMethodsTable })
    .from(ordersTable)
    .leftJoin(usersTable, eq(ordersTable.userId, usersTable.id))
    .leftJoin(packagesTable, eq(ordersTable.packageId, packagesTable.id))
    .leftJoin(paymentMethodsTable, eq(ordersTable.paymentMethodId, paymentMethodsTable.id))
    .where(where.length ? (where.length === 1 ? where[0] : and(...where)) : undefined)
    .orderBy(ordersTable.id);

  const formatted = rows.filter((r) => Boolean(r.user)).map((r) =>
    formatOrderRow({ order: r.order, user: r.user!, pkg: r.pkg ?? null, pm: r.pm ?? null })
  );

  res.json(formatted);
});

// POST /orders
router.post("/orders", asyncHandler(async (req, res): Promise<void> => {
  const { userId } = getSession(req);
  if (!userId) { res.status(401).json({ error: "غير مصرح" }); return; }

  const parsed = Api.CreateOrderBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) { res.status(401).json({ error: "غير مصرح" }); return; }

  const settings = await getOrCreateSettings();
  const depositPct = settings.depositPercentageValue ?? 50;

  const [order] = await db.insert(ordersTable).values({
    userId,
    siteName: parsed.data.siteName,
    siteType: parsed.data.siteType,
    details: parsed.data.details,
    packageId: parsed.data.packageId ?? null,
    customBudget: parsed.data.customBudget ?? null,
    currency: parsed.data.currency,
    paymentMethodId: parsed.data.paymentMethodId ?? null,
    status: "pending",
    depositPaid: false,
    finalPaid: false,
    depositPercentage: depositPct,
    couponCode: parsed.data.couponCode ?? null,
  } as any).returning();

  await notifySafely("Failed to send order received email", async () => {
    await sendOrderReceivedEmail(user.email, user.fullName, order.id, order.siteName);
  }, { orderId: order.id, userId: user.id });

  const full = await loadOrderWithRelations(order.id);
  res.status(201).json(full ?? { id: order.id });
}));

// GET /orders/:id
router.get("/orders/:id", async (req, res): Promise<void> => {
  const params = Api.GetOrderParams.safeParse({ id: parseInt(req.params.id as string, 10) });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const admin = await isAdmin(req);
  const { userId } = getSession(req);
  if (!userId) { res.status(401).json({ error: "غير مصرح" }); return; }

  const order = await loadOrderWithRelations(params.data.id);
  if (!order) { res.status(404).json({ error: "الطلب غير موجود" }); return; }

  if (!admin && order.userId !== userId) { res.status(403).json({ error: "غير مصرح" }); return; }
  res.json(order);
});

// DELETE /orders/:id
router.delete("/orders/:id", asyncHandler(async (req, res): Promise<void> => {
  const orderId = parseInt(req.params.id as string, 10);
  if (isNaN(orderId)) { res.status(400).json({ error: "معرف الطلب غير صالح" }); return; }

  const { userId } = getSession(req);
  if (!userId) { res.status(401).json({ error: "غير مصرح" }); return; }

  const admin = await isAdmin(req);
  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));
  if (!order) { res.status(404).json({ error: "الطلب غير موجود" }); return; }

  if (!admin && order.userId !== userId) {
    res.status(403).json({ error: "غير مصرح لك بحذف هذا الطلب" });
    return;
  }

  try {
    await db.transaction(async (tx) => {
      const normalizedCouponCode = order.couponCode ? normalizeCouponCode(order.couponCode) : null;

      if (normalizedCouponCode) {
        const [coupon] = await tx.select().from(couponsTable).where(eq(couponsTable.code, normalizedCouponCode));
        if (coupon && coupon.usedCount > 0) {
          await tx
            .update(couponsTable)
            .set({ usedCount: coupon.usedCount - 1 })
            .where(eq(couponsTable.id, coupon.id));
        }
      }

      await tx.delete(ordersTable).where(eq(ordersTable.id, orderId));
    });

    res.status(200).json({ success: true, id: orderId });
  } catch (err) {
    logger.error({ err, orderId, userId }, "Failed to delete order");
    res.status(500).json({ error: "حدث خطأ أثناء حذف الطلب" });
  }
}));

// POST /orders/:id/receipt 
router.post("/orders/:id/receipt", async (req, res): Promise<void> => {
  const orderId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  if (isNaN(orderId)) { res.status(400).json({ error: "معرف غير صالح" }); return; }

  const { userId } = getSession(req);
  if (!userId) { res.status(401).json({ error: "غير مصرح" }); return; }

  const {
    transferAccount,
    accountName,
    transferAmount,
  } = req.body as {
    transferAccount?: string;
    accountName?: string;
    transferAmount?: string | number;
  };

  const normalizedTransferAccount = typeof transferAccount === "string" ? transferAccount.trim() : "";
  const normalizedAccountName = typeof accountName === "string" ? accountName.trim() : "";
  const normalizedTransferAmount =
    typeof transferAmount === "number"
      ? String(transferAmount)
      : typeof transferAmount === "string"
        ? transferAmount.trim()
        : "";

  if (!normalizedTransferAccount || !normalizedAccountName || !normalizedTransferAmount) {
    res.status(400).json({ error: "بيانات التحويل مطلوبة بالكامل" }); return;
  }

  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));
  if (!order) { res.status(404).json({ error: "الطلب غير موجود" }); return; }
  if (order.userId !== userId) { res.status(403).json({ error: "غير مصرح" }); return; }

  const [updated] = await db
    .update(ordersTable)
    .set({
      transferAccount: normalizedTransferAccount,
      accountName: normalizedAccountName,
      transferAmount: normalizedTransferAmount,
    } as any)
    .where(eq(ordersTable.id, orderId))
    .returning();
    
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, order.userId));

  if (user) {
    await db.insert(notificationsTable).values({
      userId: 1, 
      message: `تم إرفاق بيانات دفع جديدة للطلب #${order.id}`,
    } as any);

    await notifySafely("Failed to send receipt uploaded email", async () => {
      await sendOrderReceiptUploadedEmail({
        to: user.email, name: user.fullName, orderId, siteName: order.siteName, kind: "deposit",
      });
    });
  }
  res.json(updated);
});

// POST /orders/:id/final-receipt 
router.post("/orders/:id/final-receipt", async (req, res): Promise<void> => {
  const orderId = parseInt(req.params.id as string, 10);
  if (isNaN(orderId)) { res.status(400).json({ error: "معرف غير صالح" }); return; }

  const { userId } = getSession(req);
  if (!userId) { res.status(401).json({ error: "غير مصرح" }); return; }

  const {
    transferAccount,
    accountName,
    transferAmount,
  } = req.body as {
    transferAccount?: string;
    accountName?: string;
    transferAmount?: string | number;
  };

  const normalizedTransferAccount = typeof transferAccount === "string" ? transferAccount.trim() : "";
  const normalizedAccountName = typeof accountName === "string" ? accountName.trim() : "";
  const normalizedTransferAmount = typeof transferAmount === "number" ? String(transferAmount) : typeof transferAmount === "string" ? transferAmount.trim() : "";

  if (!normalizedTransferAccount || !normalizedAccountName || !normalizedTransferAmount) { 
    res.status(400).json({ error: "بيانات التحويل مطلوبة بالكامل" }); return; 
  }

  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));
  if (!order) { res.status(404).json({ error: "الطلب غير موجود" }); return; }
  if (order.userId !== userId) { res.status(403).json({ error: "غير مصرح" }); return; }

  const [updated] = await db.update(ordersTable).set({ 
    transferAccount: normalizedTransferAccount,
    accountName: normalizedAccountName,
    transferAmount: normalizedTransferAmount,
  } as any).where(eq(ordersTable.id, orderId)).returning();
  
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, order.userId));

  if (user) {
    await db.insert(notificationsTable).values({
      userId: 1, 
      message: `تأكيد دفعة نهائية للطلب #${order.id}`,
    } as any);

    await notifySafely("Failed to send final receipt uploaded email", async () => {
      await sendOrderReceiptUploadedEmail({
        to: user.email, name: user.fullName, orderId, siteName: order.siteName, kind: "final",
      });
    });
  }
  res.json(updated);
});

// POST /orders/:id/cancel
router.post("/orders/:id/cancel", async (req, res): Promise<void> => {
  const orderId = parseInt(req.params.id as string, 10);
  if (isNaN(orderId)) { res.status(400).json({ error: "معرف غير صالح" }); return; }

  const { userId } = getSession(req);
  if (!userId) { res.status(401).json({ error: "غير مصرح" }); return; }

  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));
  if (!order) { res.status(404).json({ error: "الطلب غير موجود" }); return; }
  if (order.userId !== userId) { res.status(403).json({ error: "غير مصرح" }); return; }

  const [updated] = await db.update(ordersTable).set({ status: "cancelled" }).where(eq(ordersTable.id, orderId)).returning();
  res.json(updated);
});

// POST /orders/:id/apply-coupon
router.post("/orders/:id/apply-coupon", asyncHandler(async (req, res): Promise<void> => {
  const orderId = parseInt(req.params.id as string, 10);
  if (isNaN(orderId)) { res.status(400).json({ error: "معرف الطلب غير صالح" }); return; }

  const { userId } = getSession(req);
  if (!userId) { res.status(401).json({ error: "غير مصرح" }); return; }

  const { code } = req.body as { code?: string };
  if (!code || typeof code !== "string") { res.status(400).json({ error: "كود الخصم مطلوب" }); return; }

  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));
  if (!order) { res.status(404).json({ error: "الطلب غير موجود" }); return; }
  if (order.userId !== userId) { res.status(403).json({ error: "غير مصرح لك بتعديل هذا الطلب" }); return; }

  const normalized = normalizeCouponCode(code);
  const [coupon] = await db.select().from(couponsTable).where(eq(couponsTable.code, normalized));
  
  if (!coupon) { res.status(404).json({ error: "كود الخصم غير صحيح أو غير موجود" }); return; }
  if (!coupon.isActive) { res.status(400).json({ error: "هذا الكود غير مفعّل حالياً" }); return; }
  if (isCouponExpired(coupon)) { res.status(400).json({ error: "عذراً، لقد انتهت صلاحية هذا الكود" }); return; }
  if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) { res.status(400).json({ error: "تم استنفاد الحد الأقصى لاستخدام هذا الكود" }); return; }

  if (order.totalAmount == null || order.totalAmount <= 0) {
    res.status(400).json({ error: "لا يمكن تطبيق كود الخصم قبل أن تقوم الإدارة بتحديد السعر الإجمالي للطلب." }); return;
  }

  const amount = order.totalAmount;
  if (coupon.minOrderAmount !== null && amount < coupon.minOrderAmount) {
    res.status(400).json({ error: `يجب أن يكون إجمالي الطلب ${coupon.minOrderAmount} على الأقل لاستخدام هذا الكود` }); return;
  }

  const discountAmount = calculateCouponDiscountAmount(coupon, amount);
  const previousCouponCode = order.couponCode ? normalizeCouponCode(order.couponCode) : null;

  try {
    await db.transaction(async (tx) => {
      if (previousCouponCode && previousCouponCode !== normalized) {
        const [previousCoupon] = await tx.select().from(couponsTable).where(eq(couponsTable.code, previousCouponCode));
        if (previousCoupon && previousCoupon.usedCount > 0) {
          await tx.update(couponsTable).set({ usedCount: previousCoupon.usedCount - 1 }).where(eq(couponsTable.id, previousCoupon.id));
        }
      }

      await tx.update(ordersTable).set({ couponCode: normalized, discountAmount } as any).where(eq(ordersTable.id, orderId));

      if (previousCouponCode !== normalized) {
        await tx.update(couponsTable).set({ usedCount: coupon.usedCount + 1 }).where(eq(couponsTable.id, coupon.id));
      }
    });

    const full = await loadOrderWithRelations(orderId);
    res.json(full);
  } catch (err) {
    logger.error({ err, orderId, code }, "Failed to apply coupon transaction");
    res.status(500).json({ error: "حدث خطأ أثناء تطبيق الكوبون، يرجى المحاولة مرة أخرى." });
  }
}));

// PATCH /orders/:id
router.patch("/orders/:id", asyncHandler(async (req, res): Promise<void> => {
  if (!(await isAdmin(req))) { res.status(403).json({ error: "غير مصرح" }); return; }

  const orderId = parseInt(req.params.id as string, 10);
  if (isNaN(orderId)) { res.status(400).json({ error: "معرف الطلب غير صالح" }); return; }

  const [originalOrder] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));
  if (!originalOrder) { res.status(404).json({ error: "الطلب غير موجود" }); return; }

  const parsed = Api.UpdateOrderBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const body = req.body as Record<string, unknown>;
  const updateData: Record<string, unknown> = { ...parsed.data };

  if (typeof body.deliveredUrl === "string" || body.deliveredUrl === null) updateData.deliveredUrl = body.deliveredUrl;
  if (typeof body.transferAccount === "string" || body.transferAccount === null) updateData.transferAccount = body.transferAccount;
  if (typeof body.accountName === "string" || body.accountName === null) updateData.accountName = body.accountName;
  if (typeof body.transferAmount === "string" || body.transferAmount === null || typeof body.transferAmount === "number") {
    updateData.transferAmount = body.transferAmount === null ? null : String(body.transferAmount);
  }
  if (typeof body.paymentMethodId === "number" || body.paymentMethodId === null) updateData.paymentMethodId = body.paymentMethodId;
  if (typeof body.adminNotes === "string" || body.adminNotes === null) updateData.adminNotes = body.adminNotes;
  if (typeof body.couponCode === "string" || body.couponCode === null) updateData.couponCode = body.couponCode;

  const nextAmount = typeof updateData.totalAmount === "number" ? updateData.totalAmount : originalOrder.totalAmount ?? null;
  const nextCouponCode = typeof updateData.couponCode === "string" || updateData.couponCode === null ? (updateData.couponCode as string | null) : undefined;
  
  const couponState = await recalculateOrderCoupon(originalOrder, nextAmount, nextCouponCode);
  updateData.couponCode = couponState.couponCode;
  updateData.discountAmount = couponState.discountAmount;

  const [updatedOrder] = await db.update(ordersTable).set(updateData as any).where(eq(ordersTable.id, orderId)).returning();
  if (!updatedOrder) { res.status(404).json({ error: "فشل تحديث الطلب" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, updatedOrder.userId));
  const pm = await resolveNotificationPaymentMethod(updatedOrder);

  if (user) {
    const statusChanged = originalOrder.status !== updatedOrder.status;

    if (originalOrder.totalAmount == null && updatedOrder.totalAmount != null) {
      await notifySafely("Failed to send payment approved email", async () => {
        await sendOrderPaymentApprovedEmail({
          to: user.email, name: user.fullName, orderId: updatedOrder.id, siteName: updatedOrder.siteName,
          totalAmount: updatedOrder.totalAmount!, depositPercentage: updatedOrder.depositPercentage ?? 50, currency: updatedOrder.currency,
          paymentMethodName: pm?.name ?? null, paymentMethodDetails: pm?.details ?? null,
        });
      }, { orderId: updatedOrder.id });
    }

    if (originalOrder.depositPaid === false && updatedOrder.depositPaid === true) {
      await notifySafely("Failed to send receipt accepted email", async () => {
        await sendOrderReceiptAcceptedEmail({ to: user.email, name: user.fullName, orderId: updatedOrder.id, siteName: updatedOrder.siteName, kind: "deposit" });
      });
    }

    if (originalOrder.finalPaid === false && updatedOrder.finalPaid === true) {
      await notifySafely("Failed to send final payment accepted email", async () => {
        await sendOrderReceiptAcceptedEmail({ to: user.email, name: user.fullName, orderId: updatedOrder.id, siteName: updatedOrder.siteName, kind: "final" });
      });
    }

    if (statusChanged) {
      if (updatedOrder.status === "started") {
        await notifySafely("Failed to send started email", async () => {
          await sendOrderPhaseEmail({ to: user.email, name: user.fullName, orderId: updatedOrder.id, siteName: updatedOrder.siteName, phase: "started" });
        });
      } else if (updatedOrder.status === "in_progress") {
        await notifySafely("Failed to send in-progress email", async () => {
          await sendOrderInProgressPaymentDetailsEmail({
            to: user.email, name: user.fullName, orderId: updatedOrder.id, siteName: updatedOrder.siteName,
            totalAmount: updatedOrder.totalAmount, depositPercentage: updatedOrder.depositPercentage ?? 50, currency: updatedOrder.currency,
            paymentMethodName: pm?.name ?? null, paymentMethodDetails: pm?.details ?? null,
          });
        });
      } else if (updatedOrder.status !== "completed") {
        const statusMap: Record<string, string> = { "pending": "قيد الانتظار", "cancelled": "ملغي", "refunded": "مسترجع" };
        const statusAr = statusMap[updatedOrder.status as string] || updatedOrder.status;
        await notifySafely("Failed to send status update email", async () => {
          await sendOrderStatusUpdateEmail(user.email, user.fullName, updatedOrder.id, updatedOrder.siteName, statusAr, "يرجى مراجعة لوحة التحكم للإطلاع على أحدث تطورات مشروعك.");
        });
      }
    }

    const becameCompleted = statusChanged && updatedOrder.status === "completed";
    const deliveredUrlChangedOrAdded = originalOrder.deliveredUrl !== updatedOrder.deliveredUrl && Boolean(updatedOrder.deliveredUrl);
    
    if (becameCompleted || (updatedOrder.status === "completed" && deliveredUrlChangedOrAdded)) {
      const deliveredUrl = typeof updatedOrder.deliveredUrl === "string" && updatedOrder.deliveredUrl.trim().length > 0 ? updatedOrder.deliveredUrl : null;
      await notifySafely("Failed to send completed email", async () => {
        await sendOrderCompletedEmail({
          to: user.email, name: user.fullName, orderId: updatedOrder.id, siteName: updatedOrder.siteName,
          deliveredUrl: deliveredUrl ?? "",
          requireFinalPaymentNotice: !updatedOrder.finalPaid, paymentMethodName: pm?.name ?? null, paymentMethodDetails: pm?.details ?? null,
        });
      });
    }

    if (statusChanged) {
      await db.insert(notificationsTable).values({
        userId: user.id,
        message: `تم تحديث حالة طلبك إلى: ${getOrderStatusLabel(updatedOrder.status)}`,
        isRead: false,
      } as any);
    }
  }

  const full = await loadOrderWithRelations(orderId);
  res.json(full ?? updatedOrder);
}));

// ==========================================
// 💬 نظام الرسائل والشات الدقيق والتصفير
// ==========================================

router.get("/admin/chat-users", asyncHandler(async (req, res): Promise<void> => {
  const hasAccess = await checkPermission(req, "canViewMessages");
  if (!hasAccess) { res.status(403).json({ error: "غير مصرح لك برؤية الرسائل" }); return; }

  const clients = await db.select().from(usersTable).where(
    or(eq(usersTable.role, "user"), eq(usersTable.role, "client"))
  );
  
  const unreadMessages = await db.select().from(messagesTable).where(eq(messagesTable.isRead, false));

  const formattedClients = clients.map(c => {
    const count = unreadMessages.filter(m => m.senderId === c.id).length;
    return {
      id: c.id,
      fullName: c.fullName,
      email: c.email,
      unreadCount: count 
    };
  });

  formattedClients.sort((a, b) => b.unreadCount - a.unreadCount || b.id - a.id);

  res.json(formattedClients);
}));

router.get("/messages/unread-count", asyncHandler(async (req, res): Promise<void> => {
  const { userId } = getSession(req);
  if (!userId) { res.json({ unreadCount: 0 }); return; }

  const count = await db.select({ id: messagesTable.id })
    .from(messagesTable)
    .where(and(eq(messagesTable.receiverId, userId), eq(messagesTable.isRead, false)));

  res.json({ unreadCount: count.length });
}));

// 🚀 جلب الرسائل مع ربطها بجدول المستخدمين لكي يظهر دور المُرسِل (senderRole) بدقة
router.get(["/messages", "/messages/:userId"], asyncHandler(async (req, res): Promise<void> => {
  const { userId: sessionUserId, role } = getSession(req);
  if (!sessionUserId) { res.status(401).json({ error: "غير مصرح" }); return; }

  let targetUserId = sessionUserId; 

  if (role === "admin" || role === "subadmin") {
    const hasAccess = await checkPermission(req, "canViewMessages");
    if (!hasAccess) { res.status(403).json({ error: "غير مصرح لك برؤية الرسائل" }); return; }
    if (req.params.userId) {
      targetUserId = parseInt(req.params.userId as string, 10);
    }
  }

  const allUserMsgsRaw = await db.select({
    id: messagesTable.id,
    senderId: messagesTable.senderId,
    receiverId: messagesTable.receiverId,
    content: messagesTable.content,
    isRead: messagesTable.isRead,
    isEdited: messagesTable.isEdited,
    isDeleted: messagesTable.isDeleted,
    createdAt: messagesTable.createdAt,
    senderRole: usersTable.role,
  })
  .from(messagesTable)
  .leftJoin(usersTable, eq(messagesTable.senderId, usersTable.id))
  .where(
    or(
      eq(messagesTable.senderId, targetUserId),
      eq(messagesTable.receiverId, targetUserId)
    )
  )
  .orderBy(messagesTable.createdAt);

  if (role === "admin" || role === "subadmin") {
    await db.update(messagesTable)
      .set({ isRead: true })
      .where(and(eq(messagesTable.senderId, targetUserId), eq(messagesTable.isRead, false)));
  } else {
    await db.update(messagesTable)
      .set({ isRead: true })
      .where(and(eq(messagesTable.receiverId, sessionUserId), eq(messagesTable.isRead, false)));
  }

  res.json(allUserMsgsRaw);
}));

router.post("/messages", asyncHandler(async (req, res): Promise<void> => {
  const { userId: senderId, role } = getSession(req);
  if (!senderId) { res.status(401).json({ error: "غير مصرح" }); return; }

  const { receiverId, content } = req.body;
  if (!content) { res.status(400).json({ error: "محتوى الرسالة مطلوب" }); return; }

  const isAdminUser = role === "admin" || role === "subadmin";
  
  if (isAdminUser) {
    const hasAccess = await checkPermission(req, "canReplyMessages");
    if (!hasAccess) { res.status(403).json({ error: "ليس لديك صلاحية للرد على الرسائل" }); return; }
  }

  let actualReceiverId = receiverId ? Number(receiverId) : null;

  if (!isAdminUser || !actualReceiverId) {
    const adminUser = await db.select().from(usersTable).where(or(eq(usersTable.role, "admin"), eq(usersTable.role, "subadmin"))).limit(1);
    
    if (adminUser && adminUser.length > 0) {
      actualReceiverId = adminUser[0].id;
    } else {
      actualReceiverId = 1;
    }
  }

  const [newMessage] = await db.insert(messagesTable).values({
    senderId,
    receiverId: actualReceiverId,
    content,
    isRead: false,
  } as any).returning();

  if (isAdminUser) {
    await db.insert(notificationsTable).values({
      userId: actualReceiverId,
      message: "تم الرد على استفسارك من الإدارة",
      isRead: false,
    } as any);

    const [client] = await db.select().from(usersTable).where(eq(usersTable.id, actualReceiverId));
    if (client) {
      await notifySafely("Failed to send chat reply email", async () => {
        await sendChatReplyEmail(client.email, client.fullName, content);
      });
    }
  } else {
    await db.insert(notificationsTable).values({
      userId: actualReceiverId, 
      message: "توجد رسالة جديدة من أحد العملاء",
      isRead: false,
    } as any);
  }

  res.status(201).json(newMessage);
}));

// ==========================================
// 🔔 نظام الإشعارات (Notifications System)
// ==========================================

router.get("/notifications", asyncHandler(async (req, res): Promise<void> => {
  const { userId } = getSession(req);
  if (!userId) { res.status(401).json({ error: "غير مصرح" }); return; }

  const notifs = await db.select().from(notificationsTable)
    .where(eq(notificationsTable.userId, userId))
    .orderBy(desc(notificationsTable.createdAt));

  res.json(notifs);
}));

router.patch("/notifications/:id/read", asyncHandler(async (req, res): Promise<void> => {
  const { userId } = getSession(req);
  const notifId = parseInt(req.params.id as string, 10); 
  
  if (!userId || isNaN(notifId)) { res.status(400).json({ error: "بيانات غير صالحة" }); return; }

  await db.update(notificationsTable)
    .set({ isRead: true })
    .where(and(eq(notificationsTable.id, notifId), eq(notificationsTable.userId, userId)));

  res.json({ success: true });
}));

// ==========================================
// 🛠️ تعديل وحذف الرسائل (Edit & Soft Delete مع الصلاحيات الصارمة)
// ==========================================

async function canUserModifyMessage(req: any, msg: any): Promise<boolean> {
  const { userId, role } = getSession(req);
  if (!userId) return false;

  const [currentUser] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!currentUser) return false;

  // جلب معلومات مُرسِل الرسالة الأصلي
  const [senderUser] = await db.select().from(usersTable).where(eq(usersTable.id, msg.senderId));
  const senderRole = senderUser?.role; // "admin", "subadmin", "user", "client"

  const isMainAdmin = currentUser.role === "admin";
  const isSubadmin = currentUser.role === "subadmin";
  const isOwner = Number(msg.senderId) === Number(userId);

  // 1. المدير الرئيسي (Admin) يستطيع تعديل أو حذف أي رسالة خاصة به أو خاصة بالمشرف الفرعي
  if (isMainAdmin) {
    return true;
  }

  // 2. المشرف الفرعي (Subadmin)
  if (isSubadmin) {
    const storedPermissions = parseStoredPermissions((currentUser as any)?.permissions);
    const hasPermission = storedPermissions.includes("modify_messages");
    if (!hasPermission) return false;

    // المشرف الفرعي ممنوع تماماً من تعديل أو حذف رسائل المدير الرئيسي (Admin)
    if (senderRole === "admin") {
      return false;
    }

    // المشرف الفرعي يمكنه تعديل وحذف رسائله الشخصية فقط
    if (isOwner) {
      return true;
    }

    return false;
  }

  // 3. العميل العادي يمكنه تعديل وحذف رسائله الخاصة فقط
  if (isOwner) {
    return true;
  }

  return false;
}

// تعديل رسالة
router.patch("/messages/:id", asyncHandler(async (req, res): Promise<void> => {
  const { userId } = getSession(req);
  if (!userId) { res.status(401).json({ error: "غير مصرح" }); return; }
  
  const msgId = parseInt(req.params.id as string, 10);
  if (isNaN(msgId)) { res.status(400).json({ error: "معرف الرسالة غير صالح" }); return; }

  const { content } = req.body;
  if (!content || typeof content !== "string") { res.status(400).json({ error: "المحتوى مطلوب" }); return; }

  const [msg] = await db.select().from(messagesTable).where(eq(messagesTable.id, msgId));
  if (!msg) { res.status(404).json({ error: "الرسالة غير موجودة" }); return; }
  
  const allowed = await canUserModifyMessage(req, msg);
  if (!allowed) { 
    res.status(403).json({ error: "ليس لديك صلاحية لتعديل هذه الرسالة" }); 
    return; 
  }
  if ((msg as any).isDeleted) { res.status(400).json({ error: "لا يمكن تعديل رسالة محذوفة" }); return; }

  await db.update(messagesTable).set({ content, isEdited: true } as any).where(eq(messagesTable.id, msgId));
  res.json({ success: true });
}));

// حذف رسالة
router.delete("/messages/:id", asyncHandler(async (req, res): Promise<void> => {
  const { userId } = getSession(req);
  if (!userId) { res.status(401).json({ error: "غير مصرح" }); return; }
  
  const msgId = parseInt(req.params.id as string, 10);
  if (isNaN(msgId)) { res.status(400).json({ error: "معرف الرسالة غير صالح" }); return; }

  const [msg] = await db.select().from(messagesTable).where(eq(messagesTable.id, msgId));
  if (!msg) { res.status(404).json({ error: "الطلب غير موجود أو الرسالة محذوفة" }); return; }
  
  const allowed = await canUserModifyMessage(req, msg);
  if (!allowed) { 
    res.status(403).json({ error: "ليس لديك صلاحية لحذف هذه الرسالة" }); 
    return; 
  }

  await db.update(messagesTable).set({ isDeleted: true, content: "" } as any).where(eq(messagesTable.id, msgId));
  res.json({ success: true });
}));

export default router;