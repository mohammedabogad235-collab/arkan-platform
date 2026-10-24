import { Router, type IRouter } from "express";
import { eq, desc, inArray, sql } from "drizzle-orm";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import JSZip from "jszip";
import { db, certificateTemplatesTable, certificateIssuesTable, certificatePartnersTable, usersTable } from "@workspace/db";

const router: IRouter = Router();

const DEFAULT_LAYOUT = {
  logo: { x: 8, y: 8, width: 18, height: 12 },
  recipientName: { x: 22, y: 28, width: 56, height: 12 },
  programTitle: { x: 22, y: 41, width: 56, height: 8 },
  issuerName: { x: 14, y: 72, width: 28, height: 6 },
  signature: { x: 58, y: 57, width: 18, height: 12 },
  serialNumber: { x: 28, y: 80, width: 44, height: 6 },
  issueDate: { x: 28, y: 88, width: 44, height: 5 },
  qrCode: { x: 78, y: 10, width: 12, height: 12 },
};

function getSessionUser(req: any): { userId?: number; role?: string } {
  return {
    userId: req.session?.userId ?? req.user?.id ?? req.user?.userId,
    role: req.session?.role ?? req.user?.role,
  };
}

async function ensureAdmin(req: any): Promise<boolean> {
  const { userId } = getSessionUser(req);
  if (!userId) return false;
  const [user] = await db.select({
    role: usersTable.role,
    permissions: usersTable.permissions,
    isActive: usersTable.isActive,
  }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user?.isActive) return false;
  if (user.role === "admin") return true;
  if (user.role !== "subadmin" || !user.permissions) return false;
  try {
    const permissions: unknown = JSON.parse(user.permissions);
    return Array.isArray(permissions) &&
      (permissions.includes("certificate-studio") || permissions.includes("certificates"));
  } catch {
    return false;
  }
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

function normalizePosition(box: any, fallback: { x: number; y: number; width: number; height: number }) {
  const finite = (value: unknown, defaultValue: number) => {
    const number = Number(value);
    return Number.isFinite(number) ? number : defaultValue;
  };
  const x = clamp(finite(box?.x, fallback.x), 0, 99);
  const y = clamp(finite(box?.y, fallback.y), 0, 99);
  return {
    x,
    y,
    width: clamp(finite(box?.width, fallback.width), 1, 100 - x),
    height: clamp(finite(box?.height, fallback.height), 1, 100 - y),
    ...(box?.align === "left" || box?.align === "right" || box?.align === "center" ? { align: box.align } : {}),
  };
}

function normalizeLayout(layout: any = {}): Record<string, { x: number; y: number; width: number; height: number }> {
  const merged = { ...DEFAULT_LAYOUT, ...(layout && typeof layout === "object" ? layout : {}) } as Record<string, any>;
  for (const key of Object.keys(DEFAULT_LAYOUT)) {
    merged[key] = normalizePosition(layout?.[key], DEFAULT_LAYOUT[key as keyof typeof DEFAULT_LAYOUT]);
  }
  return merged;
}

function getBox(layout: Record<string, any>, key: string, pageWidth: number, pageHeight: number) {
  const fallback = DEFAULT_LAYOUT[key as keyof typeof DEFAULT_LAYOUT] ?? { x: 0, y: 0, width: 1, height: 1 };
  const box = normalizePosition(layout[key], fallback);
  return {
    x: (Number(box.x ?? 0) / 100) * pageWidth,
    y: (Number(box.y ?? 0) / 100) * pageHeight,
    width: (Number(box.width ?? 0) / 100) * pageWidth,
    height: (Number(box.height ?? 0) / 100) * pageHeight,
  };
}

function getTextAlignment(layout: Record<string, any>, key: string): "left" | "center" | "right" {
  const align = layout[key]?.align;
  return align === "left" || align === "right" || align === "center" ? align : key === "issuerName" ? "left" : "center";
}

async function fetchImageBuffer(url?: string | null): Promise<Buffer | undefined> {
  if (!url) return undefined;
  const parsed = new URL(url);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("رابط الصورة يجب أن يبدأ بـ http أو https");
  }
  const res = await fetch(parsed, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`تعذر تحميل صورة الشهادة (${res.status})`);
  const contentLength = Number(res.headers.get("content-length") || 0);
  if (contentLength > 10 * 1024 * 1024) throw new Error("حجم صورة الشهادة يتجاوز 10 ميجابايت");
  const arrayBuffer = await res.arrayBuffer();
  if (arrayBuffer.byteLength > 10 * 1024 * 1024) throw new Error("حجم صورة الشهادة يتجاوز 10 ميجابايت");
  return Buffer.from(arrayBuffer);
}

async function generateSerialNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `AW-CERT-${year}-`;
  const result = (await db.execute(sql`
    SELECT nextval('certificate_issue_serial_seq') AS count
  `)) as any;

  const row = Array.isArray(result?.rows) ? result.rows[0] : result?.[0] ?? null;
  const count = Number(row?.count ?? 1);
  return `${prefix}${String(count).padStart(6, "0")}`;
}

function buildValidationUrl(serialNumber: string): string {
  return `https://arkan-platform.onrender.com/certificate/verify?serial=${encodeURIComponent(serialNumber)}`;
}

async function getIssuePartners(issue: any): Promise<any[]> {
  if (Array.isArray(issue?.metadata?.partnerSnapshots)) return issue.metadata.partnerSnapshots;
  const ids = issue?.metadata?.partnerIds;
  if (!Array.isArray(ids) || ids.length === 0) return [];
  const partnerIds = [...new Set(ids.map(Number).filter((id: number) => Number.isInteger(id) && id > 0))];
  if (partnerIds.length === 0) return [];
  return db.select().from(certificatePartnersTable)
    .where(inArray(certificatePartnersTable.id, partnerIds))
    .orderBy(certificatePartnersTable.sortOrder, certificatePartnersTable.id);
}

async function getPartnerSnapshots(value: unknown): Promise<{ ids: number[]; snapshots: any[] }> {
  const ids = Array.isArray(value)
    ? [...new Set(value.map(Number).filter((id: number) => Number.isInteger(id) && id > 0))]
    : [];
  if (ids.length === 0) return { ids, snapshots: [] };
  const snapshots = await db.select().from(certificatePartnersTable)
    .where(inArray(certificatePartnersTable.id, ids))
    .orderBy(certificatePartnersTable.sortOrder, certificatePartnersTable.id);
  if (snapshots.length !== ids.length) throw new Error("تم حذف مؤسسة محددة؛ حدّث قائمة المؤسسات ثم أعد الحفظ");
  return { ids, snapshots };
}

function normalizeSignatures(value: unknown): Array<{ name: string; title: string; role: string; signatureUrl: string; style: string; fontSize: number }> {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 8).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const signature = item as Record<string, unknown>;
    const name = typeof signature.name === "string" ? signature.name.trim().slice(0, 120) : "";
    if (!name) return [];
    return [{
      name,
      title: typeof signature.title === "string" ? signature.title.trim().slice(0, 120) : "",
      role: typeof signature.role === "string" ? signature.role.trim().slice(0, 120) : "",
      signatureUrl: typeof signature.signatureUrl === "string" ? signature.signatureUrl.slice(0, 2048) : "",
      style: signature.style === "bold" || signature.style === "classic" ? signature.style : "script",
      fontSize: clamp(Number(signature.fontSize) || 18, 8, 96),
    }];
  });
}

export async function generateCertificatePdfBuffer(issue: any, template: any, partners: any[] = []): Promise<Buffer> {
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

  const qrDataUrl = await QRCode.toDataURL(issue.validationUrl || issue.qrCodeUrl || "https://arkan-platform.onrender.com", { width: 320, margin: 1 });
  const qrBuffer = Buffer.from(qrDataUrl.split(",")[1], "base64");
  const qrBox = getBox(layout, "qrCode", width, height);
  doc.image(qrBuffer, qrBox.x, qrBox.y, { fit: [qrBox.width, qrBox.height] });

  const recipientBox = getBox(layout, "recipientName", width, height);
  doc.fillColor("#0f172a").fontSize(28).font("Helvetica-Bold").text(String(issue.recipientName || "-"), recipientBox.x, recipientBox.y, { width: recipientBox.width, height: recipientBox.height, align: getTextAlignment(layout, "recipientName") });

  const programBox = getBox(layout, "programTitle", width, height);
  doc.fillColor("#334155").fontSize(18).font("Helvetica").text(String(issue.programTitle || "-"), programBox.x, programBox.y, { width: programBox.width, align: getTextAlignment(layout, "programTitle") });

  const serialBox = getBox(layout, "serialNumber", width, height);
  doc.fillColor("#1e293b").fontSize(16).font("Helvetica-Bold").text(`Certificate No: ${issue.serialNumber || "-"}`, serialBox.x, serialBox.y, { width: serialBox.width, align: getTextAlignment(layout, "serialNumber") });

  const issueDateBox = getBox(layout, "issueDate", width, height);
  const issueDate = issue.issueDate ? new Date(issue.issueDate) : new Date();
  doc.fillColor("#475569").fontSize(10).font("Helvetica").text(
    `Issue date: ${Number.isNaN(issueDate.getTime()) ? "-" : issueDate.toISOString().slice(0, 10)}`,
    issueDateBox.x,
    issueDateBox.y,
    { width: issueDateBox.width, align: getTextAlignment(layout, "issueDate") },
  );

  const issuerBox = getBox(layout, "issuerName", width, height);
  doc.fillColor("#475569").fontSize(12).font("Helvetica").text(String(issue.issuerName || "Arkan Web"), issuerBox.x, issuerBox.y, { width: issuerBox.width, align: getTextAlignment(layout, "issuerName") });

  const metadata = issue.metadata && typeof issue.metadata === "object" ? issue.metadata : {};
  const signatures = normalizeSignatures(metadata.signatures);
  if (signatures.length === 0 && issue.signatureName) {
    signatures.push({
      name: String(issue.signatureName),
      title: String(issue.signatureTitle || ""),
      role: "",
      signatureUrl: "",
      style: "script",
      fontSize: 18,
    });
  }
  for (let index = 0; index < signatures.length; index += 1) {
    const signature = signatures[index];
    const boxes = Array.isArray(layout.signatureBoxes) ? layout.signatureBoxes : [];
    const defaultWidth = 70 / Math.max(signatures.length, 1);
    const signatureBox = normalizePosition(boxes[index], {
      x: 15 + index * defaultWidth,
      y: 63,
      width: Math.min(defaultWidth, 24),
      height: 15,
    });
    const position = {
      x: (Number(signatureBox.x) / 100) * width,
      y: (Number(signatureBox.y) / 100) * height,
      width: (Number(signatureBox.width) / 100) * width,
      height: (Number(signatureBox.height) / 100) * height,
    };
    const imageUrl = signature?.signatureUrl ? String(signature.signatureUrl) : "";
    if (imageUrl) {
      const image = await fetchImageBuffer(imageUrl);
      if (image) doc.image(image, position.x, position.y, { fit: [position.width, position.height * 0.5] });
    }
    const signerFont = signature.style === "bold" ? "Times-Bold" : signature.style === "classic" ? "Times-Roman" : "Times-Italic";
    doc.fillColor("#334155").font(signerFont).fontSize(Number(signature.fontSize) || 18).text(
      String(signature?.name || ""),
      position.x,
      position.y + position.height * 0.55,
      { width: position.width, align: "center", height: position.height * 0.4 },
    );
    doc.font("Helvetica").fontSize(9).text(
      [signature?.title, signature?.role].filter(Boolean).join(" · "),
      position.x,
      position.y + position.height * 0.82,
      { width: position.width, align: "center", height: position.height * 0.18 },
    );
  }

  for (let index = 0; index < partners.length; index += 1) {
    const partner = partners[index];
    const logoBoxes: Record<string, any> = layout.partnerLogoBoxes && typeof layout.partnerLogoBoxes === "object" ? layout.partnerLogoBoxes : {};
    const signatureBoxesByPartner: Record<string, any> = layout.partnerSignatureBoxes && typeof layout.partnerSignatureBoxes === "object" ? layout.partnerSignatureBoxes : {};
    const legacyBoxes: Record<string, any> = layout.partnerBoxes && typeof layout.partnerBoxes === "object" ? layout.partnerBoxes : {};
    const defaultWidth = 70 / Math.max(partners.length, 1);
    const logoBox = normalizePosition(logoBoxes[String(partner.id)] ?? legacyBoxes[String(partner.id)], {
      x: 15 + index * defaultWidth,
      y: 5,
      width: Math.min(defaultWidth, 20),
      height: 14,
    });
    const signatureBox = normalizePosition(signatureBoxesByPartner[String(partner.id)], {
      x: logoBox.x,
      y: 68,
      width: logoBox.width,
      height: 20,
    });
    const logoPosition = {
      x: (logoBox.x / 100) * width,
      y: (logoBox.y / 100) * height,
      width: (logoBox.width / 100) * width,
      height: (logoBox.height / 100) * height,
    };
    const signaturePosition = {
      x: (signatureBox.x / 100) * width,
      y: (signatureBox.y / 100) * height,
      width: (signatureBox.width / 100) * width,
      height: (signatureBox.height / 100) * height,
    };
    const logo = await fetchImageBuffer(partner.logoUrl);
    if (logo) doc.image(logo, logoPosition.x, logoPosition.y, { fit: [logoPosition.width, logoPosition.height] });
    const signature = await fetchImageBuffer(partner.signatureUrl);
    if (signature) {
      doc.image(signature, signaturePosition.x, signaturePosition.y, { fit: [signaturePosition.width, signaturePosition.height * 0.4] });
    }
    doc.font("Helvetica").fontSize(8).text(
      String(partner.name || ""),
      signaturePosition.x,
      signaturePosition.y + signaturePosition.height * 0.42,
      { width: signaturePosition.width, align: "center" },
    );
    if (partner.signatureName) {
      doc.fillColor("#334155").font("Times-Italic").fontSize(12).text(
        String(partner.signatureName),
        signaturePosition.x,
        signaturePosition.y + signaturePosition.height * 0.62,
        { width: signaturePosition.width, align: "center" },
      );
      doc.font("Helvetica").fontSize(8).text(
        String(partner.signatureTitle || ""),
        signaturePosition.x,
        signaturePosition.y + signaturePosition.height * 0.84,
        { width: signaturePosition.width, align: "center" },
      );
    }
  }

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
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    res.status(400).json({ error: "اسم القالب مطلوب" });
    return;
  }

  const payload = {
    name,
    description: body.description ? String(body.description) : null,
    orientation: ["landscape", "portrait"].includes(String(body.orientation || "landscape")) ? String(body.orientation) : "landscape",
    width: clamp(Number(body.width) || 1200, 300, 5000),
    height: clamp(Number(body.height) || 800, 300, 5000),
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
  if (typeof body.name === "string" && body.name.trim()) update.name = body.name.trim();
  if (typeof body.description === "string") update.description = body.description;
  if (body.orientation === "portrait" || body.orientation === "landscape") update.orientation = body.orientation;
  if (typeof body.width === "number" && Number.isFinite(body.width)) update.width = clamp(body.width, 300, 5000);
  if (typeof body.height === "number" && Number.isFinite(body.height)) update.height = clamp(body.height, 300, 5000);
  if (typeof body.backgroundUrl === "string") update.backgroundUrl = body.backgroundUrl;
  if (typeof body.logoUrl === "string") update.logoUrl = body.logoUrl;
  if (typeof body.signatureUrl === "string") update.signatureUrl = body.signatureUrl;
  if (typeof body.partnerLogos === "string") update.partnerLogos = body.partnerLogos;
  if (body.layoutConfig && typeof body.layoutConfig === "object" && !Array.isArray(body.layoutConfig)) update.layoutConfig = body.layoutConfig;
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
  const [existingIssue] = await db.select({ id: certificateIssuesTable.id })
    .from(certificateIssuesTable)
    .where(eq(certificateIssuesTable.templateId, templateId))
    .limit(1);
  if (existingIssue) {
    res.status(409).json({ error: "لا يمكن حذف قالب مرتبط بشهادات صادرة" });
    return;
  }
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

router.get("/certificates/partners", async (req, res): Promise<void> => {
  if (!(await ensureAdmin(req))) {
    res.status(403).json({ error: "غير مصرح" });
    return;
  }
  const partners = await db.select().from(certificatePartnersTable).orderBy(certificatePartnersTable.sortOrder, certificatePartnersTable.id);
  res.json(partners);
});

router.post("/certificates/partners", async (req, res): Promise<void> => {
  if (!(await ensureAdmin(req))) {
    res.status(403).json({ error: "غير مصرح" });
    return;
  }
  const body = req.body ?? {};
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    res.status(400).json({ error: "اسم المؤسسة مطلوب" });
    return;
  }
  const [partner] = await db.insert(certificatePartnersTable).values({
    name,
    logoUrl: typeof body.logoUrl === "string" ? body.logoUrl : null,
    signatureUrl: typeof body.signatureUrl === "string" ? body.signatureUrl : null,
    signatureName: typeof body.signatureName === "string" ? body.signatureName : null,
    signatureTitle: typeof body.signatureTitle === "string" ? body.signatureTitle : null,
    sortOrder: Number.isFinite(Number(body.sortOrder)) ? Number(body.sortOrder) : 0,
  }).returning();
  res.status(201).json(partner);
});

router.patch("/certificates/partners/:id", async (req, res): Promise<void> => {
  if (!(await ensureAdmin(req))) {
    res.status(403).json({ error: "غير مصرح" });
    return;
  }
  const id = Number(req.params.id);
  const body = req.body ?? {};
  const update: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof body.name === "string" && body.name.trim()) update.name = body.name.trim();
  if (typeof body.logoUrl === "string" || body.logoUrl === null) update.logoUrl = body.logoUrl;
  if (typeof body.signatureUrl === "string" || body.signatureUrl === null) update.signatureUrl = body.signatureUrl;
  if (typeof body.signatureName === "string" || body.signatureName === null) update.signatureName = body.signatureName;
  if (typeof body.signatureTitle === "string" || body.signatureTitle === null) update.signatureTitle = body.signatureTitle;
  if (Number.isFinite(Number(body.sortOrder))) update.sortOrder = Number(body.sortOrder);
  const [partner] = await db.update(certificatePartnersTable).set(update)
    .where(eq(certificatePartnersTable.id, id)).returning();
  if (!partner) {
    res.status(404).json({ error: "المؤسسة غير موجودة" });
    return;
  }
  res.json(partner);
});

router.delete("/certificates/partners/:id", async (req, res): Promise<void> => {
  if (!(await ensureAdmin(req))) {
    res.status(403).json({ error: "غير مصرح" });
    return;
  }
  const id = Number(req.params.id);
  const [deleted] = await db.delete(certificatePartnersTable).where(eq(certificatePartnersTable.id, id)).returning();
  if (!deleted) {
    res.status(404).json({ error: "المؤسسة غير موجودة" });
    return;
  }
  res.json({ success: true, deletedId: id });
});

router.get("/certificates/verify", async (req, res): Promise<void> => {
  const serial = String(req.query.serial || "").trim();
  const [issue] = await db.select().from(certificateIssuesTable).where(eq(certificateIssuesTable.serialNumber, serial)).limit(1);

  if (!issue) {
    res.status(404).json({ valid: false, error: "الشهادة غير موجودة" });
    return;
  }

  if (issue.status !== "issued") {
    res.status(410).json({ valid: false, cancelled: true, status: "cancelled", error: "تم إلغاء هذه الشهادة" });
    return;
  }

  res.json({
    valid: true,
    certificate: {
      serialNumber: issue.serialNumber,
      recipientName: issue.recipientName,
      programTitle: issue.programTitle,
      issuerName: issue.issuerName,
      issueDate: issue.issueDate,
      status: "issued",
    },
  });
});

router.get("/certificates/qr", async (req, res): Promise<void> => {
  const serial = String(req.query.serial || "").trim();
  if (!/^AW-CERT-\d{4}-\d{6}$/.test(serial)) {
    res.status(400).json({ error: "رقم الشهادة غير صالح" });
    return;
  }
  const image = await QRCode.toBuffer(buildValidationUrl(serial), { type: "png", width: 320, margin: 1 });
  res.setHeader("Content-Type", "image/png");
  res.setHeader("Cache-Control", "no-store");
  res.end(image);
});

router.post("/certificates/preview", async (req, res): Promise<void> => {
  if (!(await ensureAdmin(req))) {
    res.status(403).json({ error: "غير مصرح" });
    return;
  }
  const body = req.body ?? {};
  const templateId = Number(body.templateId);
  const [template] = await db.select().from(certificateTemplatesTable)
    .where(eq(certificateTemplatesTable.id, templateId)).limit(1);
  if (!template) {
    res.status(404).json({ error: "القالب غير موجود" });
    return;
  }
  let selectedPartners: { ids: number[]; snapshots: any[] };
  try {
    selectedPartners = await getPartnerSnapshots(body.partnerIds ?? body.metadata?.partnerIds);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "تعذر التحقق من المؤسسات المختارة" });
    return;
  }
  const serialNumber = typeof body.serialNumber === "string" ? body.serialNumber : "AW-CERT-0000-000000";
  const validationUrl = buildValidationUrl(serialNumber);
  const issue = {
    serialNumber,
    validationUrl,
    recipientName: typeof body.recipientName === "string" && body.recipientName.trim() ? body.recipientName.trim() : "اسم صاحب الشهادة",
    programTitle: typeof body.programTitle === "string" && body.programTitle.trim() ? body.programTitle.trim() : "اسم الشهادة",
    issuerName: typeof body.issuerName === "string" && body.issuerName.trim() ? body.issuerName.trim() : "Arkan Web",
    status: "issued",
    signatureName: null,
    signatureTitle: null,
    metadata: {
      signatures: normalizeSignatures(body.signatures ?? body.metadata?.signatures),
      partnerIds: selectedPartners.ids,
      partnerSnapshots: selectedPartners.snapshots,
    },
  };
  const pdfBuffer = await generateCertificatePdfBuffer(
    issue,
    { ...template, ...(body.layoutConfig ? { layoutConfig: body.layoutConfig } : {}) },
    selectedPartners.snapshots,
  );
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", "inline; filename=\"certificate-preview.pdf\"");
  res.end(pdfBuffer);
});

router.post("/certificates/issue", async (req, res): Promise<void> => {
  if (!(await ensureAdmin(req))) {
    res.status(403).json({ error: "غير مصرح" });
    return;
  }

  const body = req.body ?? {};
  const templateId = Number(body.templateId ?? 0);
  const recipientName = typeof body.recipientName === "string" ? body.recipientName.trim() : "";
  const programTitle = typeof body.programTitle === "string" ? body.programTitle.trim() : "";
  if (!recipientName || !programTitle) {
    res.status(400).json({ error: "اسم المستفيد واسم الشهادة مطلوبان" });
    return;
  }
  const [template] = await db.select().from(certificateTemplatesTable).where(eq(certificateTemplatesTable.id, templateId)).limit(1);

  if (!template) {
    res.status(404).json({ error: "القالب غير موجود" });
    return;
  }

  const serialNumber = await generateSerialNumber();
  const validationUrl = buildValidationUrl(serialNumber);
  let selectedPartners: { ids: number[]; snapshots: any[] };
  try {
    selectedPartners = await getPartnerSnapshots(body.partnerIds ?? body.metadata?.partnerIds);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "تعذر التحقق من المؤسسات المختارة" });
    return;
  }

  const issuePayload = {
    templateId,
    serialNumber,
    validationUrl,
    recipientName,
    recipientEmail: body.recipientEmail ? String(body.recipientEmail) : null,
    recipientPhone: body.recipientPhone ? String(body.recipientPhone) : null,
    programTitle,
    description: body.description ? String(body.description) : null,
    issuerName: String(body.issuerName || "Arkan Web"),
    signatureName: body.signatureName ? String(body.signatureName) : null,
    signatureTitle: body.signatureTitle ? String(body.signatureTitle) : null,
    status: "issued",
    metadata: {
      signatures: normalizeSignatures(body.signatures ?? body.metadata?.signatures),
      partnerIds: selectedPartners.ids,
      partnerSnapshots: selectedPartners.snapshots,
    },
    qrCodeUrl: validationUrl,
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
      qrCodeUrl: validationUrl,
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
    const partners = await getIssuePartners(issue);
    const pdfBuffer = await generateCertificatePdfBuffer(issue, template ?? {
      width: 1200,
      height: 800,
      orientation: "landscape",
      backgroundUrl: null,
      logoUrl: null,
      signatureUrl: null,
      layoutConfig: DEFAULT_LAYOUT,
    }, partners);
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
  const partners = await getIssuePartners(issue);
  const pdfBuffer = await generateCertificatePdfBuffer(issue, template ?? {
    width: 1200,
    height: 800,
    orientation: "landscape",
    backgroundUrl: null,
    logoUrl: null,
    signatureUrl: null,
    layoutConfig: DEFAULT_LAYOUT,
  }, partners);

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${slugify(issue.recipientName || "certificate")}-${issue.serialNumber}.pdf"`);
  res.end(pdfBuffer);
});

router.get("/certificates/:id/preview", async (req, res): Promise<void> => {
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
  }, await getIssuePartners(issue));
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${slugify(issue.recipientName || "certificate")}-${issue.serialNumber}.pdf"`);
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

router.patch("/certificates/:id", async (req, res): Promise<void> => {
  if (!(await ensureAdmin(req))) {
    res.status(403).json({ error: "غير مصرح" });
    return;
  }
  const id = Number(req.params.id);
  const body = req.body ?? {};
  const update: Record<string, unknown> = { updatedAt: new Date() };
  if (Number.isInteger(Number(body.templateId)) && Number(body.templateId) > 0) {
    const [template] = await db.select({ id: certificateTemplatesTable.id })
      .from(certificateTemplatesTable)
      .where(eq(certificateTemplatesTable.id, Number(body.templateId)))
      .limit(1);
    if (!template) {
      res.status(404).json({ error: "القالب غير موجود" });
      return;
    }
    update.templateId = Number(body.templateId);
  }
  if (typeof body.recipientName === "string" && body.recipientName.trim()) update.recipientName = body.recipientName.trim();
  if (typeof body.programTitle === "string" && body.programTitle.trim()) update.programTitle = body.programTitle.trim();
  if (typeof body.issuerName === "string" && body.issuerName.trim()) update.issuerName = body.issuerName.trim();
  if (typeof body.recipientEmail === "string" || body.recipientEmail === null) update.recipientEmail = body.recipientEmail;
  if (typeof body.recipientPhone === "string" || body.recipientPhone === null) update.recipientPhone = body.recipientPhone;
  if (typeof body.description === "string" || body.description === null) update.description = body.description;
  if (body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)) {
    const metadata = body.metadata as Record<string, unknown>;
    let selectedPartners: { ids: number[]; snapshots: any[] };
    try {
      selectedPartners = await getPartnerSnapshots(metadata.partnerIds);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "تعذر التحقق من المؤسسات المختارة" });
      return;
    }
    update.metadata = {
      signatures: normalizeSignatures(metadata.signatures),
      partnerIds: selectedPartners.ids,
      partnerSnapshots: selectedPartners.snapshots,
    };
  }
  const [updated] = await db.update(certificateIssuesTable).set(update)
    .where(eq(certificateIssuesTable.id, id)).returning();
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
  const [deleted] = await db.update(certificateIssuesTable)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(eq(certificateIssuesTable.id, id))
    .returning();

  if (!deleted) {
    res.status(404).json({ error: "الشهادة غير موجودة" });
    return;
  }

  res.json({ success: true, cancelledId: id, status: "cancelled" });
});

export default router;
