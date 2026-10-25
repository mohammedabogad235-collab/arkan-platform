CREATE TABLE IF NOT EXISTS "certificate_verify_settings" (
  "id" integer PRIMARY KEY DEFAULT 1 CHECK ("id" = 1),
  "settings" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "updated_at" timestamp with time zone NOT NULL DEFAULT NOW()
);

INSERT INTO "certificate_verify_settings" ("id", "settings")
VALUES (
  1,
  '{
    "pageTitle": "التحقق من الشهادات",
    "pageSubtitle": "تأكد من صحة الشهادة وحالتها بالبحث عن رقمها أو بمسح رمز QR المطبوع عليها.",
    "logoUrl": "",
    "successTitle": "الشهادة صحيحة وسارية",
    "successMessage": "هذه الشهادة موثقة وصادرة من Arkan Web.",
    "cancelledTitle": "الشهادة ملغاة",
    "cancelledMessage": "تم إلغاء هذه الشهادة وهي غير صالحة للاستخدام.",
    "notFoundMessage": "لم يتم العثور على شهادة بهذا الرقم.",
    "footerText": "",
    "visibleFields": {
      "recipientName": true,
      "programTitle": true,
      "issuerName": true,
      "issueDate": true,
      "partners": true,
      "serialNumber": true
    },
    "showCertificatePreview": true,
    "allowDownloadPdf": true,
    "allowDownloadImage": true
  }'::jsonb
)
ON CONFLICT ("id") DO NOTHING;
