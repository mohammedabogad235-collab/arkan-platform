import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, packagesTable } from "@workspace/db";
import { Api } from "@workspace/api-zod";

const router: IRouter = Router();

function formatPackage(p: typeof packagesTable.$inferSelect) {
  return { ...p, createdAt: p.createdAt.toISOString() };
}

router.get("/packages", async (_req, res): Promise<void> => {
  const packages = await db.select().from(packagesTable).orderBy(packagesTable.id);
  res.json(packages.map(formatPackage));
});

router.post("/packages", async (req, res): Promise<void> => {
  const parsed = Api.CreatePackageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [pkg] = await db.insert(packagesTable).values({
    ...parsed.data,
    isActive: parsed.data.isActive ?? true,
  }).returning();

  res.status(201).json(formatPackage(pkg));
});

router.patch("/packages/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = Api.UpdatePackageParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = Api.UpdatePackageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updateData: Record<string, unknown> = {};
  if (parsed.data.name != null) updateData.name = parsed.data.name;
  if (parsed.data.description != null) updateData.description = parsed.data.description;
  if (parsed.data.priceEgp != null) updateData.priceEgp = parsed.data.priceEgp;
  if (parsed.data.priceSar != null) updateData.priceSar = parsed.data.priceSar;
  if (parsed.data.features != null) updateData.features = parsed.data.features;
  if (parsed.data.isActive != null) updateData.isActive = parsed.data.isActive;

  const [pkg] = await db.update(packagesTable).set(updateData).where(eq(packagesTable.id, params.data.id)).returning();
  if (!pkg) {
    res.status(404).json({ error: "الباقة غير موجودة" });
    return;
  }

  res.json(formatPackage(pkg));
});

router.delete("/packages/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = Api.DeletePackageParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [pkg] = await db.delete(packagesTable).where(eq(packagesTable.id, params.data.id)).returning();
  if (!pkg) {
    res.status(404).json({ error: "الباقة غير موجودة" });
    return;
  }

  res.sendStatus(204);
});

export default router;
