import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, siteSettingsTable } from "@workspace/db";
import { hasAdminPermission } from "../lib/access-control";

const router: IRouter = Router();

async function getOrCreateSettings() {
  const rows = await db.select().from(siteSettingsTable).limit(1);
  if (rows.length > 0) return rows[0];
  const [row] = await db.insert(siteSettingsTable).values({}).returning();
  return row;
}

function toPublicSettings(settings: Awaited<ReturnType<typeof getOrCreateSettings>>, includeSmtpSettings = false) {
  return {
    id: settings.id,
    phone1: settings.phone1,
    phone2: settings.phone2,
    email: settings.email,
    whatsapp: settings.whatsapp,
    address: settings.address,
    facebookUrl: settings.facebookUrl,
    instagramUrl: settings.instagramUrl,
    twitterUrl: settings.twitterUrl,
    requireDeposit: settings.requireDeposit,
    depositPercentageValue: settings.depositPercentageValue,
    termsAndConditions: settings.termsAndConditions,
    privacyPolicy: settings.privacyPolicy,
    ...(includeSmtpSettings ? {
      emailUser: settings.emailUser,
      emailPassConfigured: Boolean(settings.emailPass),
    } : {}),
  };
}

router.get("/settings", async (req, res): Promise<void> => {
  const settings = await getOrCreateSettings();
  const isAdmin = await hasAdminPermission(req);
  res.json(toPublicSettings(settings, isAdmin));
});

router.patch("/settings", async (req, res): Promise<void> => {
  if (!(await hasAdminPermission(req, ["settings"]))) {
    res.status(403).json({ error: "غير مصرح" });
    return;
  }

  const isAdmin = await hasAdminPermission(req);
  const settings = await getOrCreateSettings();

  const body = req.body as Record<string, unknown>;
  const update: Record<string, unknown> = {};

  const textFields = ["phone1", "phone2", "email", "whatsapp", "address", "facebookUrl", "instagramUrl", "twitterUrl", "termsAndConditions", "privacyPolicy"];
  if (isAdmin) textFields.push("emailUser", "emailPass");
  for (const key of textFields) {
    if (typeof body[key] === "string" && (key !== "emailPass" || body[key])) update[key] = body[key];
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

  res.json(toPublicSettings(updated, isAdmin));
});

export default router;
