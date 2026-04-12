import app from "./app";
import { logger } from "./lib/logger";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import * as crypto from "crypto";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function ensureAdminExists() {
  const hash = crypto.createHash("sha256").update("admin123" + "arkan-pwd-salt-2024").digest("hex");
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

app.listen(port, async (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  await ensureAdminExists().catch(e => logger.error({ err: e }, "Failed to ensure admin"));
});
