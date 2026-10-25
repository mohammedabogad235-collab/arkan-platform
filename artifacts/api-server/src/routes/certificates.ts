import { Router, type IRouter } from "express";
import { eq, desc, inArray, sql, isNull, isNotNull, and, or, lt, ilike, gte, lte } from "drizzle-orm";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import JSZip from "jszip";
import { ZipArchive } from "archiver";
import multer from "multer";
import { createHash, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { db, certificateTemplatesTable, certificateIssuesTable, certificatePartnersTable, certificateVerifySettingsTable } from "@workspace/db";
import { uploadBufferToSupabase } from "../lib/supabase-storage";
import { sendCertificateEmail } from "../lib/mailer";
import { hasAdminPermission } from "../lib/access-control";
import bidiFactory from "bidi-js";
import { createCanvas } from "@napi-rs/canvas";

const router: IRouter = Router();
const UPLOADED_CERTIFICATE_TEMPLATE_NAME = "قالب توثيق صور جاهزة";
const RESERVED_CODE_TEMPLATE_NAME = "قالب أكواد محجوزة";
const MAX_BULK_NAME_ROWS = 200;
const MAX_IMAGE_EXPORT_ROWS = 200;

class CertificateSerialConflictError extends Error {
  constructor(readonly serialNumber: string) {
    super("يوجد كود شهادة مستخدم بالفعل");
  }
}

const CERTIFICATE_IMAGE_HIDDEN_ELEMENTS = [
  "logo",
  "certificateTitle",
  "recipientName",
  "programTitle",
  "issuerName",
  "issueDate",
  "serialNumber",
  "qrCode",
  "signature",
  "signatures",
  "partners",
];
const DEFAULT_VERIFY_SETTINGS = {
  pageTitle: "التحقق من الشهادات",
  pageSubtitle: "تأكد من صحة الشهادة وحالتها بالبحث عن رقمها أو بمسح رمز QR المطبوع عليها.",
  logoUrl: "",
  successTitle: "الشهادة صحيحة وسارية",
  successMessage: "هذه الشهادة موثقة وصادرة من Arkan Web.",
  cancelledTitle: "الشهادة ملغاة",
  cancelledMessage: "تم إلغاء هذه الشهادة وهي غير صالحة للاستخدام.",
  notFoundMessage: "لم يتم العثور على شهادة بهذا الرقم.",
  footerText: "",
  visibleFields: {
    recipientName: true,
    programTitle: true,
    issuerName: true,
    issueDate: true,
    partners: true,
    serialNumber: true,
  },
  showCertificatePreview: true,
  allowDownloadPdf: true,
  allowDownloadImage: true,
  showLegacyNote: true,
};
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
  return hasAdminPermission(req, ["certificate-studio", "certificates"]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

type CertificateVerifySettings = typeof DEFAULT_VERIFY_SETTINGS;

function validateVerifySettings(value: unknown): CertificateVerifySettings | null {
  if (!isRecord(value) || !isRecord(value.visibleFields)) return null;

  const stringFields = [
    "pageTitle",
    "pageSubtitle",
    "logoUrl",
    "successTitle",
    "successMessage",
    "cancelledTitle",
    "cancelledMessage",
    "notFoundMessage",
    "footerText",
  ] as const;
  const normalized: Record<string, string> = {};
  for (const key of stringFields) {
    const field = value[key];
    if (typeof field !== "string" || field.length > (key === "logoUrl" ? 2048 : 1000)) return null;
    normalized[key] = field.trim();
  }

  if (normalized.logoUrl) {
    try {
      const logoUrl = new URL(normalized.logoUrl);
      if (logoUrl.protocol !== "http:" && logoUrl.protocol !== "https:") return null;
    } catch {
      return null;
    }
  }

  const visibleFields: Record<string, boolean> = {};
  for (const key of Object.keys(DEFAULT_VERIFY_SETTINGS.visibleFields) as Array<keyof typeof DEFAULT_VERIFY_SETTINGS.visibleFields>) {
    if (typeof value.visibleFields[key] !== "boolean") return null;
    visibleFields[key] = value.visibleFields[key] as boolean;
  }
  for (const key of ["showCertificatePreview", "allowDownloadPdf", "allowDownloadImage"] as const) {
    if (typeof value[key] !== "boolean") return null;
  }
  if (value.showLegacyNote !== undefined && typeof value.showLegacyNote !== "boolean") return null;

  return {
    pageTitle: normalized.pageTitle,
    pageSubtitle: normalized.pageSubtitle,
    logoUrl: normalized.logoUrl,
    successTitle: normalized.successTitle,
    successMessage: normalized.successMessage,
    cancelledTitle: normalized.cancelledTitle,
    cancelledMessage: normalized.cancelledMessage,
    notFoundMessage: normalized.notFoundMessage,
    footerText: normalized.footerText,
    visibleFields: {
      recipientName: visibleFields.recipientName,
      programTitle: visibleFields.programTitle,
      issuerName: visibleFields.issuerName,
      issueDate: visibleFields.issueDate,
      partners: visibleFields.partners,
      serialNumber: visibleFields.serialNumber,
    },
    showCertificatePreview: value.showCertificatePreview as boolean,
    allowDownloadPdf: value.allowDownloadPdf as boolean,
    allowDownloadImage: value.allowDownloadImage as boolean,
    showLegacyNote: typeof value.showLegacyNote === "boolean" ? value.showLegacyNote : true,
  };
}

async function getCertificateVerifySettings(): Promise<CertificateVerifySettings> {
  const [row] = await db.select({ settings: certificateVerifySettingsTable.settings })
    .from(certificateVerifySettingsTable)
    .where(eq(certificateVerifySettingsTable.id, 1))
    .limit(1);
  if (!isRecord(row?.settings)) return DEFAULT_VERIFY_SETTINGS;

  const current = row.settings;
  const visibleFields = isRecord(current.visibleFields) ? current.visibleFields : {};
  return validateVerifySettings({
    ...DEFAULT_VERIFY_SETTINGS,
    ...current,
    visibleFields: { ...DEFAULT_VERIFY_SETTINGS.visibleFields, ...visibleFields },
  }) ?? DEFAULT_VERIFY_SETTINGS;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "certificate";
}

function certificateFileName(value: string, fallback: string): string {
  const safeName = value
    .normalize("NFC")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/^[.\s-]+|[.\s-]+$/g, "")
    .slice(0, 100);
  return safeName || fallback;
}

function isValidSerialNumber(value: string): boolean {
  return value.length > 0 && value.length <= 100 && !/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/.test(value);
}

function isUploadedCertificateImage(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2048) return false;
  try {
    const parsed = new URL(value);
    const storageUrl = process.env.SUPABASE_URL;
    return Boolean(
      storageUrl &&
      (parsed.protocol === "http:" || parsed.protocol === "https:") &&
      !parsed.username &&
      !parsed.password &&
      parsed.hostname === new URL(storageUrl).hostname,
    );
  } catch {
    return false;
  }
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

async function generateSerialNumber(executor: Pick<typeof db, "execute" | "select"> = db): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `AW-CERT-${year}-`;
  for (let attempt = 0; attempt < 999_999; attempt += 1) {
    const result = (await executor.execute(sql`
      SELECT nextval('certificate_issue_serial_seq') AS count
    `)) as any;
    const row = Array.isArray(result?.rows) ? result.rows[0] : result?.[0] ?? null;
    const count = Number(row?.count ?? 1);
    if (!Number.isInteger(count) || count < 1 || count > 999_999) {
      throw new Error("تم استنفاد أرقام الشهادات المتاحة لهذا النمط");
    }
    const serialNumber = `${prefix}${String(count).padStart(6, "0")}`;
    const [existing] = await executor.select({ id: certificateIssuesTable.id })
      .from(certificateIssuesTable)
      .where(eq(certificateIssuesTable.serialNumber, serialNumber))
      .limit(1);
    if (!existing) return serialNumber;
  }
  throw new Error("تم استنفاد أرقام الشهادات المتاحة لهذا النمط");
}

function buildValidationUrl(serialNumber: string): string {
  const baseUrl = (process.env.PUBLIC_APP_URL || "https://arkan-platform.onrender.com").replace(/\/+$/, "");
  return `${baseUrl}/certificate/verify?serial=${encodeURIComponent(serialNumber)}`;
}

function publicCertificateImageUrl(issue: any, allowCancelled = false): string {
  const endpoint = allowCancelled ? "image-preview" : "image";
  const version = issue.updatedAt instanceof Date ? issue.updatedAt.getTime() : "";
  return `/api/certificates/public/${encodeURIComponent(issue.serialNumber)}/${endpoint}${version ? `?v=${version}` : ""}`;
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

function certificateExportFileNames(items: any[], extension: string): string[] {
  const usedNames = new Set<string>();
  return items.map((item) => {
    const baseName = certificateFileName(item.recipientName, `certificate-${item.serialNumber}`);
    const firstChoice = `${baseName}.${extension}`;
    let uniqueName = usedNames.has(firstChoice) ? `${baseName}-${item.serialNumber}.${extension}` : firstChoice;
    let suffix = 2;
    while (usedNames.has(uniqueName)) {
      uniqueName = `${baseName}-${item.serialNumber}-${suffix}.${extension}`;
      suffix += 1;
    }
    usedNames.add(uniqueName);
    return uniqueName;
  });
}

async function makeCertificatesWorkbook(items: any[], fileExtension = "pdf"): Promise<Buffer> {
  const fileNames = certificateExportFileNames(items, fileExtension);
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
    "اسم الملف",
    "بريد المستفيد",
  ];
  const rows = [columns, ...items.map((item, index) => [
    item.serialNumber,
    item.recipientName,
    item.programTitle,
    item.issueDate ? new Date(item.issueDate).toISOString() : "",
    item.deletedAt ? "في سلة المحذوفات" : item.status === "issued" ? "سارية" : item.status === "cancelled" ? "ملغاة" : item.status === "reserved" ? "محجوزة" : "مسودة",
    item.issuerName,
    (Array.isArray(item.metadata?.partnerSnapshots) ? item.metadata.partnerSnapshots : []).map((partner: any) => partner.name).join("، "),
    item.validationUrl,
    item.createdAt ? new Date(item.createdAt).toISOString() : "",
    item.updatedAt ? new Date(item.updatedAt).toISOString() : "",
    fileNames[index],
    item.recipientEmail || "",
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
  if (status && ["issued", "cancelled", "draft", "reserved"].includes(status)) filters.push(eq(certificateIssuesTable.status, status));
  const source = typeof req.query.source === "string" ? req.query.source : "";
  if (source === "legacy") {
    filters.push(sql`${certificateIssuesTable.metadata}->>'source' = 'legacy-certificate-image'`);
  } else if (source === "uploaded-images") {
    filters.push(sql`${certificateIssuesTable.metadata}->>'source' IN ('uploaded-certificate-image', 'attached-certificate-image')`);
  } else if (source === "reserved") {
    filters.push(eq(certificateIssuesTable.status, "reserved"));
  } else if (source === "normal") {
    filters.push(sql`coalesce(${certificateIssuesTable.metadata}->>'source', '') NOT IN ('uploaded-certificate-image', 'attached-certificate-image', 'legacy-certificate-image', 'reserved-code')`);
  }
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
  const issueMetadata = issue?.metadata && typeof issue.metadata === "object" ? issue.metadata : {};
  const issueLayout = issueMetadata.layoutConfig;
  return {
    ...template,
    ...(typeof issueMetadata.backgroundUrl === "string" ? { backgroundUrl: issueMetadata.backgroundUrl } : {}),
    ...(Number.isFinite(Number(issueMetadata.width)) ? { width: Number(issueMetadata.width) } : {}),
    ...(Number.isFinite(Number(issueMetadata.height)) ? { height: Number(issueMetadata.height) } : {}),
    ...(issueMetadata.orientation === "portrait" || issueMetadata.orientation === "landscape"
      ? { orientation: issueMetadata.orientation }
      : {}),
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
    if (layout.whiteBackgroundBehindQr === true) {
      const padding = Math.max(Math.min(qrBox.width, qrBox.height) * 0.06, 4);
      doc.save().fillColor("#ffffff")
        .rect(qrBox.x - padding, qrBox.y - padding, qrBox.width + padding * 2, qrBox.height + padding * 2)
        .fill().restore();
    }
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

async function renderPdfToImage(pdfBuffer: Buffer, format: "png" | "jpg" = "png"): Promise<Buffer> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = getDocument({
    data: new Uint8Array(pdfBuffer),
    useSystemFonts: true,
  });

  try {
    const document = await loadingTask.promise;
    const page = await document.getPage(1);
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = Math.min(1.25, 2000 / Math.max(baseViewport.width, baseViewport.height));
    const viewport = page.getViewport({ scale });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const context = canvas.getContext("2d");
    await page.render({ canvas: null, canvasContext: context, viewport }).promise;
    return format === "jpg"
      ? canvas.toBuffer("image/jpeg", 90)
      : canvas.toBuffer("image/png");
  } finally {
    await loadingTask.destroy();
  }
}

async function generateCertificateImageBuffer(issue: any, format: "png" | "jpg" = "png"): Promise<Buffer> {
  const [template] = await db.select().from(certificateTemplatesTable)
    .where(eq(certificateTemplatesTable.id, issue.templateId)).limit(1);
  const pdfBuffer = await generateCertificatePdfBuffer(
    issue,
    templateForIssue(issue, template ?? {
      width: 1200,
      height: 800,
      orientation: "landscape",
      backgroundUrl: null,
      logoUrl: null,
      signatureUrl: null,
      layoutConfig: DEFAULT_LAYOUT,
    }),
    await getIssuePartners(issue),
  );
  return renderPdfToImage(pdfBuffer, format);
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
      else if (row.status === "reserved") result.reserved += 1;
    }
    return result;
  }, { total: 0, issued: 0, cancelled: 0, drafts: 0, reserved: 0, trash: 0 });
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

router.get("/certificates/verify-settings", async (_req, res): Promise<void> => {
  res.setHeader("Cache-Control", "no-store");
  res.json(await getCertificateVerifySettings());
});

router.put("/certificates/verify-settings", async (req, res): Promise<void> => {
  if (!(await ensureAdmin(req))) {
    res.status(403).json({ error: "غير مصرح" });
    return;
  }

  const settings = validateVerifySettings(req.body);
  if (!settings) {
    res.status(400).json({ error: "إعدادات صفحة التحقق غير صالحة" });
    return;
  }

  const [saved] = await db.insert(certificateVerifySettingsTable)
    .values({ id: 1, settings, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: certificateVerifySettingsTable.id,
      set: { settings, updatedAt: new Date() },
    })
    .returning({ settings: certificateVerifySettingsTable.settings });
  res.setHeader("Cache-Control", "no-store");
  res.json(saved.settings);
});

async function serveCertificateImage(
  req: any,
  res: any,
  allowCancelled: boolean,
): Promise<void> {
  const serial = String(req.params.serial || "").trim();
  if (!isValidSerialNumber(serial)) {
    res.status(404).json({ error: "الشهادة غير موجودة أو غير صالحة للعرض" });
    return;
  }
  const [issue] = await db.select().from(certificateIssuesTable)
    .where(and(
      eq(certificateIssuesTable.serialNumber, serial),
      isNull(certificateIssuesTable.deletedAt),
    ))
    .limit(1);
  if (!issue || (issue.status !== "issued" && !(allowCancelled && issue.status === "cancelled"))) {
    res.status(404).json({ error: "الشهادة غير موجودة أو غير صالحة للعرض" });
    return;
  }
  const download = req.query.download === "1";
  if (download && (issue.status !== "issued" || !(await getCertificateVerifySettings()).allowDownloadImage)) {
    res.status(403).json({ error: "تنزيل صور الشهادات غير متاح حالياً" });
    return;
  }

  const image = await generateCertificateImageBuffer(issue);
  const etag = `"${createHash("sha256").update(image).digest("hex")}"`;
  res.setHeader("Content-Type", "image/png");
  res.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=60");
  res.setHeader("ETag", etag);
  res.setHeader("Content-Disposition", `${download ? "attachment" : "inline"}; filename="${certificateFileName(`${slugify(issue.recipientName)}-${issue.serialNumber}`, "certificate")}.png"`);
  if (req.headers["if-none-match"] === etag) {
    res.status(304).end();
    return;
  }
  res.end(image);
}

router.get("/certificates/verify", async (req, res): Promise<void> => {
  const settings = await getCertificateVerifySettings();
  const serial = String(req.query.serial || "").trim();
  if (!serial) {
    res.status(400).json({ valid: false, error: "أدخل رقم الشهادة للتحقق منها" });
    return;
  }
  if (!isValidSerialNumber(serial)) {
    res.status(400).json({ valid: false, error: "رقم الشهادة غير صالح" });
    return;
  }

  const [issue] = await db.select().from(certificateIssuesTable).where(eq(certificateIssuesTable.serialNumber, serial)).limit(1);

  if (!issue || issue.deletedAt) {
    res.status(404).json({ valid: false, error: settings.notFoundMessage });
    return;
  }

  if (issue.status !== "issued") {
    if (issue.status !== "cancelled") {
      res.status(404).json({ valid: false, error: settings.notFoundMessage });
      return;
    }
    const partners = await getIssuePartners(issue);
    const certificate: Record<string, unknown> = {
      status: issue.status,
      imageUrl: publicCertificateImageUrl(issue, true),
    };
    if (isRecord(issue.metadata) && issue.metadata.source === "legacy-certificate-image") {
      certificate.source = "legacy-certificate-image";
      certificate.verifiedAt = issue.createdAt;
    }
    if (settings.visibleFields.serialNumber) certificate.serialNumber = issue.serialNumber;
    if (settings.visibleFields.recipientName) certificate.recipientName = issue.recipientName;
    if (settings.visibleFields.programTitle) certificate.programTitle = issue.programTitle;
    if (settings.visibleFields.issuerName) certificate.issuerName = issue.issuerName;
    if (settings.visibleFields.issueDate) certificate.issueDate = issue.issueDate;
    if (settings.visibleFields.partners) certificate.partners = partners.map((partner) => String(partner.name || "")).filter(Boolean);
    res.status(410).json({
      valid: false,
      cancelled: issue.status === "cancelled",
      status: issue.status,
      error: settings.cancelledMessage,
      certificate,
    });
    return;
  }

  const partners = await getIssuePartners(issue);
  const certificate: Record<string, unknown> = {
    status: "issued",
  };
  certificate.imageUrl = publicCertificateImageUrl(issue);
  if (isRecord(issue.metadata) && issue.metadata.source === "legacy-certificate-image") {
    certificate.source = "legacy-certificate-image";
    certificate.verifiedAt = issue.createdAt;
  }
  if (settings.allowDownloadPdf) {
    certificate.pdfUrl = `/api/certificates/public/${encodeURIComponent(issue.serialNumber)}/pdf`;
  }
  if (settings.visibleFields.serialNumber) certificate.serialNumber = issue.serialNumber;
  if (settings.visibleFields.recipientName) certificate.recipientName = issue.recipientName;
  if (settings.visibleFields.programTitle) certificate.programTitle = issue.programTitle;
  if (settings.visibleFields.issuerName) certificate.issuerName = issue.issuerName;
  if (settings.visibleFields.issueDate) certificate.issueDate = issue.issueDate;
  if (settings.visibleFields.partners) certificate.partners = partners.map((partner) => String(partner.name || "")).filter(Boolean);
  res.json({
    valid: true,
    certificate,
  });
});

router.get("/certificates/public/:serial/image", async (req, res): Promise<void> => {
  await serveCertificateImage(req, res, false);
});

router.get("/certificates/public/:serial/image-preview", async (req, res): Promise<void> => {
  await serveCertificateImage(req, res, true);
});

router.get("/certificates/public/:serial/pdf", async (req, res): Promise<void> => {
  const serial = String(req.params.serial || "").trim();
  if (!isValidSerialNumber(serial)) {
    res.status(404).json({ error: "الشهادة غير موجودة أو غير صالحة للتنزيل" });
    return;
  }
  const [issue] = await db.select().from(certificateIssuesTable)
    .where(eq(certificateIssuesTable.serialNumber, serial)).limit(1);
  if (!issue || issue.status !== "issued" || issue.deletedAt) {
    res.status(404).json({ error: "الشهادة غير موجودة أو غير صالحة للتنزيل" });
    return;
  }
  const settings = await getCertificateVerifySettings();
  if (!settings.allowDownloadPdf) {
    res.status(403).json({ error: "تنزيل ملفات PDF غير متاح حالياً" });
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
  res.setHeader("Content-Disposition", `${disposition}; filename="${certificateFileName(`${slugify(issue.recipientName)}-${issue.serialNumber}`, "certificate")}.pdf"`);
  res.setHeader("Cache-Control", "no-store");
  res.end(pdfBuffer);
});

router.get("/certificates/qr", async (req, res): Promise<void> => {
  const serial = String(req.query.serial || "").trim();
  if (!isValidSerialNumber(serial)) {
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

router.post("/certificates/bulk-from-names", async (req, res): Promise<void> => {
  if (!(await ensureAdmin(req))) {
    res.status(403).json({ error: "غير مصرح" });
    return;
  }

  const body = req.body ?? {};
  const templateId = Number(body.templateId);
  const rows = Array.isArray(body.rows) ? body.rows : [];
  const programTitle = typeof body.programTitle === "string" ? body.programTitle.trim().slice(0, 300) : "";
  const issuerName = typeof body.issuerName === "string" ? body.issuerName.trim().slice(0, 200) : "";
  const issueDate = parseCertificateDate(body.issueDate);
  if (!Number.isInteger(templateId) || templateId < 1) {
    res.status(400).json({ error: "يجب اختيار قالب صحيح للشهادات" });
    return;
  }
  if (rows.length < 1 || rows.length > MAX_BULK_NAME_ROWS) {
    res.status(400).json({ error: `يجب إدخال اسم واحد على الأقل وبحد أقصى ${MAX_BULK_NAME_ROWS} اسم` });
    return;
  }
  if (!programTitle || !issuerName || !issueDate) {
    res.status(400).json({ error: "اسم الدورة والجهة المصدرة وتاريخ الإصدار حقول مطلوبة" });
    return;
  }

  const normalizedRows: Array<{ name: string; email: string | null }> = [];
  for (const row of rows) {
    if (!isRecord(row) || typeof row.name !== "string") {
      res.status(400).json({ error: "توجد بيانات اسم غير صالحة في القائمة" });
      return;
    }
    const name = row.name.trim().replace(/\s+/g, " ").slice(0, 200);
    const rawEmail = typeof row.email === "string" ? row.email.trim() : "";
    if (rawEmail.length > 320) {
      res.status(400).json({ error: `البريد الإلكتروني طويل أكثر من اللازم للاسم «${name}»` });
      return;
    }
    const email = rawEmail || null;
    if (!name) {
      res.status(400).json({ error: "لا يمكن إصدار شهادة لاسم فارغ" });
      return;
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: `البريد الإلكتروني غير صالح للاسم «${name}»` });
      return;
    }
    normalizedRows.push({ name, email });
  }

  const [template] = await db.select({ id: certificateTemplatesTable.id })
    .from(certificateTemplatesTable)
    .where(eq(certificateTemplatesTable.id, templateId))
    .limit(1);
  if (!template) {
    res.status(404).json({ error: "القالب غير موجود" });
    return;
  }

  let selectedPartners: { ids: number[]; snapshots: any[] };
  try {
    selectedPartners = await getPartnerSnapshots(body.partnerIds);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "تعذر التحقق من المؤسسات المختارة" });
    return;
  }
  const signatures = normalizeSignatures(body.signatures);
  const layoutConfig = normalizeLayout(body.layoutConfig ?? {});
  const serialNumbers = await Promise.all(normalizedRows.map(() => generateSerialNumber()));
  const issueResult = await db.transaction(async (tx) => {
    const [currentTemplate] = await tx.select({ id: certificateTemplatesTable.id })
      .from(certificateTemplatesTable)
      .where(eq(certificateTemplatesTable.id, templateId))
      .for("share")
      .limit(1);
    if (!currentTemplate) return { templateMissing: true as const };

    const certificates = await tx.insert(certificateIssuesTable).values(normalizedRows.map((row, index) => {
      const serialNumber = serialNumbers[index];
      const validationUrl = buildValidationUrl(serialNumber);
      return {
        templateId,
        serialNumber,
        validationUrl,
        recipientName: row.name,
        recipientEmail: row.email,
        programTitle,
        issuerName,
        issueDate,
        status: "issued",
        metadata: {
          signatures,
          partnerIds: selectedPartners.ids,
          partnerSnapshots: selectedPartners.snapshots,
          layoutConfig,
        },
        qrCodeUrl: validationUrl,
      };
    })).returning();
    return { templateMissing: false as const, certificates };
  });
  if (issueResult.templateMissing) {
    res.status(404).json({ error: "القالب غير موجود" });
    return;
  }
  const { certificates } = issueResult;

  const nameCounts = new Map<string, { name: string; count: number }>();
  for (const row of normalizedRows) {
    const key = row.name.normalize("NFC").toLocaleLowerCase("ar-EG");
    const previous = nameCounts.get(key);
    nameCounts.set(key, { name: previous?.name ?? row.name, count: (previous?.count ?? 0) + 1 });
  }
  const duplicateNames = [...nameCounts.values()].filter((item) => item.count > 1).map((item) => item.name);
  res.status(201).json({
    count: certificates.length,
    certificates,
    duplicateNames,
    warnings: duplicateNames.length ? ["توجد أسماء مكررة؛ تم إصدار شهادة مستقلة لكل تكرار"] : [],
  });
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

router.post("/certificates/bulk-issue-images", async (req, res): Promise<void> => {
  if (!(await ensureAdmin(req))) {
    res.status(403).json({ error: "غير مصرح" });
    return;
  }

  const body = req.body ?? {};
  const inputCertificates = Array.isArray(body.certificates) ? body.certificates : [];
  const isLegacyCertificateBatch = body.source === "legacy-certificate-image";
  if (inputCertificates.length < 1 || inputCertificates.length > 50) {
    res.status(400).json({ error: "ارفع شهادة واحدة على الأقل، وبحد أقصى 50 شهادة في الدفعة" });
    return;
  }
  const layoutConfig = normalizeLayout(body.layoutConfig ?? {});
  const readyRecords: Array<{
    backgroundUrl: string;
    width: number;
    height: number;
    orientation: string;
    issueDate: Date;
    serialNumber: string;
    validationUrl: string;
    programTitle: string;
    recipientName: string;
    issuerName: string;
    recipientEmail: string | null;
    layoutConfig: Record<string, any>;
  }> = [];
  for (const item of inputCertificates) {
    if (!item || typeof item !== "object" || typeof item.recipientName !== "string" ||
        !item.recipientName.trim() || !isUploadedCertificateImage(item.backgroundUrl)) {
      res.status(400).json({ error: "تأكد من وجود اسم صاحب كل شهادة ورفع صورها إلى مخزن الشهادات" });
      return;
    }
    const issueDate = typeof item.issueDate === "string" ? parseCertificateDate(item.issueDate) : new Date();
    if (!issueDate) {
      res.status(400).json({ error: "يوجد تاريخ إصدار غير صالح ضمن الشهادات" });
      return;
    }
    if (isLegacyCertificateBatch) {
      const today = new Date().toISOString().slice(0, 10);
      const issueDateValue = typeof item.issueDate === "string" ? item.issueDate : "";
      if (!parseCertificateDate(issueDateValue) ||
          issueDateValue < "1990-01-01" ||
          issueDateValue > today) {
        res.status(400).json({ error: "تاريخ الشهادة القديمة يجب أن يكون من 1990 وحتى اليوم، وبصيغة YYYY-MM-DD" });
        return;
      }
    }
    const recipientEmail = typeof item.recipientEmail === "string" && item.recipientEmail.trim()
      ? item.recipientEmail.trim().slice(0, 320)
      : null;
    if (recipientEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
      res.status(400).json({ error: "يوجد بريد إلكتروني غير صالح ضمن الشهادات" });
      return;
    }
    const hiddenElements = new Set<string>(
      Array.isArray(layoutConfig.hiddenElements) ? layoutConfig.hiddenElements : [],
    );
    const hasProgramTitle = typeof item.programTitle === "string" && Boolean(item.programTitle.trim());
    const programTitle = hasProgramTitle
      ? item.programTitle.trim().slice(0, 300)
      : "توثيق شهادة";
    if (!hasProgramTitle) hiddenElements.add("programTitle");
    readyRecords.push({
      backgroundUrl: item.backgroundUrl,
      width: clamp(Number(item.width) || 1200, 300, 5000),
      height: clamp(Number(item.height) || 800, 300, 5000),
      orientation: String(item.orientation) === "portrait" ? "portrait" : "landscape",
      issueDate,
      serialNumber: "",
      validationUrl: "",
      programTitle,
      recipientName: item.recipientName.trim().slice(0, 200),
      issuerName: typeof item.issuerName === "string" && item.issuerName.trim()
        ? item.issuerName.trim().slice(0, 200)
        : "Arkan Web",
      recipientEmail,
      layoutConfig: { ...layoutConfig, hiddenElements: [...hiddenElements] },
    });
  }

  if (isLegacyCertificateBatch && body.confirmDuplicates !== true) {
    const duplicateConditions = readyRecords.map((record) => and(
      sql`lower(${certificateIssuesTable.recipientName}) = lower(${record.recipientName})`,
      eq(certificateIssuesTable.issueDate, record.issueDate),
      sql`lower(${certificateIssuesTable.programTitle}) = lower(${record.programTitle})`,
      isNull(certificateIssuesTable.deletedAt),
    )).filter((condition): condition is NonNullable<typeof condition> => Boolean(condition));
    const existingDuplicates = duplicateConditions.length
      ? await db.select({
        id: certificateIssuesTable.id,
        serialNumber: certificateIssuesTable.serialNumber,
        recipientName: certificateIssuesTable.recipientName,
        programTitle: certificateIssuesTable.programTitle,
        issueDate: certificateIssuesTable.issueDate,
      }).from(certificateIssuesTable).where(or(...duplicateConditions))
      : [];
    const existingByKey = new Map<string, typeof existingDuplicates>();
    const duplicateKey = (record: { recipientName: string; issueDate: Date; programTitle: string }) =>
      `${record.recipientName.trim().toLocaleLowerCase()}|${record.issueDate.toISOString().slice(0, 10)}|${record.programTitle.trim().toLocaleLowerCase()}`;
    for (const existing of existingDuplicates) {
      const key = duplicateKey(existing);
      existingByKey.set(key, [...(existingByKey.get(key) ?? []), existing]);
    }
    const seenInputs = new Map<string, number>();
    const duplicates = readyRecords.flatMap((record) => {
      const key = duplicateKey(record);
      const count = (seenInputs.get(key) ?? 0) + 1;
      seenInputs.set(key, count);
      const matches = existingByKey.get(key) ?? [];
      return matches.length || count > 1
        ? [{
          recipientName: record.recipientName,
          programTitle: record.programTitle,
          issueDate: record.issueDate.toISOString().slice(0, 10),
          existingSerialNumbers: matches.map((match) => match.serialNumber),
          repeatedInBatch: count > 1,
        }]
        : [];
    });
    if (duplicates.length) {
      res.status(200).json({ confirmationRequired: true, duplicates });
      return;
    }
  }

  for (const record of readyRecords) {
    record.serialNumber = await generateSerialNumber();
    record.validationUrl = buildValidationUrl(record.serialNumber);
  }

  const { userId } = getSessionUser(req);
  const certificates = await db.transaction(async (tx) => {
    const created = [];
    await tx.execute(sql`SELECT pg_advisory_xact_lock(62142, 31007)`);
    let [template] = await tx.select().from(certificateTemplatesTable)
      .where(eq(certificateTemplatesTable.name, UPLOADED_CERTIFICATE_TEMPLATE_NAME))
      .for("update")
      .limit(1);
    if (!template) {
      [template] = await tx.insert(certificateTemplatesTable).values({
        name: UPLOADED_CERTIFICATE_TEMPLATE_NAME,
        orientation: "landscape",
        width: 1200,
        height: 800,
        layoutConfig,
        createdBy: userId ?? null,
      }).returning();
    }

    for (const record of readyRecords) {
      const [issue] = await tx.insert(certificateIssuesTable).values({
        templateId: template.id,
        serialNumber: record.serialNumber,
        validationUrl: record.validationUrl,
        qrCodeUrl: record.validationUrl,
        recipientName: record.recipientName,
        recipientEmail: record.recipientEmail,
        programTitle: record.programTitle,
        issuerName: record.issuerName,
        issueDate: record.issueDate,
        status: "issued",
        metadata: {
          signatures: [],
          partnerIds: [],
          partnerSnapshots: [],
          layoutConfig: record.layoutConfig,
          backgroundUrl: record.backgroundUrl,
          width: record.width,
          height: record.height,
          orientation: record.orientation,
          source: isLegacyCertificateBatch ? "legacy-certificate-image" : "uploaded-certificate-image",
          ...(isLegacyCertificateBatch ? { originalIssueYear: record.issueDate.getUTCFullYear() } : {}),
        },
      }).returning();
      created.push(issue);
    }
    return created;
  });

  res.status(201).json({ count: certificates.length, certificates, duplicates: [] });
});

router.post("/certificates/reserve", async (req, res): Promise<void> => {
  if (!(await ensureAdmin(req))) {
    res.status(403).json({ error: "غير مصرح" });
    return;
  }

  const body = req.body ?? {};
  const hasCount = Object.prototype.hasOwnProperty.call(body, "count");
  const hasRows = Object.prototype.hasOwnProperty.call(body, "rows");
  const hasSerialNumbers = Object.prototype.hasOwnProperty.call(body, "serialNumbers");
  if ([hasCount, hasRows, hasSerialNumbers].filter(Boolean).length !== 1) {
    res.status(400).json({ error: "أرسل عدد الأكواد أو قائمة الأسماء أو قائمة الأكواد المخصصة" });
    return;
  }

  let rows: { name: string; email: string | null }[];
  let customSerialNumbers: string[] | null = null;
  if (hasCount) {
    if (!Number.isInteger(body.count) || body.count < 1 || body.count > MAX_BULK_NAME_ROWS) {
      res.status(400).json({ error: `عدد الأكواد يجب أن يكون بين 1 و${MAX_BULK_NAME_ROWS}` });
      return;
    }
    rows = Array.from({ length: body.count }, () => ({ name: "بدون اسم", email: null }));
  } else if (hasRows) {
    if (!Array.isArray(body.rows) || body.rows.length < 1 || body.rows.length > MAX_BULK_NAME_ROWS) {
      res.status(400).json({ error: `قائمة الأسماء يجب أن تحتوي من 1 إلى ${MAX_BULK_NAME_ROWS} صف` });
      return;
    }
    rows = [];
    for (const row of body.rows) {
      if (!row || typeof row !== "object" ||
          (row.name !== undefined && typeof row.name !== "string") ||
          (row.email !== undefined && typeof row.email !== "string")) {
        res.status(400).json({ error: "يوجد صف باسم أو بريد إلكتروني غير صالح" });
        return;
      }
      const name = typeof row.name === "string" ? row.name.trim().replace(/\s+/g, " ").slice(0, 200) : "";
      const email = typeof row.email === "string" ? row.email.trim().slice(0, 320) : "";
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        res.status(400).json({ error: "يوجد بريد إلكتروني غير صالح ضمن قائمة الحجز" });
        return;
      }
      rows.push({ name: name || "بدون اسم", email: email || null });
    }
  } else {
    if (!Array.isArray(body.serialNumbers) || body.serialNumbers.length < 1 || body.serialNumbers.length > MAX_BULK_NAME_ROWS) {
      res.status(400).json({ error: `قائمة الأكواد يجب أن تحتوي من 1 إلى ${MAX_BULK_NAME_ROWS} كود` });
      return;
    }
    customSerialNumbers = [];
    for (const value of body.serialNumbers) {
      if (typeof value !== "string") {
        res.status(400).json({ error: "كل كود شهادة يجب أن يكون نصاً صالحاً" });
        return;
      }
      const serialNumber = value.trim();
      if (!isValidSerialNumber(serialNumber)) {
        res.status(400).json({ error: "يجب أن يكون كل كود من 1 إلى 100 حرف ومن دون أسطر جديدة" });
        return;
      }
      customSerialNumbers.push(serialNumber);
    }
    if (new Set(customSerialNumbers).size !== customSerialNumbers.length) {
      res.status(400).json({ error: "قائمة الأكواد تحتوي على كود مكرر" });
      return;
    }
    rows = customSerialNumbers.map(() => ({ name: "بدون اسم", email: null }));
  }

  if (body.programTitle !== undefined && typeof body.programTitle !== "string" ||
      body.issuerName !== undefined && typeof body.issuerName !== "string" ||
      body.issueDate !== undefined && typeof body.issueDate !== "string") {
    res.status(400).json({ error: "بيانات الدورة أو التاريخ غير صالحة" });
    return;
  }
  const issueDate = typeof body.issueDate === "string" && body.issueDate.trim()
    ? parseCertificateDate(body.issueDate)
    : new Date();
  if (!issueDate) {
    res.status(400).json({ error: "تاريخ الإصدار غير صالح" });
    return;
  }
  const programTitle = typeof body.programTitle === "string" && body.programTitle.trim()
    ? body.programTitle.trim().slice(0, 300)
    : "توثيق شهادة";
  const issuerName = typeof body.issuerName === "string" && body.issuerName.trim()
    ? body.issuerName.trim().slice(0, 200)
    : "Arkan Web";
  const { userId } = getSessionUser(req);

  try {
    const certificates = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(62142, 31008)`);
      if (customSerialNumbers) {
        const [existing] = await tx.select({ serialNumber: certificateIssuesTable.serialNumber })
          .from(certificateIssuesTable)
          .where(inArray(certificateIssuesTable.serialNumber, customSerialNumbers))
          .limit(1);
        if (existing) throw new CertificateSerialConflictError(existing.serialNumber);
      }

      let [template] = await tx.select().from(certificateTemplatesTable)
        .where(eq(certificateTemplatesTable.name, RESERVED_CODE_TEMPLATE_NAME))
        .for("update")
        .limit(1);
      if (!template) {
        [template] = await tx.insert(certificateTemplatesTable).values({
          name: RESERVED_CODE_TEMPLATE_NAME,
          orientation: "landscape",
          width: 1200,
          height: 800,
          layoutConfig: DEFAULT_LAYOUT,
          createdBy: userId ?? null,
        }).returning();
      }

      const created = [];
      for (const [index, row] of rows.entries()) {
        const serialNumber = customSerialNumbers?.[index] ?? await generateSerialNumber(tx);
        const validationUrl = buildValidationUrl(serialNumber);
        const insert = tx.insert(certificateIssuesTable).values({
          templateId: template.id,
          serialNumber,
          validationUrl,
          qrCodeUrl: validationUrl,
          recipientName: row.name,
          recipientEmail: row.email,
          programTitle,
          issuerName,
          issueDate,
          status: "reserved",
          metadata: {
            signatures: [],
            partnerIds: [],
            partnerSnapshots: [],
            source: "reserved-code",
          },
        });
        const [issue] = customSerialNumbers
          ? await insert.onConflictDoNothing({ target: certificateIssuesTable.serialNumber }).returning()
          : await insert.returning();
        if (!issue) throw new CertificateSerialConflictError(serialNumber);
        created.push(issue);
      }
      return created;
    });

    res.status(201).json({ count: certificates.length, certificates });
  } catch (error) {
    if (error instanceof CertificateSerialConflictError) {
      res.status(409).json({ error: `${error.message}: ${error.serialNumber}` });
      return;
    }
    throw error;
  }
});

router.post("/certificates/attach-images", async (req, res): Promise<void> => {
  if (!(await ensureAdmin(req))) {
    res.status(403).json({ error: "غير مصرح" });
    return;
  }

  const items = req.body?.items;
  if (!Array.isArray(items) || items.length < 1 || items.length > 50) {
    res.status(400).json({ error: "أرسل من 1 إلى 50 صورة لربطها بالأكواد" });
    return;
  }

  const updated: any[] = [];
  const errors: { serialNumber: string; reason: string }[] = [];
  for (const item of items) {
    const serialNumber = typeof item?.serialNumber === "string" ? item.serialNumber.trim() : "";
    const fail = (reason: string) => errors.push({ serialNumber, reason });
    if (!isValidSerialNumber(serialNumber)) {
      fail("رقم التوثيق غير صالح");
      continue;
    }
    if (!isUploadedCertificateImage(item.backgroundUrl)) {
      fail("ارفع صورة الشهادة إلى مخزن الشهادات أولاً");
      continue;
    }
    if (!Number.isFinite(item.width) || !Number.isFinite(item.height) || item.width < 1 || item.height < 1) {
      fail("أبعاد صورة الشهادة غير صالحة");
      continue;
    }
    if (["recipientName", "programTitle", "issuerName", "issueDate", "recipientEmail"].some(
      (field) => item[field] !== undefined && item[field] !== null && typeof item[field] !== "string",
    )) {
      fail("بيانات الشهادة غير صالحة");
      continue;
    }
    const submittedEmail = typeof item.recipientEmail === "string" ? item.recipientEmail.trim().slice(0, 320) : "";
    if (submittedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(submittedEmail)) {
      fail("البريد الإلكتروني غير صالح");
      continue;
    }
    const submittedDate = typeof item.issueDate === "string" && item.issueDate.trim()
      ? parseCertificateDate(item.issueDate)
      : undefined;
    if (typeof item.issueDate === "string" && item.issueDate.trim() && !submittedDate) {
      fail("تاريخ الإصدار غير صالح");
      continue;
    }
    const width = clamp(Math.round(item.width), 300, 5000);
    const height = clamp(Math.round(item.height), 300, 5000);
    const orientation = item.orientation === "portrait" || item.orientation === "landscape"
      ? item.orientation
      : height > width ? "portrait" : "landscape";

    try {
      const issue = await db.transaction(async (tx) => {
        const [reserved] = await tx.select().from(certificateIssuesTable)
          .where(and(
            eq(certificateIssuesTable.serialNumber, serialNumber),
            eq(certificateIssuesTable.status, "reserved"),
            isNull(certificateIssuesTable.deletedAt),
          ))
          .for("update")
          .limit(1);
        if (!reserved) throw new Error("الكود غير موجود أو لم يعد محجوزاً");

        const submittedName = typeof item.recipientName === "string"
          ? item.recipientName.trim().replace(/\s+/g, " ").slice(0, 200)
          : "";
        const recipientName = submittedName || reserved.recipientName;
        if (!recipientName || recipientName === "بدون اسم") {
          throw new Error("أدخل اسم المستفيد قبل إصدار الشهادة");
        }
        const metadata: Record<string, any> = reserved.metadata && typeof reserved.metadata === "object"
          ? reserved.metadata as Record<string, any>
          : {};
        const oldLayout = metadata.layoutConfig && typeof metadata.layoutConfig === "object"
          ? metadata.layoutConfig
          : {};
        const nextMetadata = {
          ...metadata,
          backgroundUrl: item.backgroundUrl,
          width,
          height,
          orientation,
          source: "attached-certificate-image",
          layoutConfig: {
            ...oldLayout,
            hiddenElements: CERTIFICATE_IMAGE_HIDDEN_ELEMENTS,
          },
        };
        const [result] = await tx.update(certificateIssuesTable)
          .set({
            recipientName,
            ...(typeof item.programTitle === "string" && item.programTitle.trim()
              ? { programTitle: item.programTitle.trim().slice(0, 300) }
              : {}),
            ...(typeof item.issuerName === "string" && item.issuerName.trim()
              ? { issuerName: item.issuerName.trim().slice(0, 200) }
              : {}),
            ...(submittedDate ? { issueDate: submittedDate } : {}),
            ...(submittedEmail ? { recipientEmail: submittedEmail } : {}),
            status: "issued",
            metadata: nextMetadata,
            updatedAt: new Date(),
          })
          .where(and(eq(certificateIssuesTable.id, reserved.id), eq(certificateIssuesTable.status, "reserved")))
          .returning();
        if (!result) throw new Error("تعذر تحديث الكود المحجوز");
        return result;
      });
      updated.push(issue);
    } catch (error) {
      fail(error instanceof Error ? error.message : "تعذر ربط صورة الشهادة");
    }
  }

  res.status(200).json({ updated, errors });
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

  const printableItems = items.filter((item) => item.status === "issued" || item.status === "cancelled");
  if (printableItems.length === 0) {
    res.status(404).json({ error: "لا توجد شهادات صادرة مطابقة للتنزيل" });
    return;
  }

  const zip = new JSZip();
  const usedFileNames = new Set<string>();

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
    const personName = certificateFileName(issue.recipientName, `certificate-${issue.serialNumber}`);
    const fileName = usedFileNames.has(personName)
      ? `${personName}-${issue.serialNumber}`
      : personName;
    usedFileNames.add(personName);
    zip.file(`${fileName}.pdf`, pdfBuffer);
  }

  const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="certificates-${Date.now()}.zip"`);
  res.end(zipBuffer);
});

router.get("/certificates/reserved-export", async (req, res): Promise<void> => {
  if (!(await ensureAdmin(req))) {
    res.status(403).json({ error: "غير مصرح" });
    return;
  }

  const idsParam = typeof req.query.ids === "string" ? req.query.ids.trim() : "";
  const ids = idsParam ? [...new Set(idsParam.split(",").map((value) => Number(value.trim())))] : [];
  if (idsParam && (ids.length === 0 || ids.some((id) => !Number.isInteger(id) || id < 1))) {
    res.status(400).json({ error: "قائمة أرقام الأكواد غير صالحة" });
    return;
  }
  const items = ids.length
    ? await db.select().from(certificateIssuesTable).where(and(
      inArray(certificateIssuesTable.id, ids),
      eq(certificateIssuesTable.status, "reserved"),
      isNull(certificateIssuesTable.deletedAt),
    )).orderBy(certificateIssuesTable.id)
    : await db.select().from(certificateIssuesTable).where(and(
      eq(certificateIssuesTable.status, "reserved"),
      isNull(certificateIssuesTable.deletedAt),
    )).orderBy(certificateIssuesTable.id);
  if (!items.length) {
    res.status(404).json({ error: "لا توجد أكواد محجوزة للتنزيل" });
    return;
  }

  const zip = new JSZip();
  for (const issue of items) {
    const namePrefix = issue.recipientName && issue.recipientName !== "بدون اسم"
      ? `${certificateFileName(issue.recipientName, "certificate").slice(0, 80)}-${issue.serialNumber}`
      : issue.serialNumber;
    zip.file(`${certificateFileName(namePrefix, issue.serialNumber)}.png`, await QRCode.toBuffer(
      issue.validationUrl,
      { type: "png", width: 1000, margin: 1 },
    ));
  }
  zip.file("codes.xlsx", await makeCertificatesWorkbook(items, "png"));
  const archive = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="reserved-certificate-codes-${Date.now()}.zip"`);
  res.setHeader("Cache-Control", "no-store");
  res.end(archive);
});

router.get("/certificates/export-images-zip", async (req, res): Promise<void> => {
  if (!(await ensureAdmin(req))) {
    res.status(403).json({ error: "غير مصرح" });
    return;
  }

  const format = req.query.format === "jpg" ? "jpg" : "png";
  const idsParam = typeof req.query.ids === "string" ? req.query.ids.trim() : "";
  const ids = idsParam
    ? [...new Set(idsParam.split(",").map((value) => Number(value.trim())))]
    : [];
  if (idsParam && (ids.length === 0 || ids.some((id) => !Number.isInteger(id) || id < 1))) {
    res.status(400).json({ error: "قائمة أرقام الشهادات غير صالحة" });
    return;
  }
  if (ids.length > MAX_IMAGE_EXPORT_ROWS) {
    res.status(413).json({ error: `يمكن تنزيل ${MAX_IMAGE_EXPORT_ROWS} شهادة كحد أقصى في الملف الواحد` });
    return;
  }

  const items = ids.length
    ? await db.select().from(certificateIssuesTable)
      .where(and(inArray(certificateIssuesTable.id, ids), isNull(certificateIssuesTable.deletedAt)))
      .orderBy(desc(certificateIssuesTable.createdAt))
    : await db.select().from(certificateIssuesTable)
      .where(certificateFilter(req))
      .orderBy(desc(certificateIssuesTable.createdAt));
  const printableItems = items.filter((item) => item.status === "issued" || item.status === "cancelled");
  if (!printableItems.length) {
    res.status(404).json({ error: "لا توجد شهادات صادرة مطابقة للتنزيل" });
    return;
  }
  if (printableItems.length > MAX_IMAGE_EXPORT_ROWS) {
    res.status(413).json({ error: `يمكن تنزيل ${MAX_IMAGE_EXPORT_ROWS} شهادة كحد أقصى في الملف الواحد` });
    return;
  }

  const fileNames = certificateExportFileNames(printableItems, format);
  const zip = new ZipArchive({ store: true });
  zip.on("error", (error) => {
    if (!res.headersSent) res.status(500).json({ error: "تعذر إنشاء ملف الصور المضغوط" });
    else res.destroy(error);
  });
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="certificates-images-${format}.zip"`);
  res.setHeader("Cache-Control", "no-store");
  zip.pipe(res);

  const appendImage = (buffer: Buffer, fileName: string) => new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      zip.off("entry", onEntry);
      zip.off("error", onError);
    };
    const onEntry = (entry: { name: string }) => {
      if (entry.name !== fileName) return;
      cleanup();
      resolve();
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    zip.on("entry", onEntry);
    zip.once("error", onError);
    zip.append(buffer, { name: fileName });
  });
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(3, printableItems.length) }, async () => {
    while (nextIndex < printableItems.length) {
      const index = nextIndex++;
      const image = await generateCertificateImageBuffer(printableItems[index], format);
      await appendImage(image, fileNames[index]);
    }
  });
  try {
    await Promise.all(workers);
    if (req.query.includeSheet === "true") {
      await appendImage(await makeCertificatesWorkbook(printableItems, format), "certificates.xlsx");
    }
    await zip.finalize();
  } catch (error) {
    zip.abort();
    if (!res.headersSent) {
      res.status(500).json({ error: error instanceof Error ? error.message : "تعذر إنشاء ملف الصور المضغوط" });
    } else {
      res.destroy(error instanceof Error ? error : new Error("تعذر إنشاء ملف الصور المضغوط"));
    }
  }
});

router.get("/certificates/:id/export", async (req, res): Promise<void> => {
  if (!(await ensureAdmin(req))) {
    res.status(403).json({ error: "غير مصرح" });
    return;
  }

  const id = Number(req.params.id);
  const [issue] = await db.select().from(certificateIssuesTable)
    .where(and(eq(certificateIssuesTable.id, id), isNull(certificateIssuesTable.deletedAt))).limit(1);
  if (!issue || issue.status === "draft" || issue.status === "reserved") {
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
  res.setHeader("Content-Disposition", `attachment; filename="${certificateFileName(`${slugify(issue.recipientName || "certificate")}-${issue.serialNumber}`, "certificate")}.pdf"`);
  res.end(pdfBuffer);
});

router.post("/certificates/:id/send-email", async (req, res): Promise<void> => {
  if (!(await ensureAdmin(req))) {
    res.status(403).json({ error: "غير مصرح" });
    return;
  }

  const id = Number(req.params.id);
  const [issue] = await db.select().from(certificateIssuesTable)
    .where(and(eq(certificateIssuesTable.id, id), isNull(certificateIssuesTable.deletedAt)))
    .limit(1);
  if (!issue || issue.status !== "issued") {
    res.status(404).json({ error: "الشهادة الصادرة غير موجودة أو غير صالحة للإرسال" });
    return;
  }

  const requestedEmail = typeof req.body?.email === "string" ? req.body.email.trim() : "";
  const recipientEmail = requestedEmail || issue.recipientEmail?.trim() || "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
    res.status(400).json({ error: "أدخل بريدًا إلكترونيًا صحيحًا للمستفيد" });
    return;
  }

  const [template] = await db.select().from(certificateTemplatesTable)
    .where(eq(certificateTemplatesTable.id, issue.templateId)).limit(1);
  const pdf = await generateCertificatePdfBuffer(
    issue,
    templateForIssue(issue, template ?? {
      width: 1200,
      height: 800,
      orientation: "landscape",
      backgroundUrl: null,
      logoUrl: null,
      signatureUrl: null,
      layoutConfig: DEFAULT_LAYOUT,
    }),
    await getIssuePartners(issue),
  );
  await sendCertificateEmail({
    to: recipientEmail,
    recipientName: issue.recipientName,
    certificateName: issue.programTitle,
    serialNumber: issue.serialNumber,
    validationUrl: issue.validationUrl,
    fileName: `${certificateFileName(issue.recipientName, `certificate-${issue.serialNumber}`)}.pdf`,
    pdf,
  });
  res.json({ success: true, email: recipientEmail });
});

router.get("/certificates/:id/preview", async (req, res): Promise<void> => {
  if (!(await ensureAdmin(req))) {
    res.status(403).json({ error: "غير مصرح" });
    return;
  }
  const id = Number(req.params.id);
  const [issue] = await db.select().from(certificateIssuesTable)
    .where(and(eq(certificateIssuesTable.id, id), isNull(certificateIssuesTable.deletedAt))).limit(1);
  if (!issue || issue.status === "reserved") {
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
  res.setHeader("Content-Disposition", `inline; filename="${certificateFileName(`${slugify(issue.recipientName || "certificate")}-${issue.serialNumber}`, "certificate")}.pdf"`);
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
  const [currentIssue] = await db.select().from(certificateIssuesTable)
    .where(and(eq(certificateIssuesTable.id, id), isNull(certificateIssuesTable.deletedAt)))
    .limit(1);
  if (!currentIssue) {
    res.status(404).json({ error: "الشهادة غير موجودة" });
    return;
  }
  const currentMetadata = isRecord(currentIssue.metadata) ? currentIssue.metadata : {};
  const uploadedImageCertificate = currentMetadata.source === "uploaded-certificate-image";
  const update: Record<string, unknown> = { updatedAt: new Date() };
  if (!uploadedImageCertificate && Number.isInteger(Number(body.templateId)) && Number(body.templateId) > 0) {
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
  if (typeof body.recipientEmail === "string" || body.recipientEmail === null) {
    const recipientEmail = typeof body.recipientEmail === "string" ? body.recipientEmail.trim() : null;
    if (recipientEmail && (recipientEmail.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail))) {
      res.status(400).json({ error: "البريد الإلكتروني غير صالح" });
      return;
    }
    update.recipientEmail = recipientEmail;
  }
  if (typeof body.recipientPhone === "string" || body.recipientPhone === null) update.recipientPhone = body.recipientPhone;
  if (typeof body.description === "string" || body.description === null) update.description = body.description;
  if (typeof body.issueDate === "string") {
    const issueDate = parseCertificateDate(body.issueDate);
    if (!issueDate) {
      res.status(400).json({ error: "تاريخ الإصدار غير صالح" });
      return;
    }
    if (currentMetadata.source === "legacy-certificate-image") {
      const today = new Date().toISOString().slice(0, 10);
      if (body.issueDate < "1990-01-01" || body.issueDate > today) {
        res.status(400).json({ error: "تاريخ الشهادة القديمة يجب أن يكون من 1990 وحتى اليوم" });
        return;
      }
    }
    update.issueDate = issueDate;
    if (currentMetadata.source === "legacy-certificate-image") {
      update.metadata = {
        ...(isRecord(update.metadata) ? update.metadata : currentMetadata),
        originalIssueYear: issueDate.getUTCFullYear(),
      };
    }
  }
  if (body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)) {
    const metadata = body.metadata as Record<string, unknown>;
    let selectedPartners: { ids: number[]; snapshots: any[] };
    try {
      selectedPartners = await getPartnerSnapshots(metadata.partnerIds);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "تعذر التحقق من المؤسسات المختارة" });
      return;
    }
    const updatedMetadata: Record<string, unknown> = {
      ...currentMetadata,
      signatures: normalizeSignatures(metadata.signatures),
      partnerIds: selectedPartners.ids,
      partnerSnapshots: selectedPartners.snapshots,
    };
    const existingLayout = currentMetadata.layoutConfig;
    const layoutConfig = metadata.layoutConfig ?? existingLayout;
    if (layoutConfig && typeof layoutConfig === "object") updatedMetadata.layoutConfig = normalizeLayout(layoutConfig);

    if (uploadedImageCertificate && metadata.backgroundUrl !== undefined) {
      if (!isUploadedCertificateImage(metadata.backgroundUrl)) {
        res.status(400).json({ error: "صورة الشهادة يجب أن تكون مرفوعة إلى مخزن الشهادات" });
        return;
      }
      const width = Number(metadata.width);
      const height = Number(metadata.height);
      if (!Number.isFinite(width) || !Number.isFinite(height) ||
          width < 300 || width > 5000 || height < 300 || height > 5000 ||
          (metadata.orientation !== "portrait" && metadata.orientation !== "landscape")) {
        res.status(400).json({ error: "أبعاد أو اتجاه صورة الشهادة غير صالح" });
        return;
      }
      updatedMetadata.backgroundUrl = metadata.backgroundUrl;
      updatedMetadata.width = Math.round(width);
      updatedMetadata.height = Math.round(height);
      updatedMetadata.orientation = metadata.orientation;
    }
    update.metadata = updatedMetadata;
  }
  const nextMetadata = isRecord(update.metadata) ? update.metadata : { ...currentMetadata };
  const changedFields: string[] = [];
  for (const field of ["recipientName", "programTitle", "issuerName", "recipientEmail", "recipientPhone", "description", "issueDate", "templateId"] as const) {
    const nextValue = update[field];
    if (nextValue !== undefined && (nextValue instanceof Date
      ? new Date(currentIssue[field] as Date).getTime() !== nextValue.getTime()
      : nextValue !== currentIssue[field])) {
      changedFields.push(field);
    }
  }
  for (const field of ["signatures", "partnerIds", "layoutConfig", "backgroundUrl", "width", "height", "orientation"] as const) {
    if (JSON.stringify(nextMetadata[field]) !== JSON.stringify(currentMetadata[field])) {
      changedFields.push(field);
    }
  }
  if (changedFields.length > 0) {
    const history = Array.isArray(currentMetadata.editHistory) ? currentMetadata.editHistory : [];
    update.metadata = {
      ...nextMetadata,
      editHistory: [
        ...history.slice(-19),
        { editedAt: new Date().toISOString(), fields: changedFields },
      ],
    };
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