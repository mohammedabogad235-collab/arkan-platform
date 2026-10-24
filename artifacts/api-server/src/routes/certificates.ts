import { Router, type IRouter } from "express";
import { eq, desc, sql } from "drizzle-orm";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import JSZip from "jszip";
import { db, certificateTemplatesTable, certificateIssuesTable } from "@workspace/db";

const router: IRouter = Router();

const DEFAULT_LAYOUT = {
  logo: { x: 8, y: 8, width: 18, height: 12 },
  recipientName: { x: 22, y: 28, width: 56, height: 12 },
  programTitle: { x: 22, y: 41, width: 56, height: 8 },
  issuerName: { x: 14, y: 72, width: 28, height: 6 },
  signature: { x: 58, y: 57, width: 18, height: 12 },
  serialNumber: { x: 28, y: 80, width: 44, height: 6 },
  qrCode: { x: 78, y: 10, width: 12, height: 12 },
};

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

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function normalizeLayout(layout: any = {}): Record<string, { x: number; y: number; width: number; height: number }> {
  const merged = { ...DEFAULT_LAYOUT } as Record<string, any>;
  for (const key of Object.keys(DEFAULT_LAYOUT)) {
    const box = layout?.[key] ?? {};
    merged[key] = {
      x: Number(box.x ?? DEFAULT_LAYOUT[key as keyof typeof DEFAULT_LAYOUT].x),
      y: Number(box.y ?? DEFAULT_LAYOUT[key as keyof typeof DEFAULT_LAYOUT].y),
      width: Number(box.width ?? DEFAULT_LAYOUT[key as keyof typeof DEFAULT_LAYOUT].width),
      height: Number(box.height ?? DEFAULT_LAYOUT[key as keyof typeof DEFAULT_LAYOUT].height),
    };
  }
  return merged;
}

function getBox(layout: Record<string, any>, key: string, pageWidth: number, pageHeight: number) {
  const box = layout[key] ?? DEFAULT_LAYOUT[key as keyof typeof DEFAULT_LAYOUT];
  return {
    x: (Number(box.x ?? 0) / 100) * pageWidth,
    y: (Number(box.y ?? 0) / 100) * pageHeight,
    width: (Number(box.width ?? 0) / 100) * pageWidth,
    height: (Number(box.height ?? 0) / 100) * pageHeight,
  };
}

async function fetchImageBuffer(url?: string | null): Promise<Buffer | undefined> {
  if (!url) return undefined;
  try {
    const res = await fetch(url);
    if (!res.ok) return undefined;
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch {
    return undefined;
  }
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

export async function generateCertificatePdfBuffer(issue: any, template: any): Promise<Buffer> {
  const pageWidth = Number(template?.width ?? 1200);
  const pageHeight = Number(template?.height ?? 800);
  const orientation = String(template?.orientation || "landscape");
  const layout = normalizeLayout(template?.layoutConfig ?? {});
  const size = orientation === "portrait" ? [pageWidth, pageHeight] : [pageWidth, pageHeight];

  const doc = new PDFDocument({
    size: size as any,
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
    autoFirstPage: false,
  });

  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));

  const pageSize = doc.page.size as number[] | { width: number; height: number } | string;
  const width = Array.isArray(pageSize)
    ? Number(pageSize[0] || pageWidth)
    : Number((pageSize as { width?: number })?.width || pageWidth);
  const height = Array.isArray(pageSize)
    ? Number(pageSize[1] || pageHeight)
    : Number((pageSize as { height?: number })?.height || pageHeight);

  doc.addPage({ size: size as any, margins: { top: 0, bottom: 0, left: 0, right: 0 } });

  const backgroundImage = await fetchImageBuffer(template?.backgroundUrl ?? null);
  if (backgroundImage) {
    doc.image(backgroundImage, 0, 0, { width, height });
  } else {
    doc.fillColor("#f8fafc").rect(0, 0, width, height).fill();
    doc.strokeColor("#cbd5e1").lineWidth(4).rect(20, 20, width - 40, height - 40).stroke();
  }

  const logoImage = await fetchImageBuffer(template?.logoUrl ?? null);
  if (logoImage) {
    const logoBox = getBox(layout, "logo", width, height);
    doc.image(logoImage, logoBox.x, logoBox.y, { fit: [logoBox.width, logoBox.height], align: "center", valign: "center" });
  }

  const signatureImage = await fetchImageBuffer(template?.signatureUrl ?? null);
  if (signatureImage) {
    const signatureBox = getBox(layout, "signature", width, height);
    doc.image(signatureImage, signatureBox.x, signatureBox.y, { fit: [signatureBox.width, signatureBox.height], align: "center", valign: "center" });
  }

  const qrDataUrl = await QRCode.toDataURL(issue.validationUrl || issue.qrCodeUrl || "https://arkan-platform.onrender.com");
  const qrBuffer = Buffer.from(qrDataUrl.split(",")[1], "base64");
  const qrBox = getBox(layout, "qrCode", width, height);
  doc.image(qrBuffer, qrBox.x, qrBox.y, { fit: [qrBox.width, qrBox.height] });

  const recipientBox = getBox(layout, "recipientName", width, height);
  doc.fillColor("#0f172a").fontSize(28).font("Helvetica-Bold").text(String(issue.recipientName || "-"), recipientBox.x, recipientBox.y, { width: recipientBox.width, height: recipientBox.height, align: "center" });

  const programBox = getBox(layout, "programTitle", width, height);
  doc.fillColor("#334155").fontSize(18).font("Helvetica").text(String(issue.programTitle || "-"), programBox.x, programBox.y, { width: programBox.width, align: "center" });

  const serialBox = getBox(layout, "serialNumber", width, height);
  doc.fillColor("#1e293b").fontSize(16).font("Helvetica-Bold").text(`Serial: ${issue.serialNumber || "-"}`, serialBox.x, serialBox.y, { width: serialBox.width, align: "center" });

  const issuerBox = getBox(layout, "issuerName", width, height);
  doc.fillColor("#475569").fontSize(12).font("Helvetica").text(String(issue.issuerName || "Arkan Web"), issuerBox.x, issuerBox.y, { width: issuerBox.width, align: "left" });

  if (issue.status === "cancelled") {
    doc.save();
    doc.rotate(-35, { origin: [width / 2, height / 2] });
    doc.fillColor("#dc2626").fontSize(56).font("Helvetica-Bold").text("مُلغاة", width / 2 - 150, height / 2 - 80, { align: "center" });
    doc.restore();
  }

  doc.end();
  await new Promise<void>((resolve) => {
    doc.on("end", () => resolve());
  });

  return Buffer.concat(chunks);
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
    layoutConfig: body.layoutConfig && typeof body.layoutConfig === "object" ? body.layoutConfig : DEFAULT_LAYOUT,
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
  const [issue] = await db.select().from(certificateIssuesTable).where(eq(certificateIssuesTable.serialNumber, serial)).limit(1);

  if (!issue) {
    res.status(404).json({ valid: false, error: "الشهادة غير موجودة" });
    return;
  }

  if (issue.status === "cancelled") {
    res.status(410).json({ valid: false, cancelled: true, error: "تم إلغاء هذه الشهادة", certificate: issue });
    return;
  }

  res.json({ valid: true, certificate: issue });
});

router.post("/certificates/issue", async (req, res): Promise<void> => {
  if (!(await ensureAdmin(req))) {
    res.status(403).json({ error: "غير مصرح" });
    return;
  }

  const body = req.body ?? {};
  const templateId = Number(body.templateId ?? 0);
  const [template] = await db.select().from(certificateTemplatesTable).where(eq(certificateTemplatesTable.id, templateId)).limit(1);

  if (!template) {
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

  const [templateExists] = await db.select().from(certificateTemplatesTable).where(eq(certificateTemplatesTable.id, templateId)).limit(1);
  if (!templateExists) {
    res.status(404).json({ error: "القالب غير موجود" });
    return;
  }

  const created: any[] = [];
  for (const recipient of recipients) {
    const serialNumber = await generateSerialNumber();
    const validationUrl = buildValidationUrl(serialNumber);
    const [issue] = await db.insert(certificateIssuesTable).values({
      templateId,
      serialNumber,
      validationUrl,
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
      qrCodeUrl: recipient.qrCodeUrl ? String(recipient.qrCodeUrl) : validationUrl,
    }).returning();

    created.push(issue);
  }

  res.status(201).json({ count: created.length, certificates: created });
});

router.get("/certificates/export-zip", async (req, res): Promise<void> => {
  if (!(await ensureAdmin(req))) {
    res.status(403).json({ error: "غير مصرح" });
    return;
  }

  const idsParam = String(req.query.ids || "");
  const ids = idsParam
    .split(",")
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isFinite(value));

  const items = ids.length > 0
    ? await db.select().from(certificateIssuesTable).where(sql`${certificateIssuesTable.id} IN (${ids})`)
    : await db.select().from(certificateIssuesTable).orderBy(desc(certificateIssuesTable.createdAt));

  const zip = new JSZip();

  for (const issue of items) {
    const [template] = await db.select().from(certificateTemplatesTable).where(eq(certificateTemplatesTable.id, issue.templateId)).limit(1);
    const pdfBuffer = await generateCertificatePdfBuffer(issue, template ?? {
      width: 1200,
      height: 800,
      orientation: "landscape",
      backgroundUrl: null,
      logoUrl: null,
      signatureUrl: null,
      layoutConfig: DEFAULT_LAYOUT,
    });
    zip.file(`${issue.serialNumber || `certificate-${issue.id}`}.pdf`, pdfBuffer);
  }

  const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="certificates-${Date.now()}.zip"`);
  res.end(zipBuffer);
});

router.get("/certificates/:id/export", async (req, res): Promise<void> => {
  if (!(await ensureAdmin(req))) {
    res.status(403).json({ error: "غير مصرح" });
    return;
  }

  const id = Number(req.params.id);
  const [issue] = await db.select().from(certificateIssuesTable).where(eq(certificateIssuesTable.id, id)).limit(1);
  if (!issue) {
    res.status(404).json({ error: "الشهادة غير موجودة" });
    return;
  }

  const [template] = await db.select().from(certificateTemplatesTable).where(eq(certificateTemplatesTable.id, issue.templateId)).limit(1);
  const pdfBuffer = await generateCertificatePdfBuffer(issue, template ?? {
    width: 1200,
    height: 800,
    orientation: "landscape",
    backgroundUrl: null,
    logoUrl: null,
    signatureUrl: null,
    layoutConfig: DEFAULT_LAYOUT,
  });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${slugify(issue.recipientName || "certificate")}-${issue.serialNumber}.pdf"`);
  res.end(pdfBuffer);
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
  const [item] = await db.select().from(certificateIssuesTable).where(eq(certificateIssuesTable.id, id)).limit(1);
  res.json(item ?? null);
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
