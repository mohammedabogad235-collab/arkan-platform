import nodemailer from "nodemailer";
import { db, siteSettingsTable } from "@workspace/db";
import { ApiError, getErrorMessage } from "./http";
import { logger } from "./logger";

type MailTransportInfo = {
  transporter: nodemailer.Transporter;
  fromEmail: string;
};

const SMTP_CONNECTION_TIMEOUT_MS = Number(process.env.SMTP_CONNECTION_TIMEOUT_MS ?? 10000);
const SMTP_GREETING_TIMEOUT_MS = Number(process.env.SMTP_GREETING_TIMEOUT_MS ?? 10000);
const SMTP_SOCKET_TIMEOUT_MS = Number(process.env.SMTP_SOCKET_TIMEOUT_MS ?? 15000);
const SMTP_SEND_TIMEOUT_MS = Number(process.env.SMTP_SEND_TIMEOUT_MS ?? 20000);
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
  return trimmed || "عزيزي العميل";
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
  ) {
    return new ApiError(
      503,
      "تعذر إرسال البريد الإلكتروني حالياً بسبب انتهاء مهلة الاتصال بخادم البريد. تحقق من إعدادات SMTP ثم أعد المحاولة.",
      {
        code: "SMTP_TIMEOUT",
        cause: error,
      },
    );
  }

  if (normalized.includes("auth") || normalized.includes("invalid login")) {
    return new ApiError(503, "فشل التحقق من بيانات SMTP. راجع البريد الإلكتروني وكلمة مرور التطبيق في إعدادات الموقع.", {
      code: "SMTP_AUTH_FAILED",
      cause: error,
    });
  }

  return new ApiError(503, rawMessage, {
    code: "MAIL_SEND_FAILED",
    cause: error,
  });
}

async function getMailTransport(): Promise<MailTransportInfo> {
  const [settings] = await db.select().from(siteSettingsTable).limit(1);
  const emailUser = settings?.emailUser?.trim() || process.env.EMAIL_USER?.trim();
  const emailPass = settings?.emailPass?.trim() || process.env.EMAIL_PASS?.trim();

  if (!emailUser || !emailPass) {
    throw new ApiError(503, "إعدادات البريد الإلكتروني غير مكتملة. أضف بيانات SMTP من لوحة الإعدادات أو متغيرات البيئة.", {
      code: "MAIL_NOT_CONFIGURED",
    });
  }

  const host = process.env.SMTP_HOST?.trim() || "smtp.gmail.com";
  const port = Number(process.env.SMTP_PORT ?? 465);
  const secure = process.env.SMTP_SECURE ? process.env.SMTP_SECURE === "true" : port === 465;

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
      connectionTimeout: SMTP_CONNECTION_TIMEOUT_MS,
      greetingTimeout: SMTP_GREETING_TIMEOUT_MS,
      socketTimeout: SMTP_SOCKET_TIMEOUT_MS,
      dnsTimeout: SMTP_CONNECTION_TIMEOUT_MS,
    }),
  };
}

async function sendEmail(options: {
  to: string;
  subject: string;
  html: string;
}) {
  const { transporter, fromEmail } = await getMailTransport();

  try {
    await withTimeout(
      transporter.sendMail({
        from: `"أركان" <${fromEmail}>`,
        to: options.to,
        subject: options.subject,
        html: options.html,
      }),
      SMTP_SEND_TIMEOUT_MS,
      () => closeTransporter(transporter),
    );
  } catch (error) {
    logger.error(
      {
        err: error,
        subject: options.subject,
        to: options.to,
      },
      "Email delivery failed",
    );
    throw toMailError(error);
  } finally {
    closeTransporter(transporter);
  }
}

function createBaseEmail({
  title,
  preheader,
  brandLine,
  content,
  accent,
  background,
}: {
  title: string;
  preheader: string;
  brandLine: string;
  content: string;
  accent: string;
  background: string;
}): string {
  return `
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta name="color-scheme" content="light only" />
      <style>
        * { box-sizing: border-box; }
        body { margin: 0; padding: 0; background: ${background}; font-family: -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; color: #0f172a; }
        .wrap { width: 100%; padding: 28px 12px; }
        .card { max-width: 640px; margin: 0 auto; background: #ffffff; border-radius: 24px; overflow: hidden; border: 1px solid rgba(15,23,42,0.08); box-shadow: 0 18px 44px rgba(15,23,42,0.10); }
        .header { padding: 26px 24px 18px; background: linear-gradient(135deg, ${accent} 0%, #0f172a 100%); color: #fff; }
        .brand { font-weight: 800; letter-spacing: 0.2px; font-size: 15px; opacity: .96; }
        .eyebrow { display: inline-block; margin-top: 14px; padding: 7px 12px; border-radius: 999px; background: rgba(255,255,255,0.14); font-size: 12px; font-weight: 700; }
        .title { margin: 14px 0 0; font-size: 24px; line-height: 1.45; }
        .content { padding: 24px; }
        .content p { margin: 0 0 14px; color: #0f172a; font-size: 15px; line-height: 1.9; }
        .muted { color: #64748b !important; font-size: 13px; }
        .panel { margin: 18px 0; padding: 16px; border-radius: 18px; background: rgba(15,23,42,0.03); border: 1px solid rgba(15,23,42,0.08); }
        .otp-card { margin: 20px 0; padding: 22px 18px; border-radius: 22px; text-align: center; background: linear-gradient(180deg, rgba(255,255,255,1) 0%, rgba(248,250,252,1) 100%); border: 1px solid rgba(15,23,42,0.08); box-shadow: inset 0 1px 0 rgba(255,255,255,0.8); }
        .otp-label { margin-bottom: 10px; color: #475569; font-size: 13px; font-weight: 700; }
        .otp-code { display: inline-block; padding: 14px 18px; border-radius: 18px; background: rgba(79,70,229,0.08); border: 1px dashed rgba(79,70,229,0.28); color: ${accent}; font-size: 34px; letter-spacing: 10px; font-weight: 800; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace; }
        .meta p { margin: 0 0 8px; }
        .button { display: inline-block; padding: 12px 20px; border-radius: 12px; background: ${accent}; color: #fff !important; text-decoration: none; font-weight: 700; }
        .footer { padding: 16px 24px 24px; border-top: 1px solid rgba(15,23,42,0.08); color: #64748b; font-size: 12px; text-align: center; }
        .preheader { display:none!important; visibility:hidden; opacity:0; color:transparent; height:0; width:0; overflow:hidden; mso-hide:all; }
        @media (max-width: 540px) {
          .wrap { padding: 16px 8px; }
          .header { padding: 22px 18px 16px; }
          .content { padding: 20px 18px; }
          .title { font-size: 21px; }
          .otp-code { font-size: 28px; letter-spacing: 6px; width: 100%; }
        }
      </style>
    </head>
    <body>
      <span class="preheader">${escapeHtml(preheader)}</span>
      <div class="wrap">
        <div class="card">
          <div class="header">
            <div class="brand">${escapeHtml(brandLine)}</div>
            <div class="eyebrow">رسالة آلية من أركان</div>
            <h1 class="title">${escapeHtml(title)}</h1>
          </div>
          <div class="content">
            ${content}
          </div>
          <div class="footer">
            &copy; ${new Date().getFullYear()} أركان — جميع الحقوق محفوظة.
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
}

function createOtpContent(params: {
  greeting: string;
  intro: string;
  otp: string;
  helperText: string;
  footerNote: string;
}) {
  return `
    <p>${escapeHtml(params.greeting)}</p>
    <p>${escapeHtml(params.intro)}</p>
    <div class="otp-card">
      <div class="otp-label">رمز التحقق الخاص بك</div>
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
  const title = `مرحباً ${userName}، بقيت خطوة واحدة لتأكيد الحساب`;
  const content = createOtpContent({
    greeting: `أهلاً ${userName}،`,
    intro: "شكراً لتسجيلك في أركان. استخدم رمز التحقق التالي لتفعيل حسابك ومتابعة استخدام المنصة.",
    otp,
    helperText: "الرمز صالح لمدة 5 دقائق فقط. أدخل الرمز كما هو تماماً، ولا تشاركه مع أي شخص.",
    footerNote: "إذا لم تكن أنت من أنشأ هذا الحساب، يمكنك تجاهل هذه الرسالة بأمان.",
  });

  const html = createBaseEmail({
    title,
    preheader: `رمز تفعيل الحساب: ${otp}`,
    brandLine: "أركان | OTP Verification",
    content,
    accent: "#4f46e5",
    background: "#eef2ff",
  });

  await sendEmail({
    to,
    subject: "رمز تأكيد إنشاء الحساب - أركان",
    html,
  });
}

export async function sendResetPasswordOtpEmail(to: string, otp: string, name?: string) {
  const userName = safeName(name);
  const title = `مرحباً ${userName}، رمز إعادة تعيين كلمة المرور`;
  const content = createOtpContent({
    greeting: `مرحباً ${userName}،`,
    intro: "استلمنا طلباً لإعادة تعيين كلمة المرور. استخدم رمز التحقق التالي لإكمال العملية بشكل آمن.",
    otp,
    helperText: "تنتهي صلاحية هذا الرمز خلال 5 دقائق. إذا لم تطلب إعادة تعيين كلمة المرور، تجاهل الرسالة وراجع أمان حسابك.",
    footerNote: "فريق أركان لن يطلب منك هذا الرمز عبر الهاتف أو الرسائل الخاصة.",
  });

  const html = createBaseEmail({
    title,
    preheader: `رمز إعادة تعيين كلمة المرور: ${otp}`,
    brandLine: "أركان | Account Security",
    content,
    accent: "#f97316",
    background: "#fff7ed",
  });

  await sendEmail({
    to,
    subject: "رمز إعادة تعيين كلمة المرور - أركان",
    html,
  });
}

function currencyLabel(currency: string): string {
  return currency === "SAR" ? "ر.س" : "ج.م";
}

function money(value: number, currency: string): string {
  return `${Math.round(value).toLocaleString("ar-EG")} ${currencyLabel(currency)}`;
}

export async function sendOrderReceivedEmail(
  to: string,
  name: string,
  orderId: number,
  siteName: string,
) {
  const safeSiteName = escapeHtml(siteName);
  const title = `مرحباً ${safeName(name)}، تم تأكيد استلام طلبك`;
  const content = `
    <p>شكراً لك، تم استلام طلبك بنجاح وسيتم مراجعته من قِبل الإدارة لتحديد السعر وخطة التنفيذ.</p>
    <div class="panel meta">
      <p style="margin:0;"><strong>رقم الطلب:</strong> #${orderId}</p>
      <p style="margin:0;"><strong>اسم المشروع:</strong> ${safeSiteName}</p>
    </div>
    <p class="muted" style="margin-top:12px;">سنرسل لك رسالة أخرى فور اعتماد الطلب وإرسال بيانات الدفع.</p>
  `;

  const html = createBaseEmail({
    title,
    preheader: `تم استلام طلبك #${orderId} بنجاح`,
    brandLine: "أركان | Orders",
    content,
    accent: "#0ea5e9",
    background: "#f1f5f9",
  });

  await sendEmail({
    to,
    subject: `تأكيد استلام الطلب #${orderId} - أركان`,
    html,
  });
}

export async function sendOrderPaymentApprovedEmail(opts: {
  to: string;
  name: string;
  orderId: number;
  siteName: string;
  totalAmount: number;
  depositPercentage: number;
  currency: string;
  paymentMethodName?: string | null;
  paymentMethodDetails?: string | null;
}) {
  const depositAmount = (opts.totalAmount * opts.depositPercentage) / 100;
  const safeSiteName = escapeHtml(opts.siteName);
  const safePaymentMethodName = opts.paymentMethodName ? escapeHtml(opts.paymentMethodName) : "";
  const paymentDetailsHtml = formatMultilineText(opts.paymentMethodDetails);

  const title = `مرحباً ${safeName(opts.name)}، تمت الموافقة على طلبك`;
  const content = `
    <p>تمت مراجعة طلبك واعتماد البدء. لإطلاق التنفيذ، يرجى سداد <strong>الدفعة المقدمة</strong> ثم رفع إيصال التحويل من لوحة الطلبات.</p>
    <div class="panel meta">
      <p style="margin:0;"><strong>رقم الطلب:</strong> #${opts.orderId}</p>
      <p style="margin:0;"><strong>اسم المشروع:</strong> ${safeSiteName}</p>
      <p style="margin:0;"><strong>الإجمالي:</strong> ${money(opts.totalAmount, opts.currency)}</p>
      <p style="margin:0;"><strong>الدفعة المقدمة (${opts.depositPercentage}%):</strong> ${money(depositAmount, opts.currency)}</p>
    </div>
    <div style="height: 10px;"></div>
    <div class="panel">
      <p style="margin:0 0 6px;"><strong>بيانات حساب الدفع</strong>${safePaymentMethodName ? ` — ${safePaymentMethodName}` : ""}</p>
      <p class="muted" style="margin:0; white-space: pre-line;">${paymentDetailsHtml || "سيتم عرض بيانات الدفع داخل لوحة الطلبات. في حال عدم ظهورها، تواصل معنا عبر الدعم."}</p>
    </div>
    <p class="muted" style="margin-top:12px;">بعد رفع الإيصال سنقوم بمراجعته وإشعارك بالقبول.</p>
  `;

  const html = createBaseEmail({
    title,
    preheader: `تم اعتماد الطلب #${opts.orderId} — بيانات الدفع جاهزة`,
    brandLine: "أركان | Billing",
    content,
    accent: "#4f46e5",
    background: "#f5f7ff",
  });

  await sendEmail({
    to: opts.to,
    subject: `تم اعتماد الطلب #${opts.orderId} — بيانات الدفع`,
    html,
  });
}

export async function sendOrderInProgressPaymentDetailsEmail(opts: {
  to: string;
  name: string;
  orderId: number;
  siteName: string;
  totalAmount?: number | null;
  depositPercentage?: number | null;
  currency: string;
  paymentMethodName?: string | null;
  paymentMethodDetails?: string | null;
}) {
  const safeSiteName = escapeHtml(opts.siteName);
  const safePaymentMethodName = opts.paymentMethodName ? escapeHtml(opts.paymentMethodName) : "";
  const paymentDetailsHtml = formatMultilineText(opts.paymentMethodDetails);
  const depositPercentage = opts.depositPercentage ?? 50;
  const depositAmount =
    typeof opts.totalAmount === "number" ? (opts.totalAmount * depositPercentage) / 100 : null;

  const title = `مرحباً ${safeName(opts.name)}، طلبك الآن قيد التنفيذ`;
  const content = `
    <p>تم تحديث حالة طلبك إلى <strong>قيد التنفيذ</strong>. لإتمام خطوة الدفع، ستجد أدناه بيانات حساب التحويل المطلوبة.</p>
    <div class="panel meta">
      <p style="margin:0;"><strong>رقم الطلب:</strong> #${opts.orderId}</p>
      <p style="margin:0;"><strong>اسم المشروع:</strong> ${safeSiteName}</p>
      ${
        typeof opts.totalAmount === "number"
          ? `<p style="margin:0;"><strong>إجمالي الطلب:</strong> ${money(opts.totalAmount, opts.currency)}</p>`
          : ""
      }
      ${
        depositAmount !== null
          ? `<p style="margin:0;"><strong>المبلغ المطلوب الآن (${depositPercentage}%):</strong> ${money(depositAmount, opts.currency)}</p>`
          : ""
      }
    </div>
    <div class="panel">
      <p style="margin:0 0 6px;"><strong>حساب التحويل</strong>${safePaymentMethodName ? ` — ${safePaymentMethodName}` : ""}</p>
      <p class="muted" style="margin:0; white-space: pre-line;">${paymentDetailsHtml || "بيانات الحساب غير متاحة حالياً داخل الإعدادات. يرجى التواصل مع الإدارة قبل التحويل."}</p>
    </div>
    <p style="margin-top:18px;">
      <a class="button" href="${escapeHtml(`${DEFAULT_FRONTEND_URL}/my-orders`)}" target="_blank" rel="noopener noreferrer">
        متابعة الطلب ورفع الإيصال
      </a>
    </p>
    <p class="muted">بعد التحويل، ارفع إيصال الدفع من صفحة طلباتك حتى تتم مراجعته بسرعة.</p>
  `;

  const html = createBaseEmail({
    title,
    preheader: `طلبك #${opts.orderId} قيد التنفيذ وبيانات التحويل جاهزة`,
    brandLine: "أركان | Transfer Details",
    content,
    accent: "#2563eb",
    background: "#eff6ff",
  });

  await sendEmail({
    to: opts.to,
    subject: `طلبك #${opts.orderId} قيد التنفيذ — بيانات التحويل`,
    html,
  });
}

export async function sendOrderReceiptUploadedEmail(opts: {
  to: string;
  name: string;
  orderId: number;
  siteName: string;
  receiptUrl?: string | null;
  kind: "deposit" | "final";
}) {
  const kindLabel = opts.kind === "final" ? "الدفع النهائي" : "الدفعة المقدمة";
  const safeSiteName = escapeHtml(opts.siteName);
  const safeReceiptUrl = opts.receiptUrl ? escapeHtml(opts.receiptUrl) : null;
  const title = `مرحباً ${safeName(opts.name)}، تم استلام إيصال الدفع`;
  const content = `
    <p>تم إرسال إيصال <strong>${kindLabel}</strong> بنجاح، وهو الآن قيد المراجعة من قِبل الإدارة.</p>
    <div class="panel meta">
      <p style="margin:0;"><strong>رقم الطلب:</strong> #${opts.orderId}</p>
      <p style="margin:0;"><strong>اسم المشروع:</strong> ${safeSiteName}</p>
    </div>
    ${
      safeReceiptUrl
        ? `<p class="muted" style="margin-top:12px;">يمكنك مراجعة الإيصال من هنا: <a href="${safeReceiptUrl}" target="_blank" rel="noopener noreferrer">${safeReceiptUrl}</a></p>`
        : `<p class="muted" style="margin-top:12px;">يمكنك مراجعة الإيصال من لوحة الطلبات.</p>`
    }
  `;

  const html = createBaseEmail({
    title,
    preheader: `تم استلام إيصال الدفع للطلب #${opts.orderId}`,
    brandLine: "أركان | Receipts",
    content,
    accent: "#0ea5e9",
    background: "#f1f5f9",
  });

  await sendEmail({
    to: opts.to,
    subject: `تم استلام إيصال الدفع — الطلب #${opts.orderId}`,
    html,
  });
}

export async function sendOrderReceiptAcceptedEmail(opts: {
  to: string;
  name: string;
  orderId: number;
  siteName: string;
  kind: "deposit" | "final";
}) {
  const kindLabel = opts.kind === "final" ? "الدفع النهائي" : "الدفعة المقدمة";
  const safeSiteName = escapeHtml(opts.siteName);
  const title = `مرحباً ${safeName(opts.name)}، تم قبول الإيصال`;
  const content = `
    <p>تم قبول إيصال <strong>${kindLabel}</strong> بنجاح.</p>
    <div class="panel meta">
      <p style="margin:0;"><strong>رقم الطلب:</strong> #${opts.orderId}</p>
      <p style="margin:0;"><strong>اسم المشروع:</strong> ${safeSiteName}</p>
    </div>
    <p class="muted" style="margin-top:12px;">سنقوم بإشعارك بتحديثات التنفيذ أولاً بأول.</p>
  `;

  const html = createBaseEmail({
    title,
    preheader: `تم قبول الإيصال — الطلب #${opts.orderId}`,
    brandLine: "أركان | Confirmation",
    content,
    accent: "#22c55e",
    background: "#f0fdf4",
  });

  await sendEmail({
    to: opts.to,
    subject: `تم قبول الإيصال — الطلب #${opts.orderId}`,
    html,
  });
}

export async function sendOrderPhaseEmail(opts: {
  to: string;
  name: string;
  orderId: number;
  siteName: string;
  phase: "started" | "in_progress";
}) {
  const phaseTitle = opts.phase === "started" ? "بدأ التنفيذ" : "قيد التنفيذ";
  const safeSiteName = escapeHtml(opts.siteName);
  const title = `مرحباً ${safeName(opts.name)}، ${phaseTitle}`;
  const content = `
    <p>تم تحديث حالة طلبك إلى <strong>${phaseTitle}</strong>.</p>
    <div class="panel meta">
      <p style="margin:0;"><strong>رقم الطلب:</strong> #${opts.orderId}</p>
      <p style="margin:0;"><strong>اسم المشروع:</strong> ${safeSiteName}</p>
    </div>
    <p class="muted" style="margin-top:12px;">سنقوم بإرسال تحديثات إضافية فور وصولنا لمراحل مهمة.</p>
  `;

  const html = createBaseEmail({
    title,
    preheader: `حالة الطلب #${opts.orderId}: ${phaseTitle}`,
    brandLine: "أركان | Progress",
    content,
    accent: "#2563eb",
    background: "#eff6ff",
  });

  await sendEmail({
    to: opts.to,
    subject: `تحديث حالة الطلب #${opts.orderId}: ${phaseTitle}`,
    html,
  });
}

export async function sendOrderCompletedEmail(opts: {
  to: string;
  name: string;
  orderId: number;
  siteName: string;
  deliveredUrl: string;
  requireFinalPaymentNotice: boolean;
  paymentMethodName?: string | null;
  paymentMethodDetails?: string | null;
}) {
  const title = `مرحباً ${safeName(opts.name)}، تم الانتهاء من طلبك`;
  const safeDeliveredUrl = escapeHtml(opts.deliveredUrl);
  const paymentDetailsHtml = formatMultilineText(opts.paymentMethodDetails);
  const notice = opts.requireFinalPaymentNotice
    ? `
      <div class="panel" style="border-left: 0; border-right: 6px solid #f97316; background: #fff7ed;">
        <p style="margin:0; font-weight:800; color:#9a3412;">
          برجاء استكمال الدفع لأخذ كافة البيانات
        </p>
        ${
          paymentDetailsHtml
            ? `<p class="muted" style="margin:8px 0 0; white-space: pre-line;">${paymentDetailsHtml}</p>`
            : ""
        }
      </div>
    `
    : "";

  const content = `
    <p>تهانينا! تم الانتهاء من العمل على مشروعك، ويمكنك الآن معاينته عبر الرابط التالي:</p>
    <div class="panel">
      <p style="margin:0;"><strong>رابط التسليم:</strong></p>
      <p style="margin:8px 0 0;"><a href="${safeDeliveredUrl}" target="_blank" rel="noopener noreferrer">${safeDeliveredUrl}</a></p>
    </div>
    ${notice}
    <p class="muted" style="margin-top:12px;">إذا واجهتك أي مشكلة في فتح الرابط، رد على هذا البريد وسنساعدك فوراً.</p>
  `;

  const html = createBaseEmail({
    title,
    preheader: `تم الانتهاء من الطلب #${opts.orderId} — رابط التسليم بالداخل`,
    brandLine: "أركان | Delivery",
    content,
    accent: "#16a34a",
    background: "#f0fdf4",
  });

  await sendEmail({
    to: opts.to,
    subject: `تم الانتهاء من الطلب #${opts.orderId} — رابط التسليم`,
    html,
  });
}

export async function sendOrderStatusUpdateEmail(
  to: string,
  name: string,
  orderId: number,
  orderName: string,
  status: string,
  message: string
) {
  const safeOrderName = escapeHtml(orderName);
  const safeStatus = escapeHtml(status);
  const safeMessage = formatMultilineText(message);
  const safeUserName = escapeHtml(name);
  const ordersUrl = escapeHtml(`${DEFAULT_FRONTEND_URL}/my-orders`);
  const title = `تحديث حالة طلبك #${orderId}`;
  const content = `
    <p>مرحباً ${safeUserName}،</p>
    <p>يوجد تحديث جديد بخصوص طلبك لموقع "<strong>${safeOrderName}</strong>".</p>
    <p><strong>الحالة الجديدة:</strong> ${safeStatus}</p>
    <hr style="border:none; border-top: 1px solid #eee; margin: 20px 0;" />
    <p>${safeMessage}</p>
    <p style="text-align:center; margin-top: 25px;">
      <a href="${ordersUrl}" style="background-color: #0056b3; color: white; padding: 12px 25px; text-decoration: none; border-radius: 8px; font-weight: bold;">
        متابعة الطلب
      </a>
    </p>
  `;
  const html = createBaseEmail({
    title,
    preheader: `تحديث بخصوص طلبك #${orderId}`,
    brandLine: "أركان | Arkan Web",
    content,
    accent: "#0ea5e9",
    background: "#f1f5f9",
  });

  await sendEmail({
    to,
    subject: `تحديث بخصوص طلبك #${orderId}`,
    html,
  });
}
