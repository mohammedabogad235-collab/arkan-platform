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
    logger.info("Session table verified/created successfully.");
  } catch (err) {
    logger.warn({ err }, "Session table might already exist or failed to create.");
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