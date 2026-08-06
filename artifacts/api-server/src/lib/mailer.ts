import nodemailer from "nodemailer";
import { db, siteSettingsTable } from "@workspace/db";

type MailTransportInfo = {
  transporter: nodemailer.Transporter;
  fromEmail: string;
};

async function getMailTransport(): Promise<MailTransportInfo> {
  const [settings] = await db.select().from(siteSettingsTable).limit(1);
  const emailUser = settings?.emailUser || process.env.EMAIL_USER;
  const emailPass = settings?.emailPass || process.env.EMAIL_PASS;

  if (!emailUser || !emailPass) {
    throw new Error("EMAIL_USER or EMAIL_PASS not configured");
  }

  return {
    fromEmail: emailUser,
    transporter: nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: {
        user: emailUser,
        pass: emailPass,
      },
    }),
  };
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
        .wrap { width: 100%; padding: 22px 12px; }
        .card { max-width: 620px; margin: 0 auto; background: #ffffff; border-radius: 18px; overflow: hidden; border: 1px solid rgba(15,23,42,0.08); box-shadow: 0 12px 30px rgba(2,6,23,0.08); }
        .header { padding: 22px 22px 16px; background: linear-gradient(135deg, ${accent} 0%, rgba(2,6,23,0.9) 100%); color: #fff; }
        .brand { font-weight: 800; letter-spacing: 0.2px; font-size: 16px; opacity: .95; }
        .title { margin: 10px 0 0; font-size: 22px; line-height: 1.4; }
        .content { padding: 22px; }
        .content p { margin: 0 0 12px; color: #0f172a; font-size: 15px; line-height: 1.8; }
        .muted { color: #64748b !important; font-size: 13px; }
        .otp { margin: 16px 0 18px; padding: 16px; border-radius: 14px; background: rgba(2,6,23,0.03); border: 1px dashed rgba(2,6,23,0.18); text-align: center; }
        .otp .code { font-size: 34px; letter-spacing: 10px; font-weight: 800; color: ${accent}; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace; }
        .hint { padding: 12px 14px; border-radius: 14px; background: rgba(2,6,23,0.03); border: 1px solid rgba(2,6,23,0.06); }
        .footer { padding: 16px 22px 22px; border-top: 1px solid rgba(15,23,42,0.08); color: #64748b; font-size: 12px; text-align: center; }
        .preheader { display:none!important; visibility:hidden; opacity:0; color:transparent; height:0; width:0; overflow:hidden; mso-hide:all; }
      </style>
    </head>
    <body>
      <span class="preheader">${preheader}</span>
      <div class="wrap">
        <div class="card">
          <div class="header">
            <div class="brand">${brandLine}</div>
            <h1 class="title">${title}</h1>
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

function safeName(name?: string): string {
  const trimmed = (name ?? "").trim();
  return trimmed || "عزيزي العميل";
}

export async function sendSignupOtpEmail(to: string, otp: string, name?: string) {
  const userName = safeName(name);
  const title = `مرحباً ${userName}، تأكيد إنشاء الحساب`;
  const content = `
    <p>يسعدنا انضمامك إلى أركان. لتأكيد بريدك وإنهاء إنشاء الحساب، استخدم رمز التحقق التالي:</p>
    <div class="otp"><div class="code">${otp}</div></div>
    <div class="hint">
      <p class="muted" style="margin:0;">صلاحية الرمز: <strong>5 دقائق</strong>. لا تشارك هذا الرمز مع أي شخص.</p>
    </div>
    <p class="muted" style="margin-top:12px;">إذا لم تقم بإنشاء حساب على أركان، تجاهل هذا البريد بأمان.</p>
  `;
  const html = createBaseEmail({
    title,
    preheader: `رمز تأكيد إنشاء الحساب: ${otp}`,
    brandLine: "أركان | Arkan Web",
    content,
    accent: "#4f46e5",
    background: "#f5f7ff",
  });

  const { transporter, fromEmail } = await getMailTransport();
  await transporter.sendMail({
    from: `"أركان" <${fromEmail}>`,
    to,
    subject: "رمز تأكيد إنشاء الحساب - أركان",
    html,
  });
}

export async function sendResetPasswordOtpEmail(to: string, otp: string, name?: string) {
  const userName = safeName(name);
  const title = `مرحباً ${userName}، إعادة تعيين كلمة المرور`;
  const content = `
    <p>استلمنا طلباً لإعادة تعيين كلمة المرور الخاصة بحسابك. استخدم رمز التحقق التالي لإكمال العملية:</p>
    <div class="otp"><div class="code">${otp}</div></div>
    <div class="hint">
      <p class="muted" style="margin:0;">هذا الرمز صالح لمدة <strong>5 دقائق</strong>. إذا لم تطلب إعادة التعيين، ننصحك بتجاهل الرسالة وتأمين حسابك.</p>
    </div>
    <p class="muted" style="margin-top:12px;">تنبيه: لا تشارك رمز التحقق مع أي جهة، حتى لو ادعت أنها من الدعم.</p>
  `;
  const html = createBaseEmail({
    title,
    preheader: `رمز إعادة تعيين كلمة المرور: ${otp}`,
    brandLine: "أركان | Security Notice",
    content,
    accent: "#f97316",
    background: "#fff7ed",
  });

  const { transporter, fromEmail } = await getMailTransport();
  await transporter.sendMail({
    from: `"أركان" <${fromEmail}>`,
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
  const title = `مرحباً ${safeName(name)}، تم تأكيد استلام طلبك`;
  const content = `
    <p>شكراً لك، تم استلام طلبك بنجاح وسيتم مراجعته من قِبل الإدارة لتحديد السعر وخطة التنفيذ.</p>
    <div class="hint">
      <p style="margin:0;"><strong>رقم الطلب:</strong> #${orderId}</p>
      <p style="margin:0;"><strong>اسم المشروع:</strong> ${siteName}</p>
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

  const { transporter, fromEmail } = await getMailTransport();
  await transporter.sendMail({
    from: `"أركان" <${fromEmail}>`,
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

  const title = `مرحباً ${safeName(opts.name)}، تمت الموافقة على طلبك`;
  const content = `
    <p>تمت مراجعة طلبك واعتماد البدء. لإطلاق التنفيذ، يرجى سداد <strong>الدفعة المقدمة</strong> ثم رفع إيصال التحويل من لوحة الطلبات.</p>
    <div class="hint">
      <p style="margin:0;"><strong>رقم الطلب:</strong> #${opts.orderId}</p>
      <p style="margin:0;"><strong>اسم المشروع:</strong> ${opts.siteName}</p>
      <p style="margin:0;"><strong>الإجمالي:</strong> ${money(opts.totalAmount, opts.currency)}</p>
      <p style="margin:0;"><strong>الدفعة المقدمة (${opts.depositPercentage}%):</strong> ${money(depositAmount, opts.currency)}</p>
    </div>
    <div style="height: 10px;"></div>
    <div class="hint">
      <p style="margin:0 0 6px;"><strong>بيانات حساب الدفع</strong>${opts.paymentMethodName ? ` — ${opts.paymentMethodName}` : ""}</p>
      <p class="muted" style="margin:0; white-space: pre-line;">${opts.paymentMethodDetails || "سيتم عرض بيانات الدفع داخل لوحة الطلبات. في حال عدم ظهورها، تواصل معنا عبر الدعم."}</p>
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

  const { transporter, fromEmail } = await getMailTransport();
  await transporter.sendMail({
    from: `"أركان" <${fromEmail}>`,
    to: opts.to,
    subject: `تم اعتماد الطلب #${opts.orderId} — بيانات الدفع`,
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
  const title = `مرحباً ${safeName(opts.name)}، تم استلام إيصال الدفع`;
  const content = `
    <p>تم إرسال إيصال <strong>${kindLabel}</strong> بنجاح، وهو الآن قيد المراجعة من قِبل الإدارة.</p>
    <div class="hint">
      <p style="margin:0;"><strong>رقم الطلب:</strong> #${opts.orderId}</p>
      <p style="margin:0;"><strong>اسم المشروع:</strong> ${opts.siteName}</p>
    </div>
    ${
      opts.receiptUrl
        ? `<p class="muted" style="margin-top:12px;">يمكنك مراجعة الإيصال من هنا: <a href="${opts.receiptUrl}" target="_blank" rel="noopener noreferrer">${opts.receiptUrl}</a></p>`
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

  const { transporter, fromEmail } = await getMailTransport();
  await transporter.sendMail({
    from: `"أركان" <${fromEmail}>`,
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
  const title = `مرحباً ${safeName(opts.name)}، تم قبول الإيصال`;
  const content = `
    <p>تم قبول إيصال <strong>${kindLabel}</strong> بنجاح.</p>
    <div class="hint">
      <p style="margin:0;"><strong>رقم الطلب:</strong> #${opts.orderId}</p>
      <p style="margin:0;"><strong>اسم المشروع:</strong> ${opts.siteName}</p>
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

  const { transporter, fromEmail } = await getMailTransport();
  await transporter.sendMail({
    from: `"أركان" <${fromEmail}>`,
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
  const title = `مرحباً ${safeName(opts.name)}، ${phaseTitle}`;
  const content = `
    <p>تم تحديث حالة طلبك إلى <strong>${phaseTitle}</strong>.</p>
    <div class="hint">
      <p style="margin:0;"><strong>رقم الطلب:</strong> #${opts.orderId}</p>
      <p style="margin:0;"><strong>اسم المشروع:</strong> ${opts.siteName}</p>
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

  const { transporter, fromEmail } = await getMailTransport();
  await transporter.sendMail({
    from: `"أركان" <${fromEmail}>`,
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
  const notice = opts.requireFinalPaymentNotice
    ? `
      <div class="hint" style="border-left: 0; border-right: 6px solid #f97316; background: #fff7ed;">
        <p style="margin:0; font-weight:800; color:#9a3412;">
          برجاء استكمال الدفع لأخذ كافة البيانات
        </p>
        ${
          opts.paymentMethodDetails
            ? `<p class="muted" style="margin:8px 0 0; white-space: pre-line;">${opts.paymentMethodDetails}</p>`
            : ""
        }
      </div>
    `
    : "";

  const content = `
    <p>تهانينا! تم الانتهاء من العمل على مشروعك، ويمكنك الآن معاينته عبر الرابط التالي:</p>
    <div class="hint">
      <p style="margin:0;"><strong>رابط التسليم:</strong></p>
      <p style="margin:8px 0 0;"><a href="${opts.deliveredUrl}" target="_blank" rel="noopener noreferrer">${opts.deliveredUrl}</a></p>
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

  const { transporter, fromEmail } = await getMailTransport();
  await transporter.sendMail({
    from: `"أركان" <${fromEmail}>`,
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
  const title = `تحديث حالة طلبك #${orderId}`;
  const content = `
    <p>مرحباً ${name},</p>
    <p>يوجد تحديث جديد بخصوص طلبك لموقع "<strong>${orderName}</strong>".</p>
    <p><strong>الحالة الجديدة:</strong> ${status}</p>
    <hr style="border:none; border-top: 1px solid #eee; margin: 20px 0;" />
    <p>${message}</p>
    <p style="text-align:center; margin-top: 25px;">
      <a href="${process.env.FRONTEND_URL}/my-orders" style="background-color: #0056b3; color: white; padding: 12px 25px; text-decoration: none; border-radius: 8px; font-weight: bold;">
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

  const { transporter, fromEmail } = await getMailTransport();
  await transporter.sendMail({
    from: `"أركان" <${fromEmail}>`,
    to,
    subject: `تحديث بخصوص طلبك #${orderId}`,
    html,
  });
}
