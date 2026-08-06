import { Router, type IRouter, type Request, type Response } from "express";
import multer from "multer";
import { uploadReceiptImage } from "../lib/supabase-storage";

const router: IRouter = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 1,
  },
  fileFilter: (_req, file, callback) => {
    if (!file.mimetype.startsWith("image/")) {
      callback(new Error("يسمح فقط برفع الصور"));
    return;
  }
    callback(null, true);
  },
});

function runSingleImageUpload(req: Request, res: Response): Promise<void> {
  return new Promise((resolve, reject) => {
    upload.single("file")(req, res, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

router.post("/storage/receipts", async (req: Request, res: Response) => {
  const userId = Number((req.session as any)?.userId ?? 0);
  if (!userId) {
    res.status(401).json({ error: "غير مصرح" });
    return;
  }

  try {
    await runSingleImageUpload(req, res);

    const file = req.file;
    if (!file) {
      res.status(400).json({ error: "ملف الصورة مطلوب" });
      return;
    }

    const kind = req.body.kind === "final" ? "final" : "deposit";
    const orderId = Number(req.body.orderId || 0) || undefined;

    const uploaded = await uploadReceiptImage({
      fileBuffer: file.buffer,
      fileName: file.originalname,
      mimeType: file.mimetype,
      userId,
      orderId,
      kind,
    });

    res.json({
      url: uploaded.publicUrl,
      publicUrl: uploaded.publicUrl,
      objectPath: uploaded.objectPath,
      bucket: uploaded.bucket,
    });
  } catch (error) {
    req.log.error({ err: error }, "Error uploading receipt image");
    res.status(500).json({
      error: error instanceof Error ? error.message : "فشل رفع صورة الإيصال",
    });
  }
});

export default router;
