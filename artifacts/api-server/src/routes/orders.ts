import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import {
  couponsTable,
  db,
  ordersTable,
  packagesTable,
  paymentMethodsTable,
  siteSettingsTable,
  usersTable,
} from "@workspace/db";
import { Api } from "@workspace/api-zod";
import {
  sendOrderCompletedEmail,
  sendOrderPaymentApprovedEmail,
  sendOrderPhaseEmail,
  sendOrderReceiptAcceptedEmail,
  sendOrderReceiptUploadedEmail,
  sendOrderReceivedEmail,
} from "../lib/mailer";
import { createClient } from "@supabase/supabase-js";

const router: IRouter = Router();

export function getSession(req: any): { userId?: number; role?: string } {
  const session = (req.session ?? {}) as Record<string, unknown>;
  return {
    userId: session.userId as number | undefined,
    role: session.role as string | undefined,
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
    // Extra fields used by frontend (not in OpenAPI strict types):
    receiptUrl: (o as any).receiptUrl ?? null,
    finalReceiptUrl: (o as any).finalReceiptUrl ?? null,
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

// GET /orders — admin: all orders, user: own orders
router.get("/orders", async (req, res): Promise<void> => {
  const parsed = Api.ListOrdersQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return; // Explicit return
  }

  const admin = await isAdmin(req);
  const { userId: sessionUserId } = getSession(req);
  if (!sessionUserId) {
    res.status(401).json({ error: "غير مصرح" });
    return; // Explicit return
  }

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
    .where(where.length ? (where.length === 1 ? where[0] : and(...where)) : undefined)
    .orderBy(ordersTable.id);

  const formatted = rows
    .filter((r) => Boolean(r.user))
    .map((r) =>
      formatOrderRow({
        order: r.order,
        user: r.user!,
        pkg: r.pkg ?? null,
        pm: r.pm ?? null,
      }),
    );

  res.json(formatted); // Explicit return
});

// POST /orders — create order (user)
router.post("/orders", async (req, res): Promise<void> => {
  const { userId } = getSession(req);
  if (!userId) {
    res.status(401).json({ error: "غير مصرح" });
    return; // Explicit return
  }

  const parsed = Api.CreateOrderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return; // Explicit return
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) {
    res.status(401).json({ error: "غير مصرح" });
    return; // Explicit return
  }

  const settings = await getOrCreateSettings();
  const depositPct = settings.depositPercentageValue ?? 50;

  const [order] = await db
    .insert(ordersTable)
    .values({
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
    } as any)
    .returning();

  // Email: order received
  try {
    await sendOrderReceivedEmail(user.email, user.fullName, order.id, order.siteName);
  } catch (err) {
    // non-blocking
    console.error("Failed to send order received email:", err);
  }

  const full = await loadOrderWithRelations(order.id);
  res.status(201).json(full ?? { id: order.id }); // Explicit return
});

// GET /orders/:id
router.get("/orders/:id", async (req, res): Promise<void> => {
  const params = Api.GetOrderParams.safeParse({ id: parseInt(req.params.id, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return; // Explicit return
  }

  const admin = await isAdmin(req);
  const { userId } = getSession(req);
  if (!userId) {
    res.status(401).json({ error: "غير مصرح" });
    return; // Explicit return
  }

  const order = await loadOrderWithRelations(params.data.id);
  if (!order) {
    res.status(404).json({ error: "الطلب غير موجود" });
    return; // Explicit return
  }

  if (!admin && order.userId !== userId) {
    res.status(403).json({ error: "غير مصرح" });
    return; // Explicit return
  }

  res.json(order); // Explicit return
});

// POST /orders/:id/receipt — user uploads deposit receipt
router.post("/orders/:id/receipt", async (req, res): Promise<void> => {
  const orderId = parseInt(req.params.id, 10);
  if (isNaN(orderId)) {
    res.status(400).json({ error: "معرف غير صالح" });
    return; // Explicit return
  }

  const { userId } = getSession(req);
  if (!userId) {
    res.status(401).json({ error: "غير مصرح" });
    return; // Explicit return
  }

  const { receiptUrl } = req.body as { receiptUrl?: string };
  if (!receiptUrl || typeof receiptUrl !== "string") {
    res.status(400).json({ error: "receiptUrl مطلوب" });
    return; // Explicit return
  }

  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));
  if (!order) {
    res.status(404).json({ error: "الطلب غير موجود" });
    return; // Explicit return
  }
  if (order.userId !== userId) {
    res.status(403).json({ error: "غير مصرح" });
    return; // Explicit return
  }

  const [updated] = await db
    .update(ordersTable)
    .set({ receiptUrl } as any)
    .where(eq(ordersTable.id, orderId))
    .returning();

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, order.userId));
  if (user) {
    try {
      await sendOrderReceiptUploadedEmail({
        to: user.email,
        name: user.fullName,
        orderId: orderId,
        siteName: order.siteName,
        receiptUrl,
        kind: "deposit",
      });
    } catch (err) {
      console.error("Failed to send receipt uploaded email:", err);
    }
  }

  res.json(updated); // Explicit return
});

// POST /orders/:id/final-receipt — user uploads final receipt
router.post("/orders/:id/final-receipt", async (req, res): Promise<void> => {
  const orderId = parseInt(req.params.id, 10);
  if (isNaN(orderId)) {
    res.status(400).json({ error: "معرف غير صالح" });
    return; // Explicit return
  }

  const { userId } = getSession(req);
  if (!userId) {
    res.status(401).json({ error: "غير مصرح" });
    return; // Explicit return
  }

  const { receiptUrl } = req.body as { receiptUrl?: string };
  if (!receiptUrl || typeof receiptUrl !== "string") {
    res.status(400).json({ error: "receiptUrl مطلوب" });
    return; // Explicit return
  }

  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));
  if (!order) {
    res.status(404).json({ error: "الطلب غير موجود" });
    return; // Explicit return
  }
  if (order.userId !== userId) {
    res.status(403).json({ error: "غير مصرح" });
    return; // Explicit return
  }

  const [updated] = await db
    .update(ordersTable)
    .set({ finalReceiptUrl: receiptUrl } as any)
    .where(eq(ordersTable.id, orderId))
    .returning();

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, order.userId));
  if (user) {
    try {
      await sendOrderReceiptUploadedEmail({
        to: user.email,
        name: user.fullName,
        orderId: orderId,
        siteName: order.siteName,
        receiptUrl,
        kind: "final",
      });
    } catch (err) {
      console.error("Failed to send final receipt uploaded email:", err);
    }
  }

  res.json(updated); // Explicit return
});

// POST /orders/:id/cancel — user cancels order
router.post("/orders/:id/cancel", async (req, res): Promise<void> => {
  const orderId = parseInt(req.params.id, 10);
  if (isNaN(orderId)) {
    res.status(400).json({ error: "معرف غير صالح" });
    return; // Explicit return
  }

  const { userId } = getSession(req);
  if (!userId) {
    res.status(401).json({ error: "غير مصرح" });
    return; // Explicit return
  }

  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));
  if (!order) {
    res.status(404).json({ error: "الطلب غير موجود" });
    return; // Explicit return
  }
  if (order.userId !== userId) {
    res.status(403).json({ error: "غير مصرح" });
    return; // Explicit return
  }

  const [updated] = await db
    .update(ordersTable)
    .set({ status: "cancelled" })
    .where(eq(ordersTable.id, orderId))
    .returning();

  res.json(updated); // Explicit return
});

// POST /orders/:id/apply-coupon — user applies coupon
router.post("/orders/:id/apply-coupon", async (req, res): Promise<void> => {
  const orderId = parseInt(req.params.id, 10);
  if (isNaN(orderId)) {
    res.status(400).json({ error: "معرف غير صالح" });
    return; // Explicit return
  }

  const { userId } = getSession(req);
  if (!userId) {
    res.status(401).json({ error: "غير مصرح" });
    return; // Explicit return
  }

  const { code } = req.body as { code?: string };
  if (!code || typeof code !== "string") {
    res.status(400).json({ error: "الكود مطلوب" });
    return; // Explicit return
  }

  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));
  if (!order) {
    res.status(404).json({ error: "الطلب غير موجود" });
    return; // Explicit return
  }
  if (order.userId !== userId) {
    res.status(403).json({ error: "غير مصرح" });
    return; // Explicit return
  }

  const normalized = code.trim().toUpperCase();
  const [coupon] = await db.select().from(couponsTable).where(eq(couponsTable.code, normalized));
  if (!coupon) {
    res.status(404).json({ error: "الكود غير موجود" });
    return; // Explicit return
  }
  if (!coupon.isActive) {
    res.status(400).json({ error: "هذا الكود غير مفعّل" });
    return; // Explicit return
  }
  if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) {
    res.status(400).json({ error: "انتهت صلاحية هذا الكود" });
    return; // Explicit return
  }
  if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) {
    res.status(400).json({ error: "تم استنفاد هذا الكود بالكامل" });
    return; // Explicit return
  }

  // discount applies only when totalAmount is set
  const amount = order.totalAmount ?? 0;
  if (coupon.minOrderAmount && amount < coupon.minOrderAmount) {
    res.status(400).json({ error: `الحد الأدنى للطلب ${coupon.minOrderAmount} لاستخدام هذا الكود` });
    return; // Explicit return
  }

  let discountAmount = 0;
  if (coupon.discountType === "percentage") {
    discountAmount = (amount * coupon.discountValue) / 100;
  } else {
    discountAmount = coupon.discountValue;
  }

  const rounded = Math.round(discountAmount);

  await db
    .update(ordersTable)
    .set({ couponCode: normalized, discountAmount: rounded } as any)
    .where(eq(ordersTable.id, orderId));

  await db
    .update(couponsTable) // Explicit return
    .set({ usedCount: coupon.usedCount + 1 }) // Explicit return
    .where(eq(couponsTable.id, coupon.id)); // Explicit return

  const full = await loadOrderWithRelations(orderId);
  res.json(full); // Explicit return
});

// PATCH /orders/:id — admin update (status/price/payment flags/etc.)
router.patch("/orders/:id", async (req, res): Promise<void> => {
  if (!(await isAdmin(req))) {
    res.status(403).json({ error: "غير مصرح" });
    return; // Explicit return
  }

  const orderId = parseInt(req.params.id, 10);
  if (isNaN(orderId)) {
    res.status(400).json({ error: "معرف غير صالح" });
    return; // Explicit return
  }

  const [originalOrder] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));
  if (!originalOrder) {
    res.status(404).json({ error: "الطلب غير موجود" });
    return; // Explicit return
  }

  // Validate core schema (OpenAPI), but allow extra fields used by UI (receiptUrl/deliveredUrl/paymentMethodId…)
  const parsed = Api.UpdateOrderBody.safeParse(req.body);
  if (!parsed.success) {
    // We still allow extra fields; only reject if body is completely empty
    // or has invalid types for known fields.
    // If safeParse failed, it means known fields failed types, so reject.
    res.status(400).json({ error: parsed.error.message }); // Explicit return
    return; // Explicit return
  }

  const body = req.body as Record<string, unknown>;
  const updateData: Record<string, unknown> = { ...parsed.data };

  // Allow extra fields used by admin UI
  // The `as any` cast is used here because `parsed.data` is strictly typed
  // but `body` might contain additional fields not in the OpenAPI schema.
  if (typeof body.deliveredUrl === "string" || body.deliveredUrl === null) updateData.deliveredUrl = body.deliveredUrl;
  if (typeof body.receiptUrl === "string" || body.receiptUrl === null) updateData.receiptUrl = body.receiptUrl;
  if (typeof body.finalReceiptUrl === "string" || body.finalReceiptUrl === null) updateData.finalReceiptUrl = body.finalReceiptUrl;
  if (typeof body.paymentMethodId === "number" || body.paymentMethodId === null) updateData.paymentMethodId = body.paymentMethodId;
  if (typeof body.adminNotes === "string" || body.adminNotes === null) updateData.adminNotes = body.adminNotes;

  const [updatedOrder] = await db.update(ordersTable).set(updateData as any).where(eq(ordersTable.id, orderId)).returning();
  if (!updatedOrder) {
    res.status(404).json({ error: "فشل تحديث الطلب" });
    return; // Explicit return
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, updatedOrder.userId));
  const [pm] =
    updatedOrder.paymentMethodId != null
      ? await db.select().from(paymentMethodsTable).where(eq(paymentMethodsTable.id, updatedOrder.paymentMethodId))
      : [];

  // --- Notification logic (non-blocking) ---
  if (user) {
    // 2) Approval + payment details (when totalAmount is set first time)
    if (originalOrder.totalAmount == null && updatedOrder.totalAmount != null) {
      try {
        await sendOrderPaymentApprovedEmail({
          to: user.email,
          name: user.fullName,
          orderId: updatedOrder.id,
          siteName: updatedOrder.siteName,
          totalAmount: updatedOrder.totalAmount,
          depositPercentage: updatedOrder.depositPercentage ?? 50,
          currency: updatedOrder.currency,
          paymentMethodName: pm?.name ?? null,
          paymentMethodDetails: pm?.details ?? null,
        });
      } catch (err) {
        console.error("Failed to send payment approved email:", err);
      }
    }

    // 3) Receipt uploaded (if admin sets it manually)
    if (!originalOrder.receiptUrl && updatedOrder.receiptUrl) {
      try {
        await sendOrderReceiptUploadedEmail({
          to: user.email,
          name: user.fullName,
          orderId: updatedOrder.id,
          siteName: updatedOrder.siteName,
          receiptUrl: updatedOrder.receiptUrl,
          kind: "deposit",
        });
      } catch (err) {
        console.error("Failed to send receipt uploaded email:", err);
      }
    }

    // 4) Receipt accepted (depositPaid)
    if (originalOrder.depositPaid === false && updatedOrder.depositPaid === true) {
      try {
        await sendOrderReceiptAcceptedEmail({
          to: user.email,
          name: user.fullName,
          orderId: updatedOrder.id,
          siteName: updatedOrder.siteName,
          kind: "deposit",
        });
      } catch (err) {
        console.error("Failed to send receipt accepted email:", err);
      }
    }

    // Final receipt accepted (finalPaid) — optional but consistent
    if (originalOrder.finalPaid === false && updatedOrder.finalPaid === true) {
      try {
        await sendOrderReceiptAcceptedEmail({
          to: user.email,
          name: user.fullName,
          orderId: updatedOrder.id,
          siteName: updatedOrder.siteName,
          kind: "final",
        });
      } catch (err) {
        console.error("Failed to send final payment accepted email:", err);
      }
    }

    // 5) Execution phases
    if (originalOrder.status !== "started" && updatedOrder.status === "started") {
      try {
        await sendOrderPhaseEmail({
          to: user.email,
          name: user.fullName,
          orderId: updatedOrder.id,
          siteName: updatedOrder.siteName,
          phase: "started",
        });
      } catch (err) {
        console.error("Failed to send started email:", err);
      }
    }
    if (originalOrder.status !== "in_progress" && updatedOrder.status === "in_progress") {
      try {
        await sendOrderPhaseEmail({
          to: user.email,
          name: user.fullName,
          orderId: updatedOrder.id,
          siteName: updatedOrder.siteName,
          phase: "in_progress",
        });
      } catch (err) {
        console.error("Failed to send in-progress email:", err);
      }
    }

    // 6) Completed + delivered link
    const becameCompleted = originalOrder.status !== "completed" && updatedOrder.status === "completed";
    const deliveredAdded = !originalOrder.deliveredUrl && Boolean(updatedOrder.deliveredUrl);
    const deliveredUrl =
      typeof updatedOrder.deliveredUrl === "string" && updatedOrder.deliveredUrl.trim().length > 0
        ? updatedOrder.deliveredUrl
        : null;

    if ((becameCompleted && deliveredUrl) || (deliveredAdded && updatedOrder.status === "completed" && deliveredUrl)) {
      try {
        await sendOrderCompletedEmail({
          to: user.email,
          name: user.fullName,
          orderId: updatedOrder.id,
          siteName: updatedOrder.siteName,
          deliveredUrl,
          requireFinalPaymentNotice: !updatedOrder.finalPaid,
          paymentMethodName: pm?.name ?? null,
          paymentMethodDetails: pm?.details ?? null,
        });
      } catch (err) {
        console.error("Failed to send completed email:", err);
      }
    }
  }

  const full = await loadOrderWithRelations(orderId);
  res.json(full ?? updatedOrder); // Explicit return
});

// POST /storage/upload-url - Generate a signed URL for Supabase upload
router.post("/storage/upload-url", async (req, res) => {
  const { userId } = getSession(req);
  if (!userId) {
    res.status(401).json({ error: "غير مصرح" });
    return; // Explicit return
  }

  const { fileName } = req.body;
  if (!fileName) {
    res.status(400).json({ error: "اسم الملف مطلوب" });
    return; // Explicit return
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucketName = process.env.SUPABASE_STORAGE_BUCKET || "receipts";

  if (!supabaseUrl || !supabaseKey) {
    console.error("Supabase URL or Service Key is not configured."); // Explicit return
    res.status(500).json({ error: "إعدادات التخزين غير مكتملة" }); // Explicit return
    return; // Explicit return
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  const extension = fileName.split(".").pop()?.toLowerCase() || "jpg";
  const uniqueFileName = `${Date.now()}-${Math.round(Math.random() * 1e9)}.${extension}`;
  const filePath = `public/user_${userId}/${uniqueFileName}`;

  const { data, error } = await supabase.storage.from(bucketName).createSignedUploadUrl(filePath);

  if (error) {
    console.error("Supabase signed URL error:", error); // Explicit return
    res.status(500).json({ error: "فشل إنشاء رابط الرفع" }); // Explicit return
    return; // Explicit return
  }

  res.json({
    uploadUrl: data.signedUrl,
    publicUrl: `${supabaseUrl}/storage/v1/object/public/${bucketName}/${data.path}`,
  }); // Explicit return
});

export default router;
