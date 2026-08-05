import app from "./app";
import { logger } from "./lib/logger";
import { db, usersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { hashPassword } from "./lib/crypto";

const rawPort = process.env["PORT"] ?? "8080";
const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function ensureSessionTable() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "session" (
      "sid" varchar NOT NULL,
      "sess" json NOT NULL,
      "expire" timestamp(6) NOT NULL,
      CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE
    ) WITH (OIDS=FALSE)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire")
  `);
}

async function ensureAdminExists() {
  const hash = hashPassword("admin123");
  const [existing] = await db.select().from(usersTable).where(eq(usersTable.username, "admin"));
  if (!existing) {
    await db.insert(usersTable).values({
      fullName: "المدير",
      phone: "01000000000",
      email: "admin@platform.com",
      username: "admin",
      passwordHash: hash,
      role: "admin",
    });
    logger.info("Admin user created");
  } else if (existing.passwordHash !== hash) {
    await db.update(usersTable).set({ passwordHash: hash, role: "admin" }).where(eq(usersTable.username, "admin"));
    logger.info("Admin password synced");
  }
}

async function startServer() {
  try {
    await ensureSessionTable();
    logger.info("Session table ready");
  } catch (e) {
    logger.error({ err: e }, "Failed to ensure session table — continuing anyway");
  }

  try {
    await ensureAdminExists();
  } catch (e) {
    logger.error({ err: e }, "Failed to ensure admin");
  }

  app.listen(port, () => {
    logger.info({ port }, "Server listening");
  });
}

startServer();
