import admin from "firebase-admin";
import { readFileSync } from "node:fs";
import { isAbsolute, resolve as resolvePath } from "node:path";
import { logger } from "./logger";

type ServiceAccountJson = {
  project_id?: string;
  client_email?: string;
  private_key?: string;
  [key: string]: unknown;
};

let firebaseAppInitialized = false;
let missingConfigWarned = false;

function safeParseServiceAccount(raw: string): ServiceAccountJson | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  try {
    const parsed = JSON.parse(trimmed) as ServiceAccountJson;
    // ✅ تطبيع private_key عند وصوله من env (غالباً يكون \n حرفياً)
    if (typeof parsed.private_key === "string") {
      parsed.private_key = parsed.private_key.replace(/\\n/g, "\n");
    }
    return parsed;
  } catch (error) {
    logger.error({ err: error }, "FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON");
    return null;
  }
}

function loadServiceAccountRaw(): string | null {
  const base64 = process.env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64?.trim();
  if (base64) {
    try {
      return Buffer.from(base64, "base64").toString("utf8");
    } catch (error) {
      logger.error({ err: error }, "FIREBASE_SERVICE_ACCOUNT_JSON_BASE64 is not valid base64");
    }
  }

  const rawJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (rawJson) return rawJson;

  const filePath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH?.trim();
  if (filePath) {
    try {
      const resolved = isAbsolute(filePath) ? filePath : resolvePath(process.cwd(), filePath);
      return readFileSync(resolved, "utf8");
    } catch (error) {
      logger.error({ err: error, filePath }, "Failed to read FIREBASE_SERVICE_ACCOUNT_PATH");
    }
  }

  return null;
}

function getFirebaseApp(): admin.app.App | null {
  // ✅ لو متضبطتش متغيرات البيئة، نخلي الإشعارات تتخطى بصمت بدون كسر السيرفر
  const rawServiceAccountJson = loadServiceAccountRaw();
  if (!rawServiceAccountJson) {
    return null;
  }

  const serviceAccount = safeParseServiceAccount(rawServiceAccountJson);
  if (!serviceAccount) return null;

  try {
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
      });
      firebaseAppInitialized = true;
      logger.info(
        {
          projectId: serviceAccount.project_id,
        },
        "Firebase Admin initialized",
      );
    }

    return admin.app();
  } catch (error) {
    logger.error({ err: error }, "Failed to initialize Firebase Admin");
    return null;
  }
}

export type PushNotificationOptions = {
  fcmToken: string;
  title: string;
  body: string;
  data?: Record<string, string>;
};

export async function sendPushNotification(options: PushNotificationOptions): Promise<void> {
  const token = options.fcmToken?.trim();
  if (!token) return;

  const app = getFirebaseApp();
  if (!app) {
    if (!missingConfigWarned) {
      // تنبيه مرة واحدة فقط في اللوج (بدون Spam)
      missingConfigWarned = true;
      logger.warn("FCM is not configured (missing FIREBASE_SERVICE_ACCOUNT_JSON). Push notifications are skipped.");
    }
    return;
  }

  try {
    await admin.messaging(app).send({
      token,
      notification: {
        title: options.title,
        body: options.body,
      },
      data: options.data,
      android: {
        priority: "high",
      },
    });
  } catch (error) {
    logger.error(
      {
        err: error,
      },
      "Failed to send push notification",
    );
  }
}
