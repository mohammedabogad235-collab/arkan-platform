import nodemailer from "nodemailer";
import { db, siteSettingsTable } from "@workspace/db";

async function getTransporter() {
  const [settings] = await db.select().from(siteSettingsTable).limit(1);

  const emailUser = (settings as any)?.emailUser || process.env.EMAIL_USER;
  const emailPass = (settings as any)?.emailPass || process.env.EMAIL_PASS;

  if (!emailUser || !emailPass) {
    throw new Error("Email credentials (EMAIL_USER, EMAIL_PASS) are not configured in DB or .env");
  }

  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: emailUser,
      pass: emailPass, // Use App Password for Gmail
    },
  });
}

function createOtpEmailTemplate(otp: string): string {
  return `
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 20px; background-color: #f4f4f7; }
        .container { max-width: 600px; margin: auto; background-color: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; }
        .header { background-color: #0d9488; padding: 24px; text-align: center; }
        .header h1 { color: #ffffff; margin: 0; font-size: 24px; }
        .content { padding: 32px; text-align: center; }
        .content p { color: #475569; font-size: 16px; line-height: 1.6; }
        .otp-code {
          display: inline-block;
          background-color: #f1f5f9;
          color: #0d9488;
          font-size: 36px;
          font-weight: bold;
          letter-spacing: 8px;
          padding: 16px 24px;
          border-radius: 8px;
          margin: 24px 0;
          border: 1px dashed #cbd5e1;
        }
        .footer { background-color: #f8fafc; padding: 20px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header"><h1>أركان</h1></div>
        <div class="content">
          <p>أهلاً بك! استخدم الرمز التالي لتأكيد حسابك أو إعادة تعيين كلمة المرور. الرمز صالح لمدة 5 دقائق.</p>
          <div class="otp-code">${otp}</div>
          <p>إذا لم تطلب هذا الرمز، يمكنك تجاهل هذا البريد الإلكتروني.</p>
        </div>
        <div class="footer">&copy; ${new Date().getFullYear()} أركان. جميع الحقوق محفوظة.</div>
      </div>
    </body>
    </html>
  `;
}

export async function sendOtpEmail(to: string, otp: string): Promise<void> {
  const transporter = await getTransporter();
  const mailOptions = {
    from: `"أركان" <${process.env.EMAIL_USER}>`,
    to,
    subject: `رمز التحقق الخاص بك هو ${otp}`,
    html: createOtpEmailTemplate(otp),
  };
  await transporter.sendMail(mailOptions);
}