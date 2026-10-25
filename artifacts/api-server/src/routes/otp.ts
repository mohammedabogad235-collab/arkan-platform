import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { hashPassword } from "../lib/crypto";
import { sendResetPasswordOtpEmail } from "../lib/mailer";
import { ApiError, asyncHandler } from "../lib/http";
import { invalidateOtp, issueOtp, normalizeEmail, validateOtp } from "../lib/otp";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// POST /auth/send-otp  — send OTP to email
router.post("/auth/send-otp", asyncHandler(async (req, res): Promise<void> => {
  const { email } = req.body as { email?: string };

  if (!email || typeof email !== "string") {
    throw new ApiError(400, "البريد الإلكتروني مطلوب", { code: "EMAIL_REQUIRED" });
  }

  const trimmed = normalizeEmail(email);
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, trimmed));
  if (user?.isActive) {
    const { otp } = issueOtp(trimmed, "password_reset");
    try {
      await sendResetPasswordOtpEmail(trimmed, otp, user.fullName);
    } catch (error) {
      logger.error({ err: error, userId: user.id }, "Password reset OTP delivery failed");
      invalidateOtp(trimmed, "password_reset");
    }
  }
  res.json({ message: "إذا كان البريد مرتبطاً بحساب نشط، فسيصلك رمز التحقق.", otpSent: true });
}));

// POST /auth/verify-otp  — verify OTP and reset password
router.post("/auth/verify-otp", asyncHandler(async (req, res): Promise<void> => {
  const { email, otp, newPassword } = req.body as { email?: string; otp?: string; newPassword?: string };

  if (!email || !otp || !newPassword) {
    res.status(400).json({ error: "البريد والرمز وكلمة المرور الجديدة مطلوبة" });
    return;
  }

  const trimmed = normalizeEmail(email);
  const validation = validateOtp(trimmed, "password_reset", otp);

  if (!validation.ok) {
    if (validation.reason === "missing" || validation.reason === "expired") {
      res.status(400).json({ error: "لم يتم إرسال رمز أو انتهت صلاحيته — أعد الطلب" });
      return;
    }

    if (validation.reason === "too_many_attempts") {
      res.status(429).json({ error: "تم استهلاك عدد المحاولات المسموح بها. اطلب رمزاً جديداً." });
      return;
    }

    res.status(400).json({
      error: "الرمز غير صحيح",
      remainingAttempts: validation.remainingAttempts,
    });
    return;
  }

  if (newPassword.length < 6) {
    res.status(400).json({ error: "كلمة المرور يجب أن تكون 6 أحرف على الأقل" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, trimmed));
  if (!user?.isActive) {
    res.status(400).json({ error: "تعذر إعادة تعيين كلمة المرور لهذا الحساب" });
    return;
  }

  await db.update(usersTable)
    .set({ passwordHash: hashPassword(newPassword) })
    .where(eq(usersTable.id, user.id));

  res.json({ message: "تم إعادة تعيين كلمة المرور بنجاح" });
}));

export default router;
