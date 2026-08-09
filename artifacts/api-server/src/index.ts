import "dotenv/config";
import { runDatabaseMigrations, verifyDatabaseConnection } from "@workspace/db";
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

  app.listen(PORT, "0.0.0.0", () => {
    logger.info({ port: PORT }, "API server is running");
  });
}

bootstrap().catch((error) => {
  logger.error({ err: error }, "Failed to start API server");
  process.exit(1);
});
