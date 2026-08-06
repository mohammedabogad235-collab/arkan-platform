import { randomUUID } from "node:crypto";

const DEFAULT_BUCKET = "receipts";

function deriveSupabaseUrlFromDatabaseUrl(): string | null {
  const raw = process.env.DATABASE_URL;
  if (!raw) return null;

  try {
    const parsed = new URL(raw.replace(/\[(.*?)\]/g, "$1"));
    const username = decodeURIComponent(parsed.username || "");
    const match = username.match(/^postgres\.([a-z0-9]+)/i);
    const projectRef = match?.[1];
    return projectRef ? `https://${projectRef}.supabase.co` : null;
  } catch {
    return null;
  }
}

function getSupabaseUrl(): string {
  const url = process.env.SUPABASE_URL || deriveSupabaseUrlFromDatabaseUrl();
  if (!url) {
    throw new Error("SUPABASE_URL is not configured");
  }
  return url;
}

function getServiceRoleKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
  }
  return key;
}

function getBucketName(): string {
  return process.env.SUPABASE_STORAGE_BUCKET || DEFAULT_BUCKET;
}

function sanitizeFileName(fileName: string): string {
  return fileName
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

function getExtension(fileName: string, mimeType: string): string {
  const dot = fileName.lastIndexOf(".");
  if (dot > -1 && dot < fileName.length - 1) {
    return fileName.slice(dot + 1).toLowerCase();
  }

  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/heic") return "heic";
  if (mimeType === "image/heif") return "heif";
  return "jpg";
}

const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

export function assertImageMimeType(mimeType: string): void {
  if (!ALLOWED_IMAGE_TYPES.has(mimeType)) {
    throw new Error("صيغة الملف غير مدعومة. المسموح فقط صور JPEG/PNG/WEBP/HEIC");
  }
}

function createSupabaseHeaders(contentType?: string): HeadersInit {
  const key = getServiceRoleKey();
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    ...(contentType ? { "Content-Type": contentType } : {}),
  };
}

export async function ensureReceiptsBucket(): Promise<string> {
  const bucket = getBucketName();
  const baseUrl = getSupabaseUrl();

  const existingRes = await fetch(`${baseUrl}/storage/v1/bucket/${bucket}`, {
    method: "GET",
    headers: createSupabaseHeaders(),
  });

  if (existingRes.ok) {
    return bucket;
  }

  const createRes = await fetch(`${baseUrl}/storage/v1/bucket`, {
    method: "POST",
    headers: createSupabaseHeaders("application/json"),
    body: JSON.stringify({
      id: bucket,
      name: bucket,
      public: true,
      file_size_limit: 10 * 1024 * 1024,
      allowed_mime_types: [...ALLOWED_IMAGE_TYPES],
    }),
  });

  if (!createRes.ok) {
    const message = await createRes.text();
    if (!/already exists/i.test(message)) {
      throw new Error(`فشل إنشاء bucket receipts في Supabase Storage: ${message}`);
    }
  }

  return bucket;
}

export async function uploadReceiptImage(params: {
  fileBuffer: Buffer;
  fileName: string;
  mimeType: string;
  userId: number;
  orderId?: number;
  kind: "deposit" | "final";
}): Promise<{ publicUrl: string; objectPath: string; bucket: string }> {
  assertImageMimeType(params.mimeType);
  const baseUrl = getSupabaseUrl();
  const bucket = await ensureReceiptsBucket();
  const ext = getExtension(params.fileName, params.mimeType);
  const safeName = sanitizeFileName(params.fileName.replace(/\.[^.]+$/, ""));
  const folder = params.orderId ? `orders/${params.orderId}` : `users/${params.userId}`;
  const objectPath = `${folder}/${params.kind}/${Date.now()}-${randomUUID()}-${safeName || "receipt"}.${ext}`;

  const uploadRes = await fetch(
    `${baseUrl}/storage/v1/object/${bucket}/${objectPath}`,
    {
      method: "POST",
      headers: {
        ...createSupabaseHeaders(params.mimeType),
        "x-upsert": "false",
        "cache-control": "3600",
      },
      body: params.fileBuffer,
    },
  );

  if (!uploadRes.ok) {
    const message = await uploadRes.text();
    throw new Error(`فشل رفع صورة الإيصال إلى Supabase Storage: ${message}`);
  }

  return {
    publicUrl: `${baseUrl}/storage/v1/object/public/${bucket}/${objectPath}`,
    objectPath,
    bucket,
  };
}
