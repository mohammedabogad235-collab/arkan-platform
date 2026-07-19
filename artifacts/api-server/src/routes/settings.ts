import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, siteSettingsTable } from "@workspace/db";

const router: IRouter = Router();

async function getOrCreateSettings() {
  const rows = await db.select().from(siteSettingsTable).limit(1);
  if (rows.length > 0) return rows[0];
  const [row] = await db.insert(siteSettingsTable).values({}).returning();
  return row;
}

router.get("/settings", async (_req, res): Promise<void> => {
  const settings = await getOrCreateSettings();
  res.json(settings);
});

router.patch("/settings", async (req, res): Promise<void> => {
  const settings = await getOrCreateSettings();

  const body = req.body as Record<string, unknown>;
  const update: Record<string, unknown> = {};

  const textFields = ["phone1", "phone2", "email", "whatsapp", "address", "facebookUrl", "instagramUrl", "twitterUrl", "termsAndConditions", "privacyPolicy"];
  for (const key of textFields) {
    if (typeof body[key] === "string") update[key] = body[key];
  }
  if (typeof body.requireDeposit === "boolean") update.requireDeposit = body.requireDeposit;
  if (typeof body.depositPercentageValue === "number") update.depositPercentageValue = body.depositPercentageValue;

  if (Object.keys(update).length === 0) {
    res.status(400).json({ error: "لا توجد بيانات صالحة للتحديث" });
    return;
  }

  const [updated] = await db.update(siteSettingsTable)
    .set(update)
    .where(eq(siteSettingsTable.id, settings.id))
    .returning();

  res.json(updated);
});

export default router;
