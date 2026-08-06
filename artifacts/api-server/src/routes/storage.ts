import { Router, type IRouter, type Request } from "express";
import multer, { type FileFilterCallback } from "multer";
import { getSession } from "./orders"; // Assuming getSession is exported from orders route
import { uploadBufferToSupabase } from "../lib/supabase-storage";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// Define a file filter to accept only images
const imageFileFilter = (_req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
  if (file.mimetype.startsWith("image/")) {
    cb(null, true);
  } else {
    const error = new Error("الملف ليس صورة!");
    cb(error);
  }
};

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: imageFileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
});

router.post("/storage/upload", upload.single("file"), async (req: Request, res) => {
  const { userId } = getSession(req);
  if (!userId) {
    res.status(401).json({ error: "غير مصرح" });
    return;
  }

  // The 'file' property is added to 'req' by multer middleware.
  if (!req.file) {
    res.status(400).json({ error: "لم يتم إرفاق أي ملف." });
    return;
  }

  try {
    const { publicUrl } = await uploadBufferToSupabase(req.file, userId);
    logger.info({ userId, url: publicUrl }, "File uploaded directly to Supabase");
    res.status(201).json({ url: publicUrl });
    return;
  } catch (err: any) {
    logger.error({ err, userId }, "Failed to upload file to Supabase");
    res.status(500).json({ error: "فشل رفع الملف إلى الخادم." });
    return;
  }
});

export default router;