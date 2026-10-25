import { Router, type IRouter } from "express";
import { eq, desc, inArray, sql, isNull, isNotNull, and, lt, ilike, gte, lte } from "drizzle-orm";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import JSZip from "jszip";
import multer from "multer";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { db, certificateTemplatesTable, certificateIssuesTable, certificatePartnersTable, usersTable } from "@workspace/db";
import { uploadBufferToSupabase } from "../lib/supabase-storage";
import bidiFactory from "bidi-js";

const router: IRouter = Router();
const SERIAL_NUMBER_PATTERN = /^AW-CERT-\d{4}-\d{6}$/;
const require = createRequire(import.meta.url);
const arabicShaper = (require("arabic-persian-reshaper") as {
  ArabicShaper: { convertArabic: (value: string) => string };
}).ArabicShaper;
const arabicBidi = bidiFactory();
const arabicFont = require.resolve("@fontsource/noto-sans-arabic/files/noto-sans-arabic-arabic-400-normal.woff");
const arabicBoldFont = require.resolve("@fontsource/noto-sans-arabic/files/noto-sans-arabic-arabic-700-normal.woff");
const latinFont = require.resolve("@fontsource/noto-sans-arabic/files/noto-sans-arabic-latin-400-normal.woff");
const latinBoldFont = require.resolve("@fontsource/noto-sans-arabic/files/noto-sans-arabic-latin-700-normal.woff");
const arabicSignatureFont = require.resolve("@fontsource/noto-naskh-arabic/files/noto-naskh-arabic-arabic-400-normal.woff");
const latinSignatureFont = require.resolve("@fontsource/noto-naskh-arabic/files/noto-naskh-arabic-latin-400-normal.woff");

function toPdfText(value: unknown): string {
  const shaped = arabicShaper.convertArabic(String(value ?? ""));
  return arabicBidi.getReorderedString(shaped, arabicBidi.getEmbeddingLevels(shaped, "rtl"));
}

function drawCertificateText(
  doc: InstanceType<typeof PDFDocument>,
  value: unknown,
  x: number,
  y: number,
  width: number,
  height: number,
  fontSize: number,
  align: "left" | "center" | "right",
  fontStyle: "regular" | "bold" | "signature" = "regular",
): void {
  const visualText = toPdfText(value);
  const runs = visualText.match(/[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff\ufb50-\ufdff\ufe70-\ufeff]+|[^\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff\ufb50-\ufdff\ufe70-\ufeff]+/g) ?? [];
  const runData = runs.map((text) => {
    const isArabic = /[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff\ufb50-\ufdff\ufe70-\ufeff]/.test(text);
    const font = fontStyle === "signature"
      ? (isArabic ? arabicSignatureFont : latinSignatureFont)
      : isArabic
        ? (fontStyle === "bold" ? arabicBoldFont : arabicFont)
        : (fontStyle === "bold" ? latinBoldFont : latinFont);
    doc.font(font).fontSize(fontSize);
    return { text, font, width: doc.widthOfString(text) };
  });
  const textWidth = runData.reduce((total, run) => total + run.width, 0);
  const scale = textWidth > width && textWidth > 0 ? width / textWidth : 1;
  const startX = align === "right" ? x + width - textWidth * scale : align === "center" ? x + (width - textWidth * scale) / 2 : x;
  let cursorX = startX;
  for (const run of runData) {
    const runWidth = run.width * scale;
    doc.font(run.font).fontSize(fontSize * scale).text(run.text, cursorX, y, {
      width: runWidth,
      height,
      lineBreak: false,
    });
    cursorX += runWidth;
  }
}

const uploadCertificateImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (["image/png", "image/jpeg", "image/webp"].includes(file.mimetype)) {
      callback(null, true);
      return;
    }
    callback(new Error("نوع الصورة غير مدعوم. ارفع PNG أو JPG أو WebP."));
  },
});

const DEFAULT_LAYOUT = {
  logo: { x: 8, y: 8, width: 18, height: 12 },
  certificateTitle: { x: 20, y: 24, width: 60, height: 10 },
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

function parsePositiveIds(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const ids = value.map((item: unknown) => typeof item === "number" || typeof item === "string" ? Number(item) : Number.NaN)
    .filter((id: number): id is number => Number.isInteger(id) && id > 0);
  return [...new Set(ids)];
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

function normalizeLayout(layout: any = {}): Record<string, any> {
  const merged = { ...DEFAULT_LAYOUT, ...(layout && typeof layout === "object" ? layout : {}) } as Record<string, any>;
  for (const key of Object.keys(DEFAULT_LAYOUT)) {
    merged[key] = normalizePosition(layout?.[key], DEFAULT_LAYOUT[key as keyof typeof DEFAULT_LAYOUT]);
  }
  return merged;
}

function isLayoutElementVisible(layout: Record<string, any>, key: string): boolean {
  return !Array.isArray(layout.hiddenElements) || !layout.hiddenElements.includes(key);
}

function parseCertificateDate(value: unknown): Date | undefined {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(`${value}T12:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) &&
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
    ? parsed
    : undefined;
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
  if (parsed.username || parsed.password) {
    throw new Error("لا يُسمح ببيانات اعتماد داخل رابط الصورة");
  }
  const storageUrl = process.env.SUPABASE_URL;
  if (!storageUrl || parsed.hostname !== new URL(storageUrl).hostname) {
    throw new Error("ارفع الصور إلى مخزن الشهادات قبل استخدامها في ملفات PDF");
  }
  const res = await fetch(parsed, { signal: AbortSignal.timeout(10_000), redirect: "error" });
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
  const baseUrl = (process.env.PUBLIC_APP_URL || "https://arkan-platform.onrender.com").replace(/\/+$/, "");
  return `${baseUrl}/certificate/verify?serial=${encodeURIComponent(serialNumber)}`;
}

function imageMatchesMimeType(file: Express.Multer.File): boolean {
  const bytes = file.buffer;
  if (file.mimetype === "image/png") return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (file.mimetype === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (file.mimetype === "image/webp") return bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
  return false;
}

function xmlEscape(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function xlsxCell(value: unknown, reference: string): string {
  return `<c r="${reference}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`;
}

async function makeCertificatesWorkbook(items: any[]): Promise<Buffer> {
  const columns = [
    "رقم الشهادة",
    "اسم المستفيد",
    "اسم الشهادة أو البرنامج",
    "تاريخ الإصدار",
    "الحالة",
    "الجهة المصدرة",
    "المؤسسات الشريكة",
    "رابط التحقق",
    "تاريخ إنشاء السجل",
    "آخر تحديث",
  ];
  const rows = [columns, ...items.map((item) => [
    item.serialNumber,
    item.recipientName,
    item.programTitle,
    item.issueDate ? new Date(item.issueDate).toISOString() : "",
    item.deletedAt ? "في سلة المحذوفات" : item.status === "issued" ? "سارية" : item.status === "cancelled" ? "ملغاة" : "مسودة",
    item.issuerName,
    (Array.isArray(item.metadata?.partnerSnapshots) ? item.metadata.partnerSnapshots : []).map((partner: any) => partner.name).join("، "),
    item.validationUrl,
    item.createdAt ? new Date(item.createdAt).toISOString() : "",
    item.updatedAt ? new Date(item.updatedAt).toISOString() : "",
  ])];
  const sheetRows = rows.map((row, rowIndex) =>
    `<row r="${rowIndex + 1}">${row.map((value, columnIndex) =>
      xlsxCell(value, `${String.fromCharCode(65 + columnIndex)}${rowIndex + 1}`),
    ).join("")}</row>`,
  ).join("");
  const workbook = new JSZip();
  workbook.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`);
  workbook.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
  workbook.file("xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="الشهادات" sheetId="1" r:id="rId1"/></sheets></workbook>`);
  workbook.file("xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`);
  workbook.file("xl/worksheets/sheet1.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows}</sheetData></worksheet>`);
  return workbook.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

function certificateFilter(req: any, trash = false) {
  const filters: any[] = [trash ? isNotNull(certificateIssuesTable.deletedAt) : isNull(certificateIssuesTable.deletedAt)];
  const status = typeof req.query.status === "string" ? req.query.status : "";
  if (status && ["issued", "cancelled", "draft"].includes(status)) filters.push(eq(certificateIssuesTable.status, status));
  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
  if (search) {
    const pattern = `%${search.replace(/[%_]/g, "\\$&")}%`;
    filters.push(sql`(${certificateIssuesTable.serialNumber} ILIKE ${pattern} ESCAPE '\\' OR ${certificateIssuesTable.recipientName} ILIKE ${pattern} ESCAPE '\\' OR ${certificateIssuesTable.programTitle} ILIKE ${pattern} ESCAPE '\\')`);
  }
  const from = typeof req.query.from === "string" ? new Date(req.query.from) : null;
  const to = typeof req.query.to === "string" ? new Date(req.query.to) : null;
  if (from && Number.isFinite(from.getTime())) filters.push(gte(certificateIssuesTable.issueDate, from));
  if (to && Number.isFinite(to.getTime())) filters.push(lte(certificateIssuesTable.issueDate, to));
  return and(...filters);
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

function templateForIssue(issue: any, template: any) {
  const issueLayout = issue?.metadata?.layoutConfig;
  return {
    ...template,
    layoutConfig: issueLayout && typeof issueLayout === "object"
      ? issueLayout
      : template?.layoutConfig || DEFAULT_LAYOUT,
  };
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

  doc.addPage({ size: size as any, margins: { top: 0, bottom: 0, left: 0, right: 0 } });
  const pageSize = doc.page.size as number[] | { width: number; height: number } | string;
  const width = Array.isArray(pageSize)
    ? Number(pageSize[0] || pageWidth)
    : Number((pageSize as { width?: number })?.width || pageWidth);
  const height = Array.isArray(pageSize)
    ? Number(pageSize[1] || pageHeight)
    : Number((pageSize as { height?: number })?.height || pageHeight);

  const backgroundImage = await fetchImageBuffer(template?.backgroundUrl ?? null);
  if (backgroundImage) {
    doc.image(backgroundImage, 0, 0, { width, height });
  } else {
    doc.fillColor("#f8fafc").rect(0, 0, width, height).fill();
    doc.strokeColor("#cbd5e1").lineWidth(4).rect(20, 20, width - 40, height - 40).stroke();
  }

  const logoImage = isLayoutElementVisible(layout, "logo") ? await fetchImageBuffer(template?.logoUrl ?? null) : undefined;
  if (logoImage) {
    const logoBox = getBox(layout, "logo", width, height);
    doc.image(logoImage, logoBox.x, logoBox.y, { fit: [logoBox.width, logoBox.height], align: "center", valign: "center" });
  }

  const signatureImage = isLayoutElementVisible(layout, "signature") ? await fetchImageBuffer(template?.signatureUrl ?? null) : undefined;
  if (signatureImage) {
    const signatureBox = getBox(layout, "signature", width, height);
    doc.image(signatureImage, signatureBox.x, signatureBox.y, { fit: [signatureBox.width, signatureBox.height], align: "center", valign: "center" });
  }

  const qrBox = getBox(layout, "qrCode", width, height);
  if (isLayoutElementVisible(layout, "qrCode") && issue.status === "issued" && issue.validationUrl) {
    const qrDataUrl = await QRCode.toDataURL(issue.validationUrl, { width: 320, margin: 1 });
    const qrBuffer = Buffer.from(qrDataUrl.split(",")[1], "base64");
    doc.image(qrBuffer, qrBox.x, qrBox.y, { fit: [qrBox.width, qrBox.height] });
  } else if (isLayoutElementVisible(layout, "qrCode")) {
    doc.strokeColor("#94a3b8").lineWidth(1).rect(qrBox.x, qrBox.y, qrBox.width, qrBox.height).stroke();
    doc.fillColor("#475569");
    drawCertificateText(doc, "بعد الإصدار", qrBox.x, qrBox.y + qrBox.height * 0.35, qrBox.width, qrBox.height * 0.3, 10, "center");
  }

  const certificateTitle = typeof layout.certificateTitleText === "string" ? layout.certificateTitleText.trim() : "";
  if (isLayoutElementVisible(layout, "certificateTitle") && certificateTitle) {
    const titleBox = getBox(layout, "certificateTitle", width, height);
    doc.fillColor("#0f2350");
    drawCertificateText(doc, certificateTitle, titleBox.x, titleBox.y, titleBox.width, titleBox.height, 30, getTextAlignment(layout, "certificateTitle"), "bold");
  }

  if (isLayoutElementVisible(layout, "recipientName")) {
    const recipientBox = getBox(layout, "recipientName", width, height);
    doc.fillColor("#0f172a");
    drawCertificateText(doc, issue.recipientName || "-", recipientBox.x, recipientBox.y, recipientBox.width, recipientBox.height, 28, getTextAlignment(layout, "recipientName"), "bold");
  }

  if (isLayoutElementVisible(layout, "programTitle")) {
    const programBox = getBox(layout, "programTitle", width, height);
    doc.fillColor("#334155");
    drawCertificateText(doc, issue.programTitle || "-", programBox.x, programBox.y, programBox.width, programBox.height, 18, getTextAlignment(layout, "programTitle"));
  }

  if (isLayoutElementVisible(layout, "serialNumber")) {
    const serialBox = getBox(layout, "serialNumber", width, height);
    doc.fillColor("#1e293b");
    drawCertificateText(doc, `رقم الشهادة: ${issue.serialNumber || "-"}`, serialBox.x, serialBox.y, serialBox.width, serialBox.height, 16, getTextAlignment(layout, "serialNumber"), "bold");
  }

  if (isLayoutElementVisible(layout, "issueDate")) {
    const issueDateBox = getBox(layout, "issueDate", width, height);
    const issueDate = issue.issueDate ? new Date(issue.issueDate) : new Date();
    doc.fillColor("#475569");
    drawCertificateText(doc, `تاريخ الإصدار: ${Number.isNaN(issueDate.getTime()) ? "-" : issueDate.toLocaleDateString("ar-EG", { timeZone: "UTC" })}`, issueDateBox.x, issueDateBox.y, issueDateBox.width, issueDateBox.height, 10, getTextAlignment(layout, "issueDate"));
  }

  if (isLayoutElementVisible(layout, "issuerName")) {
    const issuerBox = getBox(layout, "issuerName", width, height);
    doc.fillColor("#475569");
    drawCertificateText(doc, issue.issuerName || "Arkan Web", issuerBox.x, issuerBox.y, issuerBox.width, issuerBox.height, 12, getTextAlignment(layout, "issuerName"));
  }

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
  for (let index = 0; isLayoutElementVisible(layout, "signatures") && index < signatures.length; index += 1) {
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
    doc.fillColor("#334155");
    const signatureFontStyle = signature.style === "bold" ? "bold" : signature.style === "script" ? "signature" : "regular";
    drawCertificateText(doc, signature?.name || "", position.x, position.y + position.height * 0.55, position.width, position.height * 0.4, Number(signature.fontSize) || 18, "center", signatureFontStyle);
    drawCertificateText(doc, [signature?.title, signature?.role].filter(Boolean).join(" · "), position.x, position.y + position.height * 0.82, position.width, position.height * 0.18, 9, "center");
  }

  for (let index = 0; isLayoutElementVisible(layout, "partners") && index < partners.length; index += 1) {
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
    const signatureDefault: { y?: unknown; height?: unknown } =
      layout.partnerSignatureDefault && typeof layout.partnerSignatureDefault === "object"
      ? layout.partnerSignatureDefault
      : {};
    const defaultSignatureY = Number(signatureDefault.y);
    const defaultSignatureHeight = Number(signatureDefault.height);
    const signatureBox = normalizePosition(signatureBoxesByPartner[String(partner.id)], {
      x: logoBox.x,
      y: Number.isFinite(defaultSignatureY) ? defaultSignatureY : 68,
      width: logoBox.width,
      height: Number.isFinite(defaultSignatureHeight) ? defaultSignatureHeight : 20,
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
    const logo = isLayoutElementVisible(layout, "partners") ? await fetchImageBuffer(partner.logoUrl) : undefined;
    if (logo) doc.image(logo, logoPosition.x, logoPosition.y, { fit: [logoPosition.width, logoPosition.height] });
    const signature = await fetchImageBuffer(partner.signatureUrl);
    if (signature) {
      doc.image(signature, signaturePosition.x, signaturePosition.y, { fit: [signaturePosition.width, signaturePosition.height * 0.4] });
    }
    drawCertificateText(doc, partner.name || "", signaturePosition.x, signaturePosition.y + signaturePosition.height * 0.42, signaturePosition.width, signaturePosition.height * 0.18, 8, "center");
    if (partner.signatureName) {
      doc.fillColor("#334155");
      drawCertificateText(doc, partner.signatureName, signaturePosition.x, signaturePosition.y + signaturePosition.height * 0.62, signaturePosition.width, signaturePosition.height * 0.18, 12, "center", "signature");
      drawCertificateText(doc, partner.signatureTitle || "", signaturePosition.x, signaturePosition.y + signaturePosition.height * 0.84, signaturePosition.width, signaturePosition.height * 0.16, 8, "center");
    }
  }

  if (issue.status === "cancelled") {
    doc.save();
    doc.rotate(-35, { origin: [width / 2, height / 2] });
    doc.fillColor("#dc2626");
    drawCertificateText(doc, "مُلغاة", width / 2 - 150, height / 2 - 80, 300, 100, 56, "center", "bold");
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

router.post("/certificates/templates/:id/duplicate", async (req, res): Promise<void> => {
  if (!(await ensureAdmin(req))) {
    res.status(403).json({ error: "غير مصرح" });
    return;
  }
  const templateId = Number(req.params.id);
  const [source] = await db.select().from(certificateTemplatesTable)
    .where(eq(certificateTemplatesTable.id, templateId)).limit(1);
  if (!source) {
    res.status(404).json({ error: "القالب غير موجود" });
    return;
  }
  const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...copy } = source;
  const [template] = await db.insert(certificateTemplatesTable)
    .values({ ...copy, name: `${source.name} - نسخة`, updatedAt: new Date() })
    .returning();
  res.status(201).json(template);
});

router.post("/certificates/upload", async (req, res, next): Promise<void> => {
  if (!(await ensureAdmin(req))) {
    res.status(403).json({ error: "غير مصرح" });
    return;
  }
  next();
}, uploadCertificateImage.single("file"), async (req, res): Promise<void> => {
  const { userId } = getSessionUser(req);
  if (!req.file || !imageMatchesMimeType(req.file)) {
    res.status(400).json({ error: "ملف الصورة غير صالح أو لا يطابق نوعه المعلن." });
    return;
  }
  try {
    const uploaded = await uploadBufferToSupabase(req.file, userId!);
    res.status(201).json(uploaded);
  } catch (error) {
    res.status(503).json({ error: error instanceof Error ? error.message : "تعذر رفع صورة القالب" });
  }
});

router.get("/certificates/admin/stats", async (req, res): Promise<void> => {
  if (!(await ensureAdmin(req))) {
    res.status(403).json({ error: "غير مصرح" });
    return;
  }
  const rows = await db.select({
    status: certificateIssuesTable.status,
    deletedAt: certificateIssuesTable.deletedAt,
  }).from(certificateIssuesTable);
  const stats = rows.reduce((result, row) => {
    if (row.deletedAt) result.trash += 1;
    else {
      result.total += 1;
      if (row.status === "issued") result.issued += 1;
      else if (row.status === "cancelled") result.cancelled += 1;
      else if (row.status === "draft") result.drafts += 1;
    }
    return result;
  }, { total: 0, issued: 0, cancelled: 0, drafts: 0, trash: 0 });
  res.json(stats);
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
  if (!Number.isInteger(templateId) || templateId < 1) {
    res.status(400).json({ error: "معرف القالب غير صالح" });
    return;
  }

  const result = await db.transaction(async (tx) => {
    const [template] = await tx.select({ id: certificateTemplatesTable.id })
      .from(certificateTemplatesTable)
      .where(eq(certificateTemplatesTable.id, templateId))
      .for("update")
      .limit(1);
    if (!template) return { status: "missing" as const };

    const [existingIssue] = await tx.select({ id: certificateIssuesTable.id })
      .from(certificateIssuesTable)
      .where(eq(certificateIssuesTable.templateId, templateId))
      .limit(1);
    if (existingIssue) return { status: "in-use" as const };

    const [deleted] = await tx.delete(certificateTemplatesTable)
      .where(eq(certificateTemplatesTable.id, templateId))
      .returning({ id: certificateTemplatesTable.id });
    return deleted ? { status: "deleted" as const } : { status: "missing" as const };
  });

  if (result.status === "in-use") {
    res.status(409).json({ error: "لا يمكن حذف قالب مرتبط بشهادة أو مسودة" });
    return;
  }
  if (result.status === "missing") {
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

  const items = await db.select().from(certificateIssuesTable)
    .where(certificateFilter(req))
    .orderBy(desc(certificateIssuesTable.createdAt));
  res.json(items);
});

router.get("/certificates/trash", async (req, res): Promise<void> => {
  if (!(await ensureAdmin(req))) {
    res.status(403).json({ error: "غير مصرح" });
    return;
  }
  const items = await db.select().from(certificateIssuesTable)
    .where(certificateFilter(req, true))
    .orderBy(desc(certificateIssuesTable.deletedAt));
  res.json(items);
});

router.post("/certificates/bulk/trash", async (req, res): Promise<void> => {
  if (!(await ensureAdmin(req))) {
    res.status(403).json({ error: "غير مصرح" });
    return;
  }
  const ids = parsePositiveIds(req.body?.ids);
  if (ids.length === 0) {
    res.status(400).json({ error: "حدد شهادة واحدة على الأقل" });
    return;
  }
  const deleted = await db.update(certificateIssuesTable)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(inArray(certificateIssuesTable.id, ids), isNull(certificateIssuesTable.deletedAt)))
    .returning({ id: certificateIssuesTable.id });
  res.json({ success: true, affected: deleted.length });
});

router.post("/certificates/bulk/restore", async (req, res): Promise<void> => {
  if (!(await ensureAdmin(req))) {
    res.status(403).json({ error: "غير مصرح" });
    return;
  }
  const ids = parsePositiveIds(req.body?.ids);
  if (ids.length === 0) {
    res.status(400).json({ error: "حدد شهادة واحدة على الأقل" });
    return;
  }
  const restoreCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const deleted = await db.update(certificateIssuesTable)
    .set({ deletedAt: null, updatedAt: new Date() })
    .where(and(
      inArray(certificateIssuesTable.id, ids),
      isNotNull(certificateIssuesTable.deletedAt),
      gte(certificateIssuesTable.deletedAt, restoreCutoff),
    ))
    .returning({ id: certificateIssuesTable.id });
  res.json({ success: true, affected: deleted.length });
});

router.post("/certificates/bulk/permanent-delete", async (req, res): Promise<void> => {
  if (!(await ensureAdmin(req))) {
    res.status(403).json({ error: "غير مصرح" });
    return;
  }
  const ids = parsePositiveIds(req.body?.ids);
  if (ids.length === 0) {
    res.status(400).json({ error: "حدد شهادة واحدة على الأقل" });
    return;
  }
  const deleted = await db.delete(certificateIssuesTable)
    .where(and(inArray(certificateIssuesTable.id, ids), isNotNull(certificateIssuesTable.deletedAt)))
    .returning({ id: certificateIssuesTable.id });
  res.json({ success: true, affected: deleted.length });
});

router.get("/certificates/export.xlsx", async (req, res): Promise<void> => {
  if (!(await ensureAdmin(req))) {
    res.status(403).json({ error: "غير مصرح" });
    return;
  }
  const selectedIds = typeof req.query.ids === "string"
    ? req.query.ids.split(",").map(Number).filter((id) => Number.isInteger(id) && id > 0)
    : [];
  const trash = req.query.trash === "true";
  const whereClause = certificateFilter(req, trash);
  const items = selectedIds.length > 0
    ? await db.select().from(certificateIssuesTable)
      .where(and(whereClause, inArray(certificateIssuesTable.id, selectedIds)))
      .orderBy(desc(certificateIssuesTable.createdAt))
    : await db.select().from(certificateIssuesTable)
      .where(whereClause)
      .orderBy(desc(certificateIssuesTable.createdAt));
  if (items.length === 0) {
    res.status(404).json({ error: "لا توجد شهادات مطابقة للتصدير" });
    return;
  }
  const workbook = await makeCertificatesWorkbook(items);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="certificates-${Date.now()}.xlsx"`);
  res.end(workbook);
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
  if (!serial) {
    res.status(400).json({ valid: false, error: "أدخل رقم الشهادة للتحقق منها" });
    return;
  }
  if (!SERIAL_NUMBER_PATTERN.test(serial)) {
    res.status(400).json({ valid: false, error: "رقم الشهادة غير صالح" });
    return;
  }

  const [issue] = await db.select().from(certificateIssuesTable).where(eq(certificateIssuesTable.serialNumber, serial)).limit(1);

  if (!issue || issue.deletedAt) {
    res.status(404).json({ valid: false, error: "الشهادة غير موجودة" });
    return;
  }

  if (issue.status !== "issued") {
    if (issue.status === "draft") {
      res.status(404).json({ valid: false, error: "الشهادة غير موجودة أو لم تصدر بعد" });
      return;
    }
    const partners = await getIssuePartners(issue);
    res.status(410).json({
      valid: false,
      cancelled: issue.status === "cancelled",
      status: issue.status,
      error: "تم إلغاء هذه الشهادة",
      certificate: {
        serialNumber: issue.serialNumber,
        recipientName: issue.recipientName,
        programTitle: issue.programTitle,
        issuerName: issue.issuerName,
        issueDate: issue.issueDate,
        status: issue.status,
        partners: partners.map((partner) => String(partner.name || "")).filter(Boolean),
      },
    });
    return;
  }

  const partners = await getIssuePartners(issue);
  res.json({
    valid: true,
    certificate: {
      serialNumber: issue.serialNumber,
      recipientName: issue.recipientName,
      programTitle: issue.programTitle,
      issuerName: issue.issuerName,
      issueDate: issue.issueDate,
      status: "issued",
      partners: partners.map((partner) => String(partner.name || "")).filter(Boolean),
      pdfUrl: `${buildValidationUrl(issue.serialNumber).split("/certificate/verify")[0]}/api/certificates/public/${encodeURIComponent(issue.serialNumber)}/pdf`,
    },
  });
});

router.get("/certificates/public/:serial/pdf", async (req, res): Promise<void> => {
  const serial = String(req.params.serial || "").trim();
  const [issue] = await db.select().from(certificateIssuesTable)
    .where(eq(certificateIssuesTable.serialNumber, serial)).limit(1);
  if (!issue || issue.status !== "issued" || issue.deletedAt) {
    res.status(404).json({ error: "الشهادة غير موجودة أو غير صالحة للتنزيل" });
    return;
  }
  const [template] = await db.select().from(certificateTemplatesTable)
    .where(eq(certificateTemplatesTable.id, issue.templateId)).limit(1);
  const pdfBuffer = await generateCertificatePdfBuffer(
    issue,
    templateForIssue(issue, template ?? { width: 1200, height: 800, orientation: "landscape", layoutConfig: DEFAULT_LAYOUT }),
    await getIssuePartners(issue),
  );
  res.setHeader("Content-Type", "application/pdf");
  const disposition = req.query.download === "1" ? "attachment" : "inline";
  res.setHeader("Content-Disposition", `${disposition}; filename="${slugify(issue.recipientName)}-${issue.serialNumber}.pdf"`);
  res.setHeader("Cache-Control", "no-store");
  res.end(pdfBuffer);
});

router.get("/certificates/qr", async (req, res): Promise<void> => {
  const serial = String(req.query.serial || "").trim();
  if (!SERIAL_NUMBER_PATTERN.test(serial)) {
    res.status(400).json({ error: "رقم الشهادة غير صالح" });
    return;
  }
  const image = await QRCode.toBuffer(buildValidationUrl(serial), { type: "png", width: 320, margin: 1 });
  res.setHeader("Content-Type", "image/png");
  res.setHeader("Cache-Control", "no-store");
  res.end(image);
});

router.post("/certificates/drafts", async (req, res): Promise<void> => {
  if (!(await ensureAdmin(req))) {
    res.status(403).json({ error: "غير مصرح" });
    return;
  }
  const body = req.body ?? {};
  const templateId = Number(body.templateId);
  const [template] = await db.select({
    id: certificateTemplatesTable.id,
    layoutConfig: certificateTemplatesTable.layoutConfig,
  })
    .from(certificateTemplatesTable).where(eq(certificateTemplatesTable.id, templateId)).limit(1);
  if (!template) {
    res.status(404).json({ error: "القالب غير موجود" });
    return;
  }
  const draftDate = typeof body.issueDate === "string" ? parseCertificateDate(body.issueDate) : new Date();
  if (!draftDate) {
    res.status(400).json({ error: "تاريخ الإصدار غير صالح" });
    return;
  }
  const draftLayout = body.layoutConfig ?? body.metadata?.layoutConfig ?? template.layoutConfig;
  const draftProgramTitle = String(body.programTitle || (
    Array.isArray(draftLayout?.hiddenElements) && draftLayout.hiddenElements.includes("programTitle")
      ? "توثيق شهادة"
      : "مسودة شهادة"
  ));
  let selectedPartners: { ids: number[]; snapshots: any[] };
  try {
    selectedPartners = await getPartnerSnapshots(body.partnerIds ?? body.metadata?.partnerIds);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "تعذر التحقق من المؤسسات المختارة" });
    return;
  }
  const serialNumber = `DRAFT-${randomUUID()}`;
  const validationUrl = buildValidationUrl(serialNumber);
  const [draft] = await db.insert(certificateIssuesTable).values({
    templateId,
    serialNumber,
    validationUrl,
    recipientName: String(body.recipientName || "مسودة"),
    recipientEmail: body.recipientEmail ? String(body.recipientEmail) : null,
    recipientPhone: body.recipientPhone ? String(body.recipientPhone) : null,
    programTitle: draftProgramTitle,
    description: body.description ? String(body.description) : null,
    issuerName: String(body.issuerName || "Arkan Web"),
    issueDate: draftDate,
    status: "draft",
    qrCodeUrl: validationUrl,
    metadata: {
      signatures: normalizeSignatures(body.signatures ?? body.metadata?.signatures),
      partnerIds: selectedPartners.ids,
      partnerSnapshots: selectedPartners.snapshots,
      layoutConfig: normalizeLayout(draftLayout),
    },
  }).returning();
  res.status(201).json(draft);
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
  const serialCandidate = typeof body.serialNumber === "string" ? body.serialNumber.trim() : "";
  const existingIssueId = Number(body.issueId);
  const [existingIssue] = existingIssueId > 0
    ? await db.select({
        id: certificateIssuesTable.id,
        serialNumber: certificateIssuesTable.serialNumber,
        validationUrl: certificateIssuesTable.validationUrl,
        status: certificateIssuesTable.status,
      }).from(certificateIssuesTable)
        .where(and(
          eq(certificateIssuesTable.id, existingIssueId),
          isNull(certificateIssuesTable.deletedAt),
        )).limit(1)
    : [];
  const isIssuedPreview = Boolean(
    existingIssue &&
    existingIssue.status === "issued" &&
    existingIssue.serialNumber === serialCandidate,
  );
  const serialNumber = isIssuedPreview ? serialCandidate : "سيصدر بعد الاعتماد";
  const validationUrl = isIssuedPreview ? existingIssue?.validationUrl ?? "" : "";
  const issue = {
    serialNumber,
    validationUrl,
    recipientName: typeof body.recipientName === "string" && body.recipientName.trim() ? body.recipientName.trim() : "اسم صاحب الشهادة",
    programTitle: typeof body.programTitle === "string" && body.programTitle.trim() ? body.programTitle.trim() : "اسم الشهادة",
    issuerName: typeof body.issuerName === "string" && body.issuerName.trim() ? body.issuerName.trim() : "Arkan Web",
    issueDate: typeof body.issueDate === "string" ? parseCertificateDate(body.issueDate) ?? new Date() : new Date(),
    status: isIssuedPreview ? "issued" : "draft",
    signatureName: null,
    signatureTitle: null,
    metadata: {
      signatures: normalizeSignatures(body.signatures ?? body.metadata?.signatures),
      partnerIds: selectedPartners.ids,
      partnerSnapshots: selectedPartners.snapshots,
      layoutConfig: normalizeLayout(body.layoutConfig ?? body.metadata?.layoutConfig ?? template.layoutConfig),
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

router.post("/certificates/:id/issue", async (req, res): Promise<void> => {
  if (!(await ensureAdmin(req))) {
    res.status(403).json({ error: "غير مصرح" });
    return;
  }
  const id = Number(req.params.id);
  const [draft] = await db.select().from(certificateIssuesTable)
    .where(and(eq(certificateIssuesTable.id, id), isNull(certificateIssuesTable.deletedAt)))
    .limit(1);
  if (!draft) {
    res.status(404).json({ error: "المسودة غير موجودة" });
    return;
  }
  if (draft.status !== "draft") {
    res.status(409).json({ error: "هذه الشهادة ليست مسودة قابلة للإصدار" });
    return;
  }
  const recipientName = typeof req.body?.recipientName === "string" ? req.body.recipientName.trim() : draft.recipientName.trim();
  const programTitle = typeof req.body?.programTitle === "string" ? req.body.programTitle.trim() : draft.programTitle.trim();
  const draftMetadata = draft.metadata && typeof draft.metadata === "object"
    ? draft.metadata as Record<string, unknown>
    : {};
  const draftLayout: Record<string, unknown> = draftMetadata.layoutConfig && typeof draftMetadata.layoutConfig === "object"
    ? draftMetadata.layoutConfig as Record<string, unknown>
    : {};
  const programTitleHidden = Array.isArray(draftLayout?.hiddenElements) && draftLayout.hiddenElements.includes("programTitle");
  if (!recipientName || (!programTitle && !programTitleHidden)) {
    res.status(400).json({ error: "اسم المستفيد واسم الشهادة مطلوبان لإصدار الشهادة" });
    return;
  }
  const serialNumber = await generateSerialNumber();
  const validationUrl = buildValidationUrl(serialNumber);
  const [issued] = await db.update(certificateIssuesTable).set({
    serialNumber,
    validationUrl,
    qrCodeUrl: validationUrl,
    recipientName,
    programTitle: programTitle || "توثيق شهادة",
    status: "issued",
    issueDate: draft.issueDate || new Date(),
    updatedAt: new Date(),
  }).where(and(eq(certificateIssuesTable.id, id), eq(certificateIssuesTable.status, "draft"), isNull(certificateIssuesTable.deletedAt)))
    .returning();
  if (!issued) {
    res.status(409).json({ error: "تعذر إصدار المسودة؛ ربما تم تعديلها في جلسة أخرى" });
    return;
  }
  res.json(issued);
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
  const requestedLayout = body.layoutConfig ?? body.metadata?.layoutConfig;
  const programTitleHidden = Array.isArray(requestedLayout?.hiddenElements) && requestedLayout.hiddenElements.includes("programTitle");
  const issueDate = typeof body.issueDate === "string" ? parseCertificateDate(body.issueDate) : new Date();
  if (!recipientName || (!programTitle && !programTitleHidden)) {
    res.status(400).json({ error: "اسم المستفيد واسم الشهادة مطلوبان" });
    return;
  }
  if (!issueDate) {
    res.status(400).json({ error: "تاريخ الإصدار غير صالح" });
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
    programTitle: programTitle || "توثيق شهادة",
    description: body.description ? String(body.description) : null,
    issuerName: String(body.issuerName || "Arkan Web"),
    signatureName: body.signatureName ? String(body.signatureName) : null,
    signatureTitle: body.signatureTitle ? String(body.signatureTitle) : null,
    status: "issued",
    issueDate,
    metadata: {
      signatures: normalizeSignatures(body.signatures ?? body.metadata?.signatures),
      partnerIds: selectedPartners.ids,
      partnerSnapshots: selectedPartners.snapshots,
      layoutConfig: normalizeLayout(requestedLayout ?? template.layoutConfig),
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
      metadata: {
        ...(recipient.metadata && typeof recipient.metadata === "object" ? recipient.metadata : {}),
        layoutConfig: normalizeLayout(recipient.metadata?.layoutConfig ?? body.layoutConfig ?? templateExists.layoutConfig),
      },
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
    .filter((value) => Number.isInteger(value) && value > 0);

  const items = ids.length > 0
    ? await db.select().from(certificateIssuesTable).where(and(
      inArray(certificateIssuesTable.id, ids),
      isNull(certificateIssuesTable.deletedAt),
    ))
    : await db.select().from(certificateIssuesTable)
      .where(certificateFilter(req))
      .orderBy(desc(certificateIssuesTable.createdAt));

  const printableItems = items.filter((item) => item.status !== "draft");
  if (printableItems.length === 0) {
    res.status(404).json({ error: "لا توجد شهادات صادرة مطابقة للتنزيل" });
    return;
  }

  const zip = new JSZip();

  for (const issue of printableItems) {
    const [template] = await db.select().from(certificateTemplatesTable).where(eq(certificateTemplatesTable.id, issue.templateId)).limit(1);
    const partners = await getIssuePartners(issue);
    const pdfBuffer = await generateCertificatePdfBuffer(issue, templateForIssue(issue, template ?? {
      width: 1200,
      height: 800,
      orientation: "landscape",
      backgroundUrl: null,
      logoUrl: null,
      signatureUrl: null,
      layoutConfig: DEFAULT_LAYOUT,
    }), partners);
    zip.file(`${issue.serialNumber}-${slugify(issue.recipientName)}.pdf`, pdfBuffer);
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
  const [issue] = await db.select().from(certificateIssuesTable)
    .where(and(eq(certificateIssuesTable.id, id), isNull(certificateIssuesTable.deletedAt))).limit(1);
  if (!issue || issue.status === "draft") {
    res.status(404).json({ error: "الشهادة غير موجودة" });
    return;
  }

  const [template] = await db.select().from(certificateTemplatesTable).where(eq(certificateTemplatesTable.id, issue.templateId)).limit(1);
  const partners = await getIssuePartners(issue);
  const pdfBuffer = await generateCertificatePdfBuffer(issue, templateForIssue(issue, template ?? {
    width: 1200,
    height: 800,
    orientation: "landscape",
    backgroundUrl: null,
    logoUrl: null,
    signatureUrl: null,
    layoutConfig: DEFAULT_LAYOUT,
  }), partners);

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
  const [issue] = await db.select().from(certificateIssuesTable)
    .where(and(eq(certificateIssuesTable.id, id), isNull(certificateIssuesTable.deletedAt))).limit(1);
  if (!issue) {
    res.status(404).json({ error: "الشهادة غير موجودة" });
    return;
  }
  const [template] = await db.select().from(certificateTemplatesTable).where(eq(certificateTemplatesTable.id, issue.templateId)).limit(1);
  const pdfBuffer = await generateCertificatePdfBuffer(issue, templateForIssue(issue, template ?? {
    width: 1200,
    height: 800,
    orientation: "landscape",
    backgroundUrl: null,
    logoUrl: null,
    signatureUrl: null,
    layoutConfig: DEFAULT_LAYOUT,
  }), await getIssuePartners(issue));
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
    .where(and(
      eq(certificateIssuesTable.id, id),
      eq(certificateIssuesTable.status, "issued"),
      isNull(certificateIssuesTable.deletedAt),
    ))
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
  if (typeof body.issueDate === "string") {
    const issueDate = parseCertificateDate(body.issueDate);
    if (!issueDate) {
      res.status(400).json({ error: "تاريخ الإصدار غير صالح" });
      return;
    }
    update.issueDate = issueDate;
  }
  if (body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)) {
    const metadata = body.metadata as Record<string, unknown>;
    const [currentIssue] = await db.select({ metadata: certificateIssuesTable.metadata })
      .from(certificateIssuesTable)
      .where(eq(certificateIssuesTable.id, id))
      .limit(1);
    let selectedPartners: { ids: number[]; snapshots: any[] };
    try {
      selectedPartners = await getPartnerSnapshots(metadata.partnerIds);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "تعذر التحقق من المؤسسات المختارة" });
      return;
    }
    const updatedMetadata: Record<string, unknown> = {
      signatures: normalizeSignatures(metadata.signatures),
      partnerIds: selectedPartners.ids,
      partnerSnapshots: selectedPartners.snapshots,
    };
    const currentMetadata = currentIssue?.metadata;
    const existingLayout = currentMetadata && typeof currentMetadata === "object" && "layoutConfig" in currentMetadata
      ? currentMetadata.layoutConfig
      : undefined;
    const layoutConfig = metadata.layoutConfig ?? existingLayout;
    if (layoutConfig && typeof layoutConfig === "object") updatedMetadata.layoutConfig = normalizeLayout(layoutConfig);
    update.metadata = updatedMetadata;
  }
  const [updated] = await db.update(certificateIssuesTable).set(update)
    .where(and(eq(certificateIssuesTable.id, id), isNull(certificateIssuesTable.deletedAt))).returning();
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
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(certificateIssuesTable.id, id), isNull(certificateIssuesTable.deletedAt)))
    .returning();

  if (!deleted) {
    res.status(404).json({ error: "الشهادة غير موجودة" });
    return;
  }

  res.json({ success: true, deletedId: id, deletedAt: deleted.deletedAt });
});

router.patch("/certificates/:id/restore", async (req, res): Promise<void> => {
  if (!(await ensureAdmin(req))) {
    res.status(403).json({ error: "غير مصرح" });
    return;
  }
  const id = Number(req.params.id);
  const [restored] = await db.update(certificateIssuesTable)
    .set({ deletedAt: null, updatedAt: new Date() })
    .where(and(
      eq(certificateIssuesTable.id, id),
      isNotNull(certificateIssuesTable.deletedAt),
      gte(certificateIssuesTable.deletedAt, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)),
    ))
    .returning();
  if (!restored) {
    res.status(404).json({ error: "الشهادة غير موجودة في السلة أو انتهت مدة الاحتفاظ بها" });
    return;
  }
  res.json(restored);
});

router.delete("/certificates/:id/permanent", async (req, res): Promise<void> => {
  if (!(await ensureAdmin(req))) {
    res.status(403).json({ error: "غير مصرح" });
    return;
  }
  const id = Number(req.params.id);
  const [deleted] = await db.delete(certificateIssuesTable)
    .where(and(eq(certificateIssuesTable.id, id), isNotNull(certificateIssuesTable.deletedAt)))
    .returning({ id: certificateIssuesTable.id });
  if (!deleted) {
    res.status(404).json({ error: "يجب نقل الشهادة إلى سلة المحذوفات قبل حذفها نهائيًا" });
    return;
  }
  res.json({ success: true, permanentlyDeletedId: id });
});

export async function purgeExpiredCertificates(): Promise<number> {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const deleted = await db.delete(certificateIssuesTable)
    .where(and(isNotNull(certificateIssuesTable.deletedAt), lt(certificateIssuesTable.deletedAt, cutoff)))
    .returning({ id: certificateIssuesTable.id });
  return deleted.length;
}

export default router;
