import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { Api } from "@workspace/api-zod";
import { hashPassword } from "../lib/crypto";
import { sendSignupOtpEmail } from "../lib/mailer";

const router: IRouter = Router();

// In-memory signup OTP store: email -> { otp, expiresAt }
const signupOtpStore = new Map<string, { otp: string; expiresAt: number }>();

function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

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
router.post("/auth/register", async (req, res): Promise<void> => {
  const parsed = Api.RegisterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { fullName, phone, email, password } = parsed.data;

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
        const otp = generateOtp();
        signupOtpStore.set(email.toLowerCase(), { otp, expiresAt: Date.now() + 5 * 60 * 1000 });
        await sendSignupOtpEmail(email.toLowerCase(), otp, existingEmail.fullName);
      } catch {
        // Non-fatal: user can request resend
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

  // Send OTP (non-blocking error handling — user can request resend)
  try {
    const otp = generateOtp();
    signupOtpStore.set(email.toLowerCase(), { otp, expiresAt: Date.now() + 5 * 60 * 1000 });
    await sendSignupOtpEmail(email.toLowerCase(), otp, user.fullName);
  } catch {
    // OTP sending failed — user can request resend on verify page
  }

  res.status(201).json({
    pendingVerification: true,
    email: user.email,
    message: "تم إنشاء الحساب — تحقق من بريدك الإلكتروني للحصول على رمز التأكيد",
  });
});

// POST /auth/send-signup-otp — resend verification OTP
router.post("/auth/send-signup-otp", async (req, res): Promise<void> => {
  const { email } = req.body as { email?: string };
  if (!email || typeof email !== "string") {
    res.status(400).json({ error: "البريد الإلكتروني مطلوب" });
    return;
  }

  const trimmed = email.trim().toLowerCase();
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, trimmed));

  if (!user) {
    res.status(404).json({ error: "لا يوجد حساب مسجل بهذا البريد" });
    return;
  }
  if (user.isVerified) {
    res.status(400).json({ error: "الحساب مؤكد مسبقاً" });
    return;
  }

  const otp = generateOtp();
  signupOtpStore.set(trimmed, { otp, expiresAt: Date.now() + 5 * 60 * 1000 });

  try {
    await sendSignupOtpEmail(trimmed, otp, user.fullName);
    res.json({ message: "تم إرسال رمز التأكيد" });
  } catch (err: any) {
    signupOtpStore.delete(trimmed);
    res.status(500).json({ error: err?.message || "فشل إرسال البريد — تحقق من إعدادات OTP" });
  }
});

// POST /auth/verify-signup-otp — confirm account
router.post("/auth/verify-signup-otp", async (req, res): Promise<void> => {
  const { email, otp } = req.body as { email?: string; otp?: string };

  if (!email || !otp) {
    res.status(400).json({ error: "البريد والرمز مطلوبان" });
    return;
  }

  const trimmed = email.trim().toLowerCase();
  const stored = signupOtpStore.get(trimmed);

  if (!stored) {
    res.status(400).json({ error: "لم يُرسَل رمز أو انتهت صلاحيته — اطلب إرساله مجدداً" });
    return;
  }
  if (Date.now() > stored.expiresAt) {
    signupOtpStore.delete(trimmed);
    res.status(400).json({ error: "انتهت صلاحية الرمز — اطلب رمزاً جديداً" });
    return;
  }
  if (stored.otp !== otp.trim()) {
    res.status(400).json({ error: "الرمز غير صحيح" });
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

  signupOtpStore.delete(trimmed);

  // Create session
  (req.session as unknown as Record<string, unknown>).userId = user.id;
  (req.session as unknown as Record<string, unknown>).role = user.role;

  res.json({ user: sanitizeUser(user), message: "تم تأكيد الحساب بنجاح" });
});

// POST /auth/login
router.post("/auth/login", async (req, res): Promise<void> => {
  const { identifier, password } = req.body as { identifier?: string; password?: string };

  if (!identifier || !password) {
    res.status(400).json({ error: "رقم الهاتف أو البريد وكلمة المرور مطلوبان" });
    return;
  }

  const passwordHash = hashPassword(password);
  const trimmed = identifier.trim();

  let [user] = await db.select().from(usersTable).where(eq(usersTable.phone, trimmed));
  if (!user) [user] = await db.select().from(usersTable).where(eq(usersTable.email, trimmed));
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
});

// POST /auth/verify-phone (kept for backward compat)
router.post("/auth/verify-phone", async (req, res): Promise<void> => {
  const { phone } = req.body as { phone?: string };
  if (!phone) { res.status(400).json({ error: "رقم الجوال مطلوب" }); return; }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.phone, phone.trim()));
  if (!user) { res.status(404).json({ error: "لا يوجد حساب مسجل بهذا الرقم" }); return; }
  res.json({ found: true, username: user.username });
});

// POST /auth/reset-password-by-phone (kept for backward compat)
router.post("/auth/reset-password-by-phone", async (req, res): Promise<void> => {
  const { phone, newPassword } = req.body as { phone?: string; newPassword?: string };
  if (!phone || !newPassword) { res.status(400).json({ error: "رقم الجوال وكلمة المرور الجديدة مطلوبان" }); return; }
  if (newPassword.length < 6) { res.status(400).json({ error: "كلمة المرور يجب أن تكون 6 أحرف على الأقل" }); return; }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.phone, phone.trim()));
  if (!user) { res.status(404).json({ error: "لا يوجد حساب مسجل بهذا الرقم" }); return; }
  await db.update(usersTable).set({ passwordHash: hashPassword(newPassword) }).where(eq(usersTable.id, user.id));
  res.json({ message: "تم تغيير كلمة المرور بنجاح" });
});

// POST /auth/logout
router.post("/auth/logout", async (req, res): Promise<void> => {
  req.session.destroy(() => {
    res.json({ message: "تم تسجيل الخروج بنجاح" });
  });
});

// GET /auth/me
router.get("/auth/me", async (req, res): Promise<void> => {
  const userId = (req.session as unknown as Record<string, unknown>).userId as number | undefined;
  if (!userId) { res.status(401).json({ error: "غير مصرح" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) { res.status(401).json({ error: "المستخدم غير موجود" }); return; }

  res.json(sanitizeUser(user));
});

export default router;
