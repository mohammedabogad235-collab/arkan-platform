import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch, apiFetchJson, resolveApiUrl } from "@/lib/api-fetch";
import { useToast } from "@/hooks/use-toast";
import JSZip from "jszip";

type Box = { x: number; y: number; width: number; height: number };
type Signer = { name: string; title: string; role: string; signatureUrl: string; style: string; fontSize: number };
type Partner = {
  id: number;
  name: string;
  logoUrl?: string | null;
  signatureUrl?: string | null;
  signatureName?: string | null;
  signatureTitle?: string | null;
  sortOrder: number;
};
type CertificateTemplate = {
  id: number;
  name: string;
  orientation: string;
  width: number;
  height: number;
  backgroundUrl?: string | null;
  logoUrl?: string | null;
  signatureUrl?: string | null;
  layoutConfig?: Record<string, any>;
};
type CertificateIssue = {
  id: number;
  templateId: number;
  serialNumber: string;
  validationUrl: string;
  recipientName: string;
  recipientEmail?: string | null;
  recipientPhone?: string | null;
  programTitle: string;
  description?: string | null;
  issuerName: string;
  status: string;
  issueDate: string;
  deletedAt?: string | null;
  metadata?: {
    signatures?: Signer[];
    partnerIds?: number[];
    layoutConfig?: Record<string, any>;
    backgroundUrl?: string;
    width?: number;
    height?: number;
    orientation?: string;
    source?: string;
  };
};
type VerifySettings = {
  pageTitle: string;
  pageSubtitle: string;
  logoUrl: string;
  successTitle: string;
  successMessage: string;
  cancelledTitle: string;
  cancelledMessage: string;
  notFoundMessage: string;
  footerText: string;
  visibleFields: {
    recipientName: boolean;
    programTitle: boolean;
    issuerName: boolean;
    issueDate: boolean;
    partners: boolean;
    serialNumber: boolean;
  };
  showCertificatePreview: boolean;
  allowDownloadPdf: boolean;
  allowDownloadImage: boolean;
  showLegacyNote: boolean;
};
type BulkNameRow = { id: string; name: string; email: string };
type LegacyImportRow = {
  id: string;
  fileName: string;
  name: string;
  issueDate: string;
  programTitle: string;
  issuerName: string;
  email: string;
};
type UploadedCertificate = {
  id: string;
  file: File;
  previewUrl: string;
  recipientName: string;
  programTitle: string;
  issuerName: string;
  recipientEmail: string;
  issueDate: string;
  width: number;
  height: number;
  orientation: "portrait" | "landscape";
};
type ReservedImageUpload = {
  id: string;
  file: File;
  previewUrl: string;
  recipientName: string;
  serialNumber: string;
  matched: boolean;
  uploadedUrl?: string;
  width: number;
  height: number;
  orientation: "portrait" | "landscape";
};

const initialBoxes: Record<string, Box> = {
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

const emptyTemplate = {
  name: "",
  orientation: "landscape",
  width: 1200,
  height: 800,
  backgroundUrl: "",
  logoUrl: "",
  signatureUrl: "",
};

const emptyCertificate = {
  templateId: "",
  recipientName: "",
  recipientEmail: "",
  recipientPhone: "",
  programTitle: "",
  issuerName: "Arkan Web",
  description: "",
  issueDate: getLocalDateInputValue(),
};

function getLocalDateInputValue(date = new Date()): string {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

const certificateElements = [
  ["certificateTitle", "عنوان الشهادة"],
  ["recipientName", "اسم المستفيد"],
  ["programTitle", "اسم البرنامج"],
  ["issuerName", "الجهة المصدرة"],
  ["issueDate", "تاريخ الإصدار"],
  ["serialNumber", "رقم الشهادة"],
  ["qrCode", "رمز التحقق QR"],
  ["logo", "شعار القالب"],
  ["signature", "التوقيع الافتراضي"],
  ["partners", "المؤسسات الشريكة"],
  ["signatures", "التوقيعات الإضافية"],
] as const;

function isCertificateElementVisible(currentLayout: Record<string, any>, key: string): boolean {
  return !Array.isArray(currentLayout.hiddenElements) || !currentLayout.hiddenElements.includes(key);
}

const emptyPartner = {
  name: "",
  logoUrl: "",
  signatureUrl: "",
  signatureName: "",
  signatureTitle: "",
  sortOrder: "0",
};

function isValidCertificateSerial(value: string): boolean {
  return value.length > 0 && value.length <= 100 && !/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/.test(value);
}

const defaultVerifySettings: VerifySettings = {
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

type CertificateStudioSection =
  | "issue"
  | "codes"
  | "templates"
  | "partners"
  | "manage"
  | "verification";

const certificateStudioSections: { id: CertificateStudioSection; label: string; description: string }[] = [
  { id: "issue", label: "إصدار الشهادات", description: "إصدار شهادة منفردة أو دفعة من صور وأسماء." },
  { id: "codes", label: "حجز الأكواد", description: "إنشاء أكواد QR مسبقاً أو ربط الأكواد المحجوزة بصور الشهادات." },
  { id: "templates", label: "القوالب والتصميم", description: "إنشاء القوالب وضبط أماكن النصوص والشعارات والتوقيعات." },
  { id: "partners", label: "الجهات الشريكة", description: "إدارة الجهات التي يمكن إضافتها إلى الشهادات." },
  { id: "manage", label: "إدارة الشهادات", description: "البحث والتحقق والتنزيل وإدارة الحالات وسلة المحذوفات." },
  { id: "verification", label: "إعدادات التحقق", description: "تخصيص صفحة التحقق العامة والبيانات التي تظهر للزائر." },
];

function parseDelimitedRows(text: string): string[][] {
  const records: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const delimiter = text.includes("\t") && !text.includes(",") ? "\t" : ",";
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"' && quoted && text[index + 1] === '"') {
      field += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      row.push(field.trim());
      field = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field.trim());
      records.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field || row.length) {
    row.push(field.trim());
    records.push(row);
  }
  return records;
}

function normalizeLegacyImportRows(records: string[][]): Omit<LegacyImportRow, "id">[] {
  if (!records.length) return [];
  const normalizeHeader = (value: string) => value.replace(/^\uFEFF/, "").trim().toLocaleLowerCase().replace(/[\s_-]+/g, "");
  const headers = records[0].map(normalizeHeader);
  const headerAliases: Record<keyof Omit<LegacyImportRow, "id">, string[]> = {
    fileName: ["filename", "اسم الملف", "اسم الملف الأصلي", "اسم الصورة"],
    name: ["name", "الاسم", "اسم المستفيد"],
    issueDate: ["date", "issuedate", "التاريخ", "تاريخ الإصدار", "تاريخ الاصدار"],
    programTitle: ["course", "program", "الدورة", "اسم الدورة", "البرنامج"],
    issuerName: ["issuer", "organization", "الجهة", "الجهة المصدرة"],
    email: ["email", "البريد", "البريد الإلكتروني"],
  };
  const fieldIndexes = Object.fromEntries(
    Object.entries(headerAliases).map(([key, aliases]) => [
      key,
      headers.findIndex((header) => aliases.some((alias) => normalizeHeader(alias) === header)),
    ]),
  ) as Record<keyof Omit<LegacyImportRow, "id">, number>;
  const hasHeader = Object.values(fieldIndexes).some((index) => index >= 0);
  const dataRows = hasHeader ? records.slice(1) : records;
  return dataRows.flatMap((row) => {
    const get = (key: keyof Omit<LegacyImportRow, "id">, fallback: number) =>
      row[fieldIndexes[key] >= 0 ? fieldIndexes[key] : fallback]?.trim() ?? "";
    const value = {
      fileName: get("fileName", 0),
      name: get("name", 1),
      issueDate: get("issueDate", 2),
      programTitle: get("programTitle", 3),
      issuerName: get("issuerName", 4),
      email: get("email", 5),
    };
    return value.fileName || value.name ? [value] : [];
  });
}

function parseNameLines(value: string): Array<{ name: string; email: string }> {
  return value.split(/\r?\n/).flatMap((line) => {
    const trimmed = line.trim();
    if (!trimmed) return [];
    const separator = trimmed.indexOf(",");
    const name = (separator < 0 ? trimmed : trimmed.slice(0, separator)).trim();
    const email = separator < 0 ? "" : trimmed.slice(separator + 1).trim();
    return name ? [{ name, email }] : [];
  });
}

function parseCsv(text: string): Array<{ name: string; email: string }> {
  const records: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"' && quoted && text[index + 1] === '"') {
      field += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(field.trim());
      field = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field.trim());
      records.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field || row.length) {
    row.push(field.trim());
    records.push(row);
  }
  return records.flatMap(([name = "", email = ""], index) => {
    const header = name.replace(/^\uFEFF/, "").trim().toLocaleLowerCase();
    if (index === 0 && (["name", "اسم", "الاسم", "اسم المستفيد", "recipientname"].includes(header) || email.toLocaleLowerCase() === "email")) return [];
    return name.trim() ? [{ name: name.trim(), email: email.trim() }] : [];
  });
}

async function parseExcelFile(file: File): Promise<Array<{ name: string; email: string }>> {
  const archive = await JSZip.loadAsync(await file.arrayBuffer());
  const workbookFile = archive.file("xl/workbook.xml");
  const relationshipsFile = archive.file("xl/_rels/workbook.xml.rels");
  if (!workbookFile || !relationshipsFile) throw new Error("ملف Excel لا يحتوي على ورقة عمل قابلة للقراءة");
  const [workbookXml, relationshipsXml] = await Promise.all([workbookFile.async("text"), relationshipsFile.async("text")]);
  const workbook = new DOMParser().parseFromString(workbookXml, "application/xml");
  const relationships = new DOMParser().parseFromString(relationshipsXml, "application/xml");
  const firstSheet = workbook.querySelector("sheet");
  const relationshipId = firstSheet?.getAttribute("r:id");
  if (!relationshipId) throw new Error("تعذر تحديد ورقة العمل الأولى في ملف Excel");
  const relationship = [...relationships.querySelectorAll("Relationship")].find((item) => item.getAttribute("Id") === relationshipId);
  const target = relationship?.getAttribute("Target");
  if (!target) throw new Error("مسار ورقة Excel غير صالح");
  const sheetPath = target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\/+/, "")}`;
  const sheetFile = archive.file(sheetPath);
  if (!sheetFile) throw new Error("ورقة العمل الأولى غير موجودة في ملف Excel");
  const sharedStringsFile = archive.file("xl/sharedStrings.xml");
  const sharedStrings = sharedStringsFile
    ? [...new DOMParser().parseFromString(await sharedStringsFile.async("text"), "application/xml").querySelectorAll("si")]
      .map((item) => item.textContent ?? "")
    : [];
  const sheet = new DOMParser().parseFromString(await sheetFile.async("text"), "application/xml");
  return [...sheet.querySelectorAll("sheetData row")].flatMap((row, rowIndex) => {
    const values: string[] = [];
    for (const cell of row.querySelectorAll("c")) {
      const column = cell.getAttribute("r")?.match(/^[A-Z]+/)?.[0] ?? "";
      const columnIndex = column.split("").reduce((total, char) => total * 26 + char.charCodeAt(0) - 64, 0) - 1;
      const value = cell.querySelector("v")?.textContent ?? cell.querySelector("is")?.textContent ?? "";
      values[columnIndex] = cell.getAttribute("t") === "s" ? sharedStrings[Number(value)] ?? "" : value;
    }
    const name = (values[0] ?? "").trim();
    const email = (values[1] ?? "").trim();
    const header = name.toLocaleLowerCase();
    if (rowIndex === 0 && (["name", "اسم", "الاسم", "اسم المستفيد", "recipientname"].includes(header) || email.toLocaleLowerCase() === "email")) return [];
    return name ? [{ name, email }] : [];
  });
}

async function parseLegacyExcelFile(file: File): Promise<string[][]> {
  const archive = await JSZip.loadAsync(await file.arrayBuffer());
  const workbookFile = archive.file("xl/workbook.xml");
  const relationshipsFile = archive.file("xl/_rels/workbook.xml.rels");
  if (!workbookFile || !relationshipsFile) throw new Error("ملف Excel لا يحتوي على ورقة عمل قابلة للقراءة");
  const [workbookXml, relationshipsXml] = await Promise.all([workbookFile.async("text"), relationshipsFile.async("text")]);
  const workbook = new DOMParser().parseFromString(workbookXml, "application/xml");
  const relationships = new DOMParser().parseFromString(relationshipsXml, "application/xml");
  const relationshipId = workbook.querySelector("sheet")?.getAttribute("r:id");
  const target = relationshipId
    ? [...relationships.querySelectorAll("Relationship")].find((item) => item.getAttribute("Id") === relationshipId)?.getAttribute("Target")
    : "";
  if (!target) throw new Error("تعذر تحديد ورقة العمل الأولى في ملف Excel");
  const sheetPath = target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\/+/, "")}`;
  const sheetFile = archive.file(sheetPath);
  if (!sheetFile) throw new Error("ورقة العمل الأولى غير موجودة في ملف Excel");
  const sharedStringsFile = archive.file("xl/sharedStrings.xml");
  const sharedStrings = sharedStringsFile
    ? [...new DOMParser().parseFromString(await sharedStringsFile.async("text"), "application/xml").querySelectorAll("si")]
      .map((item) => item.textContent ?? "")
    : [];
  const sheet = new DOMParser().parseFromString(await sheetFile.async("text"), "application/xml");
  return [...sheet.querySelectorAll("sheetData row")].map((row) => {
    const values: string[] = [];
    for (const cell of row.querySelectorAll("c")) {
      const column = cell.getAttribute("r")?.match(/^[A-Z]+/)?.[0] ?? "";
      const columnIndex = column.split("").reduce((total, char) => total * 26 + char.charCodeAt(0) - 64, 0) - 1;
      const value = cell.querySelector("v")?.textContent ?? cell.querySelector("is")?.textContent ?? "";
      values[columnIndex] = cell.getAttribute("t") === "s" ? sharedStrings[Number(value)] ?? "" : value;
    }
    return values;
  });
}

function normalizeLegacyDate(value: string): string {
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    const excelDate = new Date(Date.UTC(1899, 11, 30) + Number(trimmed) * 86_400_000);
    return Number.isNaN(excelDate.getTime()) ? trimmed : excelDate.toISOString().slice(0, 10);
  }
  const match = trimmed.match(/^(\d{1,2})[/. -](\d{1,2})[/. -](\d{4})$/);
  if (match) {
    const first = Number(match[1]);
    const second = Number(match[2]);
    const year = Number(match[3]);
    const month = second;
    const day = first;
    return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  return trimmed;
}

function normalizeLegacyFileName(value: string): string {
  return value.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, "").normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase() ?? "";
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  dir,
  min,
  max,
}: {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  type?: string;
  dir?: "ltr" | "rtl";
  min?: string;
  max?: string;
}) {
  return (
    <label className="block space-y-1.5 text-sm">
      <span className="font-medium">{label}</span>
      <input
        className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
        type={type}
        value={value}
        dir={dir}
        min={min}
        max={max}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function ImageUploadField({
  label,
  value,
  onChange,
  onDimensions,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onDimensions?: (dimensions: { width: number; height: number }) => void;
}) {
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);

  const upload = async (file?: File) => {
    if (!file) return;
    setUploading(true);
    try {
      const dimensions = onDimensions
        ? await new Promise<{ width: number; height: number }>((resolve, reject) => {
            const objectUrl = URL.createObjectURL(file);
            const image = new Image();
            image.onload = () => {
              URL.revokeObjectURL(objectUrl);
              resolve({ width: image.naturalWidth, height: image.naturalHeight });
            };
            image.onerror = () => {
              URL.revokeObjectURL(objectUrl);
              reject(new Error("تعذرت قراءة أبعاد الصورة"));
            };
            image.src = objectUrl;
          })
        : undefined;
      const form = new FormData();
      form.append("file", file);
      const response = await apiFetch("/api/certificates/upload", { method: "POST", body: form });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || typeof result.publicUrl !== "string") {
        throw new Error(result.error || "تعذر رفع الصورة");
      }
      onChange(result.publicUrl);
      if (dimensions) onDimensions?.(dimensions);
      toast({ title: "تم رفع الصورة بنجاح" });
    } catch (error) {
      toast({ variant: "destructive", title: "تعذر رفع الصورة", description: (error as Error).message });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-2">
      <Field label={label} value={value} dir="ltr" onChange={onChange} />
      <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-xs hover:bg-muted">
        {uploading ? "جارٍ الرفع..." : "رفع صورة"}
        <input
          className="sr-only"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          disabled={uploading}
          onChange={(event) => {
            void upload(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
      </label>
      <p className="text-xs text-muted-foreground">لضمان تضمين الصورة بأمان في ملفات PDF، استخدم زر الرفع إلى مخزن الشهادات.</p>
    </div>
  );
}

function boxFor(layout: Record<string, any>, key: string, fallback: Box): Box {
  const box = layout?.[key] ?? fallback;
  const x = Math.min(Math.max(Number(box.x ?? fallback.x) || 0, 0), 99);
  const y = Math.min(Math.max(Number(box.y ?? fallback.y) || 0, 0), 99);
  return {
    x,
    y,
    width: Math.min(Math.max(Number(box.width ?? fallback.width) || 1, 1), 100 - x),
    height: Math.min(Math.max(Number(box.height ?? fallback.height) || 1, 1), 100 - y),
  };
}

function alignmentFor(layout: Record<string, any>, key: string): "left" | "center" | "right" {
  const value = layout?.[key]?.align;
  return value === "left" || value === "right" || value === "center" ? value : key === "issuerName" ? "left" : "center";
}

export default function CertificateStudio() {
  const { toast } = useToast();
  const [activeSection, setActiveSection] = useState<CertificateStudioSection>("issue");
  const [templates, setTemplates] = useState<CertificateTemplate[]>([]);
  const [issues, setIssues] = useState<CertificateIssue[]>([]);
  const [trashIssues, setTrashIssues] = useState<CertificateIssue[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [stats, setStats] = useState({ total: 0, issued: 0, cancelled: 0, drafts: 0, reserved: 0, trash: 0 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [referenceTemplateLoading, setReferenceTemplateLoading] = useState(false);
  const [templateId, setTemplateId] = useState("");
  const [templateForm, setTemplateForm] = useState(emptyTemplate);
  const [layout, setLayout] = useState<Record<string, any>>(initialBoxes);
  const layoutRef = useRef(layout);
  const pendingIssueLayoutRef = useRef<Record<string, any> | null>(null);
  const pendingIssueImageRef = useRef<{ backgroundUrl: string; width: number; height: number; orientation: string } | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const legacyPreviewRef = useRef<HTMLDivElement>(null);
  const [layoutUndo, setLayoutUndo] = useState<Record<string, any>[]>([]);
  const [layoutRedo, setLayoutRedo] = useState<Record<string, any>[]>([]);
  const [partnerForm, setPartnerForm] = useState(emptyPartner);
  const [partnerEditId, setPartnerEditId] = useState<number | null>(null);
  const [certificateForm, setCertificateForm] = useState(emptyCertificate);
  const [certificateId, setCertificateId] = useState<number | null>(null);
  const [editingStatus, setEditingStatus] = useState("");
  const [editingUploadedImage, setEditingUploadedImage] = useState(false);
  const [signers, setSigners] = useState<Signer[]>([]);
  const [selectedPartners, setSelectedPartners] = useState<number[]>([]);
  const [verificationInput, setVerificationInput] = useState("");
  const [verificationLoading, setVerificationLoading] = useState(false);
  const [verificationResult, setVerificationResult] = useState<any>(null);
  const [showTrash, setShowTrash] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [selectedIssueIds, setSelectedIssueIds] = useState<number[]>([]);
  const [emailSendingId, setEmailSendingId] = useState<number | null>(null);
  const [uploadedCertificates, setUploadedCertificates] = useState<UploadedCertificate[]>([]);
  const [bulkIssuing, setBulkIssuing] = useState(false);
  const [imageIssueMode, setImageIssueMode] = useState<"standard" | "legacy">("standard");
  const [legacyDefaultDate, setLegacyDefaultDate] = useState("");
  const [legacyMetadataRows, setLegacyMetadataRows] = useState<LegacyImportRow[]>([]);
  const [legacyTextImport, setLegacyTextImport] = useState("");
  const [legacyWhiteBackground, setLegacyWhiteBackground] = useState(true);
  const [legacyPreviewOpen, setLegacyPreviewOpen] = useState(false);
  const [legacyQrPreviewUrl, setLegacyQrPreviewUrl] = useState("");
  const [verifySettings, setVerifySettings] = useState<VerifySettings>(defaultVerifySettings);
  const [savingVerifySettings, setSavingVerifySettings] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [bulkNameRows, setBulkNameRows] = useState<BulkNameRow[]>([]);
  const [bulkTemplateId, setBulkTemplateId] = useState("");
  const [bulkProgramTitle, setBulkProgramTitle] = useState("");
  const [bulkIssuerName, setBulkIssuerName] = useState("Arkan Web");
  const [bulkIssueDate, setBulkIssueDate] = useState(getLocalDateInputValue());
  const [bulkPartnerIds, setBulkPartnerIds] = useState<number[]>([]);
  const [bulkNameIssuing, setBulkNameIssuing] = useState(false);
  const [imageExporting, setImageExporting] = useState<string | null>(null);
  const [reservationMode, setReservationMode] = useState<"count" | "names" | "codes">("count");
  const [reservationCount, setReservationCount] = useState("3");
  const [reservationNames, setReservationNames] = useState("");
  const [reservationSerialNumbers, setReservationSerialNumbers] = useState("");
  const [reservationProgramTitle, setReservationProgramTitle] = useState("");
  const [reservationIssuerName, setReservationIssuerName] = useState("");
  const [reservationIssueDate, setReservationIssueDate] = useState("");
  const [reservationBusy, setReservationBusy] = useState(false);
  const [newlyReserved, setNewlyReserved] = useState<CertificateIssue[]>([]);
  const [reservedImageUploads, setReservedImageUploads] = useState<ReservedImageUpload[]>([]);
  const [attachingImages, setAttachingImages] = useState(false);
  const [attachmentErrors, setAttachmentErrors] = useState<{ serialNumber: string; reason: string }[]>([]);
  const uploadedCertificatesRef = useRef<UploadedCertificate[]>([]);
  const reservedImageUploadsRef = useRef<ReservedImageUpload[]>([]);
  const [bulkLayout, setBulkLayout] = useState<Record<string, any>>({
    ...initialBoxes,
    hiddenElements: certificateElements
      .map(([key]) => key)
      .filter((key) => !["serialNumber", "qrCode"].includes(key)),
  });
  const [page, setPage] = useState(1);

  const selectedTemplate = useMemo(
    () => templates.find((template) => String(template.id) === templateId),
    [templates, templateId],
  );
  const bulkSelectedTemplate = useMemo(
    () => templates.find((template) => String(template.id) === bulkTemplateId),
    [templates, bulkTemplateId],
  );
  const selectedPartnerRecords = partners.filter((partner) => selectedPartners.includes(partner.id));
  const reservedIssues = issues.filter((issue) => issue.status === "reserved" && !issue.deletedAt);

  const refresh = async () => {
    const [templateData, issueData, partnerData, statsData] = await Promise.all([
      apiFetchJson<CertificateTemplate[]>("/api/certificates/templates"),
      apiFetchJson<CertificateIssue[]>("/api/certificates"),
      apiFetchJson<Partner[]>("/api/certificates/partners"),
      apiFetchJson<typeof stats>("/api/certificates/admin/stats"),
    ]);
    setTemplates(templateData);
    setIssues(issueData);
    setPartners(partnerData);
    setStats(statsData);
    if (!templateId && templateData[0]) setTemplateId(String(templateData[0].id));
    if (!bulkTemplateId && templateData[0]) setBulkTemplateId(String(templateData[0].id));
    return templateData;
  };

  const loadTrash = async () => {
    const items = await apiFetchJson<CertificateIssue[]>("/api/certificates/trash");
    setTrashIssues(items);
  };

  useEffect(() => {
    apiFetchJson<VerifySettings>("/api/certificates/verify-settings")
      .then((settings) => setVerifySettings({
        ...defaultVerifySettings,
        ...settings,
        visibleFields: { ...defaultVerifySettings.visibleFields, ...settings.visibleFields },
      }))
      .catch((error: Error) => toast({ variant: "destructive", title: "تعذر تحميل إعدادات التحقق", description: error.message }));
  }, []);

  const saveVerificationSettings = async (event: React.FormEvent) => {
    event.preventDefault();
    setSavingVerifySettings(true);
    try {
      const saved = await apiFetchJson<VerifySettings>("/api/certificates/verify-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(verifySettings),
      });
      setVerifySettings(saved);
      toast({ title: "تم حفظ إعدادات صفحة التحقق" });
    } catch (error) {
      toast({ variant: "destructive", title: "تعذر حفظ إعدادات التحقق", description: (error as Error).message });
    } finally {
      setSavingVerifySettings(false);
    }
  };

  const updateBulkNameText = (value: string) => {
    setBulkText(value);
    setBulkNameRows(parseNameLines(value).map((row) => ({ ...row, id: crypto.randomUUID() })));
  };

  const downloadReservedCodes = async (ids: number[] = []) => {
    try {
      const query = ids.length ? `?${new URLSearchParams({ ids: ids.join(",") }).toString()}` : "";
      const response = await apiFetch(`/api/certificates/reserved-export${query}`);
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || `HTTP ${response.status}`);
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = "reserved-certificate-codes.zip";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      toast({ title: "بدأ تنزيل QR وملف الأكواد" });
    } catch (error) {
      toast({ variant: "destructive", title: "تعذر تنزيل الأكواد المحجوزة", description: (error as Error).message });
    }
  };

  const reserveCertificates = async () => {
    const rows = parseNameLines(reservationNames);
    const serialNumbers = reservationSerialNumbers.split(/\r?\n/).map((serial) => serial.trim()).filter(Boolean);
    if (reservationMode === "names" && (rows.length < 1 || rows.length > 200)) {
      toast({ variant: "destructive", title: "أدخل من 1 إلى 200 اسم" });
      return;
    }
    if (reservationMode === "codes" && (serialNumbers.length < 1 || serialNumbers.length > 200)) {
      toast({ variant: "destructive", title: "أدخل من 1 إلى 200 كود، كود واحد في كل سطر" });
      return;
    }
    if (reservationMode === "codes" && serialNumbers.some((serial) => !isValidCertificateSerial(serial))) {
      toast({ variant: "destructive", title: "كل كود يجب أن يكون من 1 إلى 100 حرفاً ومن دون أسطر جديدة" });
      return;
    }
    if (reservationMode === "codes" && new Set(serialNumbers).size !== serialNumbers.length) {
      toast({ variant: "destructive", title: "قائمة الأكواد تحتوي على كود مكرر" });
      return;
    }
    const count = Number(reservationCount);
    if (reservationMode === "count" && (!Number.isInteger(count) || count < 1 || count > 200)) {
      toast({ variant: "destructive", title: "عدد الأكواد يجب أن يكون بين 1 و200" });
      return;
    }
    setReservationBusy(true);
    try {
      const payload = await apiFetchJson<{ certificates: CertificateIssue[] }>("/api/certificates/reserve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(reservationMode === "count"
            ? { count }
            : reservationMode === "names"
              ? { rows }
              : { serialNumbers }),
          ...(reservationProgramTitle.trim() ? { programTitle: reservationProgramTitle.trim() } : {}),
          ...(reservationIssuerName.trim() ? { issuerName: reservationIssuerName.trim() } : {}),
          ...(reservationIssueDate ? { issueDate: reservationIssueDate } : {}),
        }),
      });
      setNewlyReserved(payload.certificates);
      await refresh();
      toast({ title: `تم حجز ${payload.certificates.length} كود توثيق` });
    } catch (error) {
      toast({ variant: "destructive", title: "تعذر حجز الأكواد", description: (error as Error).message });
    } finally {
      setReservationBusy(false);
    }
  };

  const addReservedImageFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const selectedFiles = Array.from(files);
    if (reservedImageUploads.length + selectedFiles.length > 50) {
      toast({ variant: "destructive", title: "الحد الأقصى 50 صورة في الدفعة الواحدة" });
      return;
    }
    const prepared: ReservedImageUpload[] = [];
    try {
      for (const file of selectedFiles) {
        if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
          throw new Error(`صيغة ${file.name} غير مدعومة؛ استخدم JPG أو PNG أو WebP.`);
        }
        if (file.size > 8 * 1024 * 1024) {
          throw new Error(`حجم ${file.name} أكبر من 8 ميجابايت.`);
        }
        const previewUrl = URL.createObjectURL(file);
        const dimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => {
          const image = new Image();
          image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
          image.onerror = () => {
            URL.revokeObjectURL(previewUrl);
            reject(new Error(`تعذرت قراءة صورة ${file.name}.`));
          };
          image.src = previewUrl;
        });
        const fileStem = file.name.replace(/\.[^.]+$/, "");
        const generatedSerialNumber = fileStem.match(/AW-CERT-\d{4}-\d{6}/)?.[0] || "";
        const exactReservedCode = reservedIssues.find((issue) => issue.serialNumber === fileStem.trim());
        const serialNumber = exactReservedCode?.serialNumber || generatedSerialNumber;
        const normalizedName = (value: string) => value.normalize("NFC").trim().replace(/\s+/g, " ");
        const reserved = exactReservedCode ?? (generatedSerialNumber
          ? reservedIssues.find((issue) => issue.serialNumber === serialNumber)
          : reservedIssues.find((issue) => normalizedName(issue.recipientName) === normalizedName(fileStem)));
        const selectedSerial = reserved?.serialNumber || "";
        const derivedName = exactReservedCode
          ? ""
          : generatedSerialNumber
          ? fileStem.replace(generatedSerialNumber, "").replace(/[-_\s]+/g, " ").trim()
          : fileStem;
        prepared.push({
          id: crypto.randomUUID(),
          file,
          previewUrl,
          recipientName: reserved && reserved.recipientName !== "بدون اسم"
            ? reserved.recipientName
            : derivedName,
          serialNumber: selectedSerial,
          matched: Boolean(reserved),
          width: dimensions.width,
          height: dimensions.height,
          orientation: dimensions.height > dimensions.width ? "portrait" : "landscape",
        });
      }
      setReservedImageUploads((current) => [...current, ...prepared]);
      setAttachmentErrors([]);
    } catch (error) {
      prepared.forEach((image) => URL.revokeObjectURL(image.previewUrl));
      toast({ variant: "destructive", title: "تعذر إضافة الصور", description: (error as Error).message });
    }
  };

  const removeReservedImage = (id: string) => {
    const removed = reservedImageUploads.find((image) => image.id === id);
    if (removed) URL.revokeObjectURL(removed.previewUrl);
    setReservedImageUploads((current) => {
      return current.filter((image) => image.id !== id);
    });
  };

  const attachReservedImages = async () => {
    if (!reservedImageUploads.length) return;
    const serials = reservedImageUploads.map((image) => image.serialNumber).filter(Boolean);
    const duplicateSerial = serials.find((serial, index) => serials.indexOf(serial) !== index);
    if (duplicateSerial) {
      setAttachmentErrors([{ serialNumber: duplicateSerial, reason: "تم اختيار الكود نفسه لأكثر من صورة" }]);
      return;
    }
    setAttachingImages(true);
    setAttachmentErrors([]);
    const errors: { serialNumber: string; reason: string }[] = [];
    const items: Record<string, unknown>[] = [];
    for (const image of reservedImageUploads) {
      const reserved = reservedIssues.find((issue) => issue.serialNumber === image.serialNumber);
      if (!reserved) {
        errors.push({ serialNumber: image.serialNumber, reason: "اختر كوداً محجوزاً لهذه الصورة" });
        continue;
      }
      const recipientName = image.recipientName.trim() || reserved.recipientName;
      if (!recipientName || recipientName === "بدون اسم") {
        errors.push({ serialNumber: image.serialNumber, reason: "أدخل اسم المستفيد قبل الإصدار" });
        continue;
      }
      try {
        let backgroundUrl = image.uploadedUrl;
        if (!backgroundUrl) {
          const form = new FormData();
          form.append("file", image.file);
          const response = await apiFetch("/api/certificates/upload", { method: "POST", body: form });
          const result = await response.json().catch(() => ({}));
          if (!response.ok || typeof result.publicUrl !== "string") {
            throw new Error(result.error || "تعذر رفع الصورة");
          }
          backgroundUrl = result.publicUrl;
          setReservedImageUploads((current) => current.map((item) => item.id === image.id
            ? { ...item, uploadedUrl: backgroundUrl }
            : item));
        }
        items.push({
          serialNumber: image.serialNumber,
          backgroundUrl,
          width: image.width,
          height: image.height,
          orientation: image.orientation,
          recipientName,
        });
      } catch (error) {
        errors.push({
          serialNumber: image.serialNumber,
          reason: error instanceof Error ? error.message : "تعذر رفع الصورة",
        });
      }
    }

    let updated: CertificateIssue[] = [];
    if (items.length) {
      try {
        const result = await apiFetchJson<{ updated: CertificateIssue[]; errors: { serialNumber: string; reason: string }[] }>(
          "/api/certificates/attach-images",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ items }),
          },
        );
        updated = result.updated;
        errors.push(...result.errors);
      } catch (error) {
        errors.push({ serialNumber: "", reason: (error as Error).message });
      }
    }

    if (updated.length) {
      const completedSerials = new Set(updated.map((issue) => issue.serialNumber));
      reservedImageUploads
        .filter((image) => completedSerials.has(image.serialNumber))
        .forEach((image) => URL.revokeObjectURL(image.previewUrl));
      setReservedImageUploads((current) => current.filter((image) => !completedSerials.has(image.serialNumber)));
      await refresh().catch((error: Error) => {
        errors.push({ serialNumber: "", reason: `تم الربط لكن تعذر تحديث القائمة: ${error.message}` });
      });
      toast({ title: `تم إصدار ${updated.length} شهادة`, description: errors.length ? `تعذر ربط ${errors.length} صورة` : undefined });
    }
    setAttachmentErrors(errors);
    setAttachingImages(false);
  };

  const importBulkNameFile = async (file?: File) => {
    if (!file) return;
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error("حجم ملف الاستيراد يجب ألا يتجاوز 5 ميجابايت");
      const rows = file.name.toLocaleLowerCase().endsWith(".csv")
        ? parseCsv(await file.text())
        : file.name.toLocaleLowerCase().endsWith(".xlsx")
          ? await parseExcelFile(file)
          : (() => { throw new Error("استخدم ملف CSV أو Excel بصيغة XLSX"); })();
      if (!rows.length) throw new Error("لم يتم العثور على أسماء في الملف");
      if (rows.length > 200) throw new Error("الحد الأقصى 200 اسم في الدفعة الواحدة");
      setBulkNameRows(rows.map((row) => ({ ...row, id: crypto.randomUUID() })));
      setBulkText(rows.map((row) => row.email ? `${row.name}, ${row.email}` : row.name).join("\n"));
      toast({ title: `تم استيراد ${rows.length} اسم`, description: file.name });
    } catch (error) {
      toast({ variant: "destructive", title: "تعذر قراءة ملف الأسماء", description: error instanceof Error ? error.message : "تحقق من تنسيق الملف" });
    }
  };

  const issueCertificatesFromNames = async () => {
    if (!bulkTemplateId || !bulkProgramTitle.trim() || !bulkIssuerName.trim() || !bulkIssueDate) {
      toast({ variant: "destructive", title: "أكمل القالب وبيانات الدورة أولاً" });
      return;
    }
    if (!bulkNameRows.length || bulkNameRows.length > 200) {
      toast({ variant: "destructive", title: "أدخل من اسم واحد إلى 200 اسم" });
      return;
    }
    if (bulkNameRows.some((row) => !row.name.trim() || (row.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email.trim())))) {
      toast({ variant: "destructive", title: "راجع الأسماء والبريد الإلكتروني قبل الإصدار" });
      return;
    }
    if (!window.confirm(`سيتم إصدار ${bulkNameRows.length} شهادة بأرقام وروابط QR مستقلة. هل تريد المتابعة؟`)) return;

    setBulkNameIssuing(true);
    try {
      const result = await apiFetchJson<{
        count: number;
        duplicateNames: string[];
      }>("/api/certificates/bulk-from-names", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId: Number(bulkTemplateId),
          rows: bulkNameRows.map(({ name, email }) => ({ name: name.trim(), email: email.trim() || undefined })),
          programTitle: bulkProgramTitle.trim(),
          issuerName: bulkIssuerName.trim(),
          issueDate: bulkIssueDate,
          partnerIds: bulkPartnerIds,
          signatures: [],
          layoutConfig: bulkSelectedTemplate?.layoutConfig || {},
        }),
      });
      setBulkNameRows([]);
      setBulkText("");
      toast({
        title: `تم إصدار ${result.count} شهادة`,
        description: result.duplicateNames.length
          ? `أسماء مكررة أُصدرت لكل منها شهادة مستقلة: ${result.duplicateNames.join("، ")}`
          : "تم إنشاء رقم تحقق مستقل لكل شهادة.",
      });
      try {
        await refresh();
      } catch (error) {
        toast({
          variant: "destructive",
          title: "تم إصدار الشهادات لكن تعذر تحديث القائمة",
          description: error instanceof Error ? error.message : "حدّث الصفحة لعرض الشهادات الجديدة",
        });
      }
    } catch (error) {
      toast({ variant: "destructive", title: "تعذر إصدار شهادات القائمة", description: (error as Error).message });
    } finally {
      setBulkNameIssuing(false);
    }
  };

  const filteredIssues = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase();
    return (showTrash ? trashIssues : issues).filter((issue) => {
      const matchesSearch = !normalizedSearch || [
        issue.recipientName,
        issue.serialNumber,
        issue.programTitle,
        issue.issuerName,
      ].some((value) => value?.toLocaleLowerCase().includes(normalizedSearch));
      const source = issue.metadata?.source;
      const matchesSource = !sourceFilter ||
        (sourceFilter === "legacy" && source === "legacy-certificate-image") ||
        (sourceFilter === "uploaded-images" && (source === "uploaded-certificate-image" || source === "attached-certificate-image")) ||
        (sourceFilter === "reserved" && issue.status === "reserved") ||
        (sourceFilter === "normal" && !["uploaded-certificate-image", "attached-certificate-image", "legacy-certificate-image", "reserved-code"].includes(source || ""));
      return matchesSearch && (!statusFilter || issue.status === statusFilter) && matchesSource;
    });
  }, [issues, trashIssues, showTrash, search, statusFilter, sourceFilter]);

  const pageSize = 10;
  const pageCount = Math.max(1, Math.ceil(filteredIssues.length / pageSize));
  const pagedIssues = filteredIssues.slice((page - 1) * pageSize, page * pageSize);

  const applyLayout = (next: Record<string, any>) => {
    setLayoutUndo((history) => [...history.slice(-29), layoutRef.current]);
    setLayoutRedo([]);
    layoutRef.current = next;
    setLayout(next);
  };

  const undoLayout = () => {
    if (!layoutUndo.length) return;
    const previous = layoutUndo[layoutUndo.length - 1];
    setLayoutUndo((history) => history.slice(0, -1));
    setLayoutRedo((history) => [...history, layoutRef.current]);
    layoutRef.current = previous;
    setLayout(previous);
  };

  const redoLayout = () => {
    if (!layoutRedo.length) return;
    const next = layoutRedo[layoutRedo.length - 1];
    setLayoutRedo((history) => history.slice(0, -1));
    setLayoutUndo((history) => [...history, layoutRef.current]);
    layoutRef.current = next;
    setLayout(next);
  };

  const startDrag = (event: React.PointerEvent, key: string, originalBox: Box) => {
    if (!previewRef.current || event.button !== 0) return;
    event.preventDefault();
    const bounds = previewRef.current.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    const originalLayout = layoutRef.current;
    let currentBox = originalBox;
    const applyBox = (box: Box) => {
      const nextLayout = { ...layoutRef.current };
      if (key.startsWith("signature:")) {
        const index = Number(key.split(":")[1]);
        const signatureBoxes = [...(nextLayout.signatureBoxes || [])];
        signatureBoxes[index] = box;
        nextLayout.signatureBoxes = signatureBoxes;
      } else if (key.startsWith("partnerLogo:") || key.startsWith("partnerSignature:")) {
        const [groupKey, partnerId] = key.split(":");
        const group = groupKey === "partnerLogo" ? "partnerLogoBoxes" : "partnerSignatureBoxes";
        nextLayout[group] = { ...nextLayout[group], [partnerId]: box };
      } else {
        nextLayout[key] = box;
      }
      layoutRef.current = nextLayout;
      setLayout(nextLayout);
    };
    const move = (pointerEvent: PointerEvent) => {
      if (pointerEvent.pointerId !== event.pointerId) return;
      currentBox = {
        ...originalBox,
        x: Math.min(Math.max(originalBox.x + ((pointerEvent.clientX - startX) / bounds.width) * 100, 0), 100 - originalBox.width),
        y: Math.min(Math.max(originalBox.y + ((pointerEvent.clientY - startY) / bounds.height) * 100, 0), 100 - originalBox.height),
      };
      applyBox(currentBox);
    };
    const finish = (pointerEvent: PointerEvent) => {
      if (pointerEvent.pointerId !== event.pointerId) return;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      if (currentBox !== originalBox) {
        setLayoutUndo((history) => [...history.slice(-29), originalLayout]);
        setLayoutRedo([]);
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
  };

  useEffect(() => {
    refresh()
      .catch((error: Error) => toast({ variant: "destructive", title: "تعذر تحميل بيانات الشهادات", description: error.message }))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    uploadedCertificatesRef.current = uploadedCertificates;
  }, [uploadedCertificates]);

  useEffect(() => () => {
    uploadedCertificatesRef.current.forEach((certificate) => URL.revokeObjectURL(certificate.previewUrl));
  }, []);

  useEffect(() => {
    reservedImageUploadsRef.current = reservedImageUploads;
  }, [reservedImageUploads]);

  useEffect(() => () => {
    reservedImageUploadsRef.current.forEach((image) => URL.revokeObjectURL(image.previewUrl));
  }, []);

  useEffect(() => {
    if (!selectedTemplate) return;
    const issueImage = pendingIssueImageRef.current;
    pendingIssueImageRef.current = null;
    setTemplateForm({
      name: selectedTemplate.name,
      orientation: issueImage?.orientation || selectedTemplate.orientation || "landscape",
      width: issueImage?.width || selectedTemplate.width || 1200,
      height: issueImage?.height || selectedTemplate.height || 800,
      backgroundUrl: issueImage?.backgroundUrl || selectedTemplate.backgroundUrl || "",
      logoUrl: selectedTemplate.logoUrl || "",
      signatureUrl: selectedTemplate.signatureUrl || "",
    });
    const nextLayout = { ...initialBoxes, ...(pendingIssueLayoutRef.current || selectedTemplate.layoutConfig || {}) };
    pendingIssueLayoutRef.current = null;
    layoutRef.current = nextLayout;
    setLayout(nextLayout);
    setLayoutUndo([]);
    setLayoutRedo([]);
  }, [selectedTemplate?.id]);

  const updateTemplateField = (key: keyof typeof emptyTemplate, value: string) => {
    setTemplateForm((form) => ({
      ...form,
      [key]: key === "width" || key === "height" ? Number(value) : value,
    }));
  };

  const addUploadedCertificates = async (files: FileList | null) => {
    if (!files?.length) return;
    const selectedFiles = Array.from(files);
    if (uploadedCertificates.length + selectedFiles.length > 50) {
      toast({ variant: "destructive", title: "الحد الأقصى 50 صورة في الدفعة الواحدة" });
      return;
    }
    const prepared: UploadedCertificate[] = [];
    try {
      for (const file of selectedFiles) {
        if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
          throw new Error(`صيغة ${file.name} غير مدعومة؛ استخدم JPG أو PNG أو WebP.`);
        }
        if (file.size > 8 * 1024 * 1024) {
          throw new Error(`حجم ${file.name} أكبر من 8 ميجابايت.`);
        }
        const previewUrl = URL.createObjectURL(file);
        const dimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => {
          const image = new Image();
          image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
          image.onerror = () => {
            URL.revokeObjectURL(previewUrl);
            reject(new Error(`تعذرت قراءة صورة ${file.name}.`));
          };
          image.src = previewUrl;
        });
        const imported = legacyMetadataRows.find((row) =>
          normalizeLegacyFileName(row.fileName) === normalizeLegacyFileName(file.name),
        );
        prepared.push({
          id: crypto.randomUUID(),
          file,
          previewUrl,
          recipientName: imported?.name || "",
          programTitle: imported?.programTitle || "",
          issuerName: imported?.issuerName || "",
          recipientEmail: imported?.email || "",
          issueDate: imported?.issueDate || (imageIssueMode === "legacy" ? legacyDefaultDate : getLocalDateInputValue()),
          width: dimensions.width,
          height: dimensions.height,
          orientation: dimensions.height > dimensions.width ? "portrait" : "landscape",
        });
      }
      setUploadedCertificates((current) => [...current, ...prepared]);
    } catch (error) {
      prepared.forEach((certificate) => URL.revokeObjectURL(certificate.previewUrl));
      toast({
        variant: "destructive",
        title: "تعذر إضافة الصور",
        description: error instanceof Error ? error.message : "تحقق من الصور المختارة",
      });
    }
  };

  const applyLegacyMetadataRows = (rows: Omit<LegacyImportRow, "id">[]) => {
    const normalizedRows: LegacyImportRow[] = rows.map((row) => ({
      ...row,
      id: crypto.randomUUID(),
      issueDate: normalizeLegacyDate(row.issueDate),
    }));
    setLegacyMetadataRows(normalizedRows);
    setUploadedCertificates((current) => current.map((certificate) => {
      const imported = normalizedRows.find((row) =>
        normalizeLegacyFileName(row.fileName) === normalizeLegacyFileName(certificate.file.name),
      );
      return imported ? {
        ...certificate,
        recipientName: imported.name || certificate.recipientName,
        issueDate: imported.issueDate || certificate.issueDate,
        programTitle: imported.programTitle || certificate.programTitle,
        issuerName: imported.issuerName || certificate.issuerName,
        recipientEmail: imported.email || certificate.recipientEmail,
      } : certificate;
    }));
  };

  const applyLegacyTextImport = () => {
    const rows = normalizeLegacyImportRows(parseDelimitedRows(legacyTextImport));
    if (!rows.length) {
      toast({ variant: "destructive", title: "لم يتم العثور على صفوف استيراد صالحة" });
      return;
    }
    applyLegacyMetadataRows(rows);
    toast({ title: `تم استيراد بيانات ${rows.length} صف` });
  };

  const importLegacyMetadataFile = async (file?: File) => {
    if (!file) return;
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error("حجم ملف البيانات يجب ألا يتجاوز 5 ميجابايت");
      const lowerName = file.name.toLocaleLowerCase();
      const records = lowerName.endsWith(".csv")
        ? parseDelimitedRows(await file.text())
        : lowerName.endsWith(".xlsx")
          ? await parseLegacyExcelFile(file)
          : (() => { throw new Error("استخدم ملف CSV أو Excel بصيغة XLSX"); })();
      const rows = normalizeLegacyImportRows(records);
      if (!rows.length) throw new Error("لم يتم العثور على بيانات شهادات في الملف");
      if (rows.length > 200) throw new Error("الحد الأقصى 200 صف بيانات في الملف");
      applyLegacyMetadataRows(rows);
      setLegacyTextImport("");
      toast({ title: `تم استيراد ${rows.length} صف`, description: file.name });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "تعذر قراءة ملف البيانات",
        description: error instanceof Error ? error.message : "تحقق من تنسيق الملف",
      });
    }
  };

  const applyLegacyDefaultDate = (value: string) => {
    setLegacyDefaultDate(value);
    if (value) {
      setUploadedCertificates((current) => current.map((certificate) => ({ ...certificate, issueDate: value })));
    }
  };

  const updateUploadedCertificate = (id: string, field: keyof UploadedCertificate, value: string) => {
    setUploadedCertificates((current) => current.map((certificate) =>
      certificate.id === id ? { ...certificate, [field]: value } : certificate,
    ));
  };

  const removeUploadedCertificate = (id: string) => {
    setUploadedCertificates((current) => {
      const certificate = current.find((item) => item.id === id);
      if (certificate) URL.revokeObjectURL(certificate.previewUrl);
      return current.filter((item) => item.id !== id);
    });
  };

  const issueUploadedCertificates = async () => {
    if (!uploadedCertificates.length) {
      toast({ variant: "destructive", title: "أضف صور الشهادات أولاً" });
      return;
    }
    if (uploadedCertificates.some((certificate) => !certificate.recipientName.trim())) {
      toast({ variant: "destructive", title: "اكتب اسم صاحب كل شهادة قبل إصدار الدفعة" });
      return;
    }
    if (imageIssueMode === "legacy" && uploadedCertificates.some((certificate) => !certificate.issueDate)) {
      toast({ variant: "destructive", title: "أدخل تاريخ الإصدار الأصلي لكل شهادة قديمة" });
      return;
    }
    if (imageIssueMode === "legacy") {
      const today = getLocalDateInputValue();
      if (uploadedCertificates.some((certificate) =>
        certificate.issueDate < "1990-01-01" || certificate.issueDate > today,
      )) {
        toast({ variant: "destructive", title: "تاريخ الشهادة القديمة يجب أن يكون من 1990 وحتى اليوم" });
        return;
      }
    }
    if (uploadedCertificates.some((certificate) =>
      certificate.recipientEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(certificate.recipientEmail.trim()),
    )) {
      toast({ variant: "destructive", title: "راجع البريد الإلكتروني؛ يوجد بريد غير صحيح ضمن الدفعة" });
      return;
    }
    const isLegacyBatch = imageIssueMode === "legacy";
    if (!window.confirm(
      isLegacyBatch
        ? `سيتم توثيق ${uploadedCertificates.length} شهادة قديمة. رقم التوثيق يتولد الآن بتاريخ السنة الحالية، ويظل تاريخ الإصدار الأصلي منفصلاً في صفحة التحقق. متابعة؟`
        : `سيتم رفع وإصدار ${uploadedCertificates.length} شهادة مع أرقام وQR تحقق فريدة. متابعة؟`,
    )) return;

    setBulkIssuing(true);
    try {
      const certificatePayloads: {
        backgroundUrl: string;
        recipientName: string;
        programTitle: string;
        issuerName: string;
        recipientEmail: string;
        issueDate: string;
        width: number;
        height: number;
        orientation: "portrait" | "landscape";
      }[] = [];
      for (const certificate of uploadedCertificates) {
        const formData = new FormData();
        formData.append("file", certificate.file);
        const uploadResponse = await apiFetch("/api/certificates/upload", { method: "POST", body: formData });
        const uploadResult = await uploadResponse.json().catch(() => ({}));
        if (!uploadResponse.ok || typeof uploadResult.publicUrl !== "string") {
          throw new Error(uploadResult.error || `تعذر رفع صورة ${certificate.file.name}`);
        }
        certificatePayloads.push({
          backgroundUrl: uploadResult.publicUrl,
          recipientName: certificate.recipientName.trim(),
          programTitle: certificate.programTitle.trim(),
          issuerName: certificate.issuerName.trim(),
          recipientEmail: certificate.recipientEmail.trim(),
          issueDate: certificate.issueDate || getLocalDateInputValue(),
          width: certificate.width,
          height: certificate.height,
          orientation: certificate.orientation,
        });
      }

      const issueBatch = async (confirmDuplicates: boolean) => {
        const response = await apiFetch("/api/certificates/bulk-issue-images", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            certificates: certificatePayloads,
            layoutConfig: isLegacyBatch
              ? { ...bulkLayout, whiteBackgroundBehindQr: legacyWhiteBackground }
              : bulkLayout,
            ...(isLegacyBatch ? {
              source: "legacy-certificate-image",
              confirmDuplicates,
            } : {}),
          }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
        return payload as { count?: number; confirmationRequired?: boolean; duplicates?: { recipientName: string; issueDate: string; programTitle: string }[] };
      };
      let result = await issueBatch(false);
      if (result.confirmationRequired) {
        const duplicateNames = [...new Set((result.duplicates ?? []).map((duplicate) => `${duplicate.recipientName} — ${duplicate.issueDate}`))];
        if (!window.confirm(`توجد شهادات قديمة بنفس الاسم والتاريخ والدورة:\n${duplicateNames.join("\n")}\n\nهل تريد الإصدار رغم ذلك؟`)) return;
        result = await issueBatch(true);
      }
      if (!result.count) throw new Error("لم يتم إصدار أي شهادة");
      uploadedCertificates.forEach((certificate) => URL.revokeObjectURL(certificate.previewUrl));
      setUploadedCertificates([]);
      setLegacyMetadataRows([]);
      setLegacyTextImport("");
      toast({
        title: `تم توثيق ${result.count} شهادة`,
        description: isLegacyBatch
          ? "أُنشئ لكل شهادة رقم توثيق جديد بتاريخ السنة الحالية، مع الاحتفاظ بتاريخ إصدارها الأصلي."
          : "أُنشئ رقم ورمز QR خاص بكل شهادة.",
      });
      try {
        await refresh();
      } catch (error) {
        toast({
          variant: "destructive",
          title: "تم إصدار الشهادات لكن تعذر تحديث القائمة",
          description: error instanceof Error ? error.message : "حدّث الصفحة لعرض الشهادات الجديدة",
        });
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "تعذر إصدار دفعة الشهادات",
        description: error instanceof Error ? error.message : "حدث خطأ غير متوقع",
      });
    } finally {
      setBulkIssuing(false);
    }
  };

  const updateBox = (key: string, field: keyof Box, value: string) => {
    const fallback = initialBoxes[key] || { x: 10, y: 10, width: 18, height: 12 };
    const current = boxFor(layoutRef.current, key, fallback);
    const number = Number(value);
    const safeValue = Number.isFinite(number) ? Math.min(Math.max(number, 0), 100) : current[field];
    applyLayout({
      ...layoutRef.current,
      [key]: {
        ...boxFor(layoutRef.current, key, fallback),
        [field]: safeValue,
      },
    });
  };

  const updateBulkBox = (key: string, field: keyof Box, value: string) => {
    const current = boxFor(bulkLayout, key, initialBoxes[key]);
    const number = Number(value);
    setBulkLayout((currentLayout) => ({
      ...currentLayout,
      [key]: {
        ...current,
        [field]: Number.isFinite(number) ? Math.min(Math.max(number, 0), 100) : current[field],
      },
    }));
  };

  const startLegacyDrag = (event: React.PointerEvent, key: "serialNumber" | "qrCode") => {
    if (!legacyPreviewRef.current || event.button !== 0) return;
    event.preventDefault();
    const bounds = legacyPreviewRef.current.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    const originalLayout = bulkLayout;
    const originalBox = boxFor(originalLayout, key, initialBoxes[key]);
    let currentBox = originalBox;
    const move = (pointerEvent: PointerEvent) => {
      if (pointerEvent.pointerId !== event.pointerId) return;
      currentBox = {
        ...originalBox,
        x: Math.min(Math.max(originalBox.x + ((pointerEvent.clientX - startX) / bounds.width) * 100, 0), 100 - originalBox.width),
        y: Math.min(Math.max(originalBox.y + ((pointerEvent.clientY - startY) / bounds.height) * 100, 0), 100 - originalBox.height),
      };
      setBulkLayout((current) => ({ ...current, [key]: currentBox }));
    };
    const finish = (pointerEvent: PointerEvent) => {
      if (pointerEvent.pointerId !== event.pointerId) return;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      if (currentBox !== originalBox) {
        setBulkLayout((current) => ({ ...current, [key]: currentBox }));
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
  };

  const openLegacyPreview = () => {
    if (!uploadedCertificates.length) {
      toast({ variant: "destructive", title: "ارفع صورة شهادة لمعاينتها أولاً" });
      return;
    }
    const sampleSerial = `AW-CERT-${new Date().getFullYear()}-000001`;
    setLegacyQrPreviewUrl(resolveApiUrl(`/api/certificates/qr?serial=${encodeURIComponent(sampleSerial)}`));
    setLegacyPreviewOpen(true);
  };

  const updatePartnerBox = (group: "partnerLogoBoxes" | "partnerSignatureBoxes", partnerId: number, field: keyof Box, value: string, fallback: Box) => {
    const number = Number(value);
    const current = boxFor({ position: layoutRef.current[group]?.[String(partnerId)] }, "position", fallback);
    applyLayout({
      ...layoutRef.current,
      [group]: {
        ...layoutRef.current[group],
        [String(partnerId)]: {
          ...current,
          [field]: Number.isFinite(number) ? Math.min(Math.max(number, 0), 100) : current[field],
        },
      },
    });
  };

  const saveTemplate = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const body = {
        ...templateForm,
        layoutConfig: layout,
        isActive: true,
      };
      const result = templateId
        ? await apiFetchJson<CertificateTemplate>(`/api/certificates/templates/${templateId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          })
        : await apiFetchJson<CertificateTemplate>("/api/certificates/templates", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
      await refresh();
      setTemplateId(String(result.id));
      if (!certificateId) {
        setCertificateForm((current) => ({ ...current, templateId: String(result.id) }));
      }
      toast({ title: "تم حفظ تصميم القالب" });
    } catch (error) {
      toast({ variant: "destructive", title: "تعذر حفظ القالب", description: (error as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const duplicateTemplate = async () => {
    if (!templateId) return;
    try {
      const copy = await apiFetchJson<CertificateTemplate>(`/api/certificates/templates/${templateId}/duplicate`, { method: "POST" });
      await refresh();
      setTemplateId(String(copy.id));
      toast({ title: "تم نسخ القالب", description: copy.name });
    } catch (error) {
      toast({ variant: "destructive", title: "تعذر نسخ القالب", description: (error as Error).message });
    }
  };

  const deleteTemplate = async () => {
    const selected = templates.find((template) => String(template.id) === templateId);
    if (!selected) return;
    if (!window.confirm(`حذف القالب «${selected.name}» نهائياً؟ لا يمكن حذف قالب مرتبط بأي شهادة.`)) return;

    setSaving(true);
    try {
      await apiFetchJson(`/api/certificates/templates/${selected.id}`, { method: "DELETE" });
      setTemplateId("");
      setTemplateForm(emptyTemplate);
      if (String(certificateForm.templateId) === String(selected.id)) {
        setCertificateForm((current) => ({ ...current, templateId: "" }));
      }
      applyLayout(initialBoxes);
      const remainingTemplates = await refresh();
      setTemplateId(String(remainingTemplates[0]?.id ?? ""));
      if (!remainingTemplates.length) {
        setTemplateForm(emptyTemplate);
        applyLayout(initialBoxes);
      }
      toast({ title: "تم حذف القالب" });
    } catch (error) {
      toast({ variant: "destructive", title: "تعذر حذف القالب", description: (error as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const savePartner = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const body = { ...partnerForm, sortOrder: Number(partnerForm.sortOrder) };
      await apiFetchJson(partnerEditId ? `/api/certificates/partners/${partnerEditId}` : "/api/certificates/partners", {
        method: partnerEditId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setPartnerForm(emptyPartner);
      setPartnerEditId(null);
      await refresh();
      toast({ title: partnerEditId ? "تم تحديث المؤسسة" : "تمت إضافة المؤسسة" });
    } catch (error) {
      toast({ variant: "destructive", title: "تعذر حفظ المؤسسة", description: (error as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const editPartner = (partner: Partner) => {
    setPartnerEditId(partner.id);
    setPartnerForm({
      name: partner.name,
      logoUrl: partner.logoUrl || "",
      signatureUrl: partner.signatureUrl || "",
      signatureName: partner.signatureName || "",
      signatureTitle: partner.signatureTitle || "",
      sortOrder: String(partner.sortOrder),
    });
  };

  const deletePartner = async (partner: Partner) => {
    if (!window.confirm(`هل تريد حذف المؤسسة «${partner.name}»؟`)) return;
    try {
      await apiFetchJson(`/api/certificates/partners/${partner.id}`, { method: "DELETE" });
      setSelectedPartners((ids) => ids.filter((id) => id !== partner.id));
      await refresh();
      toast({ title: "تم حذف المؤسسة" });
    } catch (error) {
      toast({ variant: "destructive", title: "تعذر حذف المؤسسة", description: (error as Error).message });
    }
  };

  const beginEditCertificate = (issue: CertificateIssue) => {
    setCertificateId(issue.id);
    setEditingStatus(issue.status);
    setEditingUploadedImage(issue.metadata?.source === "uploaded-certificate-image");
    setTemplateId(String(issue.templateId));
    const issueLayout = issue.metadata?.layoutConfig;
    pendingIssueLayoutRef.current = issueLayout || null;
    pendingIssueImageRef.current = issue.metadata?.backgroundUrl
      ? {
          backgroundUrl: issue.metadata.backgroundUrl,
          width: issue.metadata.width || 1200,
          height: issue.metadata.height || 800,
          orientation: issue.metadata.orientation || "landscape",
        }
      : null;
    if (String(issue.templateId) === templateId) {
      const currentTemplate = templates.find((item) => item.id === issue.templateId);
      if (pendingIssueImageRef.current) {
        setTemplateForm({
          name: currentTemplate?.name || "",
          orientation: pendingIssueImageRef.current.orientation,
          width: pendingIssueImageRef.current.width,
          height: pendingIssueImageRef.current.height,
          backgroundUrl: pendingIssueImageRef.current.backgroundUrl,
          logoUrl: currentTemplate?.logoUrl || "",
          signatureUrl: currentTemplate?.signatureUrl || "",
        });
        pendingIssueImageRef.current = null;
      }
      const nextLayout = { ...initialBoxes, ...(issueLayout || currentTemplate?.layoutConfig || {}) };
      layoutRef.current = nextLayout;
      setLayout(nextLayout);
      setLayoutUndo([]);
      setLayoutRedo([]);
      pendingIssueLayoutRef.current = null;
    }
    setCertificateForm({
      templateId: String(issue.templateId),
      recipientName: issue.recipientName || "",
      recipientEmail: issue.recipientEmail || "",
      recipientPhone: issue.recipientPhone || "",
      programTitle: issue.programTitle || "",
      issuerName: issue.issuerName || "Arkan Web",
      description: issue.description || "",
      issueDate: issue.issueDate?.slice(0, 10) || getLocalDateInputValue(),
    });
    setSigners(issue.metadata?.signatures || []);
    setSelectedPartners(issue.metadata?.partnerIds || []);
    setVerificationInput(issue.serialNumber);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const clearCertificateForm = () => {
    setCertificateId(null);
    setEditingStatus("");
    setEditingUploadedImage(false);
    setCertificateForm(emptyCertificate);
    setSigners([]);
    setSelectedPartners([]);
    setVerificationInput("");
    const selected = templates.find((item) => String(item.id) === templateId);
    if (selected) {
      const nextLayout = { ...initialBoxes, ...(selected.layoutConfig || {}) };
      layoutRef.current = nextLayout;
      setLayout(nextLayout);
      setLayoutUndo([]);
      setLayoutRedo([]);
    }
  };

  const certificatePayload = () => ({
    ...certificateForm,
    templateId: Number(certificateForm.templateId),
    layoutConfig: layout,
    signatures: signers,
    partnerIds: selectedPartners,
    metadata: {
      signatures: signers,
      partnerIds: selectedPartners,
      layoutConfig: layout,
      ...(editingUploadedImage ? {
        backgroundUrl: templateForm.backgroundUrl,
        width: Number(templateForm.width),
        height: Number(templateForm.height),
        orientation: templateForm.orientation,
      } : {}),
    },
  });

  const saveCertificate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!certificateForm.templateId) {
      toast({ variant: "destructive", title: "اختر قالب الشهادة أولاً" });
      return;
    }
    if (templateId !== certificateForm.templateId) {
      setTemplateId(certificateForm.templateId);
      toast({ title: "تم تحميل تصميم القالب المحدد", description: "راجع المعاينة ثم احفظ الشهادة مرة أخرى." });
      return;
    }
    setSaving(true);
    try {
      const body = certificatePayload();
      const result = certificateId
        ? await apiFetchJson<CertificateIssue>(`/api/certificates/${certificateId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          })
        : await apiFetchJson<CertificateIssue>("/api/certificates/issue", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
      setCertificateId(result.id);
      setEditingStatus(result.status);
      setVerificationInput(result.serialNumber);
      await refresh();
      toast({
        title: editingStatus === "draft" ? "تم تحديث المسودة" : certificateId ? "تم تحديث الشهادة" : "تم إصدار الشهادة",
        description: result.serialNumber,
      });
    } catch (error) {
      toast({ variant: "destructive", title: "تعذر حفظ الشهادة", description: (error as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const loadReferenceTemplate = async () => {
    if (certificateId) {
      toast({ variant: "destructive", title: "احفظ تعديل الشهادة الحالية قبل بدء قالب جديد" });
      return;
    }
    if (templateId && !window.confirm("سيبدأ هذا التصميم قالباً جديداً بدلاً من القالب المحدد. متابعة؟")) return;

    setReferenceTemplateLoading(true);
    try {
      const imageResponse = await fetch("/templates/arkan-trainova-certificate-base.jpg");
      if (!imageResponse.ok) throw new Error("تعذر تحميل صورة القالب المرجعي");

      const image = await imageResponse.blob();
      const form = new FormData();
      form.append("file", new File([image], "arkan-trainova-certificate-base.jpg", { type: "image/jpeg" }));
      const uploadResponse = await apiFetch("/api/certificates/upload", { method: "POST", body: form });
      const uploadResult = await uploadResponse.json().catch(() => ({}));
      if (!uploadResponse.ok || typeof uploadResult.publicUrl !== "string") {
        throw new Error(uploadResult.error || "تعذر رفع خلفية القالب إلى مخزن الشهادات");
      }

      const referencePartners = partners.filter((partner) => {
        const normalizedName = partner.name.toLocaleLowerCase().replace(/[\s_-]+/g, "");
        return /trainova|ترينوفا|تراينوفا|arkan|أركان|اركان/.test(normalizedName);
      }).slice(0, 2);
      const partnerLogoBoxes = Object.fromEntries(referencePartners.map((partner, index) => [
        String(partner.id),
        { x: index === 0 ? 36 : 52, y: 8, width: 14, height: 16 },
      ]));
      const partnerSignatureBoxes = Object.fromEntries(referencePartners.map((partner, index) => [
        String(partner.id),
        { x: index === 0 ? 48 : 68, y: 77, width: 18, height: 13 },
      ]));
      const referenceLayout = {
        ...initialBoxes,
        certificateTitle: { ...initialBoxes.certificateTitle, x: 20, y: 28, width: 60, height: 9 },
        recipientName: { ...initialBoxes.recipientName, x: 18, y: 44, width: 64, height: 10 },
        programTitle: { ...initialBoxes.programTitle, x: 18, y: 60, width: 64, height: 8 },
        issuerName: { ...initialBoxes.issuerName, x: 30, y: 69, width: 40, height: 6, align: "center" },
        issueDate: { ...initialBoxes.issueDate, x: 13, y: 77, width: 22, height: 5, align: "left" },
        serialNumber: { ...initialBoxes.serialNumber, x: 13, y: 84, width: 22, height: 6, align: "left" },
        qrCode: { ...initialBoxes.qrCode, x: 3, y: 77, width: 8, height: 10 },
        certificateTitleText: "شهادة إتمام",
        partnerLogoBoxes,
        partnerSignatureBoxes,
        partnerSignatureDefault: { y: 77, height: 13 },
      };

      setTemplateId("");
      setTemplateForm({
        ...emptyTemplate,
        name: "TraiNova × Arkan Web — شهادة تدريب",
        width: 1376,
        height: 768,
        backgroundUrl: uploadResult.publicUrl,
      });
      setCertificateForm((current) => ({ ...current, templateId: "" }));
      setSelectedPartners(referencePartners.map((partner) => partner.id));
      applyLayout(referenceLayout);
      toast({
        title: "تم تجهيز القالب المرجعي",
        description: referencePartners.length
          ? "تم اختيار شركاء TraiNova وArkan الموجودين. راجع المواضع واحفظ القالب."
          : "أضف سجلات المؤسسات الشريكة أولاً لاستخدام شعاراتها وتوقيعاتها، ثم احفظ القالب.",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "تعذر تجهيز القالب المرجعي",
        description: error instanceof Error ? error.message : "حدث خطأ غير متوقع",
      });
    } finally {
      setReferenceTemplateLoading(false);
    }
  };

  const createQuickVerificationTemplate = async () => {
    if (certificateId) {
      toast({ variant: "destructive", title: "احفظ الشهادة الحالية أو ابدأ شهادة جديدة أولاً" });
      return;
    }
    if ((templateId || templateForm.name.trim()) && !window.confirm("سيتم إنشاء قالب توثيق بسيط جديد. متابعة؟")) return;

    setSaving(true);
    const hiddenElements = certificateElements
      .map(([key]) => key)
      .filter((key) => !["recipientName", "issueDate", "serialNumber", "qrCode"].includes(key));
    const quickLayout = {
      ...initialBoxes,
      recipientName: { ...initialBoxes.recipientName, x: 20, y: 31, width: 60, height: 14 },
      issueDate: { ...initialBoxes.issueDate, x: 25, y: 52, width: 50, height: 6, align: "center" },
      serialNumber: { ...initialBoxes.serialNumber, x: 25, y: 62, width: 50, height: 6, align: "center" },
      qrCode: { ...initialBoxes.qrCode, x: 44, y: 72, width: 12, height: 15 },
      certificateTitleText: "",
      hiddenElements,
    };
    try {
      const reusableTemplate = templates.find((item) => item.name === "قالب توثيق سريع");
      if (reusableTemplate) {
        setTemplateId(String(reusableTemplate.id));
        setTemplateForm({
          name: reusableTemplate.name,
          orientation: reusableTemplate.orientation || "portrait",
          width: reusableTemplate.width || 800,
          height: reusableTemplate.height || 1100,
          backgroundUrl: reusableTemplate.backgroundUrl || "",
          logoUrl: reusableTemplate.logoUrl || "",
          signatureUrl: reusableTemplate.signatureUrl || "",
        });
        setCertificateForm((current) => ({
          ...current,
          templateId: String(reusableTemplate.id),
          programTitle: "",
          issuerName: "",
        }));
        setSigners([]);
        setSelectedPartners([]);
        applyLayout({ ...initialBoxes, ...(reusableTemplate.layoutConfig || quickLayout) });
        toast({ title: "تم اختيار قالب التوثيق السريع", description: "أدخل اسم المستفيد والتاريخ، ثم أصدر الشهادة." });
        return;
      }
      const template = await apiFetchJson<CertificateTemplate>("/api/certificates/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "قالب توثيق سريع",
          orientation: "portrait",
          width: 800,
          height: 1100,
          backgroundUrl: "",
          logoUrl: "",
          signatureUrl: "",
          layoutConfig: quickLayout,
          isActive: true,
        }),
      });
      await refresh();
      setTemplateId(String(template.id));
      setTemplateForm({
        name: template.name,
        orientation: "portrait",
        width: 800,
        height: 1100,
        backgroundUrl: "",
        logoUrl: "",
        signatureUrl: "",
      });
      setCertificateForm((current) => ({
        ...current,
        templateId: String(template.id),
        programTitle: "",
        issuerName: "",
      }));
      setSigners([]);
      setSelectedPartners([]);
      applyLayout(quickLayout);
      toast({
        title: "تم تجهيز نموذج التوثيق السريع",
        description: "أدخل اسم المستفيد والتاريخ، وسيُنشأ رقم فريد ورمز QR عند الإصدار.",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "تعذر تجهيز التوثيق السريع",
        description: error instanceof Error ? error.message : "حدث خطأ غير متوقع",
      });
    } finally {
      setSaving(false);
    }
  };

  const saveDraft = async () => {
    if (certificateId && editingStatus !== "draft") {
      toast({ variant: "destructive", title: "لا يمكن تحويل شهادة صادرة إلى مسودة" });
      return;
    }
    if (!certificateForm.templateId) {
      toast({ variant: "destructive", title: "اختر قالب الشهادة أولاً" });
      return;
    }
    setSaving(true);
    try {
      const body = certificatePayload();
      const result = certificateId
        ? await apiFetchJson<CertificateIssue>(`/api/certificates/${certificateId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          })
        : await apiFetchJson<CertificateIssue>("/api/certificates/drafts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
      setCertificateId(result.id);
      setEditingStatus(result.status);
      await refresh();
      toast({ title: "تم حفظ المسودة", description: "لم تصدر الشهادة بعد ولا يمكن التحقق منها." });
    } catch (error) {
      toast({ variant: "destructive", title: "تعذر حفظ المسودة", description: (error as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const issueDraft = async (issue: CertificateIssue) => {
    if (!window.confirm(`إصدار الشهادة للمستفيد «${issue.recipientName}» الآن؟`)) return;
    try {
      const result = await apiFetchJson<CertificateIssue>(`/api/certificates/${issue.id}/issue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipientName: issue.recipientName,
          programTitle: issue.programTitle,
        }),
      });
      await refresh();
      toast({ title: "تم إصدار الشهادة", description: result.serialNumber });
    } catch (error) {
      toast({ variant: "destructive", title: "تعذر إصدار المسودة", description: (error as Error).message });
    }
  };

  const cancelCertificate = async (issue: CertificateIssue) => {
    if (!window.confirm(`سيتم إلغاء الشهادة ${issue.serialNumber} ولن تظهر كشهادة صالحة في صفحة التحقق. متابعة؟`)) return;
    try {
      await apiFetchJson(`/api/certificates/${issue.id}/cancel`, { method: "PATCH" });
      await refresh();
      toast({ title: "تم إلغاء الشهادة" });
    } catch (error) {
      toast({ variant: "destructive", title: "تعذر إلغاء الشهادة", description: (error as Error).message });
    }
  };

  const moveToTrash = async (issue: CertificateIssue) => {
    if (!window.confirm(`نقل الشهادة ${issue.serialNumber} إلى سلة المحذوفات؟ يمكن استعادتها خلال 30 يوماً.`)) return;
    try {
      await apiFetchJson(`/api/certificates/${issue.id}`, { method: "DELETE" });
      await refresh();
      toast({ title: "نُقلت الشهادة إلى سلة المحذوفات" });
    } catch (error) {
      toast({ variant: "destructive", title: "تعذر نقل الشهادة", description: (error as Error).message });
    }
  };

  const moveSelectedToTrash = async () => {
    if (!selectedIssueIds.length || !window.confirm(`نقل ${selectedIssueIds.length} شهادة إلى سلة المحذوفات؟`)) return;
    try {
      await apiFetchJson("/api/certificates/bulk/trash", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedIssueIds }),
      });
      setSelectedIssueIds([]);
      await Promise.all([refresh(), loadTrash()]);
      toast({ title: "تم نقل الشهادات إلى السلة" });
    } catch (error) {
      toast({ variant: "destructive", title: "تعذر نقل الشهادات", description: (error as Error).message });
    }
  };

  const restoreIssues = async (ids: number[]) => {
    try {
      await apiFetchJson("/api/certificates/bulk/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      setSelectedIssueIds([]);
      await Promise.all([refresh(), loadTrash()]);
      toast({ title: "تمت استعادة الشهادات" });
    } catch (error) {
      toast({ variant: "destructive", title: "تعذرت استعادة الشهادات", description: (error as Error).message });
    }
  };

  const permanentlyDeleteIssues = async (ids: number[]) => {
    if (!window.confirm(`سيتم حذف ${ids.length} شهادة نهائياً ولا يمكن استعادتها. متابعة؟`)) return;
    try {
      await apiFetchJson("/api/certificates/bulk/permanent-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      setSelectedIssueIds([]);
      await Promise.all([refresh(), loadTrash()]);
      toast({ title: "تم الحذف النهائي" });
    } catch (error) {
      toast({ variant: "destructive", title: "تعذر الحذف النهائي", description: (error as Error).message });
    }
  };

  const downloadCollection = async (format: "zip" | "xlsx", ids: number[]) => {
    try {
      const query = new URLSearchParams();
      if (ids.length) query.set("ids", ids.join(","));
      if (!ids.length && search.trim()) query.set("search", search.trim());
      if (!ids.length && statusFilter) query.set("status", statusFilter);
      if (!ids.length && sourceFilter) query.set("source", sourceFilter);
      if (showTrash) query.set("trash", "true");
      const response = await apiFetch(`/api/certificates/${format === "zip" ? "export-zip" : "export.xlsx"}?${query.toString()}`);
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || `HTTP ${response.status}`);
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = format === "zip" ? "certificates.zip" : "certificates.xlsx";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      toast({ variant: "destructive", title: "تعذر تنزيل الملفات", description: (error as Error).message });
    }
  };

  const downloadImagesZip = async (format: "png" | "jpg", includeSheet = false) => {
    if (showTrash) return;
    const key = `${format}-${includeSheet ? "sheet" : "images"}`;
    setImageExporting(key);
    try {
      let ids = selectedIssueIds;
      if (!ids.length) {
        const query = new URLSearchParams();
        if (search.trim()) query.set("search", search.trim());
        if (statusFilter) query.set("status", statusFilter);
        if (sourceFilter) query.set("source", sourceFilter);
        const filtered = await apiFetchJson<CertificateIssue[]>(`/api/certificates?${query.toString()}`);
        ids = filtered.map((issue) => issue.id);
      }
      if (!ids.length) throw new Error("لا توجد شهادات مطابقة للتنزيل");
      const response = await apiFetch(
        `/api/certificates/export-images-zip?${new URLSearchParams({
          ids: ids.join(","),
          format,
          ...(includeSheet ? { includeSheet: "true" } : {}),
        }).toString()}`,
      );
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || `HTTP ${response.status}`);
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `certificates-images-${format}${includeSheet ? "-excel" : ""}.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      toast({ title: "بدأ تنزيل ملف الصور", description: `عدد الشهادات: ${ids.length}` });
    } catch (error) {
      toast({ variant: "destructive", title: "تعذر تنزيل صور الشهادات", description: (error as Error).message });
    } finally {
      setImageExporting(null);
    }
  };

  const openPdf = async (issue: CertificateIssue, preview: boolean) => {
    const target = preview ? window.open("", "_blank") : null;
    try {
      const response = await apiFetch(`/api/certificates/${issue.id}/${preview ? "preview" : "export"}`);
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || `HTTP ${response.status}`);
      }
      const pdfUrl = URL.createObjectURL(await response.blob());
      if (preview && target) {
        target.location.href = pdfUrl;
      } else if (preview) {
        window.location.href = pdfUrl;
      } else {
        const downloadLink = document.createElement("a");
        downloadLink.href = pdfUrl;
        const personName = issue.recipientName
          .normalize("NFC")
          .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
          .replace(/\s+/g, "-")
          .replace(/^[.\s-]+|[.\s-]+$/g, "")
          .slice(0, 100) || `certificate-${issue.serialNumber}`;
        downloadLink.download = `${personName}.pdf`;
        document.body.appendChild(downloadLink);
        downloadLink.click();
        downloadLink.remove();
      }
      window.setTimeout(() => URL.revokeObjectURL(pdfUrl), 60_000);
    } catch (error) {
      target?.close();
      toast({ variant: "destructive", title: "تعذر فتح الشهادة", description: (error as Error).message });
    }
  };

  const emailCertificate = async (issue: CertificateIssue) => {
    const email = window.prompt("أدخل البريد الإلكتروني الذي تريد إرسال الشهادة إليه:", issue.recipientEmail || "");
    if (email === null || !email.trim()) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      toast({ variant: "destructive", title: "البريد الإلكتروني غير صحيح" });
      return;
    }
    if (!window.confirm(`سيتم إرسال PDF الخاص بشهادة ${issue.recipientName} إلى ${email.trim()}. متابعة؟`)) return;

    setEmailSendingId(issue.id);
    try {
      await apiFetchJson(`/api/certificates/${issue.id}/send-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      toast({ title: "تم إرسال الشهادة بالبريد", description: email.trim() });
    } catch (error) {
      toast({ variant: "destructive", title: "تعذر إرسال الشهادة", description: (error as Error).message });
    } finally {
      setEmailSendingId(null);
    }
  };

  const openDraftPdf = async () => {
    if (!certificateForm.templateId) {
      toast({ variant: "destructive", title: "اختر قالب الشهادة أولاً" });
      return;
    }
    if (templateId !== certificateForm.templateId) {
      setTemplateId(certificateForm.templateId);
      toast({ title: "تم تحميل تصميم القالب المحدد", description: "راجع المعاينة ثم أعد فتح معاينة PDF." });
      return;
    }
    const target = window.open("", "_blank");
    try {
      const response = await apiFetch("/api/certificates/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...certificateForm,
          templateId: Number(certificateForm.templateId),
          serialNumber: activeSerial,
          issueId: certificateId,
          signatures: signers,
          partnerIds: selectedPartners,
          layoutConfig: layout,
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || `HTTP ${response.status}`);
      }
      const pdfUrl = URL.createObjectURL(await response.blob());
      if (target) target.location.href = pdfUrl;
      else window.location.href = pdfUrl;
      window.setTimeout(() => URL.revokeObjectURL(pdfUrl), 60_000);
    } catch (error) {
      target?.close();
      toast({ variant: "destructive", title: "تعذرت معاينة PDF", description: (error as Error).message });
    }
  };

  const verifyCertificate = async (event: React.FormEvent) => {
    event.preventDefault();
    setVerificationLoading(true);
    setVerificationResult(null);
    try {
      const result = await apiFetchJson(`/api/certificates/verify?serial=${encodeURIComponent(verificationInput.trim())}`);
      setVerificationResult(result);
    } catch (error) {
      setVerificationResult({ valid: false, error: (error as Error).message });
    } finally {
      setVerificationLoading(false);
    }
  };

  const activeIssue = issues.find((issue) => issue.id === certificateId);
  const activeSerial = editingStatus === "issued" && activeIssue?.status === "issued" && activeIssue.serialNumber === verificationInput
    ? verificationInput
    : "";
  const previewWidth = Math.max(Number(templateForm.width) || 1200, 1);
  const previewHeight = Math.max(Number(templateForm.height) || 800, 1);
  const signatureBoxes: Box[] = signers.map((_, index) => {
    const configured = layout.signatureBoxes?.[index];
    const defaultWidth = 70 / Math.max(signers.length, 1);
    const fallback = {
      x: 15 + index * defaultWidth,
      y: 63,
      width: Math.min(defaultWidth, 24),
      height: 15,
    };
    return boxFor({ position: configured || fallback }, "position", fallback);
  });

  if (loading) return <div className="py-16 text-center text-muted-foreground">جاري تحميل استوديو الشهادات...</div>;

  return (
    <div className="space-y-6" dir="rtl">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">استوديو الشهادات</h1>
          <p className="mt-1 text-sm text-muted-foreground">كل أدوات الشهادات والأكواد والجهات في أقسام مستقلة وواضحة.</p>
        </div>
        <button className="rounded-lg border px-4 py-2 text-sm" onClick={() => refresh().catch((error: Error) => toast({ variant: "destructive", title: "تعذر التحديث", description: error.message }))}>
          تحديث البيانات
        </button>
      </header>

      <nav className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3" role="tablist" aria-label="أقسام استوديو الشهادات">
        {certificateStudioSections.map((section) => (
          <button
            key={section.id}
            type="button"
            role="tab"
            aria-selected={activeSection === section.id}
            className={`rounded-xl border p-3 text-right transition-colors ${
              activeSection === section.id
                ? "border-primary bg-primary/5 text-primary shadow-sm"
                : "bg-white hover:bg-muted/40"
            }`}
            onClick={() => setActiveSection(section.id)}
          >
            <span className="block font-semibold">{section.label}</span>
            <span className="mt-1 block text-xs text-muted-foreground">{section.description}</span>
            {section.id === "codes" && (
              <span className="mt-2 inline-block rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800">
                {reservedIssues.length} كود غير مربوط
              </span>
            )}
          </button>
        ))}
      </nav>

      <p className="text-sm font-medium text-primary">
        {certificateStudioSections.find((section) => section.id === activeSection)?.description}
      </p>

      {activeSection === "verification" && (
      <section className="space-y-4 rounded-2xl border bg-white p-5 shadow-sm">
        <div>
          <h2 className="text-lg font-bold">إعدادات صفحة التحقق</h2>
          <p className="mt-1 text-sm text-muted-foreground">عدّل النصوص والحقول المتاحة للزائر، وشاهد معاينة مباشرة قبل الحفظ.</p>
        </div>
        <form onSubmit={saveVerificationSettings} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="عنوان الصفحة" value={verifySettings.pageTitle} onChange={(value) => setVerifySettings({ ...verifySettings, pageTitle: value })} />
            <ImageUploadField label="شعار صفحة التحقق" value={verifySettings.logoUrl} onChange={(value) => setVerifySettings({ ...verifySettings, logoUrl: value })} />
            {([
              ["pageSubtitle", "وصف الصفحة"],
              ["successTitle", "عنوان الشهادة الصحيحة"],
              ["successMessage", "رسالة الشهادة الصحيحة"],
              ["cancelledTitle", "عنوان الشهادة الملغاة"],
              ["cancelledMessage", "رسالة الشهادة الملغاة"],
              ["notFoundMessage", "رسالة عدم العثور"],
              ["footerText", "نص التذييل"],
            ] as const).map(([key, label]) => (
              <label key={key} className="block space-y-1.5 text-sm">
                <span className="font-medium">{label}</span>
                <textarea
                  className="min-h-20 w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                  value={verifySettings[key]}
                  onChange={(event) => setVerifySettings({ ...verifySettings, [key]: event.target.value })}
                />
              </label>
            ))}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 rounded-lg bg-muted/30 p-3">
              <p className="text-sm font-semibold">الحقول الظاهرة للزائر</p>
              {([
                ["recipientName", "اسم المستفيد"],
                ["programTitle", "اسم الدورة / البرنامج"],
                ["issuerName", "الجهة المصدرة"],
                ["issueDate", "تاريخ الإصدار"],
                ["partners", "المؤسسات الشريكة"],
                ["serialNumber", "رقم الشهادة"],
              ] as const).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={verifySettings.visibleFields[key]}
                    onChange={(event) => setVerifySettings({
                      ...verifySettings,
                      visibleFields: { ...verifySettings.visibleFields, [key]: event.target.checked },
                    })}
                  />
                  {label}
                </label>
              ))}
            </div>
            <div className="space-y-2 rounded-lg bg-muted/30 p-3">
              <p className="text-sm font-semibold">المعاينة والتنزيل</p>
              {([
                ["showCertificatePreview", "عرض معاينة صورة الشهادة"],
                ["allowDownloadPdf", "السماح بتنزيل PDF"],
                ["allowDownloadImage", "السماح بتنزيل الصورة"],
                ["showLegacyNote", "عرض ملاحظة الشهادات القديمة"],
              ] as const).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={verifySettings[key]}
                    onChange={(event) => setVerifySettings({ ...verifySettings, [key]: event.target.checked })}
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>
          <div className="rounded-xl border bg-slate-50 p-4" dir="rtl">
            <div className="mb-3 text-center">
              {verifySettings.logoUrl && <img src={verifySettings.logoUrl} alt="" className="mx-auto mb-2 max-h-12 max-w-32 object-contain" />}
              <h3 className="font-bold">{verifySettings.pageTitle || "عنوان صفحة التحقق"}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{verifySettings.pageSubtitle}</p>
            </div>
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-emerald-800">
              <p className="font-bold">{verifySettings.successTitle}</p>
              <p className="mt-1 text-sm">{verifySettings.successMessage}</p>
              <div className="mt-3 grid gap-2 rounded bg-white/80 p-3 text-xs sm:grid-cols-2">
                {verifySettings.visibleFields.recipientName && <p>اسم المستفيد: مثال تجريبي</p>}
                {verifySettings.visibleFields.programTitle && <p>البرنامج: مثال تجريبي</p>}
                {verifySettings.visibleFields.issuerName && <p>الجهة: Arkan Web</p>}
                {verifySettings.visibleFields.issueDate && <p>تاريخ الإصدار: مثال تجريبي</p>}
                {verifySettings.visibleFields.partners && <p>الشركاء: مثال تجريبي</p>}
                {verifySettings.visibleFields.serialNumber && <p dir="ltr">AW-CERT-2026-000001</p>}
              </div>
              {verifySettings.showLegacyNote && <p className="mt-2 rounded bg-white/80 p-2 text-xs text-muted-foreground">معاينة ملاحظة الشهادات القديمة: تاريخ التوثيق وتاريخ الإصدار الأصلي.</p>}
              {verifySettings.showCertificatePreview && <div className="mt-3 flex h-24 items-center justify-center rounded border border-dashed bg-white text-xs text-muted-foreground">معاينة صورة الشهادة</div>}
              <div className="mt-2 flex gap-2 text-xs">
                {verifySettings.allowDownloadPdf && <span className="rounded border bg-white px-2 py-1">تنزيل PDF</span>}
                {verifySettings.allowDownloadImage && <span className="rounded border bg-white px-2 py-1">تنزيل الصورة</span>}
              </div>
            </div>
            {verifySettings.footerText && <p className="mt-3 text-center text-xs text-muted-foreground">{verifySettings.footerText}</p>}
          </div>
          <button type="submit" disabled={savingVerifySettings} className="rounded-lg bg-primary px-4 py-2.5 font-semibold text-primary-foreground disabled:opacity-60">
            {savingVerifySettings ? "جارٍ الحفظ..." : "حفظ إعدادات صفحة التحقق"}
          </button>
        </form>
      </section>
      )}

      {activeSection === "codes" && (
      <>
      <section className="space-y-4 rounded-2xl border border-primary/20 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">حجز أكواد توثيق</h2>
            <p className="mt-1 text-sm text-muted-foreground">أنشئ أرقاماً وروابط QR ثابتة قبل تجهيز تصميم الشهادة خارج الموقع.</p>
          </div>
          <span className="rounded-full bg-amber-50 px-3 py-1 text-sm font-semibold text-amber-800">الأكواد المحجوزة: {reservedIssues.length}</span>
        </div>
        <div className="flex gap-2">
          <button type="button" className={`rounded-lg border px-4 py-2 text-sm ${reservationMode === "count" ? "border-primary bg-primary/5 font-semibold text-primary" : ""}`} onClick={() => setReservationMode("count")}>عدد أكواد</button>
          <button type="button" className={`rounded-lg border px-4 py-2 text-sm ${reservationMode === "names" ? "border-primary bg-primary/5 font-semibold text-primary" : ""}`} onClick={() => setReservationMode("names")}>قائمة أسماء</button>
          <button type="button" className={`rounded-lg border px-4 py-2 text-sm ${reservationMode === "codes" ? "border-primary bg-primary/5 font-semibold text-primary" : ""}`} onClick={() => setReservationMode("codes")}>كتابة الأكواد</button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {reservationMode === "count" ? (
            <Field label="عدد الأكواد (1–200)" type="number" value={reservationCount} onChange={setReservationCount} />
          ) : reservationMode === "names" ? (
            <label className="block space-y-1.5 text-sm sm:col-span-2">
              <span className="font-medium">الأسماء (اسم في كل سطر، ويمكن إضافة البريد بعد فاصلة)</span>
              <textarea className="min-h-28 w-full rounded-lg border bg-background px-3 py-2" value={reservationNames} onChange={(event) => setReservationNames(event.target.value)} placeholder={"محمد أحمد, mail@example.com\nسارة علي"} />
            </label>
          ) : (
            <label className="block space-y-1.5 text-sm sm:col-span-2">
              <span className="font-medium">الأكواد المخصصة (كود واحد في كل سطر)</span>
              <textarea
                className="min-h-28 w-full rounded-lg border bg-background px-3 py-2 font-mono"
                dir="auto"
                maxLength={20_200}
                value={reservationSerialNumbers}
                onChange={(event) => setReservationSerialNumbers(event.target.value)}
                placeholder={"CERT-2026-001\nMY-CUSTOM-CODE-002"}
              />
              <span className="block text-xs text-muted-foreground">يمكنك كتابة أي صيغة، بحد أقصى 100 حرف للكود و200 كود في الدفعة. لا تُستخدم الأكواد المكررة.</span>
            </label>
          )}
          <Field label="اسم الدورة (اختياري)" value={reservationProgramTitle} onChange={setReservationProgramTitle} />
          <Field label="اسم الجهة المصدرة للكود (اختياري)" value={reservationIssuerName} onChange={setReservationIssuerName} />
          <Field label="التاريخ (اختياري)" type="date" value={reservationIssueDate} onChange={setReservationIssueDate} />
        </div>
        <button type="button" disabled={reservationBusy} className="rounded-lg bg-primary px-4 py-2.5 font-semibold text-primary-foreground disabled:opacity-60" onClick={() => void reserveCertificates()}>
          {reservationBusy ? "جارٍ حجز الأكواد..." : "حجز الأكواد"}
        </button>
        {newlyReserved.length > 0 && (
          <div className="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50/50 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold">تم حجز {newlyReserved.length} كود</p>
              <button type="button" className="rounded-lg border bg-white px-3 py-2 text-sm font-semibold" onClick={() => void downloadReservedCodes(newlyReserved.map((issue) => issue.id))}>تنزيل ZIP للـ QR + Excel</button>
            </div>
            <div className="max-h-64 overflow-auto rounded-lg border bg-white">
              {newlyReserved.map((issue) => (
                <div key={issue.id} className="flex flex-wrap items-center gap-2 border-b p-2 text-sm last:border-b-0">
                  <span className="font-mono" dir="ltr">{issue.serialNumber}</span>
                  <span className="flex-1">{issue.recipientName}</span>
                  <a className="text-primary underline" href={issue.validationUrl} target="_blank" rel="noreferrer">رابط التحقق</a>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold">الأكواد المحجوزة التي لم تُربط بصورة ({reservedIssues.length})</h3>
            {reservedIssues.length > 0 && <button type="button" className="rounded-lg border px-3 py-2 text-sm" onClick={() => void downloadReservedCodes(reservedIssues.map((issue) => issue.id))}>تنزيل كل الأكواد المحجوزة</button>}
          </div>
          <div className="max-h-72 divide-y overflow-auto rounded-xl border">
            {reservedIssues.map((issue) => (
              <div key={issue.id} className="flex flex-wrap items-center gap-2 p-3 text-sm">
                <span className="font-mono" dir="ltr">{issue.serialNumber}</span>
                <span className="min-w-24 flex-1">{issue.recipientName}</span>
                {issue.recipientEmail && <span className="text-muted-foreground" dir="ltr">{issue.recipientEmail}</span>}
                <a className="text-primary underline" href={issue.validationUrl} target="_blank" rel="noreferrer">رابط التحقق</a>
                <button type="button" className="text-primary underline" onClick={() => void downloadReservedCodes([issue.id])}>تنزيل QR + Excel</button>
              </div>
            ))}
            {!reservedIssues.length && <p className="p-4 text-center text-sm text-muted-foreground">لا توجد أكواد محجوزة حالياً.</p>}
          </div>
        </div>
      </section>

      <section className="space-y-4 rounded-2xl border border-primary/20 bg-white p-5 shadow-sm">
        <div>
          <h2 className="text-lg font-bold">رفع الشهادات الجاهزة وربطها بالأكواد</h2>
          <p className="mt-1 text-sm text-muted-foreground">تتم مطابقة الأكواد المخصصة أو رقم AW-CERT أو الاسم الكامل من اسم الملف تلقائياً، ويمكنك اختيار الكود يدوياً قبل الإصدار.</p>
        </div>
        <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-5 text-center hover:bg-muted/30">
          <span className="font-semibold">{reservedImageUploads.length ? `إضافة صور أخرى (${reservedImageUploads.length}/50)` : "اختيار صور الشهادات الجاهزة"}</span>
          <span className="text-xs text-muted-foreground">JPG أو PNG أو WebP — حتى 8 ميجابايت للصورة، وبحد أقصى 50 صورة</span>
          <input className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" multiple disabled={attachingImages} onChange={(event) => {
            void addReservedImageFiles(event.target.files);
            event.target.value = "";
          }} />
        </label>
        {reservedImageUploads.length > 0 && (
          <div className="space-y-3">
            {reservedImageUploads.map((image, index) => {
              const currentMatch = reservedIssues.find((issue) => issue.serialNumber === image.serialNumber);
              const usedByOtherImage = (serial: string) => reservedImageUploads.some((other) => other.id !== image.id && other.serialNumber === serial);
              return (
                <div key={image.id} className="grid gap-3 rounded-xl border p-3 sm:grid-cols-[150px_1fr]">
                  <div className="space-y-2">
                    <div className="overflow-hidden rounded-lg border bg-muted" style={{ aspectRatio: `${image.width} / ${image.height}` }}>
                      <img src={image.previewUrl} alt={`معاينة الصورة ${index + 1}`} className="h-full w-full object-contain" />
                    </div>
                    <p className="break-all text-xs text-muted-foreground">{image.file.name}</p>
                  </div>
                  <div className="space-y-3">
                    <div className={`rounded-lg px-3 py-2 text-sm ${currentMatch ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>
                      {currentMatch ? image.matched ? "تمت المطابقة تلقائياً" : "تم اختيار الكود يدوياً" : "لم تتم المطابقة — اختر كوداً محجوزاً"}
                    </div>
                    <label className="block space-y-1.5 text-sm">
                      <span className="font-medium">كود التوثيق</span>
                      <select className="w-full rounded-lg border bg-background px-3 py-2 font-mono" dir="ltr" value={image.serialNumber} onChange={(event) => {
                        const selected = reservedIssues.find((issue) => issue.serialNumber === event.target.value);
                        setReservedImageUploads((current) => current.map((item) => item.id === image.id ? {
                          ...item,
                          serialNumber: event.target.value,
                          matched: false,
                          recipientName: selected && selected.recipientName !== "بدون اسم"
                            ? selected.recipientName
                            : item.recipientName,
                        } : item));
                      }}>
                        <option value="">اختر كوداً محجوزاً</option>
                        {reservedIssues.map((issue) => (
                          <option key={issue.id} value={issue.serialNumber} disabled={usedByOtherImage(issue.serialNumber)}>
                            {issue.serialNumber} · {issue.recipientName}
                          </option>
                        ))}
                      </select>
                    </label>
                    <Field label="اسم المستفيد" value={image.recipientName} onChange={(value) => setReservedImageUploads((current) => current.map((item) => item.id === image.id ? { ...item, recipientName: value } : item))} />
                    <button type="button" className="text-sm text-destructive underline" onClick={() => removeReservedImage(image.id)}>إزالة الصورة</button>
                  </div>
                </div>
              );
            })}
            <button type="button" disabled={attachingImages} className="rounded-lg bg-primary px-4 py-2.5 font-semibold text-primary-foreground disabled:opacity-60" onClick={() => void attachReservedImages()}>
              {attachingImages ? "جارٍ رفع الصور وإصدار الشهادات..." : "إصدار وتوثيق"}
            </button>
          </div>
        )}
        {attachmentErrors.length > 0 && (
          <div className="space-y-1 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            <p className="font-semibold">تعذر إكمال بعض الصور:</p>
            {attachmentErrors.map((error, index) => <p key={`${error.serialNumber}-${index}`}>{error.serialNumber ? `${error.serialNumber}: ` : ""}{error.reason}</p>)}
          </div>
        )}
      </section>
      </>
      )}

      {activeSection === "issue" && (
      <>
      <section className="space-y-4 rounded-2xl border border-primary/20 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
          <h2 className="text-lg font-bold">{imageIssueMode === "legacy" ? "توثيق شهادات قديمة" : "توثيق شهادة أو أكثر"}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {imageIssueMode === "legacy"
              ? "ارفع شهادات صدرت سابقاً بدون QR. سيُضاف رقم التوثيق ورمز QR فوق الصورة، مع حفظ تاريخ الإصدار الأصلي."
              : "ارفع صورة شهادة واحدة أو أكثر، واكتب اسم صاحب كل شهادة وبيانات التحقق. سيحتفظ الموقع بالصورة كما هي ويضيف رقمًا فريدًا ورمز QR فوقها."}
          </p>
          </div>
          <div className="flex gap-2">
            <button type="button" className={`rounded-lg border px-3 py-2 text-sm ${imageIssueMode === "standard" ? "border-primary bg-primary/5 font-semibold text-primary" : ""}`} onClick={() => setImageIssueMode("standard")}>شهادات عادية</button>
            <button type="button" className={`rounded-lg border px-3 py-2 text-sm ${imageIssueMode === "legacy" ? "border-primary bg-primary/5 font-semibold text-primary" : ""}`} onClick={() => setImageIssueMode("legacy")}>شهادات قديمة</button>
          </div>
        </div>
        {imageIssueMode === "legacy" && (
          <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/50 p-4">
            <p className="text-sm font-semibold text-amber-900">
              رقم التوثيق يتولد وقت التوثيق بسنة الإصدار الحالية، بينما يظهر تاريخ الإصدار الأصلي منفصلاً في صفحة التحقق.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label="تاريخ افتراضي لكل الصور"
                type="date"
                value={legacyDefaultDate}
                min="1990-01-01"
                max={getLocalDateInputValue()}
                onChange={applyLegacyDefaultDate}
              />
              <label className="block space-y-1.5 text-sm">
                <span className="font-medium">استيراد بيانات من Excel أو CSV</span>
                <input
                  className="block w-full rounded-lg border bg-white px-3 py-2 text-sm"
                  type="file"
                  accept=".csv,.xlsx"
                  onChange={(event) => {
                    void importLegacyMetadataFile(event.target.files?.[0]);
                    event.target.value = "";
                  }}
                />
              </label>
            </div>
            <label className="block space-y-1.5 text-sm">
              <span className="font-medium">لصق صفوف البيانات (اسم الملف، الاسم، التاريخ، الدورة، الجهة، البريد)</span>
              <textarea
                className="min-h-24 w-full rounded-lg border bg-white px-3 py-2"
                value={legacyTextImport}
                onChange={(event) => setLegacyTextImport(event.target.value)}
                placeholder={"اسم الملف,الاسم,التاريخ,الدورة,الجهة,البريد\ncertificate-1.png,محمد أحمد,2020-05-20,دورة تدريبية,أركان,mail@example.com"}
              />
            </label>
            <button type="button" className="rounded-lg border bg-white px-3 py-2 text-sm" onClick={applyLegacyTextImport}>مطابقة بيانات الصفوف مع الصور</button>
            {legacyMetadataRows.filter((row) =>
              !uploadedCertificates.some((certificate) =>
                normalizeLegacyFileName(certificate.file.name) === normalizeLegacyFileName(row.fileName),
              ),
            ).map((row) => (
              <p key={row.id} className="text-sm text-red-700">
                لم يتم العثور على صورة باسم الملف: {row.fileName || "اسم ملف غير محدد"}
              </p>
            ))}
          </div>
        )}
        <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 text-center hover:bg-muted/30">
          <span className="font-semibold">{uploadedCertificates.length ? `إضافة صور أخرى (${uploadedCertificates.length}/50)` : imageIssueMode === "legacy" ? "اختيار صور الشهادات القديمة" : "اختيار صورة واحدة أو أكثر"}</span>
          <span className="text-xs text-muted-foreground">JPG أو PNG أو WebP — حتى 8 ميجابايت للصورة، وبحد أقصى 50 شهادة في الطلب</span>
          <input
            className="sr-only"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            disabled={bulkIssuing}
            onChange={(event) => {
              void addUploadedCertificates(event.target.files);
              event.target.value = "";
            }}
          />
        </label>

        <div className="space-y-2 rounded-lg bg-muted/30 p-3">
          <p className="text-sm font-semibold">العناصر التي ستُضاف فوق الصور</p>
          <p className="text-xs text-muted-foreground">افتراضيًا نضيف رقم التوثيق والـQR فقط؛ فعّل الاسم أو البيانات إذا لم تكن مطبوعة مسبقًا في صور الشهادات.</p>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {([
              ["recipientName", "إضافة اسم المستفيد على الصورة"],
              ["programTitle", "إضافة اسم الشهادة / البرنامج"],
              ["issueDate", imageIssueMode === "legacy" ? "إضافة تاريخ الإصدار الأصلي" : "إضافة تاريخ الإصدار"],
              ["issuerName", "إضافة الجهة المصدرة"],
            ] as const).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={isCertificateElementVisible(bulkLayout, key)}
                  onChange={(event) => {
                    const hiddenElements: string[] = Array.isArray(bulkLayout.hiddenElements)
                      ? [...bulkLayout.hiddenElements]
                      : [];
                    setBulkLayout({
                      ...bulkLayout,
                      hiddenElements: event.target.checked
                        ? hiddenElements.filter((item) => item !== key)
                        : [...hiddenElements, key],
                    });
                  }}
                />
                {label}
              </label>
            ))}
            {imageIssueMode === "legacy" && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={legacyWhiteBackground} onChange={(event) => setLegacyWhiteBackground(event.target.checked)} />
              خلفية بيضاء خلف الـ QR لتحسين وضوحه
            </label>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {(imageIssueMode === "legacy"
            ? ["serialNumber", "qrCode"]
            : ["serialNumber", "qrCode", ...(isCertificateElementVisible(bulkLayout, "recipientName") ? ["recipientName"] : [])]
            ).map((key) => (
            <div key={key} className="rounded-lg border bg-background p-2">
                <p className="mb-2 text-xs font-semibold">{key === "serialNumber" ? "موضع رقم التوثيق (%)" : key === "qrCode" ? "موضع وحجم QR (%)" : "موضع اسم المستفيد (%)"}</p>
                <div className="grid grid-cols-4 gap-2">
                  {(["x", "y", "width", "height"] as const).map((part) => (
                    <Field
                      key={part}
                      label={{ x: "أفقي", y: "عمودي", width: "عرض", height: "ارتفاع" }[part]}
                      type="number"
                      value={boxFor(bulkLayout, key, initialBoxes[key])[part]}
                      onChange={(value) => updateBulkBox(key, part, value)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
          {imageIssueMode === "legacy" && (
            <button type="button" className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white" onClick={openLegacyPreview}>معاينة أول صورة بالـ QR</button>
          )}
        </div>

        {imageIssueMode === "legacy" && legacyPreviewOpen && uploadedCertificates[0] && (
          <div className="space-y-3 rounded-xl border bg-slate-50 p-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="font-semibold">معاينة الصورة الأولى</h3>
                <p className="text-xs text-muted-foreground">اسحب مربع QR أو رقم التوثيق لضبط موضعهما؛ الإعدادات ستُطبق على كل الصور.</p>
              </div>
              <button type="button" className="text-sm text-primary underline" onClick={() => setLegacyPreviewOpen(false)}>إغلاق المعاينة</button>
            </div>
            <div
              ref={legacyPreviewRef}
              className="relative mx-auto w-full max-w-5xl overflow-hidden rounded-lg border bg-white"
              style={{ aspectRatio: `${uploadedCertificates[0].width} / ${uploadedCertificates[0].height}` }}
            >
              <img src={uploadedCertificates[0].previewUrl} alt="معاينة الشهادة القديمة" className="absolute inset-0 h-full w-full object-fill" />
              {isCertificateElementVisible(bulkLayout, "qrCode") && (
                <div
                  className={`absolute cursor-move touch-none ${legacyWhiteBackground ? "bg-white p-1.5" : "bg-white/20"}`}
                  style={{
                    left: `${boxFor(bulkLayout, "qrCode", initialBoxes.qrCode).x}%`,
                    top: `${boxFor(bulkLayout, "qrCode", initialBoxes.qrCode).y}%`,
                    width: `${boxFor(bulkLayout, "qrCode", initialBoxes.qrCode).width}%`,
                    height: `${boxFor(bulkLayout, "qrCode", initialBoxes.qrCode).height}%`,
                  }}
                  onPointerDown={(event) => startLegacyDrag(event, "qrCode")}
                >
                  <img src={legacyQrPreviewUrl} alt="رمز QR تجريبي" className="h-full w-full object-fill" draggable={false} />
                </div>
              )}
              {isCertificateElementVisible(bulkLayout, "serialNumber") && (
                <div
                  className="absolute flex cursor-move touch-none items-center justify-center overflow-hidden bg-white/90 px-1 text-center font-mono text-[clamp(8px,1.5vw,18px)]"
                  style={{
                    left: `${boxFor(bulkLayout, "serialNumber", initialBoxes.serialNumber).x}%`,
                    top: `${boxFor(bulkLayout, "serialNumber", initialBoxes.serialNumber).y}%`,
                    width: `${boxFor(bulkLayout, "serialNumber", initialBoxes.serialNumber).width}%`,
                    height: `${boxFor(bulkLayout, "serialNumber", initialBoxes.serialNumber).height}%`,
                  }}
                  onPointerDown={(event) => startLegacyDrag(event, "serialNumber")}
                >
                  AW-CERT-{new Date().getFullYear()}-000001
                </div>
              )}
              {isCertificateElementVisible(bulkLayout, "recipientName") && <span className="absolute inset-x-0 top-1/3 text-center font-bold">{uploadedCertificates[0].recipientName || "اسم المستفيد"}</span>}
              {isCertificateElementVisible(bulkLayout, "issueDate") && <span className="absolute inset-x-0 top-[42%] text-center text-sm">{uploadedCertificates[0].issueDate || "تاريخ الإصدار الأصلي"}</span>}
              {isCertificateElementVisible(bulkLayout, "programTitle") && uploadedCertificates[0].programTitle && <span className="absolute inset-x-0 top-[48%] text-center text-sm">{uploadedCertificates[0].programTitle}</span>}
              {isCertificateElementVisible(bulkLayout, "issuerName") && uploadedCertificates[0].issuerName && <span className="absolute inset-x-0 bottom-[12%] text-center text-sm">{uploadedCertificates[0].issuerName}</span>}
            </div>
            <p className="text-center text-xs text-muted-foreground">رمز QR المعروض حقيقي للمعاينة؛ يُنشأ رمز كل شهادة برقمها الفعلي عند الإصدار.</p>
          </div>
        )}

        {uploadedCertificates.length > 0 && (
          <div className="space-y-3">
            {uploadedCertificates.map((certificate, index) => (
              <div key={certificate.id} className="grid gap-3 rounded-xl border p-3 sm:grid-cols-[120px_1fr]">
                <div className="space-y-2">
                <div
                  className="relative w-full overflow-hidden rounded-lg border bg-muted"
                  style={{ aspectRatio: `${certificate.width} / ${certificate.height}` }}
                >
                  <img src={certificate.previewUrl} alt={`معاينة شهادة ${index + 1}`} className="absolute inset-0 h-full w-full object-fill" />
                  {isCertificateElementVisible(bulkLayout, "serialNumber") && (
                    <span
                      className="absolute flex items-center justify-center overflow-hidden bg-white/75 text-center font-mono text-[clamp(5px,1.3vw,10px)]"
                      style={{
                        left: `${boxFor(bulkLayout, "serialNumber", initialBoxes.serialNumber).x}%`,
                        top: `${boxFor(bulkLayout, "serialNumber", initialBoxes.serialNumber).y}%`,
                        width: `${boxFor(bulkLayout, "serialNumber", initialBoxes.serialNumber).width}%`,
                        height: `${boxFor(bulkLayout, "serialNumber", initialBoxes.serialNumber).height}%`,
                      }}
                    >
                      رقم التوثيق
                    </span>
                  )}
                  {isCertificateElementVisible(bulkLayout, "qrCode") && (
                    <span
                      className="absolute flex items-center justify-center border border-dashed border-slate-600 bg-white/80 text-center text-[clamp(5px,1.2vw,9px)]"
                      style={{
                        left: `${boxFor(bulkLayout, "qrCode", initialBoxes.qrCode).x}%`,
                        top: `${boxFor(bulkLayout, "qrCode", initialBoxes.qrCode).y}%`,
                        width: `${boxFor(bulkLayout, "qrCode", initialBoxes.qrCode).width}%`,
                        height: `${boxFor(bulkLayout, "qrCode", initialBoxes.qrCode).height}%`,
                      }}
                    >
                      QR بعد الإصدار
                    </span>
                  )}
                  {isCertificateElementVisible(bulkLayout, "recipientName") && (
                    <span
                      className="absolute flex items-center justify-center overflow-hidden bg-white/75 text-center text-[clamp(5px,1.3vw,10px)] font-semibold"
                      style={{
                        left: `${boxFor(bulkLayout, "recipientName", initialBoxes.recipientName).x}%`,
                        top: `${boxFor(bulkLayout, "recipientName", initialBoxes.recipientName).y}%`,
                        width: `${boxFor(bulkLayout, "recipientName", initialBoxes.recipientName).width}%`,
                        height: `${boxFor(bulkLayout, "recipientName", initialBoxes.recipientName).height}%`,
                      }}
                    >
                      {certificate.recipientName || "اسم المستفيد"}
                    </span>
                  )}
                </div>
                  <p className="truncate text-xs text-muted-foreground" title={certificate.file.name}>{certificate.file.name}</p>
                  <button type="button" className="text-xs text-destructive" disabled={bulkIssuing} onClick={() => removeUploadedCertificate(certificate.id)}>إزالة الصورة</button>
                </div>
                <div className="grid content-start gap-3 sm:grid-cols-2">
                  <Field label="اسم صاحب الشهادة *" value={certificate.recipientName} onChange={(value) => updateUploadedCertificate(certificate.id, "recipientName", value)} />
                  <Field label="اسم الشهادة / البرنامج (اختياري)" value={certificate.programTitle} onChange={(value) => updateUploadedCertificate(certificate.id, "programTitle", value)} />
                  <Field label="الجهة المصدرة (اختياري)" value={certificate.issuerName} onChange={(value) => updateUploadedCertificate(certificate.id, "issuerName", value)} />
                  <Field label="البريد (اختياري)" value={certificate.recipientEmail} dir="ltr" onChange={(value) => updateUploadedCertificate(certificate.id, "recipientEmail", value)} />
                  <Field
                    label={imageIssueMode === "legacy" ? "تاريخ الإصدار الأصلي *" : "تاريخ الإصدار"}
                    type="date"
                    value={certificate.issueDate}
                    min={imageIssueMode === "legacy" ? "1990-01-01" : undefined}
                    max={imageIssueMode === "legacy" ? getLocalDateInputValue() : undefined}
                    onChange={(value) => updateUploadedCertificate(certificate.id, "issueDate", value)}
                  />
                </div>
              </div>
            ))}
            <button
              type="button"
              className="w-full rounded-lg bg-primary px-4 py-3 font-semibold text-primary-foreground disabled:opacity-60"
              disabled={bulkIssuing || uploadedCertificates.some((certificate) =>
                !certificate.recipientName.trim() || (imageIssueMode === "legacy" && !certificate.issueDate),
              )}
              onClick={() => void issueUploadedCertificates()}
            >
              {bulkIssuing ? "جارٍ رفع الصور وإصدار الشهادات..." : `إصدار وتوثيق ${uploadedCertificates.length} شهادة`}
            </button>
          </div>
        )}
      </section>

      <section className="space-y-4 rounded-2xl border bg-white p-5 shadow-sm">
        <div>
          <h2 className="text-lg font-bold">إنشاء شهادات من قائمة أسماء</h2>
          <p className="mt-1 text-sm text-muted-foreground">اختر قالباً وأدخل بيانات الدورة مرة واحدة، ثم راجع القائمة قبل إصدار حتى 200 شهادة.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1.5 text-sm">
            <span className="font-medium">قالب الشهادة</span>
            <select className="w-full rounded-lg border bg-background px-3 py-2" value={bulkTemplateId} onChange={(event) => setBulkTemplateId(event.target.value)}>
              <option value="">اختر قالباً</option>
              {templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
            </select>
          </label>
          <Field label="اسم الدورة / البرنامج" value={bulkProgramTitle} onChange={setBulkProgramTitle} />
          <Field label="الجهة المصدرة" value={bulkIssuerName} onChange={setBulkIssuerName} />
          <Field label="تاريخ الإصدار" type="date" value={bulkIssueDate} onChange={setBulkIssueDate} />
        </div>
        <div className="space-y-2 rounded-lg bg-muted/30 p-3">
          <p className="text-sm font-semibold">المؤسسات الشريكة</p>
          <div className="flex flex-wrap gap-4">
            {partners.map((partner) => (
              <label key={partner.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={bulkPartnerIds.includes(partner.id)}
                  onChange={(event) => setBulkPartnerIds((selected) => event.target.checked
                    ? [...selected, partner.id]
                    : selected.filter((id) => id !== partner.id))}
                />
                {partner.name}
              </label>
            ))}
            {!partners.length && <p className="text-sm text-muted-foreground">لا توجد مؤسسات مسجلة.</p>}
          </div>
        </div>
        <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
          <label className="block space-y-1.5 text-sm">
            <span className="font-medium">الأسماء — اسم في كل سطر، ويمكن إضافة البريد بعد فاصلة</span>
            <textarea
              className="min-h-36 w-full rounded-lg border bg-background px-3 py-2"
              placeholder={"أحمد محمد\nسارة علي, sara@example.com"}
              value={bulkText}
              onChange={(event) => updateBulkNameText(event.target.value)}
            />
          </label>
          <label className="inline-flex h-fit cursor-pointer items-center justify-center rounded-lg border px-4 py-2 text-sm hover:bg-muted">
            استيراد CSV أو Excel
            <input
              className="sr-only"
              type="file"
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(event) => {
                void importBulkNameFile(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
          </label>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className={`text-sm ${bulkNameRows.length > 200 ? "text-destructive" : "text-muted-foreground"}`}>
            {bulkNameRows.length} من 200 اسم
          </p>
          <button
            type="button"
            className="rounded-lg bg-primary px-4 py-2.5 font-semibold text-primary-foreground disabled:opacity-60"
            disabled={bulkNameIssuing || bulkNameRows.length < 1 || bulkNameRows.length > 200}
            onClick={() => void issueCertificatesFromNames()}
          >
            {bulkNameIssuing ? "جارٍ إصدار الشهادات..." : "إصدار الكل"}
          </button>
        </div>
        {bulkNameRows.length > 0 && (
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full min-w-[540px] text-sm">
              <thead className="bg-muted/40 text-right"><tr><th className="p-2">#</th><th className="p-2">الاسم</th><th className="p-2">البريد الإلكتروني</th><th className="p-2">إجراء</th></tr></thead>
              <tbody className="divide-y">
                {bulkNameRows.map((row, index) => (
                  <tr key={row.id}>
                    <td className="p-2">{index + 1}</td>
                    <td className="p-2"><input className="w-full rounded border px-2 py-1" value={row.name} onChange={(event) => setBulkNameRows((rows) => rows.map((item) => item.id === row.id ? { ...item, name: event.target.value } : item))} /></td>
                    <td className="p-2"><input className="w-full rounded border px-2 py-1" dir="ltr" value={row.email} onChange={(event) => setBulkNameRows((rows) => rows.map((item) => item.id === row.id ? { ...item, email: event.target.value } : item))} /></td>
                    <td className="p-2"><button type="button" className="text-destructive" onClick={() => setBulkNameRows((rows) => rows.filter((item) => item.id !== row.id))}>حذف</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      </>
      )}

      {activeSection === "templates" && (
      <div className="grid gap-6 xl:grid-cols-2">
        <section className="space-y-4 rounded-2xl border bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-bold">تصميم القالب</h2>
            <button
              type="button"
              className="rounded-lg border border-primary/30 px-3 py-2 text-sm font-medium text-primary hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={referenceTemplateLoading || saving}
              onClick={() => void loadReferenceTemplate()}
            >
              {referenceTemplateLoading ? "جارٍ تجهيز القالب..." : "استخدام قالب TraiNova × Arkan"}
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            يستورد التصميم المرجعي بخلفية نظيفة؛ الاسم والبرنامج والشعارات والتوقيعات تبقى عناصر مستقلة قابلة للتعديل.
          </p>
          <label className="block space-y-1.5 text-sm">
            <span className="font-medium">قالب محفوظ</span>
            <select className="w-full rounded-lg border bg-background px-3 py-2" value={templateId} onChange={(event) => {
              const value = event.target.value;
              setTemplateId(value);
              if (!value) {
                setTemplateForm(emptyTemplate);
                applyLayout(initialBoxes);
              }
            }}>
              <option value="">قالب جديد</option>
              {templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
            </select>
          </label>
          {templateId && (
            <div className="flex flex-wrap gap-2">
              <button type="button" className="rounded-lg border px-3 py-2 text-sm disabled:opacity-60" disabled={saving} onClick={() => void duplicateTemplate()}>
                نسخ القالب المحدد
              </button>
              <button type="button" className="rounded-lg border border-destructive/40 px-3 py-2 text-sm text-destructive disabled:opacity-60" disabled={saving} onClick={() => void deleteTemplate()}>
                حذف القالب المحدد
              </button>
            </div>
          )}
          <form onSubmit={saveTemplate} className="space-y-3">
            <Field label="اسم القالب" value={templateForm.name} onChange={(value) => updateTemplateField("name", value)} />
            <Field
              label="عنوان الشهادة (اختياري)"
              value={layout.certificateTitleText ?? ""}
              onChange={(value) => applyLayout({ ...layoutRef.current, certificateTitleText: value })}
            />
            <div className="space-y-2 rounded-lg bg-muted/30 p-3">
              <p className="text-sm font-semibold">العناصر الظاهرة على الشهادة</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {certificateElements.map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={isCertificateElementVisible(layout, key)}
                      onChange={(event) => {
                        const hiddenElements = Array.isArray(layoutRef.current.hiddenElements)
                          ? [...layoutRef.current.hiddenElements]
                          : [];
                        const nextHidden = event.target.checked
                          ? hiddenElements.filter((item: string) => item !== key)
                          : [...hiddenElements, key];
                        applyLayout({ ...layoutRef.current, hiddenElements: nextHidden });
                      }}
                    />
                    {label}
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">يمكن إخفاء النصوص والعناصر القابلة للتحرير. النص المطبوع داخل صورة الخلفية يحتاج إلى خلفية نظيفة.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1.5 text-sm">
                <span className="font-medium">اتجاه الصفحة</span>
                <select className="w-full rounded-lg border bg-background px-3 py-2" value={templateForm.orientation} onChange={(event) => updateTemplateField("orientation", event.target.value)}>
                  <option value="landscape">أفقي</option>
                  <option value="portrait">عمودي</option>
                </select>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <Field label="العرض" type="number" value={templateForm.width} onChange={(value) => updateTemplateField("width", value)} />
                <Field label="الارتفاع" type="number" value={templateForm.height} onChange={(value) => updateTemplateField("height", value)} />
              </div>
            </div>
            <ImageUploadField label="خلفية القالب" value={templateForm.backgroundUrl} onChange={(value) => updateTemplateField("backgroundUrl", value)} />
            <div className="grid gap-3 sm:grid-cols-2">
              <ImageUploadField label="شعار الجهة المصدرة" value={templateForm.logoUrl} onChange={(value) => updateTemplateField("logoUrl", value)} />
              <ImageUploadField label="صورة توقيع افتراضي (اختياري)" value={templateForm.signatureUrl} onChange={(value) => updateTemplateField("signatureUrl", value)} />
            </div>
            <div className="space-y-2 border-t pt-3">
              <p className="text-sm font-semibold">مواضع العناصر (%)</p>
              <p className="text-xs text-muted-foreground">اسحب العناصر في المعاينة لتغيير موقعها، أو اضبط الموقع والحجم بالأرقام.</p>
              {[
                ["certificateTitle", "عنوان الشهادة"],
                ["recipientName", "اسم المستفيد"],
                ["programTitle", "اسم البرنامج"],
                ["issuerName", "الجهة المصدرة"],
                ["signature", "التوقيع الافتراضي"],
                ["serialNumber", "رقم الشهادة"],
                ["issueDate", "تاريخ الإصدار"],
                ["qrCode", "رمز QR"],
                ["logo", "شعار القالب"],
              ].map(([key, label]) => (
                <div key={key} className="grid grid-cols-5 items-end gap-2 rounded-lg bg-muted/30 p-2">
                  <span className="col-span-5 text-xs font-medium sm:col-span-1">{label}</span>
                  {(["x", "y", "width", "height"] as const).map((part) => (
                    <Field key={part} label={part === "x" ? "أفقي" : part === "y" ? "عمودي" : part === "width" ? "عرض" : "ارتفاع"} type="number" value={boxFor(layout, key, initialBoxes[key])[part]} onChange={(value) => updateBox(key, part, value)} />
                  ))}
                  {["recipientName", "programTitle", "issuerName", "serialNumber", "issueDate"].includes(key) && (
                    <label className="col-span-5 flex items-center gap-2 text-xs sm:col-span-2">
                      المحاذاة
                      <select
                        className="rounded border bg-background px-2 py-1"
                        value={alignmentFor(layout, key)}
                        onChange={(event) => applyLayout({ ...layoutRef.current, [key]: { ...boxFor(layoutRef.current, key, initialBoxes[key]), align: event.target.value } })}
                      >
                        <option value="right">يمين</option>
                        <option value="center">وسط</option>
                        <option value="left">يسار</option>
                      </select>
                    </label>
                  )}
                </div>
              ))}
            </div>
            <button disabled={saving} className="w-full rounded-lg bg-primary px-4 py-2.5 font-semibold text-primary-foreground disabled:opacity-60">
              {saving ? "جارٍ الحفظ..." : templateId ? "حفظ تعديلات القالب" : "إنشاء القالب"}
            </button>
          </form>
        </section>

        <section className="space-y-4 rounded-2xl border bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-bold">معاينة مباشرة</h2>
            <div className="flex gap-2">
              <button type="button" className="rounded border px-3 py-1.5 text-sm disabled:opacity-40" disabled={!layoutUndo.length} onClick={undoLayout}>تراجع</button>
              <button type="button" className="rounded border px-3 py-1.5 text-sm disabled:opacity-40" disabled={!layoutRedo.length} onClick={redoLayout}>إعادة</button>
            </div>
          </div>
          <div
            ref={previewRef}
            className="relative mx-auto w-full overflow-hidden border-8 border-amber-700/60 bg-amber-50 shadow-inner"
            style={{
              aspectRatio: `${previewWidth} / ${previewHeight}`,
              containerType: "inline-size",
              backgroundImage: templateForm.backgroundUrl ? `url("${templateForm.backgroundUrl}")` : undefined,
              backgroundSize: "100% 100%",
              backgroundPosition: "center",
            }}
          >
            {!templateForm.backgroundUrl && <div className="absolute inset-3 border border-amber-600/60" />}
            {isCertificateElementVisible(layout, "logo") && templateForm.logoUrl && <img onPointerDown={(event) => startDrag(event, "logo", boxFor(layout, "logo", initialBoxes.logo))} src={templateForm.logoUrl} className="absolute cursor-move touch-none object-contain" style={{ left: `${boxFor(layout, "logo", initialBoxes.logo).x}%`, top: `${boxFor(layout, "logo", initialBoxes.logo).y}%`, width: `${boxFor(layout, "logo", initialBoxes.logo).width}%`, height: `${boxFor(layout, "logo", initialBoxes.logo).height}%` }} alt="" />}
            {isCertificateElementVisible(layout, "signature") && templateForm.signatureUrl && <img onPointerDown={(event) => startDrag(event, "signature", boxFor(layout, "signature", initialBoxes.signature))} src={templateForm.signatureUrl} className="absolute cursor-move touch-none object-contain" style={{ left: `${boxFor(layout, "signature", initialBoxes.signature).x}%`, top: `${boxFor(layout, "signature", initialBoxes.signature).y}%`, width: `${boxFor(layout, "signature", initialBoxes.signature).width}%`, height: `${boxFor(layout, "signature", initialBoxes.signature).height}%` }} alt="التوقيع الافتراضي" />}
            {isCertificateElementVisible(layout, "certificateTitle") && typeof layout.certificateTitleText === "string" && layout.certificateTitleText.trim() && (
              <span
                onPointerDown={(event) => startDrag(event, "certificateTitle", boxFor(layout, "certificateTitle", initialBoxes.certificateTitle))}
                className="absolute flex cursor-move touch-none items-center justify-center overflow-hidden text-center text-[clamp(14px,2.4vw,32px)] font-serif font-bold text-[#0f2350]"
                style={{
                  left: `${boxFor(layout, "certificateTitle", initialBoxes.certificateTitle).x}%`,
                  top: `${boxFor(layout, "certificateTitle", initialBoxes.certificateTitle).y}%`,
                  width: `${boxFor(layout, "certificateTitle", initialBoxes.certificateTitle).width}%`,
                  height: `${boxFor(layout, "certificateTitle", initialBoxes.certificateTitle).height}%`,
                  textAlign: alignmentFor(layout, "certificateTitle"),
                }}
              >
                {layout.certificateTitleText}
              </span>
            )}
            {isCertificateElementVisible(layout, "recipientName") && <span onPointerDown={(event) => startDrag(event, "recipientName", boxFor(layout, "recipientName", initialBoxes.recipientName))} className="absolute flex cursor-move touch-none overflow-hidden text-[clamp(12px,2vw,28px)] font-bold text-slate-900" style={{ left: `${boxFor(layout, "recipientName", initialBoxes.recipientName).x}%`, top: `${boxFor(layout, "recipientName", initialBoxes.recipientName).y}%`, width: `${boxFor(layout, "recipientName", initialBoxes.recipientName).width}%`, height: `${boxFor(layout, "recipientName", initialBoxes.recipientName).height}%`, alignItems: "center", justifyContent: alignmentFor(layout, "recipientName") === "left" ? "flex-start" : alignmentFor(layout, "recipientName") === "right" ? "flex-end" : "center", textAlign: alignmentFor(layout, "recipientName") }}>
              {certificateForm.recipientName || "اسم صاحب الشهادة"}
            </span>}
            {isCertificateElementVisible(layout, "programTitle") && <span onPointerDown={(event) => startDrag(event, "programTitle", boxFor(layout, "programTitle", initialBoxes.programTitle))} className="absolute flex cursor-move touch-none overflow-hidden text-[clamp(9px,1.5vw,18px)] text-slate-700" style={{ left: `${boxFor(layout, "programTitle", initialBoxes.programTitle).x}%`, top: `${boxFor(layout, "programTitle", initialBoxes.programTitle).y}%`, width: `${boxFor(layout, "programTitle", initialBoxes.programTitle).width}%`, height: `${boxFor(layout, "programTitle", initialBoxes.programTitle).height}%`, alignItems: "center", justifyContent: alignmentFor(layout, "programTitle") === "left" ? "flex-start" : alignmentFor(layout, "programTitle") === "right" ? "flex-end" : "center", textAlign: alignmentFor(layout, "programTitle") }}>
              {certificateForm.programTitle || "اسم الشهادة / البرنامج"}
            </span>}
            {isCertificateElementVisible(layout, "issuerName") && <span onPointerDown={(event) => startDrag(event, "issuerName", boxFor(layout, "issuerName", initialBoxes.issuerName))} className="absolute flex cursor-move touch-none overflow-hidden text-[clamp(7px,1vw,13px)] text-slate-600" style={{ left: `${boxFor(layout, "issuerName", initialBoxes.issuerName).x}%`, top: `${boxFor(layout, "issuerName", initialBoxes.issuerName).y}%`, width: `${boxFor(layout, "issuerName", initialBoxes.issuerName).width}%`, height: `${boxFor(layout, "issuerName", initialBoxes.issuerName).height}%`, alignItems: "center", justifyContent: alignmentFor(layout, "issuerName") === "left" ? "flex-start" : alignmentFor(layout, "issuerName") === "right" ? "flex-end" : "center", textAlign: alignmentFor(layout, "issuerName") }}>
              {certificateForm.issuerName || "الجهة المصدرة"}
            </span>}
            {isCertificateElementVisible(layout, "serialNumber") && <span onPointerDown={(event) => startDrag(event, "serialNumber", boxFor(layout, "serialNumber", initialBoxes.serialNumber))} className="absolute flex cursor-move touch-none overflow-hidden text-[clamp(7px,1vw,12px)] font-mono" style={{ left: `${boxFor(layout, "serialNumber", initialBoxes.serialNumber).x}%`, top: `${boxFor(layout, "serialNumber", initialBoxes.serialNumber).y}%`, width: `${boxFor(layout, "serialNumber", initialBoxes.serialNumber).width}%`, height: `${boxFor(layout, "serialNumber", initialBoxes.serialNumber).height}%`, alignItems: "center", justifyContent: alignmentFor(layout, "serialNumber") === "left" ? "flex-start" : alignmentFor(layout, "serialNumber") === "right" ? "flex-end" : "center", textAlign: alignmentFor(layout, "serialNumber") }}>
              رقم الشهادة: {activeSerial || "سيصدر بعد الاعتماد"}
            </span>}
            {isCertificateElementVisible(layout, "issueDate") && <span onPointerDown={(event) => startDrag(event, "issueDate", boxFor(layout, "issueDate", initialBoxes.issueDate))} className="absolute flex cursor-move touch-none items-center justify-center overflow-hidden text-center text-[clamp(6px,0.8vw,10px)] text-slate-600" style={{ left: `${boxFor(layout, "issueDate", initialBoxes.issueDate).x}%`, top: `${boxFor(layout, "issueDate", initialBoxes.issueDate).y}%`, width: `${boxFor(layout, "issueDate", initialBoxes.issueDate).width}%`, height: `${boxFor(layout, "issueDate", initialBoxes.issueDate).height}%` }}>
              تاريخ الإصدار: {certificateForm.issueDate ? new Date(`${certificateForm.issueDate}T12:00:00.000Z`).toLocaleDateString("ar-EG", { timeZone: "UTC" }) : "-"}
            </span>}
            {isCertificateElementVisible(layout, "qrCode") && (activeSerial ? (
              <img onPointerDown={(event) => startDrag(event, "qrCode", boxFor(layout, "qrCode", initialBoxes.qrCode))} src={resolveApiUrl(`/api/certificates/qr?serial=${encodeURIComponent(activeSerial)}`)} alt="رمز التحقق QR" className="absolute cursor-move touch-none bg-white" style={{ left: `${boxFor(layout, "qrCode", initialBoxes.qrCode).x}%`, top: `${boxFor(layout, "qrCode", initialBoxes.qrCode).y}%`, width: `${boxFor(layout, "qrCode", initialBoxes.qrCode).width}%`, height: `${boxFor(layout, "qrCode", initialBoxes.qrCode).height}%` }} />
            ) : (
              <div
                onPointerDown={(event) => startDrag(event, "qrCode", boxFor(layout, "qrCode", initialBoxes.qrCode))}
                className="absolute flex cursor-move touch-none items-center justify-center border border-dashed border-slate-400 bg-white/70 text-[clamp(6px,0.7vw,10px)] text-slate-500"
                style={{
                  left: `${boxFor(layout, "qrCode", initialBoxes.qrCode).x}%`,
                  top: `${boxFor(layout, "qrCode", initialBoxes.qrCode).y}%`,
                  width: `${boxFor(layout, "qrCode", initialBoxes.qrCode).width}%`,
                  height: `${boxFor(layout, "qrCode", initialBoxes.qrCode).height}%`,
                }}
              >
                اسحب رمز QR
              </div>
            ))}
            {isCertificateElementVisible(layout, "partners") && selectedPartnerRecords.map((partner, index) => {
              const defaultWidth = 70 / Math.max(selectedPartnerRecords.length, 1);
              const logoBox = boxFor(
                { position: layout.partnerLogoBoxes?.[String(partner.id)] ?? layout.partnerBoxes?.[String(partner.id)] },
                "position",
                { x: 15 + index * defaultWidth, y: 5, width: Math.min(defaultWidth, 20), height: 14 },
              );
              const signatureBox = boxFor(
                { position: layout.partnerSignatureBoxes?.[String(partner.id)] },
                "position",
                {
                  x: logoBox.x,
                  y: Number(layout.partnerSignatureDefault?.y ?? 68),
                  width: logoBox.width,
                  height: Number(layout.partnerSignatureDefault?.height ?? 20),
                },
              );
              return (
                <div key={partner.id}>
                  {partner.logoUrl && <img onPointerDown={(event) => startDrag(event, `partnerLogo:${partner.id}`, logoBox)} src={partner.logoUrl} className="absolute cursor-move touch-none object-contain" style={{ left: `${logoBox.x}%`, top: `${logoBox.y}%`, width: `${logoBox.width}%`, height: `${logoBox.height}%` }} alt={partner.name} />}
                  <div onPointerDown={(event) => startDrag(event, `partnerSignature:${partner.id}`, signatureBox)} className="absolute flex cursor-move touch-none flex-col items-center justify-center overflow-hidden text-center text-[clamp(6px,0.8vw,10px)]" style={{ left: `${signatureBox.x}%`, top: `${signatureBox.y}%`, width: `${signatureBox.width}%`, height: `${signatureBox.height}%` }}>
                    {partner.signatureUrl && <img src={partner.signatureUrl} className="max-h-[40%] max-w-full object-contain" alt="" />}
                    <span>{partner.name}</span>
                    {partner.signatureName && <span className="font-[cursive] italic">{partner.signatureName}</span>}
                    {partner.signatureTitle && <span>{partner.signatureTitle}</span>}
                  </div>
                </div>
              );
            })}
            {isCertificateElementVisible(layout, "signatures") && signers.map((signer, index) => {
              const box = signatureBoxes[index] || initialBoxes.signature;
              return (
                <div key={index} onPointerDown={(event) => startDrag(event, `signature:${index}`, box)} className="absolute flex cursor-move touch-none flex-col items-center justify-center overflow-hidden text-center" style={{ left: `${box.x}%`, top: `${box.y}%`, width: `${box.width}%`, height: `${box.height}%` }}>
                  {signer.signatureUrl && <img src={signer.signatureUrl} className="max-h-[50%] max-w-full object-contain" alt="" />}
                  <span
                    className={signer.style === "classic" ? "font-serif" : signer.style === "bold" ? "font-bold" : "font-[cursive] italic"}
                    style={{ fontSize: `${Math.max(8, Number(signer.fontSize || 18)) / previewWidth * 100}cqw` }}
                  >
                    {signer.name || "التوقيع"}
                  </span>
                  <span className="text-[clamp(6px,0.7vw,10px)]">{signer.title || signer.role}</span>
                </div>
              );
            })}
          </div>
          <p className="text-center text-xs text-muted-foreground">الموضع والحجم نسبيان إلى مساحة الشهادة؛ ملف PDF يُنشأ من إعدادات التصميم المحفوظة نفسها.</p>
        </section>
      </div>
      )}

      {(activeSection === "partners" || activeSection === "issue") && (
      <div className="space-y-6">
      {activeSection === "partners" && (
      <section className="space-y-4 rounded-2xl border bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-bold">{partnerEditId ? "تعديل مؤسسة شريكة" : "إضافة مؤسسة شريكة"}</h2>
            {partnerEditId && <button className="text-sm text-primary underline" onClick={() => { setPartnerEditId(null); setPartnerForm(emptyPartner); }}>إلغاء التعديل</button>}
          </div>
          <p className="text-sm text-muted-foreground">أضف الجهة هنا، ثم اخترها في القالب أو ضمن المؤسسات المشاركة عند إصدار الشهادة أو دفعة أسماء.</p>
          <form onSubmit={savePartner} className="grid gap-3 sm:grid-cols-2">
            <Field label="اسم المؤسسة" value={partnerForm.name} onChange={(value) => setPartnerForm({ ...partnerForm, name: value })} />
            <Field label="ترتيب العرض" type="number" value={partnerForm.sortOrder} onChange={(value) => setPartnerForm({ ...partnerForm, sortOrder: value })} />
            <ImageUploadField label="شعار المؤسسة" value={partnerForm.logoUrl} onChange={(value) => setPartnerForm({ ...partnerForm, logoUrl: value })} />
            <ImageUploadField label="صورة توقيع المؤسسة" value={partnerForm.signatureUrl} onChange={(value) => setPartnerForm({ ...partnerForm, signatureUrl: value })} />
            <Field label="اسم مسؤول التوقيع" value={partnerForm.signatureName} onChange={(value) => setPartnerForm({ ...partnerForm, signatureName: value })} />
            <Field label="صفة المسؤول" value={partnerForm.signatureTitle} onChange={(value) => setPartnerForm({ ...partnerForm, signatureTitle: value })} />
            <button disabled={saving} className="rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground sm:col-span-2">{saving ? "جارٍ الحفظ..." : partnerEditId ? "حفظ المؤسسة" : "إضافة المؤسسة"}</button>
          </form>
          <div className="divide-y rounded-xl border">
            {partners.map((partner) => (
              <div key={partner.id} className="flex flex-wrap items-center gap-3 p-3">
                {partner.logoUrl && <img src={partner.logoUrl} alt="" className="h-10 w-10 rounded object-contain" />}
                <div className="min-w-0 flex-1"><p className="font-semibold">{partner.name}</p><p className="text-xs text-muted-foreground">الترتيب: {partner.sortOrder} {partner.signatureName ? `· ${partner.signatureName} ${partner.signatureTitle || ""}` : ""}</p></div>
                <button className="text-sm text-primary" onClick={() => editPartner(partner)}>تعديل</button>
                <button className="text-sm text-destructive" onClick={() => deletePartner(partner)}>حذف</button>
              </div>
            ))}
            {!partners.length && <p className="p-4 text-sm text-muted-foreground">أضف المؤسسات التي يمكن اختيارها لشهاداتك.</p>}
          </div>
      </section>
      )}

      {activeSection === "issue" && (
        <section className="space-y-4 rounded-2xl border bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-bold">{certificateId ? "تعديل شهادة" : "إصدار شهادة جديدة"}</h2>
            {certificateId && <button className="text-sm text-primary underline" onClick={clearCertificateForm}>إصدار شهادة جديدة</button>}
          </div>
          {!certificateId && (
            <button
              type="button"
              className="w-full rounded-lg border border-primary/40 bg-primary/5 px-4 py-2.5 text-sm font-semibold text-primary disabled:opacity-60"
              disabled={saving}
              onClick={() => void createQuickVerificationTemplate()}
            >
              {saving ? "جارٍ تجهيز النموذج..." : "إعداد شهادة توثيق فقط (اسم + تاريخ + QR)"}
            </button>
          )}
          <form onSubmit={saveCertificate} className="space-y-3">
            <label className="block space-y-1.5 text-sm">
              <span className="font-medium">قالب الشهادة</span>
              <select className="w-full rounded-lg border bg-background px-3 py-2" value={certificateForm.templateId} disabled={editingUploadedImage} onChange={(event) => { setCertificateForm({ ...certificateForm, templateId: event.target.value }); setTemplateId(event.target.value); }}>
                <option value="">اختر قالباً</option>
                {templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
              </select>
            </label>
            {editingUploadedImage && (
              <ImageUploadField
                label="استبدال صورة الشهادة"
                value={templateForm.backgroundUrl}
                onChange={(value) => updateTemplateField("backgroundUrl", value)}
                onDimensions={({ width, height }) => setTemplateForm((form) => ({
                  ...form,
                  width,
                  height,
                  orientation: height > width ? "portrait" : "landscape",
                }))}
              />
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="اسم المستفيد" value={certificateForm.recipientName} onChange={(value) => setCertificateForm({ ...certificateForm, recipientName: value })} />
              {(editingUploadedImage || isCertificateElementVisible(layout, "programTitle")) && <Field label="اسم الشهادة / البرنامج" value={certificateForm.programTitle} onChange={(value) => setCertificateForm({ ...certificateForm, programTitle: value })} />}
              {(editingUploadedImage || isCertificateElementVisible(layout, "issuerName")) && <Field label="الجهة المصدرة" value={certificateForm.issuerName} onChange={(value) => setCertificateForm({ ...certificateForm, issuerName: value })} />}
              <Field label="بريد المستفيد (اختياري للإرسال)" value={certificateForm.recipientEmail} dir="ltr" onChange={(value) => setCertificateForm({ ...certificateForm, recipientEmail: value })} />
              {(editingUploadedImage || isCertificateElementVisible(layout, "issueDate")) && <Field label="تاريخ الإصدار" type="date" value={certificateForm.issueDate} onChange={(value) => setCertificateForm({ ...certificateForm, issueDate: value })} />}
            </div>
            <Field label="وصف / ملاحظات داخلية" value={certificateForm.description} onChange={(value) => setCertificateForm({ ...certificateForm, description: value })} />
            <div className="space-y-2 border-t pt-3">
              <div className="flex items-center justify-between"><p className="font-semibold">التوقيعات على هذه الشهادة</p><button type="button" className="text-sm text-primary" onClick={() => setSigners([...signers, { name: "", title: "", role: "", signatureUrl: "", style: "script", fontSize: 18 }])}>+ إضافة توقيع</button></div>
              {signers.map((signer, index) => (
                <div key={index} className="space-y-2 rounded-lg border bg-muted/20 p-3">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Field label="اسم صاحب التوقيع" value={signer.name} onChange={(value) => setSigners(signers.map((item, i) => i === index ? { ...item, name: value } : item))} />
                    <Field label="الصفة / المسمى" value={signer.title} onChange={(value) => setSigners(signers.map((item, i) => i === index ? { ...item, title: value } : item))} />
                    <Field label="الجهة (اختياري)" value={signer.role} onChange={(value) => setSigners(signers.map((item, i) => i === index ? { ...item, role: value } : item))} />
                    <ImageUploadField label="صورة التوقيع (اختياري)" value={signer.signatureUrl} onChange={(value) => setSigners(signers.map((item, i) => i === index ? { ...item, signatureUrl: value } : item))} />
                    <label className="block space-y-1.5 text-sm">
                      <span className="font-medium">نمط الاسم</span>
                      <select className="w-full rounded-lg border bg-background px-3 py-2" value={signer.style || "script"} onChange={(event) => setSigners(signers.map((item, i) => i === index ? { ...item, style: event.target.value } : item))}>
                        <option value="script">يدوي مائل</option>
                        <option value="classic">كلاسيكي</option>
                        <option value="bold">عريض</option>
                      </select>
                    </label>
                    <Field label="حجم الاسم في PDF" type="number" value={signer.fontSize || 18} onChange={(value) => setSigners(signers.map((item, i) => i === index ? { ...item, fontSize: Number(value) } : item))} />
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {(["x", "y", "width", "height"] as const).map((part) => <Field key={part} label={{ x: "أفقي %", y: "عمودي %", width: "عرض %", height: "ارتفاع %" }[part]} type="number" value={signatureBoxes[index]?.[part] ?? 10} onChange={(value) => {
                      const next = [...signatureBoxes];
                      const number = Number(value);
                      next[index] = { ...(next[index] || initialBoxes.signature), [part]: Number.isFinite(number) ? Math.min(Math.max(number, 0), 100) : next[index]?.[part] ?? 10 };
                      applyLayout({ ...layoutRef.current, signatureBoxes: next });
                    }} />)}
                  </div>
                  <button type="button" className="text-sm text-destructive" onClick={() => { setSigners(signers.filter((_, i) => i !== index)); applyLayout({ ...layoutRef.current, signatureBoxes: signatureBoxes.filter((_, i) => i !== index) }); }}>حذف هذا التوقيع</button>
                </div>
              ))}
              {!signers.length && <p className="text-xs text-muted-foreground">أضف توقيعاً أو أكثر؛ سيُعرض الاسم بخط مائل مميز مع صفته.</p>}
            </div>
            <div className="space-y-2 border-t pt-3">
              <p className="font-semibold">المؤسسات المشاركة في هذه الشهادة فقط</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {partners.map((partner, index) => {
                  const selected = selectedPartners.includes(partner.id);
                  const selectedIndex = Math.max(selectedPartners.indexOf(partner.id), 0);
                  const defaultWidth = 70 / Math.max(selectedPartners.length, 1);
                  const defaultLogoBox = { x: 15 + selectedIndex * defaultWidth, y: 5, width: Math.min(defaultWidth, 20), height: 14 };
                  const logoBox = boxFor({ position: layout.partnerLogoBoxes?.[String(partner.id)] ?? layout.partnerBoxes?.[String(partner.id)] }, "position", defaultLogoBox);
                  const signatureBox = boxFor(
                    { position: layout.partnerSignatureBoxes?.[String(partner.id)] },
                    "position",
                    {
                      x: logoBox.x,
                      y: Number(layout.partnerSignatureDefault?.y ?? 68),
                      width: logoBox.width,
                      height: Number(layout.partnerSignatureDefault?.height ?? 20),
                    },
                  );
                  return (
                    <div key={partner.id} className="space-y-2 rounded-lg border p-3">
                      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={selected} onChange={(event) => {
                        const nextIds = event.target.checked
                          ? [...selectedPartners, partner.id]
                          : selectedPartners.filter((id) => id !== partner.id);
                        setSelectedPartners(nextIds.sort((left, right) => partners.findIndex((item) => item.id === left) - partners.findIndex((item) => item.id === right)));
                      }} />{partner.name}</label>
                      {selected && <div className="space-y-2">
                        <div><p className="text-xs font-semibold">موضع وحجم الشعار</p><div className="grid grid-cols-4 gap-1">
                          {(["x", "y", "width", "height"] as const).map((part) => <Field key={part} label={{ x: "أفقي", y: "عمودي", width: "عرض", height: "ارتفاع" }[part]} type="number" value={logoBox[part]} onChange={(value) => updatePartnerBox("partnerLogoBoxes", partner.id, part, value, defaultLogoBox)} />)}
                        </div></div>
                        <div><p className="text-xs font-semibold">موضع وحجم التوقيع والبيانات</p><div className="grid grid-cols-4 gap-1">
                          {(["x", "y", "width", "height"] as const).map((part) => <Field key={part} label={{ x: "أفقي", y: "عمودي", width: "عرض", height: "ارتفاع" }[part]} type="number" value={signatureBox[part]} onChange={(value) => updatePartnerBox("partnerSignatureBoxes", partner.id, part, value, { x: logoBox.x, y: Number(layout.partnerSignatureDefault?.y ?? 68), width: logoBox.width, height: Number(layout.partnerSignatureDefault?.height ?? 20) })} />)}
                        </div></div>
                      </div>}
                    </div>
                  );
                })}
                {!partners.length && <p className="text-xs text-muted-foreground">أضف المؤسسات من القسم المجاور أولاً.</p>}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button disabled={saving} className="flex-1 rounded-lg bg-primary px-4 py-2.5 font-semibold text-primary-foreground disabled:opacity-60">{saving ? "جارٍ الحفظ..." : editingStatus === "draft" ? "حفظ المسودة" : certificateId ? "حفظ التعديلات" : "إصدار الشهادة"}</button>
              {(!certificateId || editingStatus === "draft") && <button type="button" disabled={saving} className="rounded-lg border px-4 py-2.5 disabled:opacity-60" onClick={saveDraft}>{saving ? "جارٍ الحفظ..." : "حفظ كمسودة"}</button>}
              <button type="button" className="rounded-lg border px-4 py-2" onClick={openDraftPdf}>معاينة PDF</button>
            </div>
          </form>
        </section>
      )}
      </div>
      )}

      {activeSection === "manage" && (
      <section className="space-y-3 rounded-2xl border bg-white p-5 shadow-sm">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
          {[
            ["الإجمالي", stats.total],
            ["صادرة", stats.issued],
            ["ملغاة", stats.cancelled],
            ["مسودات", stats.drafts],
            ["محجوزة", stats.reserved],
            ["سلة المحذوفات", stats.trash],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg bg-muted/40 p-3 text-center">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-xl font-bold">{value}</p>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold">{showTrash ? "سلة المحذوفات" : "إدارة الشهادات"} ({filteredIssues.length})</h2>
          <div className="flex flex-wrap gap-2">
            <a className="rounded-lg border px-3 py-2 text-sm" href="/certificate/verify" target="_blank" rel="noreferrer">صفحة التحقق العامة</a>
            <button type="button" className="rounded-lg border px-3 py-2 text-sm" onClick={async () => {
              if (!showTrash) {
                try {
                  await loadTrash();
                } catch (error) {
                  toast({ variant: "destructive", title: "تعذر تحميل سلة المحذوفات", description: (error as Error).message });
                  return;
                }
              }
              setShowTrash(!showTrash);
              setSelectedIssueIds([]);
              setPage(1);
            }}>{showTrash ? "عرض الشهادات" : `سلة المحذوفات (${stats.trash})`}</button>
          </div>
        </div>
        <form onSubmit={verifyCertificate} className="flex flex-wrap gap-2">
          <input className="min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm" placeholder="كود الشهادة للتحقق" value={verificationInput} onChange={(event) => setVerificationInput(event.target.value)} />
          <button disabled={verificationLoading} className="rounded-lg bg-slate-800 px-3 py-2 text-sm text-white">{verificationLoading ? "جارٍ التحقق..." : "التحقق من الشهادة"}</button>
        </form>
        {verificationResult && <div className={`rounded-lg p-3 text-sm ${verificationResult.valid ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>{verificationResult.valid ? `شهادة صحيحة — ${verificationResult.certificate?.recipientName} · ${verificationResult.certificate?.programTitle}` : verificationResult.error || "الشهادة غير صالحة أو ملغاة"}</div>}
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-[220px] flex-1 space-y-1 text-sm">
            <span>بحث</span>
            <input className="w-full rounded-lg border px-3 py-2" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="الاسم أو رقم الشهادة أو العنوان" />
          </label>
          <label className="space-y-1 text-sm">
            <span>الحالة</span>
            <select className="block rounded-lg border bg-background px-3 py-2" value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }}>
              <option value="">كل الحالات</option>
              <option value="issued">صادرة</option>
              <option value="cancelled">ملغاة</option>
              <option value="draft">مسودات</option>
              <option value="reserved">محجوزة</option>
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span>المصدر</span>
            <select className="block rounded-lg border bg-background px-3 py-2" value={sourceFilter} onChange={(event) => { setSourceFilter(event.target.value); setPage(1); }}>
              <option value="">كل المصادر</option>
              <option value="normal">عادية</option>
              <option value="uploaded-images">صور جاهزة</option>
              <option value="legacy">قديمة</option>
              <option value="reserved">محجوزة</option>
            </select>
          </label>
          <button type="button" className="rounded-lg border px-3 py-2 text-sm" disabled={!filteredIssues.length || showTrash} onClick={() => void downloadCollection("zip", selectedIssueIds)}>تنزيل الشهادات PDF بصيغة ZIP (بأسماء المستفيدين)</button>
          <button type="button" className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50" disabled={!filteredIssues.length || showTrash || Boolean(imageExporting)} onClick={() => void downloadImagesZip("png")}>{imageExporting === "png-images" ? "جارٍ تجهيز الصور..." : "تنزيل صور ZIP (PNG)"}</button>
          <button type="button" className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50" disabled={!filteredIssues.length || showTrash || Boolean(imageExporting)} onClick={() => void downloadImagesZip("jpg")}>{imageExporting === "jpg-images" ? "جارٍ تجهيز الصور..." : "تنزيل صور ZIP (JPG)"}</button>
          <button type="button" className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50" disabled={!filteredIssues.length || showTrash || Boolean(imageExporting)} onClick={() => void downloadImagesZip("png", true)}>{imageExporting === "png-sheet" ? "جارٍ تجهيز الصور وExcel..." : "ZIP + Excel"}</button>
          <button type="button" className="rounded-lg border px-3 py-2 text-sm" disabled={!filteredIssues.length} onClick={() => void downloadCollection("xlsx", selectedIssueIds)}>تصدير Excel</button>
        </div>
        {selectedIssueIds.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-primary/5 p-3 text-sm">
            <span>تم تحديد {selectedIssueIds.length} شهادة</span>
            {showTrash ? (
              <>
                <button type="button" className="rounded border px-3 py-1.5" onClick={() => void restoreIssues(selectedIssueIds)}>استعادة المحدد</button>
                <button type="button" className="rounded border border-destructive px-3 py-1.5 text-destructive" onClick={() => void permanentlyDeleteIssues(selectedIssueIds)}>حذف نهائي</button>
              </>
            ) : (
              <button type="button" className="rounded border border-destructive px-3 py-1.5 text-destructive" onClick={() => void moveSelectedToTrash()}>نقل المحدد للسلة</button>
            )}
          </div>
        )}
        <div className="divide-y rounded-xl border">
          {pagedIssues.length > 0 && (
            <label className="flex items-center gap-2 border-b bg-muted/20 p-3 text-sm">
              <input type="checkbox" checked={pagedIssues.every((issue) => selectedIssueIds.includes(issue.id))} onChange={(event) => {
                const pageIds = pagedIssues.map((issue) => issue.id);
                setSelectedIssueIds((selected) => event.target.checked
                  ? [...new Set([...selected, ...pageIds])]
                  : selected.filter((id) => !pageIds.includes(id)));
              }} />
              تحديد شهادات هذه الصفحة
            </label>
          )}
          {pagedIssues.map((issue) => (
            <div key={issue.id} className="flex flex-wrap items-center gap-3 p-3">
              <input type="checkbox" aria-label={`تحديد ${issue.recipientName}`} checked={selectedIssueIds.includes(issue.id)} onChange={(event) => setSelectedIssueIds((selected) => event.target.checked ? [...selected, issue.id] : selected.filter((id) => id !== issue.id))} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  {issue.recipientName}{" "}
                  <span className="text-xs text-muted-foreground">· {issue.status === "issued" ? "صادرة" : issue.status === "draft" ? "مسودة" : issue.status === "reserved" ? "محجوزة" : "ملغاة"}</span>
                  {issue.metadata?.source === "legacy-certificate-image" && <span className="ms-2 rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-800">قديمة</span>}
                </p>
                <p className="text-sm text-muted-foreground">{issue.programTitle} · {issue.serialNumber}</p>
                {showTrash && issue.deletedAt && <p className="text-xs text-muted-foreground">تاريخ الحذف: {new Date(issue.deletedAt).toLocaleDateString("ar-EG")}</p>}
              </div>
              {!showTrash && issue.status === "issued" && <>
                <img src={resolveApiUrl(`/api/certificates/qr?serial=${encodeURIComponent(issue.serialNumber)}`)} alt="QR" className="h-12 w-12" />
                <a className="text-sm text-primary underline" href={`/certificate/verify?serial=${encodeURIComponent(issue.serialNumber)}`} target="_blank" rel="noreferrer">رابط التحقق</a>
              </>}
              {!showTrash && <>
                <button className="text-sm text-primary" onClick={() => beginEditCertificate(issue)}>تعديل</button>
                {issue.status !== "reserved" && <button className="text-sm text-primary" onClick={() => openPdf(issue, true)}>معاينة</button>}
                {(issue.status === "issued" || issue.status === "cancelled") && <button className="text-sm text-primary" onClick={() => openPdf(issue, false)}>تنزيل PDF</button>}
                {issue.status === "issued" && <button className="text-sm text-primary disabled:opacity-50" disabled={emailSendingId === issue.id} onClick={() => void emailCertificate(issue)}>{emailSendingId === issue.id ? "جارٍ الإرسال..." : "إرسال بالبريد"}</button>}
                {issue.status === "draft" && <button className="text-sm text-emerald-700" onClick={() => void issueDraft(issue)}>إصدار</button>}
                {issue.status === "issued" && <button className="text-sm text-amber-700" onClick={() => void cancelCertificate(issue)}>إلغاء الشهادة</button>}
                <button className="text-sm text-destructive" onClick={() => void moveToTrash(issue)}>نقل إلى السلة</button>
              </>}
              {showTrash && <>
                <button className="text-sm text-primary" onClick={() => void restoreIssues([issue.id])}>استعادة</button>
                <button className="text-sm text-destructive" onClick={() => void permanentlyDeleteIssues([issue.id])}>حذف نهائي</button>
              </>}
            </div>
          ))}
          {!pagedIssues.length && <p className="p-6 text-center text-sm text-muted-foreground">{showTrash ? "سلة المحذوفات فارغة." : "لا توجد شهادات مطابقة."}</p>}
        </div>
        {pageCount > 1 && <div className="flex items-center justify-center gap-3 text-sm">
          <button type="button" className="rounded border px-3 py-1.5 disabled:opacity-40" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>السابق</button>
          <span>صفحة {page} من {pageCount}</span>
          <button type="button" className="rounded border px-3 py-1.5 disabled:opacity-40" disabled={page >= pageCount} onClick={() => setPage((current) => current + 1)}>التالي</button>
        </div>}
      </section>
      )}
    </div>
  );
}
