import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { hashPassword } from "../lib/crypto";
import { sendResetPasswordOtpEmail } from "../lib/mailer";

const router: IRouter = Router();

// In-memory OTP store: email -> { otp, expiresAt }
const otpStore = new Map<string, { otp: string; expiresAt: number }>();

function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// POST /auth/send-otp  — send OTP to email
router.post("/auth/send-otp", async (req, res): Promise<void> => {
  const { email } = req.body as { email?: string };

  if (!email || typeof email !== "string") {
    res.status(400).json({ error: "البريد الإلكتروني مطلوب" });
    return;
  }

  const trimmed = email.trim().toLowerCase();
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, trimmed));

  if (!user) {
    res.status(404).json({ error: "لا يوجد حساب مسجل بهذا البريد الإلكتروني" });
    return;
  }

  const otp = generateOtp();
  const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes
  otpStore.set(trimmed, { otp, expiresAt });

  try {
    await sendResetPasswordOtpEmail(trimmed, otp, user.fullName);
    res.json({ message: "تم إرسال رمز التحقق إلى بريدك الإلكتروني" });
  } catch (err: any) {
    otpStore.delete(trimmed);
    res.status(500).json({ error: err?.message || "فشل إرسال البريد الإلكتروني — تحقق من إعدادات OTP" });
  }
});

// POST /auth/verify-otp  — verify OTP and reset password
router.post("/auth/verify-otp", async (req, res): Promise<void> => {
  const { email, otp, newPassword } = req.body as { email?: string; otp?: string; newPassword?: string };

  if (!email || !otp || !newPassword) {
    res.status(400).json({ error: "البريد والرمز وكلمة المرور الجديدة مطلوبة" });
    return;
  }

  const trimmed = email.trim().toLowerCase();
  const stored = otpStore.get(trimmed);

  if (!stored) {
    res.status(400).json({ error: "لم يتم إرسال رمز أو انتهت صلاحيته — أعد الطلب" });
    return;
  }

  if (Date.now() > stored.expiresAt) {
    otpStore.delete(trimmed);
    res.status(400).json({ error: "انتهت صلاحية الرمز، أعد طلبه" });
    return;
  }

  if (stored.otp !== otp.trim()) {
    res.status(400).json({ error: "الرمز غير صحيح" });
    return;
  }

  if (newPassword.length < 6) {
    res.status(400).json({ error: "كلمة المرور يجب أن تكون 6 أحرف على الأقل" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, trimmed));
  if (!user) {
    res.status(404).json({ error: "المستخدم غير موجود" });
    return;
  }

  await db.update(usersTable)
    .set({ passwordHash: hashPassword(newPassword) })
    .where(eq(usersTable.id, user.id));

  otpStore.delete(trimmed);
  res.json({ message: "تم إعادة تعيين كلمة المرور بنجاح" });
});

export default router;
