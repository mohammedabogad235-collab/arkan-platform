import "dotenv/config";
import { runDatabaseMigrations, verifyDatabaseConnection, db } from "@workspace/db";
import { sql } from "drizzle-orm"; // استيراد sql من drizzle
import app from "./app";
import { logger } from "./lib/logger";

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

    logger.info("Session and certificate tables verified/created successfully.");
  } catch (err) {
    logger.warn({ err }, "Session/certificate tables might already exist or failed to create.");
  }
  // ----------------------------------------------------------------------

  app.listen(PORT, "0.0.0.0", () => {
    logger.info({ port: PORT }, "API server is running");
  });
}

bootstrap().catch((error) => {
  logger.error({ err: error }, "Failed to start API server");
  process.exit(1);
});