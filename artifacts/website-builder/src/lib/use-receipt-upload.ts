import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { getSupabaseClient, getSupabaseEnv, hasSupabaseEnv } from "@/lib/supabase";

/**
 * This hook encapsulates the logic for uploading a file to Supabase Storage.
 * 1. It requests a signed upload URL from our backend.
 * 2. It uploads the file directly to Supabase using that URL.
 * 3. It returns the public URL of the uploaded file.
 */
export function useReceiptUpload() {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const RECEIPTS_BUCKET = "receipts";
  const MAX_FILE_SIZE = 10 * 1024 * 1024;
  const ALLOWED_MIME_TYPES = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
    "application/pdf",
  ]);

  const sanitizeFileName = (fileName: string): string => {
    const withoutExtension = fileName.replace(/\.[^.]+$/, "");

    return withoutExtension
      .trim()
      .replace(/\s+/g, "-")
      .replace(/[^\w\u0600-\u06FF-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase() || "receipt";
  };

  const getFileExtension = (file: File): string => {
    const extensionFromName = file.name.split(".").pop()?.trim().toLowerCase();
    if (extensionFromName) return extensionFromName;

    if (file.type === "image/jpeg") return "jpg";
    if (file.type === "image/png") return "png";
    if (file.type === "image/webp") return "webp";
    if (file.type === "application/pdf") return "pdf";

    return "bin";
  };

  const createReceiptPath = (file: File): string => {
    const safeBaseName = sanitizeFileName(file.name);
    const extension = getFileExtension(file);
    const uniqueId =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    return `public/${new Date().getFullYear()}/${uniqueId}-${safeBaseName}.${extension}`;
  };

  const getErrorMessage = (err: unknown): string => {
    if (err instanceof Error && err.message) return err.message;
    if (typeof err === "string" && err.trim()) return err;
    return "حدث خطأ غير متوقع أثناء رفع الإيصال";
  };

  const logUploadError = (err: unknown, context: Record<string, unknown>) => {
    if (err instanceof Error) {
      console.error("[ReceiptUpload] Upload failed", {
        ...context,
        errorName: err.name,
        errorMessage: err.message,
        errorStack: err.stack,
        rawError: err,
      });
      return;
    }

    console.error("[ReceiptUpload] Upload failed with non-Error value", {
      ...context,
      rawError: err,
    });
  };

  const uploadFile = async (file: File): Promise<{ url: string } | null> => {
    setIsUploading(true);
    setError(null);

    try {
      const env = getSupabaseEnv();
      const uploadContext = {
        fileName: file?.name,
        fileSize: file?.size,
        fileType: file?.type,
        hasSupabaseUrl: env.hasUrl,
        hasSupabaseAnonKey: env.hasAnonKey,
      };

      console.groupCollapsed("[ReceiptUpload] Starting upload");
      console.info("[ReceiptUpload] Runtime env check", uploadContext);

      if (!hasSupabaseEnv()) {
        throw new Error(
          "متغيرات Supabase في Vite غير ظاهرة داخل الواجهة. تأكد من تعريف VITE_SUPABASE_URL و VITE_SUPABASE_ANON_KEY ثم أعد بناء الواجهة."
        );
      }

      if (!(file instanceof File)) {
        throw new Error("العنصر المرسل إلى دالة الرفع ليس File object صالحاً.");
      }

      if (!file.size) {
        throw new Error("الملف فارغ أو لم تتم قراءته بشكل صحيح.");
      }

      if (file.size > MAX_FILE_SIZE) {
        throw new Error("حجم الملف أكبر من 10 ميجابايت.");
      }

      if (file.type && !ALLOWED_MIME_TYPES.has(file.type)) {
        throw new Error(`نوع الملف غير مدعوم: ${file.type}`);
      }

      const filePath = createReceiptPath(file);
      const supabase = getSupabaseClient();

      console.info("[ReceiptUpload] Upload target prepared", {
        bucket: RECEIPTS_BUCKET,
        filePath,
        contentType: file.type || "application/octet-stream",
      });

      const { data, error: uploadError } = await supabase.storage
        .from(RECEIPTS_BUCKET)
        .upload(filePath, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: file.type || "application/octet-stream",
        });

      if (uploadError) {
        console.error("[ReceiptUpload] Supabase upload error details", {
          bucket: RECEIPTS_BUCKET,
          filePath,
          errorName: uploadError.name,
          errorMessage: uploadError.message,
          rawError: uploadError,
        });

        throw new Error(`رفض Supabase رفع الملف: ${uploadError.message}`);
      }

      console.info("[ReceiptUpload] Supabase upload response", data);

      const {
        data: { publicUrl },
      } = supabase.storage.from(RECEIPTS_BUCKET).getPublicUrl(filePath);

      if (!publicUrl) {
        throw new Error("تم رفع الملف ولكن فشل استخراج الرابط العام.");
      }

      console.info("[ReceiptUpload] Upload completed successfully", {
        bucket: RECEIPTS_BUCKET,
        filePath,
        publicUrl,
      });

      return { url: publicUrl };
    } catch (err: unknown) {
      const errorMessage = getErrorMessage(err);
      setError(errorMessage);
      logUploadError(err, {
        bucket: RECEIPTS_BUCKET,
      });

      toast({
        variant: "destructive",
        title: "خطأ في الرفع",
        description: errorMessage,
      });

      return null;
    } finally {
      console.groupEnd();
      setIsUploading(false);
    }
  };

  return { uploadFile, isUploading, error };
}
