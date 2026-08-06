import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

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

  const uploadFile = async (file: File): Promise<{ url: string } | null> => {
    setIsUploading(true);
    setError(null);

    try {
      // Step 1: Get the signed upload URL from our backend
      const signedUrlRes = await fetch("/api/storage/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include", // Important to send session cookie
        body: JSON.stringify({
          fileName: file.name,
        }),
      });

      if (!signedUrlRes.ok) {
        const errData = await signedUrlRes.json();
        throw new Error(errData.error || "فشل الحصول على رابط الرفع");
      }

      const { uploadUrl, publicUrl } = await signedUrlRes.json();

      // Step 2: Upload the file directly to Supabase Storage using the signed URL
      const uploadRes = await fetch(uploadUrl, {
        method: "POST",
        headers: {
          "Content-Type": file.type,
        },
        body: file,
      });

      if (!uploadRes.ok) {
        throw new Error("فشل رفع الملف إلى التخزين السحابي");
      }

      // Step 3: Return the public URL for saving in the database
      return { url: publicUrl };
    } catch (err: any) {
      const errorMessage = err.message || "حدث خطأ غير متوقع أثناء الرفع";
      setError(errorMessage);
      toast({
        variant: "destructive",
        title: "خطأ في الرفع",
        description: errorMessage,
      });
      return null;
    } finally {
      setIsUploading(false);
    }
  };

  return { uploadFile, isUploading, error };
}