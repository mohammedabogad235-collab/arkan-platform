export type OtpPurpose = "signup_verification" | "password_reset";

type OtpEntry = {
  otp: string;
  expiresAt: number;
  attempts: number;
  createdAt: number;
};

type OtpValidationResult =
  | { ok: true }
  | {
      ok: false;
      reason: "missing" | "expired" | "invalid" | "too_many_attempts";
      remainingAttempts?: number;
    };

const OTP_TTL_MS = 5 * 60 * 1000;
const MAX_OTP_ATTEMPTS = 5;
const otpStore = new Map<string, OtpEntry>();

function createKey(email: string, purpose: OtpPurpose): string {
  return `${purpose}:${normalizeEmail(email)}`;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export function issueOtp(email: string, purpose: OtpPurpose, ttlMs = OTP_TTL_MS) {
  const otp = generateOtp();
  const expiresAt = Date.now() + ttlMs;

  otpStore.set(createKey(email, purpose), {
    otp,
    expiresAt,
    attempts: 0,
    createdAt: Date.now(),
  });

  return { otp, expiresAt };
}

export function invalidateOtp(email: string, purpose: OtpPurpose) {
  otpStore.delete(createKey(email, purpose));
}

export function getOtpState(email: string, purpose: OtpPurpose): OtpEntry | null {
  const entry = otpStore.get(createKey(email, purpose));
  if (!entry) return null;

  if (Date.now() > entry.expiresAt) {
    otpStore.delete(createKey(email, purpose));
    return null;
  }

  return entry;
}

export function validateOtp(email: string, purpose: OtpPurpose, providedOtp: string): OtpValidationResult {
  const key = createKey(email, purpose);
  const entry = otpStore.get(key);

  if (!entry) {
    return { ok: false, reason: "missing" };
  }

  if (Date.now() > entry.expiresAt) {
    otpStore.delete(key);
    return { ok: false, reason: "expired" };
  }

  if (entry.otp !== providedOtp.trim()) {
    const attempts = entry.attempts + 1;

    if (attempts >= MAX_OTP_ATTEMPTS) {
      otpStore.delete(key);
      return { ok: false, reason: "too_many_attempts" };
    }

    otpStore.set(key, {
      ...entry,
      attempts,
    });

    return {
      ok: false,
      reason: "invalid",
      remainingAttempts: MAX_OTP_ATTEMPTS - attempts,
    };
  }

  otpStore.delete(key);
  return { ok: true };
}
