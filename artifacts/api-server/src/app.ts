import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import router from "./routes";
import { logger } from "./lib/logger";
import { normalizedDatabaseUrl } from "@workspace/db";
import path from "path";

const app: Express = express();

app.set("trust proxy", 1);

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

function normalizeOrigin(origin: string) {
  try {
    const url = new URL(origin.trim());
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

const allowedOrigins = new Set(
  [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://arkan-app-1cme.onrender.com",
    "https://arkan-web-2.web.app",
    "https://arkan-web-2.firebaseapp.com",
    process.env.FRONTEND_URL,
    process.env.FIREBASE_APP_URL,
    process.env.FIREBASE_PREVIEW_URL,
    ...(process.env.ALLOWED_ORIGINS?.split(",") ?? []),
  ]
    .map((origin) => (origin ? normalizeOrigin(origin) : null))
    .filter((origin): origin is string => Boolean(origin)),
);

function isAllowedOrigin(origin?: string) {
  if (!origin) return true;

  const normalizedOrigin = normalizeOrigin(origin);
  if (!normalizedOrigin) return false;

  if (allowedOrigins.has(normalizedOrigin)) {
    return true;
  }

  try {
    const { protocol, hostname } = new URL(normalizedOrigin);

    if (
      protocol === "https:" &&
      (hostname.endsWith(".web.app") || hostname.endsWith(".firebaseapp.com"))
    ) {
      return true;
    }
  } catch {
    return false;
  }

  return false;
}

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);

    if (isAllowedOrigin(origin)) {
      callback(null, true);
    } else {
      logger.warn({ origin }, "Blocked CORS origin");
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  optionsSuccessStatus: 204,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PgSession = connectPgSimple(session);

app.use(
  session({
    store: new PgSession({
      conString: normalizedDatabaseUrl,
      tableName: "session",
      createTableIfMissing: true,
    }),
    secret: process.env.SESSION_SECRET ?? "fallback-secret-change-in-production",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    },
  })
);

// 1. تشغيل مسارات الـ API (الباك إند)
app.use(router);

// 2. مسار فحص صحة السيرفر
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// 3. ربط ملفات الواجهة (الفرونت إند) بالسيرفر
const frontendDistPath = path.join(process.cwd(), "artifacts/website-builder/dist");
app.use(express.static(frontendDistPath));

// 4. توجيه أي مسار آخر لصفحة الواجهة (التعديل الأخير هنا لتجنب خطأ PathError)
app.get(/.*/, (req: Request, res: Response) => {
  res.sendFile(path.join(frontendDistPath, "index.html"));
});

// 5. صائد الأخطاء العام (يجب أن يكون في النهاية تماماً)
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error(err, "An unhandled error occurred");
  res.status(500).json({ error: err.message || "حدث خطأ في السيرفر" });
});

export default app;