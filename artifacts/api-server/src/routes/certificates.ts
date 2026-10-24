import { Router, type IRouter } from "express";
import { and, eq, desc, sql } from "drizzle-orm";
import { db, certificateTemplatesTable, certificateIssuesTable } from "@workspace/db";

const router: IRouter = Router();

function getSessionUser(req: any): { userId?: number; role?: string } {
  return {
    userId: req.session?.userId ?? req.user?.id ?? req.user?.userId,
    role: req.session?.role ?? req.user?.role,
  };
}

async function ensureAdmin(req: any): Promise<boolean> {
  const { role } = getSessionUser(req);
  return role === "admin" || role === "subadmin";
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "certificate";
}

async function generateSerialNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `AW-CERT-${year}-`;
  const result = (await db.execute(sql`
    SELECT COALESCE(MAX(CAST(REGEXP_REPLACE(serial_number, '^AW-CERT-[0-9]{4}-', '') AS INTEGER)), 0) + 1 AS count
    FROM certificate_issues
    WHERE serial_number LIKE ${`${prefix}%`}
  `)) as any;

  const row = Array.isArray(result?.rows) ? result.rows[0] : result?.[0] ?? null;
  const count = Number(row?.count ?? 1);
  return `${prefix}${String(count).padStart(6, "0")}`;
}

function buildValidationUrl(serialNumber: string): string {
  return `https://arkan-platform.onrender.com/certificate/verify?serial=${encodeURIComponent(serialNumber)}`;
}

router.get("/certificates/templates", async (req, res): Promise<void> => {
  if (!(await ensureAdmin(req))) {
    res.status(403).json({ error: "غير مصرح" });
    return;
  }

  const templates = await db.select().from(certificateTemplatesTable).orderBy(desc(certificateTemplatesTable.createdAt));
  res.json(templates);
});

router.post("/certificates/templates", async (req, res): Promise<void> => {
  if (!(await ensureAdmin(req))) {
    res.status(403).json({ error: "غير مصرح" });
    return;
  }

  const { userId } = getSessionUser(req);
  const body = req.body ?? {};

  const payload = {
    name: String(body.name || "قالب شهادة جديد"),
    description: body.description ? String(body.description) : null,
    orientation: ["landscape", "portrait"].includes(String(body.orientation || "landscape")) ? String(body.orientation) : "landscape",
    width: Number(body.width ?? 1200) || 1200,
    height: Number(body.height ?? 800) || 800,
    backgroundUrl: body.backgroundUrl ? String(body.backgroundUrl) : null,
    logoUrl: body.logoUrl ? String(body.logoUrl) : null,
    signatureUrl: body.signatureUrl ? String(body.signatureUrl) : null,
    partnerLogos: body.partnerLogos ? String(body.partnerLogos) : null,
    layoutConfig: body.layoutConfig && typeof body.layoutConfig === "object" ? body.layoutConfig : {},
    isActive: body.isActive !== false,
    createdBy: userId ?? null,
  };

  const [template] = await db.insert(certificateTemplatesTable).values(payload).returning();
  res.status(201).json(template);
});

router.patch("/certificates/templates/:id", async (req, res): Promise<void> => {
  if (!(await ensureAdmin(req))) {
    res.status(403).json({ error: "غير مصرح" });
    return;
  }

  const templateId = Number(req.params.id);
  const body = req.body ?? {};

  const update: Record<string, unknown> = {};
  if (typeof body.name === "string") update.name = body.name;
  if (typeof body.description === "string") update.description = body.description;
  if (body.orientation === "portrait" || body.orientation === "landscape") update.orientation = body.orientation;
  if (typeof body.width === "number") update.width = body.width;
  if (typeof body.height === "number") update.height = body.height;
  if (typeof body.backgroundUrl === "string") update.backgroundUrl = body.backgroundUrl;
  if (typeof body.logoUrl === "string") update.logoUrl = body.logoUrl;
  if (typeof body.signatureUrl === "string") update.signatureUrl = body.signatureUrl;
  if (typeof body.partnerLogos === "string") update.partnerLogos = body.partnerLogos;
  if (body.layoutConfig && typeof body.layoutConfig === "object") update.layoutConfig = body.layoutConfig;
  if (typeof body.isActive === "boolean") update.isActive = body.isActive;

  if (Object.keys(update).length === 0) {
    res.status(400).json({ error: "لا توجد بيانات صالحة للتحديث" });
    return;
  }

  const [updated] = await db.update(certificateTemplatesTable)
    .set({ ...update, updatedAt: new Date() })
    .where(eq(certificateTemplatesTable.id, templateId))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "القالب غير موجود" });
    return;
  }

  res.json(updated);
});

router.delete("/certificates/templates/:id", async (req, res): Promise<void> => {
  if (!(await ensureAdmin(req))) {
    res.status(403).json({ error: "غير مصرح" });
    return;
  }

  const templateId = Number(req.params.id);
  const [deleted] = await db.delete(certificateTemplatesTable).where(eq(certificateTemplatesTable.id, templateId)).returning();

  if (!deleted) {
    res.status(404).json({ error: "القالب غير موجود" });
    return;
  }

  res.json({ success: true, deletedId: templateId });
});

router.get("/certificates", async (req, res): Promise<void> => {
  if (!(await ensureAdmin(req))) {
    res.status(403).json({ error: "غير مصرح" });
    return;
  }

  const items = await db.select().from(certificateIssuesTable).orderBy(desc(certificateIssuesTable.createdAt));
  res.json(items);
});

router.get("/certificates/verify", async (req, res): Promise<void> => {
  const serial = String(req.query.serial || "").trim();
  const issue = await db.select().from(certificateIssuesTable).where(eq(certificateIssuesTable.serialNumber, serial)).limit(1);

  if (!issue[0]) {
    res.status(404).json({ valid: false, error: "الشهادة غير موجودة" });
    return;
  }

  res.json({ valid: true, certificate: issue[0] });
});

router.post("/certificates/issue", async (req, res): Promise<void> => {
  if (!(await ensureAdmin(req))) {
    res.status(403).json({ error: "غير مصرح" });
    return;
  }

  const body = req.body ?? {};
  const templateId = Number(body.templateId ?? 0);
  const template = await db.select().from(certificateTemplatesTable).where(eq(certificateTemplatesTable.id, templateId)).limit(1);

  if (!template[0]) {
    res.status(404).json({ error: "القالب غير موجود" });
    return;
  }

  const serialNumber = await generateSerialNumber();
  const validationUrl = buildValidationUrl(serialNumber);

  const issuePayload = {
    templateId,
    serialNumber,
    validationUrl,
    recipientName: String(body.recipientName || ""),
    recipientEmail: body.recipientEmail ? String(body.recipientEmail) : null,
    recipientPhone: body.recipientPhone ? String(body.recipientPhone) : null,
    programTitle: String(body.programTitle || ""),
    description: body.description ? String(body.description) : null,
    issuerName: String(body.issuerName || "Arkan Web"),
    signatureName: body.signatureName ? String(body.signatureName) : null,
    signatureTitle: body.signatureTitle ? String(body.signatureTitle) : null,
    status: body.status ? String(body.status) : "issued",
    metadata: body.metadata && typeof body.metadata === "object" ? body.metadata : {},
    qrCodeUrl: body.qrCodeUrl ? String(body.qrCodeUrl) : validationUrl,
  };

  const [issue] = await db.insert(certificateIssuesTable).values(issuePayload).returning();
  res.status(201).json(issue);
});

router.post("/certificates/bulk-issue", async (req, res): Promise<void> => {
  if (!(await ensureAdmin(req))) {
    res.status(403).json({ error: "غير مصرح" });
    return;
  }

  const body = req.body ?? {};
  const templateId = Number(body.templateId ?? 0);
  const recipients = Array.isArray(body.recipients) ? body.recipients : [];

  if (!templateId) {
    res.status(400).json({ error: "يجب تحديد قالب الشهادة" });
    return;
  }

  const templateExists = await db.select().from(certificateTemplatesTable).where(eq(certificateTemplatesTable.id, templateId)).limit(1);
  if (!templateExists[0]) {
    res.status(404).json({ error: "القالب غير موجود" });
    return;
  }

  const created: any[] = [];
  for (const recipient of recipients) {
    const serialNumber = await generateSerialNumber();
    const [issue] = await db.insert(certificateIssuesTable).values({
      templateId,
      serialNumber,
      validationUrl: buildValidationUrl(serialNumber),
      recipientName: String(recipient.recipientName || ""),
      recipientEmail: recipient.recipientEmail ? String(recipient.recipientEmail) : null,
      recipientPhone: recipient.recipientPhone ? String(recipient.recipientPhone) : null,
      programTitle: String(recipient.programTitle || ""),
      description: recipient.description ? String(recipient.description) : null,
      issuerName: String(recipient.issuerName || "Arkan Web"),
      signatureName: recipient.signatureName ? String(recipient.signatureName) : null,
      signatureTitle: recipient.signatureTitle ? String(recipient.signatureTitle) : null,
      status: recipient.status ? String(recipient.status) : "issued",
      metadata: recipient.metadata && typeof recipient.metadata === "object" ? recipient.metadata : {},
      qrCodeUrl: recipient.qrCodeUrl ? String(recipient.qrCodeUrl) : buildValidationUrl(serialNumber),
    }).returning();

    created.push(issue);
  }

  res.status(201).json({ count: created.length, certificates: created });
});

router.patch("/certificates/:id/cancel", async (req, res): Promise<void> => {
  if (!(await ensureAdmin(req))) {
    res.status(403).json({ error: "غير مصرح" });
    return;
  }

  const id = Number(req.params.id);
  const [updated] = await db.update(certificateIssuesTable)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(eq(certificateIssuesTable.id, id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "الشهادة غير موجودة" });
    return;
  }

  res.json(updated);
});

router.get("/certificates/:id", async (req, res): Promise<void> => {
  if (!(await ensureAdmin(req))) {
    res.status(403).json({ error: "غير مصرح" });
    return;
  }

  const id = Number(req.params.id);
  const item = await db.select().from(certificateIssuesTable).where(eq(certificateIssuesTable.id, id)).limit(1);
  res.json(item[0] ?? null);
});

router.delete("/certificates/:id", async (req, res): Promise<void> => {
  if (!(await ensureAdmin(req))) {
    res.status(403).json({ error: "غير مصرح" });
    return;
  }

  const id = Number(req.params.id);
  const [deleted] = await db.delete(certificateIssuesTable).where(eq(certificateIssuesTable.id, id)).returning();

  if (!deleted) {
    res.status(404).json({ error: "الشهادة غير موجودة" });
    return;
  }

  res.json({ success: true, deletedId: id });
});

export default router;
