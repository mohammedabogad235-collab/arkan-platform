import { useState } from "react";

interface UploadResult {
  objectPath: string;
  url: string;
}

export function useReceiptUpload() {
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const uploadFile = async (file: File): Promise<UploadResult | null> => {
    setIsUploading(true);
    setError(null);
    setProgress(10);

    try {
      const urlRes = await fetch("/api/storage/uploads/request-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: file.name,
          size: file.size,
          contentType: file.type || "application/octet-stream",
        }),
      });

      if (!urlRes.ok) throw new Error("فشل الحصول على رابط الرفع");
      const { uploadURL, objectPath } = await urlRes.json();

      setProgress(40);

      const putRes = await fetch(uploadURL, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type || "application/octet-stream" },
      });

      if (!putRes.ok) throw new Error("فشل رفع الملف");

      setProgress(100);
      return { objectPath, url: `/api/storage${objectPath}` };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "حدث خطأ أثناء الرفع";
      setError(msg);
      return null;
    } finally {
      setIsUploading(false);
    }
  };

  return { uploadFile, isUploading, progress, error };
}
