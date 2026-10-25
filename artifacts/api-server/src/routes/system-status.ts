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

function normalizeText(raw: unknown, { allowNull }: { allowNull: boolean }): string | null | undefined {
  if (raw === null) return allowNull ? null : undefined;
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return allowNull ? null : "";
  return trimmed;
}

function normalizeBoolean(raw: unknown): boolean | undefined {
  return typeof raw === "boolean" ? raw : undefined;
}

// GET /system-status (Public)
router.get("/system-status", async (_req, res): Promise<void> => {
  const settings = await getOrCreateSettings();

  res.json({
    webMaintenanceMode: (settings as any).webMaintenanceMode ?? false,
    webMaintenanceMessage: (settings as any).webMaintenanceMessage ?? "",
    webMaintenanceEndTime: (settings as any).webMaintenanceEndTime ?? null,
    webShowAppAlternative: (settings as any).webShowAppAlternative ?? false,

    appMaintenanceMode: (settings as any).appMaintenanceMode ?? false,
    appUpdateRequired: (settings as any).appUpdateRequired ?? false,
    requiredAppVersion: (settings as any).requiredAppVersion ?? "0.0.0",
    appStatusMessage: (settings as any).appStatusMessage ?? "",
    appMaintenanceEndTime: (settings as any).appMaintenanceEndTime ?? null,
    appShowWebAlternative: (settings as any).appShowWebAlternative ?? false,
    appUpdateLink: (settings as any).appUpdateLink ?? "",
  });
});

// POST /system-status (Admin only)
router.post("/system-status", async (req, res): Promise<void> => {
  if (!(await hasAdminPermission(req))) {
    res.status(403).json({ error: "غير مصرح" });
    return;
  }

  const settings = await getOrCreateSettings();
  const body = req.body as Record<string, unknown>;

  const update: Record<string, unknown> = {};

  const webMaintenanceMode = normalizeBoolean(body.webMaintenanceMode);
  const webShowAppAlternative = normalizeBoolean(body.webShowAppAlternative);
  const appMaintenanceMode = normalizeBoolean(body.appMaintenanceMode);
  const appUpdateRequired = normalizeBoolean(body.appUpdateRequired);
  const appShowWebAlternative = normalizeBoolean(body.appShowWebAlternative);

  const webMaintenanceMessage = normalizeText(body.webMaintenanceMessage, { allowNull: false });
  const webMaintenanceEndTime = normalizeText(body.webMaintenanceEndTime, { allowNull: true });
  const appStatusMessage = normalizeText(body.appStatusMessage, { allowNull: false });
  const appMaintenanceEndTime = normalizeText(body.appMaintenanceEndTime, { allowNull: true });
  const appUpdateLink = normalizeText(body.appUpdateLink, { allowNull: false });
  const requiredAppVersion = normalizeText(body.requiredAppVersion, { allowNull: false });

  if (webMaintenanceMode !== undefined) update.webMaintenanceMode = webMaintenanceMode;
  if (webShowAppAlternative !== undefined) update.webShowAppAlternative = webShowAppAlternative;
  if (appMaintenanceMode !== undefined) update.appMaintenanceMode = appMaintenanceMode;
  if (appUpdateRequired !== undefined) update.appUpdateRequired = appUpdateRequired;
  if (appShowWebAlternative !== undefined) update.appShowWebAlternative = appShowWebAlternative;

  if (webMaintenanceMessage !== undefined) update.webMaintenanceMessage = webMaintenanceMessage;
  if (webMaintenanceEndTime !== undefined) update.webMaintenanceEndTime = webMaintenanceEndTime;
  if (appStatusMessage !== undefined) update.appStatusMessage = appStatusMessage;
  if (appMaintenanceEndTime !== undefined) update.appMaintenanceEndTime = appMaintenanceEndTime;
  if (appUpdateLink !== undefined) update.appUpdateLink = appUpdateLink;
  if (requiredAppVersion !== undefined) update.requiredAppVersion = requiredAppVersion;

  if (Object.keys(update).length === 0) {
    res.status(400).json({ error: "لا توجد بيانات صالحة للتحديث" });
    return;
  }

  const [updated] = await db
    .update(siteSettingsTable)
    .set(update)
    .where(eq(siteSettingsTable.id, settings.id))
    .returning();

  res.json(updated);
});

export default router;
