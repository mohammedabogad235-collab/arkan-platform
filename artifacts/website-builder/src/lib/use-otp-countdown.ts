import { useCallback, useEffect, useMemo, useState } from "react";

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function readExpiresAt(storageKey: string): number | null {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

function writeExpiresAt(storageKey: string, expiresAt: number) {
  try {
    localStorage.setItem(storageKey, String(expiresAt));
  } catch {
    // ignore
  }
}

export function formatCountdown(seconds: number): string {
  const s = clamp(Math.floor(seconds), 0, 24 * 60 * 60);
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

/**
 * Hook بسيط يمنع "إعادة إرسال OTP" حتى ينتهي المؤقت، مع حفظ الحالة في LocalStorage
 * حتى لا يستطيع المستخدم تجاوز المنع عبر عمل Refresh.
 */
export function useOtpCountdown(opts: {
  key: string;
  seconds?: number;
  autoStart?: boolean;
}) {
  const duration = opts.seconds ?? 60;
  const storageKey = useMemo(() => `arkan:otp_cooldown:${opts.key}`, [opts.key]);

  const [remaining, setRemaining] = useState(0);

  const sync = useCallback(() => {
    const expiresAt = readExpiresAt(storageKey);
    const next =
      expiresAt == null ? 0 : Math.ceil((expiresAt - Date.now()) / 1000);
    setRemaining(clamp(next, 0, duration));
  }, [storageKey, duration]);

  const start = useCallback(() => {
    const expiresAt = Date.now() + duration * 1000;
    writeExpiresAt(storageKey, expiresAt);
    setRemaining(duration);
  }, [storageKey, duration]);

  useEffect(() => {
    sync();
    if (opts.autoStart) {
      const expiresAt = readExpiresAt(storageKey);
      if (!expiresAt || expiresAt <= Date.now()) {
        start();
      }
    }
  }, [sync, start, storageKey, opts.autoStart]);

  useEffect(() => {
    if (remaining <= 0) return;
    const id = window.setInterval(() => sync(), 1000);
    return () => window.clearInterval(id);
  }, [remaining, sync]);

  return {
    remaining,
    canResend: remaining <= 0,
    start,
  };
}

