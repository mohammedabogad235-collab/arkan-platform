import "dotenv/config";
import { runDatabaseMigrations, verifyDatabaseConnection, db } from "@workspace/db";
import { sql } from "drizzle-orm"; // استيراد sql من drizzle
import app from "./app";
import { logger } from "./lib/logger";
import { purgeExpiredCertificates } from "./routes/certificates";

const PORT = Number(process.env.PORT || 8080);

process.on("unhandledRejection", (reason) => {
  logger.error({ err: reason }, "Unhandled promise rejection");
});

process.on("uncaughtException", (error) => {
  logger.fatal({ err: error }, "Uncaught exception");
});

async function bootstrap() {
  await runDatabaseMigrations();
  await verifyDatabaseConnection();

  // --- السطر السحري الجديد لصناعة جدول الجلسات وحل مشكلة "غير مصرح" ---
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "session" (
        "sid" varchar NOT NULL COLLATE "default",
        "sess" json NOT NULL,
        "expire" timestamp(6) NOT NULL,
        CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE
      ) WITH (OIDS=FALSE);
      CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "certificate_templates" (
        id serial PRIMARY KEY,
        name text NOT NULL,
        description text,
        orientation text NOT NULL DEFAULT 'landscape',
        width integer NOT NULL DEFAULT 1200,
        height integer NOT NULL DEFAULT 800,
        background_url text,
        logo_url text,
        signature_url text,
        partner_logos text,
        layout_config jsonb NOT NULL DEFAULT '{}'::jsonb,
        is_active boolean NOT NULL DEFAULT true,
        created_by integer,
        created_at timestamp with time zone NOT NULL DEFAULT NOW(),
        updated_at timestamp with time zone NOT NULL DEFAULT NOW()
      );
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "certificate_issues" (
        id serial PRIMARY KEY,
        template_id integer NOT NULL,
        serial_number text NOT NULL UNIQUE,
        validation_url text NOT NULL,
        recipient_name text NOT NULL,
        recipient_email text,
        recipient_phone text,
        program_title text NOT NULL,
        description text,
        issuer_name text NOT NULL DEFAULT 'Arkan Web',
        signature_name text,
        signature_title text,
        issue_date timestamp with time zone NOT NULL DEFAULT NOW(),
        status text NOT NULL DEFAULT 'issued',
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        qr_code_url text,
        created_at timestamp with time zone NOT NULL DEFAULT NOW(),
        updated_at timestamp with time zone NOT NULL DEFAULT NOW()
      );
    `);
    await db.execute(sql`ALTER TABLE "certificate_issues" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "certificate_issues_status_deleted_at_idx" ON "certificate_issues" ("status", "deleted_at")`);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "certificate_partners" (
        id serial PRIMARY KEY,
        name text NOT NULL,
        logo_url text,
        signature_url text,
        signature_name text,
        signature_title text,
        sort_order integer NOT NULL DEFAULT 0,
        created_at timestamp with time zone NOT NULL DEFAULT NOW(),
        updated_at timestamp with time zone NOT NULL DEFAULT NOW()
      );
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "certificate_verify_settings" (
        id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
        settings jsonb NOT NULL DEFAULT '{}'::jsonb,
        updated_at timestamp with time zone NOT NULL DEFAULT NOW()
      );
    `);
    await db.execute(sql`
      INSERT INTO "certificate_verify_settings" ("id", "settings")
      VALUES (1, '{
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
      }'::jsonb)
      ON CONFLICT ("id") DO NOTHING
    `);
    await db.execute(sql`CREATE SEQUENCE IF NOT EXISTS "certificate_issue_serial_seq" START WITH 1 INCREMENT BY 1`);
    await db.execute(sql`
      SELECT setval(
        'certificate_issue_serial_seq',
        COALESCE((
          SELECT MAX(CAST(REGEXP_REPLACE(serial_number, '^AW-CERT-[0-9]{4}-', '') AS BIGINT))
          FROM certificate_issues
          WHERE serial_number ~ '^AW-CERT-[0-9]{4}-[0-9]{6}$'
        ), 0) + 1,
        false
      )
      FROM certificate_issue_serial_seq
      WHERE NOT is_called;
    `);

    logger.info("Session and certificate tables verified/created successfully.");
  } catch (err) {
    logger.error({ err }, "Failed to create or verify session and certificate tables.");
    throw err;
  }
  // ----------------------------------------------------------------------

  const cleanupExpiredCertificates = () => {
    void purgeExpiredCertificates()
      .then((count) => {
        if (count > 0) logger.info({ count }, "Permanently removed expired certificate trash items");
      })
      .catch((error) => logger.error({ err: error }, "Failed to purge expired certificate trash items"));
  };
  cleanupExpiredCertificates();
  setInterval(cleanupExpiredCertificates, 24 * 60 * 60 * 1000).unref();

  app.listen(PORT, "0.0.0.0", () => {
    logger.info({ port: PORT }, "API server is running");
  });
}

bootstrap().catch((error) => {
  logger.error({ err: error }, "Failed to start API server");
  process.exit(1);
});