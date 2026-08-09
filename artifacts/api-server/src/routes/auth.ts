import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { Api } from "@workspace/api-zod";
import { hashPassword } from "../lib/crypto";
import { sendSignupOtpEmail } from "../lib/mailer";
import { ApiError, asyncHandler, getErrorMessage } from "../lib/http";
import { issueOtp, normalizeEmail, validateOtp } from "../lib/otp";
import { logger } from "../lib/logger";

const router: IRouter = Router();

function sanitizeUser(user: typeof usersTable.$inferSelect) {
  return {
    id: user.id,
    fullName: user.fullName,
    phone: user.phone,
    email: user.email,
    username: user.username,
    role: user.role,
    permissions: user.permissions ? JSON.parse(user.permissions) : [],
    isActive: user.isActive,
    createdAt: user.createdAt.toISOString(),
  };
}

// POST /auth/register — create account (unverified), send OTP
router.post("/auth/register", asyncHandler(async (req, res): Promise<void> => {
  const parsed = Api.RegisterBody.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(400, parsed.error.message, { code: "INVALID_REGISTER_BODY" });
  }

  const { fullName, phone, password } = parsed.data;
  const email = normalizeEmail(parsed.data.email);

  const [existingPhone] = await db.select().from(usersTable).where(eq(usersTable.phone, phone));
  if (existingPhone) {
    res.status(409).json({ error: "رقم الهاتف مسجل بالفعل", field: "phone" });
    return;
  }

  const [existingEmail] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (existingEmail) {
    // If already registered but unverified, resend OTP
    if (!existingEmail.isVerified) {
      try {
        const { otp } = issueOtp(email, "signup_verification");
        await sendSignupOtpEmail(email, otp, existingEmail.fullName);
      } catch (error) {
        logger.warn(
          {
            err: error,
            email,
          },
          "Failed to resend signup OTP for existing unverified account",
        );
        res.status(503).json({
          error: getErrorMessage(error),
          field: "email",
          pendingVerification: true,
          otpSent: false,
          email,
        });
        return;
      }
      res.status(409).json({ error: "الحساب موجود لكنه غير مؤكد — أُرسل لك رمز تأكيد جديد", field: "email", pendingVerification: true });
      return;
    }
    res.status(409).json({ error: "الحساب موجود بالفعل", field: "email" });
    return;
  }

  const username = "u_" + phone.replace(/\D/g, "") + "_" + Date.now().toString().slice(-4);
  const passwordHash = hashPassword(password);

  const [user] = await db.insert(usersTable).values({
    fullName,
    phone,
    email,
    username,
    passwordHash,
    role: "client",
    isVerified: false,
  }).returning();

  const { otp } = issueOtp(email, "signup_verification");

  try {
    await sendSignupOtpEmail(email, otp, user.fullName);
  } catch (error) {
    logger.error(
      {
        err: error,
        userId: user.id,
        email,
      },
      "Signup OTP delivery failed after account creation",
    );

    res.status(201).json({
      pendingVerification: true,
      email: user.email,
      otpSent: false,
      message: "تم إنشاء الحساب، لكن تعذر إرسال رمز التحقق حالياً. يمكنك طلب إعادة الإرسال من شاشة التحقق.",
      mailError: getErrorMessage(error),
    });
    return;
  }

  res.status(201).json({
    pendingVerification: true,
    email: user.email,
    otpSent: true,
    message: "تم إنشاء الحساب — تحقق من بريدك الإلكتروني للحصول على رمز التأكيد",
  });
}));

// POST /auth/send-signup-otp — resend verification OTP
router.post("/auth/send-signup-otp", asyncHandler(async (req, res): Promise<void> => {
  const { email } = req.body as { email?: string };
  if (!email || typeof email !== "string") {
    throw new ApiError(400, "البريد الإلكتروني مطلوب", { code: "EMAIL_REQUIRED" });
  }

  const trimmed = normalizeEmail(email);
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, trimmed));

  if (!user) {
    res.status(404).json({ error: "لا يوجد حساب مسجل بهذا البريد" });
    return;
  }
  if (user.isVerified) {
    res.status(400).json({ error: "الحساب مؤكد مسبقاً" });
    return;
  }

  const { otp } = issueOtp(trimmed, "signup_verification");

  try {
    await sendSignupOtpEmail(trimmed, otp, user.fullName);
    res.json({ message: "تم إرسال رمز التأكيد", otpSent: true });
  } catch (error) {
    res.status(503).json({
      error: getErrorMessage(error),
      pendingVerification: true,
      otpSent: false,
      email: trimmed,
    });
  }
}));

// POST /auth/verify-signup-otp — confirm account
router.post("/auth/verify-signup-otp", asyncHandler(async (req, res): Promise<void> => {
  const { email, otp } = req.body as { email?: string; otp?: string };

  if (!email || !otp) {
    res.status(400).json({ error: "البريد والرمز مطلوبان" });
    return;
  }

  const trimmed = normalizeEmail(email);
  const validation = validateOtp(trimmed, "signup_verification", otp);

  if (!validation.ok) {
    if (validation.reason === "missing" || validation.reason === "expired") {
      res.status(400).json({ error: "لم يُرسَل رمز أو انتهت صلاحيته — اطلب إرساله مجدداً" });
      return;
    }

    if (validation.reason === "too_many_attempts") {
      res.status(429).json({ error: "تم تجاوز عدد المحاولات المسموح بها. اطلب رمزاً جديداً ثم أعد المحاولة." });
      return;
    }

    res.status(400).json({
      error: "الرمز غير صحيح",
      remainingAttempts: validation.remainingAttempts,
    });
    return;
  }

  const [user] = await db.update(usersTable)
    .set({ isVerified: true })
    .where(eq(usersTable.email, trimmed))
    .returning();

  if (!user) {
    res.status(404).json({ error: "المستخدم غير موجود" });
    return;
  }

  // Create session
  (req.session as unknown as Record<string, unknown>).userId = user.id;
  (req.session as unknown as Record<string, unknown>).role = user.role;

  res.json({ user: sanitizeUser(user), message: "تم تأكيد الحساب بنجاح" });
}));

// POST /auth/login
router.post("/auth/login", asyncHandler(async (req, res): Promise<void> => {
  const { identifier, password } = req.body as { identifier?: string; password?: string };

  if (!identifier || !password) {
    res.status(400).json({ error: "رقم الهاتف أو البريد وكلمة المرور مطلوبان" });
    return;
  }

  const passwordHash = hashPassword(password);
  const trimmed = identifier.trim();
  const normalizedEmailIdentifier = normalizeEmail(identifier);

  let [user] = await db.select().from(usersTable).where(eq(usersTable.phone, trimmed));
  if (!user) [user] = await db.select().from(usersTable).where(eq(usersTable.email, normalizedEmailIdentifier));
  if (!user) [user] = await db.select().from(usersTable).where(eq(usersTable.username, trimmed));

  if (!user) {
    res.status(404).json({ error: "هذا الحساب غير موجود" });
    return;
  }

  if (user.passwordHash !== passwordHash) {
    res.status(401).json({ error: "كلمة المرور غير صحيحة" });
    return;
  }

  if (!user.isActive) {
    res.status(403).json({ error: "تم تعطيل هذا الحساب، تواصل مع المدير" });
    return;
  }

  if (!user.isVerified) {
    res.status(403).json({ error: "يجب تأكيد بريدك الإلكتروني أولاً", pendingVerification: true, email: user.email });
    return;
  }

  (req.session as unknown as Record<string, unknown>).userId = user.id;
  (req.session as unknown as Record<string, unknown>).role = user.role;

  res.json({ user: sanitizeUser(user), message: "تم تسجيل الدخول بنجاح" });
}));

// POST /auth/verify-phone (kept for backward compat)
router.post("/auth/verify-phone", asyncHandler(async (req, res): Promise<void> => {
  const { phone } = req.body as { phone?: string };
  if (!phone) { res.status(400).json({ error: "رقم الجوال مطلوب" }); return; }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.phone, phone.trim()));
  if (!user) { res.status(404).json({ error: "لا يوجد حساب مسجل بهذا الرقم" }); return; }
  res.json({ found: true, username: user.username });
}));

// POST /auth/reset-password-by-phone (kept for backward compat)
router.post("/auth/reset-password-by-phone", asyncHandler(async (req, res): Promise<void> => {
  const { phone, newPassword } = req.body as { phone?: string; newPassword?: string };
  if (!phone || !newPassword) { res.status(400).json({ error: "رقم الجوال وكلمة المرور الجديدة مطلوبان" }); return; }
  if (newPassword.length < 6) { res.status(400).json({ error: "كلمة المرور يجب أن تكون 6 أحرف على الأقل" }); return; }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.phone, phone.trim()));
  if (!user) { res.status(404).json({ error: "لا يوجد حساب مسجل بهذا الرقم" }); return; }
  await db.update(usersTable).set({ passwordHash: hashPassword(newPassword) }).where(eq(usersTable.id, user.id));
  res.json({ message: "تم تغيير كلمة المرور بنجاح" });
}));

// POST /auth/logout
router.post("/auth/logout", asyncHandler(async (req, res): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    req.session.destroy((error) => {
      if (error) {
        reject(new ApiError(500, "تعذر إنهاء الجلسة الحالية", { code: "SESSION_DESTROY_FAILED", cause: error }));
        return;
      }

      resolve();
    });
  });

  res.json({ message: "تم تسجيل الخروج بنجاح" });
}));

// GET /auth/me
router.get("/auth/me", asyncHandler(async (req, res): Promise<void> => {
  const userId = (req.session as unknown as Record<string, unknown>).userId as number | undefined;
  if (!userId) { res.status(401).json({ error: "غير مصرح" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) { res.status(401).json({ error: "المستخدم غير موجود" }); return; }

  res.json(sanitizeUser(user));
}));

export default router;
