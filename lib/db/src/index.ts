import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import fs from "node:fs";
import path from "node:path";
import * as schema from "./schema";

const { Pool } = pg;

export function normalizeDatabaseUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);

    if (parsed.password.startsWith("[") && parsed.password.endsWith("]")) {
      parsed.password = parsed.password.slice(1, -1);
    }

    if (parsed.hostname.includes("supabase.com")) {
      parsed.searchParams.delete("sslmode");
    }

    return parsed.toString();
  } catch {
    return rawUrl;
  }
}

export const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const normalizedDatabaseUrl = normalizeDatabaseUrl(databaseUrl);

function needsSsl(connectionString: string): boolean {
  return (
    connectionString.includes("supabase.com") ||
    connectionString.includes("sslmode=require")
  );
}

export function createPool(connectionString = normalizedDatabaseUrl): pg.Pool {
  return new Pool({
    connectionString,
    ssl: needsSsl(connectionString) ? { rejectUnauthorized: false } : undefined,
  });
}

export const pool = createPool();

export const db = drizzle(pool, { schema });

function resolveMigrationsFolder(): string | null {
  const candidates = [
    path.resolve(process.cwd(), "lib/db/drizzle"),
    path.resolve(process.cwd(), "drizzle"),
    path.resolve(__dirname, "../drizzle"),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, "meta", "_journal.json"))) {
      return candidate;
    }
  }

  return null;
}

export async function runDatabaseMigrations(): Promise<void> {
  const migrationsFolder = resolveMigrationsFolder();

  if (!migrationsFolder) {
    return;
  }

  await migrate(db, { migrationsFolder });
}

export async function verifyDatabaseConnection(): Promise<void> {
  await pool.query("select 1");
}

export * from "./schema";
