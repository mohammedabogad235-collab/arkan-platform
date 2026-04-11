import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, paymentMethodsTable } from "@workspace/db";
import {
  CreatePaymentMethodBody,
  UpdatePaymentMethodBody,
  UpdatePaymentMethodParams,
  DeletePaymentMethodParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

function formatMethod(m: typeof paymentMethodsTable.$inferSelect) {
  return { ...m, createdAt: m.createdAt.toISOString() };
}

router.get("/payment-methods", async (_req, res): Promise<void> => {
  const methods = await db.select().from(paymentMethodsTable).orderBy(paymentMethodsTable.id);
  res.json(methods.map(formatMethod));
});

router.post("/payment-methods", async (req, res): Promise<void> => {
  const parsed = CreatePaymentMethodBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [method] = await db.insert(paymentMethodsTable).values({
    ...parsed.data,
    isActive: parsed.data.isActive ?? true,
  }).returning();

  res.status(201).json(formatMethod(method));
});

router.patch("/payment-methods/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = UpdatePaymentMethodParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdatePaymentMethodBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updateData: Record<string, unknown> = {};
  if (parsed.data.name != null) updateData.name = parsed.data.name;
  if (parsed.data.details != null) updateData.details = parsed.data.details;
  if (parsed.data.isActive != null) updateData.isActive = parsed.data.isActive;

  const [method] = await db.update(paymentMethodsTable).set(updateData).where(eq(paymentMethodsTable.id, params.data.id)).returning();
  if (!method) {
    res.status(404).json({ error: "طريقة الدفع غير موجودة" });
    return;
  }

  res.json(formatMethod(method));
});

router.delete("/payment-methods/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = DeletePaymentMethodParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [method] = await db.delete(paymentMethodsTable).where(eq(paymentMethodsTable.id, params.data.id)).returning();
  if (!method) {
    res.status(404).json({ error: "طريقة الدفع غير موجودة" });
    return;
  }

  res.sendStatus(204);
});

export default router;
