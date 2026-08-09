import nodemailer from "nodemailer";
import { db, siteSettingsTable } from "@workspace/db";
import { ApiError, getErrorMessage } from "./http";
import { logger } from "./logger";

type MailTransportInfo = {
  transporter: nodemailer.Transporter;
  fromEmail: string;
};

// تقليل مهلة الاتصال لعدم تعليق السيرفر (10 ثوانٍ كحد أقصى)
const SMTP_CONNECTION_TIMEOUT_MS = 10000;
const SMTP_GREETING_TIMEOUT_MS = 10000;
const SMTP_SOCKET_TIMEOUT_MS = 10000;
const SMTP_SEND_TIMEOUT_MS = 15000;
const DEFAULT_FRONTEND_URL = process.env.FRONTEND_URL?.trim() || "https://arkan-platform.onrender.com";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatMultilineText(value?: string | null): string {
  const normalized = (value ?? "").trim();
  if (!normalized) return "";
  return escapeHtml(normalized).replace(/\r?\n/g, "<br />");
}

function safeName(name?: string): string {
  const trimmed = (name ?? "").trim();
  return trimmed || "عميلنا العزيز";
}

function closeTransporter(transporter: nodemailer.Transporter) {
  if ("close" in transporter && typeof transporter.close === "function") {
    transporter.close();
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, onTimeout?: () => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      onTimeout?.();
      reject(new Error(`SMTP send timeout after ${ms}ms`));
    }, ms);

    void promise
      .then((result) => {
        clearTimeout(timeoutId);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
  });
}

function toMailError(error: unknown): ApiError {
  const rawMessage = getErrorMessage(error, "تعذر إرسال البريد الإلكتروني حالياً");
  const normalized = rawMessage.toLowerCase();

  if (
    normalized.includes("timeout")
    || normalized.includes("timed out")
    || normalized.includes("etimedout")
    || normalized.includes("greetingneverreceived")
    || normalized.includes("enetunreach")
  ) {
    return new ApiError(
      503,
      "تعذر إرسال البريد الإلكتروني بسبب مشكلة في الاتصال بخادم البريد. يرجى المحاولة مرة أخرى.",
      { code: "SMTP_TIMEOUT", cause: error }
    );
  }

  if (normalized.includes("auth") || normalized.includes("invalid login")) {
    return new ApiError(503, "فشل المصادقة مع خادم البريد. تأكد من صحة بيانات الدخول في الإعدادات.", {
      code: "SMTP_AUTH_FAILED",
      cause: error,
    });
  }

  return new ApiError(503, rawMessage, { code: "MAIL_SEND_FAILED", cause: error });
}

async function getMailTransport(): Promise<MailTransportInfo> {
  const [settings] = await db.select().from(siteSettingsTable).limit(1);
  
  // الأولوية لإعدادات الداتا بيز (لوحة التحكم)، ثم الـ Environment Variables
  const emailUser = settings?.emailUser?.trim() || process.env.SMTP_USER?.trim() || process.env.EMAIL_USER?.trim();
  const emailPass = settings?.emailPass?.trim() || process.env.SMTP_PASS?.trim() || process.env.EMAIL_PASS?.trim();

  if (!emailUser || !emailPass) {
    throw new ApiError(503, "إعدادات البريد الإلكتروني غير مكتملة. يرجى إضافة بيانات SMTP.", {
      code: "MAIL_NOT_CONFIGURED",
    });
  }

  // التعرف التلقائي على ما إذا كان المستخدم يود استخدام Brevo بناءً على اسم المستخدم أو الإعدادات
  const isBrevo = emailUser.includes("smtp-brevo.com") || emailUser.includes("@smtp-brevo.com") || (process.env.SMTP_HOST?.includes("brevo.com") ?? false);

  const host = process.env.SMTP_HOST?.trim() || (isBrevo ? "smtp-relay.brevo.com" : "smtp.gmail.com");
  const port = Number(process.env.SMTP_PORT || (isBrevo ? 587 : 465));
  const secure = port === 465; // بورت 465 آمن بشكل مباشر، بورت 587 يستخدم TLS

  return {
    fromEmail: emailUser,
    transporter: nodemailer.createTransport({
      host,
      port,
      secure,
      auth: {
        user: emailUser,
        pass: emailPass,
      },
      pool: false,
      family: 4, // إجبار السيرفر على استخدام IPv4 لمنع أخطاء الشبكة على Render
      connectionTimeout: SMTP_CONNECTION_TIMEOUT_MS,
      greetingTimeout: SMTP_GREETING_TIMEOUT_MS,
      socketTimeout: SMTP_SOCKET_TIMEOUT_MS,
      dnsTimeout: SMTP_CONNECTION_TIMEOUT_MS,
    } as any),
  };
}

async function sendEmail(options: { to: string; subject: string; html: string; }) {
  const { transporter, fromEmail } = await getMailTransport();

  try {
    await withTimeout(
      transporter.sendMail({
        from: `"أركان لتقنية المعلومات" <${fromEmail}>`,
        to: options.to,
        subject: options.subject,
        html: options.html,
      }),
      SMTP_SEND_TIMEOUT_MS,
      () => closeTransporter(transporter),
    );
  } catch (error) {
    logger.error({ err: error, subject: options.subject, to: options.to }, "Email delivery failed");
    throw toMailError(error);
  } finally {
    closeTransporter(transporter);
  }
}

// ==========================================
// قوالب التصميم الفخمة (Ultra-Premium HTML)
// ==========================================

function createBaseEmail({
  title, preheader, brandLine, content, accent, background,
}: {
  title: string; preheader: string; brandLine: string; content: string; accent: string; background: string;
}): string {
  return `
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap');
        * { box-sizing: border-box; }
        body { margin: 0; padding: 0; background-color: #f8fafc; font-family: 'Cairo', -apple-system, sans-serif; color: #0f172a; -webkit-font-smoothing: antialiased; }
        .wrap { width: 100%; padding: 40px 15px; }
        .card { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 24px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 20px 40px -15px rgba(0,0,0,0.05); }
        .header { padding: 40px 32px 30px; background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); color: #fff; text-align: right; }
        .brand { font-weight: 800; font-size: 16px; color: ${accent}; letter-spacing: 0.5px; text-transform: uppercase; }
        .title { margin: 16px 0 0; font-size: 26px; font-weight: 800; line-height: 1.4; color: #ffffff; }
        .content { padding: 32px; background: #ffffff; }
        .content p { margin: 0 0 16px; color: #334155; font-size: 16px; line-height: 1.8; font-weight: 600; }
        .muted { color: #64748b !important; font-size: 14px; font-weight: 400 !important; }
        .panel { margin: 24px 0; padding: 20px; border-radius: 16px; background: #f8fafc; border: 1px solid #e2e8f0; }
        .payment-box { margin: 24px 0; padding: 24px; border-radius: 16px; background: linear-gradient(to left, #f8fafc, #ffffff); border-right: 4px solid ${accent}; box-shadow: 0 4px 12px rgba(0,0,0,0.02); border-left: 1px solid #e2e8f0; border-top: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0; }
        .payment-box p { color: #0f172a; }
        .otp-card { margin: 32px 0; padding: 32px 24px; border-radius: 20px; text-align: center; background: #f8fafc; border: 1px dashed #cbd5e1; }
        .otp-label { margin-bottom: 12px; color: #64748b; font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; }
        .otp-code { display: inline-block; padding: 12px 32px; border-radius: 16px; background: #ffffff; border: 2px solid ${accent}; color: ${accent}; font-size: 36px; letter-spacing: 12px; font-weight: 800; font-family: ui-monospace, monospace; box-shadow: 0 8px 20px -8px ${accent}40; }
        .button { display: inline-block; padding: 16px 32px; border-radius: 12px; background: ${accent}; color: #ffffff !important; text-decoration: none; font-weight: 700; font-size: 16px; transition: opacity 0.2s; text-align: center; width: 100%; box-shadow: 0 8px 16px -4px ${accent}40; }
        .footer { padding: 24px 32px; border-top: 1px solid #e2e8f0; background: #f8fafc; color: #94a3b8; font-size: 13px; text-align: center; font-weight: 600; }
        .preheader { display:none!important; visibility:hidden; opacity:0; color:transparent; height:0; width:0; overflow:hidden; }
        @media (max-width: 600px) {
          .wrap { padding: 20px 10px; }
          .header, .content, .footer { padding: 24px 20px; }
          .title { font-size: 22px; }
          .otp-code { font-size: 28px; letter-spacing: 8px; width: 100%; padding: 12px 16px; }
        }
      </style>
    </head>
    <body>
      <span class="preheader">${escapeHtml(preheader)}</span>
      <div class="wrap">
        <div class="card">
          <div class="header">
            <div class="brand">${escapeHtml(brandLine)}</div>
            <h1 class="title">${escapeHtml(title)}</h1>
          </div>
          <div class="content">
            ${content}
          </div>
          <div class="footer">
            &copy; ${new Date().getFullYear()} أركان لتقنية المعلومات — جميع الحقوق محفوظة.
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
}

function createOtpContent(params: { greeting: string; intro: string; otp: string; helperText: string; footerNote: string; }) {
  return `
    <p>${escapeHtml(params.greeting)}</p>
    <p>${escapeHtml(params.intro)}</p>
    <div class="otp-card">
      <div class="otp-label">رمز التحقق الآمن</div>
      <div class="otp-code">${escapeHtml(params.otp)}</div>
    </div>
    <div class="panel">
      <p style="margin:0;" class="muted">${escapeHtml(params.helperText)}</p>
    </div>
    <p class="muted">${escapeHtml(params.footerNote)}</p>
  `;
}

export async function sendSignupOtpEmail(to: string, otp: string, name?: string) {
  const userName = safeName(name);
  const title = `مرحباً بك في أركان، خطوة واحدة متبقية`;
  const content = createOtpContent({
    greeting: `أهلاً بك يا ${userName}،`,
    intro: "سعداء بانضمامك إلى منصة أركان. يرجى استخدام رمز التحقق أدناه لتفعيل حسابك والبدء في استخدام خدماتنا.",
    otp,
    helperText: "الرمز صالح لمدة 5 دقائق فقط. نرجو عدم مشاركة هذا الرمز مع أي شخص لضمان أمان حسابك.",
    footerNote: "إذا لم تقم بإنشاء هذا الحساب، يمكنك تجاهل هذه الرسالة بأمان.",
  });

  const html = createBaseEmail({ title, preheader: `رمز تفعيل الحساب: ${otp}`, brandLine: "أركان | حماية الحساب", content, accent: "#3b82f6", background: "#f8fafc" });
  await sendEmail({ to, subject: "تفعيل حسابك في أركان", html });
}

export async function sendResetPasswordOtpEmail(to: string, otp: string, name?: string) {
  const userName = safeName(name);
  const title = `طلب إعادة تعيين كلمة المرور`;
  const content = createOtpContent({
    greeting: `أهلاً بك يا ${userName}،`,
    intro: "لقد تلقينا طلباً لإعادة تعيين كلمة المرور الخاصة بحسابك. يرجى استخدام الرمز أدناه لإكمال العملية.",
    otp,
    helperText: "تنتهي صلاحية هذا الرمز خلال 5 دقائق. إذا لم تقم بهذا الطلب، يرجى تجاهل الرسالة.",
    footerNote: "فريق أركان لن يطلب منك كلمة المرور أو رمز التحقق بأي شكل من الأشكال.",
  });

  const html = createBaseEmail({ title, preheader: `رمز إعادة تعيين كلمة المرور: ${otp}`, brandLine: "أركان | الأمان والخصوصية", content, accent: "#f59e0b", background: "#f8fafc" });
  await sendEmail({ to, subject: "رمز إعادة تعيين كلمة المرور - أركان", html });
}

function currencyLabel(currency: string): string { return currency === "SAR" ? "ر.س" : "ج.م"; }
function money(value: number, currency: string): string { return `${Math.round(value).toLocaleString("ar-EG")} ${currencyLabel(currency)}`; }

export async function sendOrderReceivedEmail(to: string, name: string, orderId: number, siteName: string) {
  const safeSiteName = escapeHtml(siteName);
  const title = `تم استلام طلبك بنجاح`;
  const content = `
    <p>أهلاً بك يا ${safeName(name)}،</p>
    <p>نشكرك على ثقتك في أركان. لقد قمنا باستلام طلبك الخاص بمشروعك، وجاري مراجعته من قبل فريق التقييم لتحديد خطة العمل.</p>
    <div class="panel">
      <p style="margin:0 0 8px;"><strong>رقم الطلب المرجعي:</strong> #${orderId}</p>
      <p style="margin:0;"><strong>اسم المشروع:</strong> ${safeSiteName}</p>
    </div>
    <p class="muted">سيتم إرسال رسالة أخرى فور اعتماد الطلب وتجهيز تفاصيل الدفع.</p>
  `;
  const html = createBaseEmail({ title, preheader: `تم استلام طلبك #${orderId} بنجاح`, brandLine: "أركان | إدارة الطلبات", content, accent: "#0ea5e9", background: "#f8fafc" });
  await sendEmail({ to, subject: `تأكيد استلام الطلب #${orderId} - أركان`, html });
}

export async function sendOrderPaymentApprovedEmail(opts: { to: string; name: string; orderId: number; siteName: string; totalAmount: number; depositPercentage: number; currency: string; paymentMethodName?: string | null; paymentMethodDetails?: string | null; }) {
  const depositAmount = (opts.totalAmount * opts.depositPercentage) / 100;
  const safeSiteName = escapeHtml(opts.siteName);
  const safePaymentMethodName = opts.paymentMethodName ? escapeHtml(opts.paymentMethodName) : "";
  const paymentDetailsHtml = formatMultilineText(opts.paymentMethodDetails);

  const title = `تمت الموافقة على طلبك`;
  const content = `
    <p>أهلاً بك يا ${safeName(opts.name)}،</p>
    <p>يسعدنا إخبارك بأنه تمت مراجعة طلبك والموافقة عليه. للبدء الفوري في التنفيذ، يرجى سداد <strong>الدفعة المقدمة</strong>.</p>
    <div class="panel">
      <p style="margin:0 0 8px;"><strong>رقم الطلب:</strong> #${opts.orderId} | <strong>المشروع:</strong> ${safeSiteName}</p>
      <p style="margin:0 0 8px;"><strong>إجمالي التكلفة:</strong> ${money(opts.totalAmount, opts.currency)}</p>
      <p style="margin:0; color:#0ea5e9; font-weight:800;"><strong>الدفعة المطلوبة الآن (${opts.depositPercentage}%):</strong> ${money(depositAmount, opts.currency)}</p>
    </div>
    <div class="payment-box">
      <p style="margin:0 0 12px; font-weight:800; font-size:18px;">💳 بيانات حساب الدفع ${safePaymentMethodName ? `(${safePaymentMethodName})` : ""}</p>
      <p style="margin:0; font-family: ui-monospace, monospace; font-size: 15px; font-weight: 600; white-space: pre-line; line-height: 1.6;">${paymentDetailsHtml || "الرجاء مراجعة لوحة التحكم لعرض بيانات الدفع المتاحة."}</p>
    </div>
    <p class="muted">بعد إتمام التحويل، نرجو منك رفع صورة الإيصال عبر لوحة تحكم طلباتك ليتم البدء فوراً.</p>
  `;
  const html = createBaseEmail({ title, preheader: `تم اعتماد الطلب #${opts.orderId} — تفاصيل الدفع بالداخل`, brandLine: "أركان | الإدارة المالية", content, accent: "#8b5cf6", background: "#f8fafc" });
  await sendEmail({ to: opts.to, subject: `تم اعتماد الطلب #${opts.orderId} — تفاصيل الدفع`, html });
}

export async function sendOrderInProgressPaymentDetailsEmail(opts: { to: string; name: string; orderId: number; siteName: string; totalAmount?: number | null; depositPercentage?: number | null; currency: string; paymentMethodName?: string | null; paymentMethodDetails?: string | null; }) {
  const safeSiteName = escapeHtml(opts.siteName);
  const safePaymentMethodName = opts.paymentMethodName ? escapeHtml(opts.paymentMethodName) : "";
  const paymentDetailsHtml = formatMultilineText(opts.paymentMethodDetails);
  const depositPercentage = opts.depositPercentage ?? 50;
  const depositAmount = typeof opts.totalAmount === "number" ? (opts.totalAmount * depositPercentage) / 100 : null;

  const title = `طلبك الآن قيد التنفيذ`;
  const content = `
    <p>أهلاً بك يا ${safeName(opts.name)}،</p>
    <p>تم تحديث حالة مشروعك إلى <strong>قيد التنفيذ</strong>. لتجنب أي تأخير في سير العمل، نرجو منك إتمام عملية الدفع عبر البيانات الموضحة أدناه.</p>
    <div class="panel">
      <p style="margin:0 0 8px;"><strong>رقم الطلب:</strong> #${opts.orderId} | <strong>المشروع:</strong> ${safeSiteName}</p>
      ${typeof opts.totalAmount === "number" ? `<p style="margin:0 0 8px;"><strong>الإجمالي:</strong> ${money(opts.totalAmount, opts.currency)}</p>` : ""}
      ${depositAmount !== null ? `<p style="margin:0; color:#10b981; font-weight:800;"><strong>المطلوب سداده الآن:</strong> ${money(depositAmount, opts.currency)}</p>` : ""}
    </div>
    <div class="payment-box">
      <p style="margin:0 0 12px; font-weight:800; font-size:18px;">🏦 تفاصيل حساب التحويل ${safePaymentMethodName ? `(${safePaymentMethodName})` : ""}</p>
      <p style="margin:0; font-family: ui-monospace, monospace; font-size: 15px; font-weight: 600; white-space: pre-line; line-height: 1.6;">${paymentDetailsHtml || "بيانات الحساب غير مدرجة، يرجى التواصل مع الإدارة."}</p>
    </div>
    <div style="margin-top: 32px;">
      <a class="button" href="${escapeHtml(`${DEFAULT_FRONTEND_URL}/my-orders`)}" target="_blank">
        رفع إيصال الدفع
      </a>
    </div>
  `;
  const html = createBaseEmail({ title, preheader: `طلبك #${opts.orderId} قيد التنفيذ - يرجى إتمام الدفع`, brandLine: "أركان | قيد التنفيذ", content, accent: "#10b981", background: "#f8fafc" });
  await sendEmail({ to: opts.to, subject: `مشروعك #${opts.orderId} قيد التنفيذ — بيانات التحويل`, html });
}

export async function sendOrderReceiptUploadedEmail(opts: { to: string; name: string; orderId: number; siteName: string; receiptUrl?: string | null; kind: "deposit" | "final"; }) {
  const kindLabel = opts.kind === "final" ? "النهائي" : "المقدم";
  const safeSiteName = escapeHtml(opts.siteName);
  const title = `تم استلام إيصال الدفع`;
  const content = `
    <p>أهلاً بك يا ${safeName(opts.name)}،</p>
    <p>لقد استلمنا بنجاح إيصال الدفع (<strong>${kindLabel}</strong>) الخاص بك، وهو الآن قيد المراجعة والمطابقة من قِبل قسم الحسابات.</p>
    <div class="panel">
      <p style="margin:0 0 8px;"><strong>رقم الطلب:</strong> #${opts.orderId}</p>
      <p style="margin:0;"><strong>اسم المشروع:</strong> ${safeSiteName}</p>
    </div>
    <p class="muted">سنقوم بتحديث حالة طلبك فور الانتهاء من مراجعة الإيصال.</p>
  `;
  const html = createBaseEmail({ title, preheader: `استلام إيصال دفع الطلب #${opts.orderId}`, brandLine: "أركان | قسم الحسابات", content, accent: "#0ea5e9", background: "#f8fafc" });
  await sendEmail({ to: opts.to, subject: `استلام إيصال الدفع — الطلب #${opts.orderId}`, html });
}

export async function sendOrderReceiptAcceptedEmail(opts: { to: string; name: string; orderId: number; siteName: string; kind: "deposit" | "final"; }) {
  const title = `تم قبول الدفعة بنجاح`;
  const content = `
    <p>أهلاً بك يا ${safeName(opts.name)}،</p>
    <p>نود إعلامك بأنه تم التأكد من التحويل وقبول إيصال الدفع الخاص بك بنجاح.</p>
    <div class="panel" style="background: #f0fdf4; border-color: #bbf7d0;">
      <p style="margin:0 0 8px; color:#15803d;"><strong>رقم الطلب:</strong> #${opts.orderId}</p>
      <p style="margin:0; color:#15803d;"><strong>المشروع:</strong> ${escapeHtml(opts.siteName)}</p>
    </div>
    <p class="muted">شكراً لتعاونك، سنوافيك بآخر تطورات المشروع قريباً.</p>
  `;
  const html = createBaseEmail({ title, preheader: `تأكيد استلام وقبول الدفعة للطلب #${opts.orderId}`, brandLine: "أركان | تأكيد الدفع", content, accent: "#22c55e", background: "#f8fafc" });
  await sendEmail({ to: opts.to, subject: `تأكيد الدفع — الطلب #${opts.orderId}`, html });
}

export async function sendOrderPhaseEmail(opts: { to: string; name: string; orderId: number; siteName: string; phase: "started" | "in_progress"; }) {
  const phaseTitle = opts.phase === "started" ? "بدء التنفيذ" : "قيد التنفيذ";
  const title = `تم تحديث حالة مشروعك`;
  const content = `
    <p>أهلاً بك يا ${safeName(opts.name)}،</p>
    <p>تم انتقال مشروعك إلى مرحلة <strong>${phaseTitle}</strong> ونعمل حالياً بجهد على إنجازه وفق أعلى معايير الجودة.</p>
    <div class="panel">
      <p style="margin:0 0 8px;"><strong>رقم الطلب:</strong> #${opts.orderId}</p>
      <p style="margin:0;"><strong>اسم المشروع:</strong> ${escapeHtml(opts.siteName)}</p>
    </div>
  `;
  const html = createBaseEmail({ title, preheader: `حالة الطلب #${opts.orderId}: ${phaseTitle}`, brandLine: "أركان | تحديثات المشروع", content, accent: "#3b82f6", background: "#f8fafc" });
  await sendEmail({ to: opts.to, subject: `تحديث الطلب #${opts.orderId} - ${phaseTitle}`, html });
}

export async function sendOrderCompletedEmail(opts: { to: string; name: string; orderId: number; siteName: string; deliveredUrl: string; requireFinalPaymentNotice: boolean; paymentMethodName?: string | null; paymentMethodDetails?: string | null; }) {
  const title = `تهانينا! تم إنجاز مشروعك`;
  const safeDeliveredUrl = escapeHtml(opts.deliveredUrl);
  const paymentDetailsHtml = formatMultilineText(opts.paymentMethodDetails);
  const notice = opts.requireFinalPaymentNotice
    ? `
      <div class="payment-box" style="border-right-color: #f59e0b; background: linear-gradient(to left, #fffbeb, #ffffff);">
        <p style="margin:0 0 8px; font-weight:800; color:#b45309; font-size:16px;">⚠️ خطوة أخيرة لاستلام كامل الملفات</p>
        <p style="margin:0 0 12px; font-weight:600;">يرجى استكمال الدفعة النهائية لتسليمك كافة الصلاحيات والبيانات.</p>
        ${paymentDetailsHtml ? `<p style="margin:0; font-family: ui-monospace, monospace; font-size: 14px; white-space: pre-line; color: #78350f;">${paymentDetailsHtml}</p>` : ""}
      </div>
    ` : "";

  const content = `
    <p>أهلاً بك يا ${safeName(opts.name)}،</p>
    <p>يسعدنا إخبارك بأنه تم الانتهاء من العمل على مشروعك بالكامل. يمكنك الآن معاينة النتيجة النهائية عبر الرابط المرفق.</p>
    <div class="panel" style="text-align: center; background: #f0fdf4; border-color: #bbf7d0;">
      <p style="margin:0 0 12px; font-weight: 800; color:#166534;">رابط المعاينة المباشر</p>
      <a href="${safeDeliveredUrl}" target="_blank" style="color:#15803d; font-weight:700; text-decoration:underline;">${safeDeliveredUrl}</a>
    </div>
    ${notice}
    <p class="muted">إذا كان لديك أي استفسار، نحن متواجدون لخدمتك دائماً.</p>
  `;
  const html = createBaseEmail({ title, preheader: `تم إنجاز طلبك #${opts.orderId} — استلم مشروعك الآن`, brandLine: "أركان | تسليم المشروع", content, accent: "#10b981", background: "#f8fafc" });
  await sendEmail({ to: opts.to, subject: `تسليم المشروع #${opts.orderId} - أركان`, html });
}

export async function sendOrderStatusUpdateEmail(to: string, name: string, orderId: number, orderName: string, status: string, message: string) {
  const ordersUrl = escapeHtml(`${DEFAULT_FRONTEND_URL}/my-orders`);
  const title = `تحديث بخصوص طلبك #${orderId}`;
  const content = `
    <p>أهلاً بك يا ${escapeHtml(name)}،</p>
    <p>هنالك تحديث جديد بخصوص مشروعك: <strong>${escapeHtml(orderName)}</strong>.</p>
    <div class="panel">
      <p style="margin:0 0 8px;"><strong>الحالة الحالية:</strong> <span style="color:#2563eb; font-weight:800;">${escapeHtml(status)}</span></p>
    </div>
    <p style="font-weight:600; color:#334155; line-height: 1.8;">${formatMultilineText(message)}</p>
    <div style="margin-top: 32px;">
      <a class="button" href="${ordersUrl}" target="_blank">
        متابعة حالة الطلب
      </a>
    </div>
  `;
  const html = createBaseEmail({ title, preheader: `تحديث جديد بخصوص طلبك #${orderId}`, brandLine: "أركان | تنبيهات النظام", content, accent: "#3b82f6", background: "#f8fafc" });
  await sendEmail({ to, subject: `تحديث الطلب #${orderId}`, html });
}
