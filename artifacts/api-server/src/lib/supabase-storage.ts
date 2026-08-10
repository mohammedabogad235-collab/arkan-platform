import { createClient } from "@supabase/supabase-js";
import { logger } from "./logger";

function isConfiguredEnvValue(value: string | undefined): value is string {
  if (!value) return false;
  const normalized = value.trim();
  if (!normalized) return false;
  if (normalized.includes("YOUR_PROJECT_REF")) return false;
  if (normalized.includes("YOUR_SUPABASE_SERVICE_ROLE_KEY")) return false;
  return true;
}

export function getSupabaseStorageConfig(): {
  supabaseUrl: string;
  supabaseKey: string;
  bucketName: string;
} {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucketName = process.env.SUPABASE_STORAGE_BUCKET || "receipts";

  if (!isConfiguredEnvValue(supabaseUrl) || !isConfiguredEnvValue(supabaseKey)) {
    logger.error(
      {
        hasSupabaseUrl: isConfiguredEnvValue(supabaseUrl),
        hasSupabaseServiceKey: isConfiguredEnvValue(supabaseKey),
        bucketName,
      },
      "Supabase storage configuration is incomplete",
    );
    throw new Error("إعدادات Supabase Storage غير مكتملة.");
  }

  return { supabaseUrl, supabaseKey, bucketName };
}

/**
 * This is a placeholder function to demonstrate the fix for the 'HeadersInit' type error.
 * The fix is to use a Node.js-compatible type like Record<string, string>.
 * @param headers The headers for a request.
 */
export async function functionUsingHeaders(headers: Record<string, string>) {
  logger.info({ headers }, "functionUsingHeaders was called with Node.js compatible headers type.");
  // Placeholder for logic that would use headers
}

/**
 * Uploads a file buffer from multer to a specified path in Supabase Storage.
 * @param file The file object from multer (Express.Multer.File).
 * @param userId The ID of the user uploading the file.
 * @returns The public URL of the uploaded file.
 */
export async function uploadBufferToSupabase(
  file: Express.Multer.File,
  userId: number
): Promise<{ publicUrl: string }> {
  const { supabaseUrl, supabaseKey, bucketName } = getSupabaseStorageConfig();

  const supabase = createClient(supabaseUrl, supabaseKey);
  const extension = file.originalname.split(".").pop()?.toLowerCase() || "bin";
  const uniqueFileName = `user_${userId}/${Date.now()}-${Math.round(Math.random() * 1e9)}.${extension}`;

  const { error } = await supabase.storage.from(bucketName).upload(uniqueFileName, file.buffer, {
    contentType: file.mimetype,
    upsert: false,
  });

  if (error) {
    logger.error({ error, userId }, "Supabase storage upload failed");
    throw new Error(`Supabase upload error: ${error.message}`);
  }

  const { data } = supabase.storage.from(bucketName).getPublicUrl(uniqueFileName);
  return { publicUrl: data.publicUrl };
}
