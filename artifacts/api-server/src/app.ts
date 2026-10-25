import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import router from "./routes";
import { isApiError } from "./lib/http";
import { logger } from "./lib/logger";
import { normalizedDatabaseUrl } from "@workspace/db";
import { existsSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const app: Express = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const frontendDistPath = resolve(__dirname, "../../website-builder/dist");
const frontendIndexPath = resolve(frontendDistPath, "index.html");
const sessionSecret = process.env.SESSION_SECRET?.trim();

if (process.env.NODE_ENV === "production" && (!sessionSecret || sessionSecret.length < 32)) {
  throw new Error("SESSION_SECRET must be configured with at least 32 characters in production");
}

logger.info(
  {
    frontendDistPath,
    frontendDistExists: existsSync(frontendDistPath),
    frontendIndexExists: existsSync(frontendIndexPath),
  },
  "Resolved frontend static assets path",
);

app.set("trust proxy", 1);

function normalizeOrigin(value: string): string {
  const url = new URL(value.trim());
  if (!["http:", "https:"].includes(url.protocol) || url.origin === "null") {
    throw new Error(`Invalid allowed origin: ${value}`);
  }
  return url.origin;
}

const configuredOrigins = [
  ...(process.env.ALLOWED_ORIGINS ?? "").split(",").map((origin) => origin.trim()).filter(Boolean),
  process.env.PUBLIC_APP_URL?.trim() || "https://arkan-platform.onrender.com",
  process.env.FRONTEND_URL?.trim(),
  ...(process.env.NODE_ENV === "production"
    ? []
    : ["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:3000"]),
].filter((origin): origin is string => Boolean(origin));
const allowedOrigins = new Set(configuredOrigins.map(normalizeOrigin));

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use((req, res, next) => {
  const origin = req.get("Origin");
  if (origin && !allowedOrigins.has(origin)) {
    res.status(403).json({ error: "مصدر الطلب غير مسموح" });
    return;
  }
  next();
});

app.use(
  cors({
    origin: (origin, callback) => callback(null, !origin || allowedOrigins.has(origin)),
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "Accept",
      "Origin",
      "X-Requested-With",
      "X-CSRF-Token",
    ],
    optionsSuccessStatus: 204,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  express.static(frontendDistPath, {
    index: false,
  }),
);

const PgSession = connectPgSimple(session);
app.use(
  session({
    store: new PgSession({
      conString: normalizedDatabaseUrl,
      tableName: "session",
      createTableIfMissing: false, // تم التعديل لمنع البحث عن ملف table.sql المفقود
    }),
    secret: sessionSecret ?? "development-only-session-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 30 * 24 * 60 * 60 * 1000,
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    },
  })
);

app.use("/api", router);
app.use("/api", (_req, res) => {
  res.status(404).json({
    error: "المسار المطلوب غير موجود",
    code: "API_ROUTE_NOT_FOUND",
  });
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.get(/^(?!\/api(?:\/|$)).*/, (req: Request, res: Response, next: NextFunction) => {
  if (extname(req.path)) {
    return next();
  }

  res.sendFile(frontendIndexPath);
});

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  const statusCode = isApiError(err) ? err.statusCode : 500;
  const errorCode = isApiError(err) ? err.code : "INTERNAL_SERVER_ERROR";
  const details = isApiError(err) ? err.details : undefined;

  logger.error(
    {
      err,
      statusCode,
      errorCode,
    },
    "An unhandled error occurred",
  );

  res.status(statusCode).json({
    error: err.message || "حدث خطأ في السيرفر",
    code: errorCode,
    ...(details !== undefined ? { details } : {}),
  });
});

export default app;
