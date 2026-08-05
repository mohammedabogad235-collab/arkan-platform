import nodemailer from "nodemailer";
import { db, siteSettingsTable } from "@workspace/db";

async function getEmailConfig(): Promise<{ user: string; pass: string }> {
  try {
    const rows = await db.select({
      emailUser: siteSettingsTable.emailUser,
      emailPass: siteSettingsTable.emailPass,
    }).from(siteSettingsTable).limit(1);

    const row = rows[0];
    if (row?.emailUser && row?.emailPass) {
      return { user: row.emailUser, pass: row.emailPass };
    }
  } catch {
    // fall through to env vars
  }

  return {
    user: process.env.EMAIL_USER || "",
    pass: process.env.EMAIL_PASS || "",
  };
}

export async function sendOtpEmail(to: string, otp: string): Promise<void> {
  const { user, pass } = await getEmailConfig();

  if (!user || !pass) {
    throw new Error("لم يتم إعداد بيانات البريد الإلكتروني — راجع إعدادات OTP في لوحة التحكم");
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 10000,
  });

  await transporter.sendMail({
    from: `"أركان للمواقع" <${user}>`,
    to,
    subject: "رمز التحقق (OTP) — أركان",
    html: `
      <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 480px; margin: auto; padding: 32px; border-radius: 12px; border: 1px solid #e5e7eb;">
        <h2 style="color: #1e293b; margin-bottom: 8px;">رمز التحقق الخاص بك</h2>
        <p style="color: #64748b; margin-bottom: 24px;">استخدم الرمز التالي لإعادة تعيين كلمة المرور. صالح لمدة <strong>5 دقائق</strong>.</p>
        <div style="background: #f1f5f9; border-radius: 10px; padding: 20px; text-align: center; margin-bottom: 24px;">
          <span style="font-size: 40px; font-weight: bold; letter-spacing: 8px; color: #0f172a; font-family: monospace;">${otp}</span>
        </div>
        <p style="color: #94a3b8; font-size: 13px;">إذا لم تطلب هذا الرمز، تجاهل هذا البريد بأمان.</p>
      </div>
    `,
  });
}
