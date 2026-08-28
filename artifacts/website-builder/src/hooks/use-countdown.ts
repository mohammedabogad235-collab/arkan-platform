import { useEffect, useMemo, useState } from "react";

export type CountdownParts = {
  totalMs: number;
  isExpired: boolean;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
};

function clamp(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
}

function splitMs(ms: number): CountdownParts {
  const total = clamp(ms);
  const secondsTotal = Math.floor(total / 1000);

  const days = Math.floor(secondsTotal / (60 * 60 * 24));
  const hours = Math.floor((secondsTotal % (60 * 60 * 24)) / (60 * 60));
  const minutes = Math.floor((secondsTotal % (60 * 60)) / 60);
  const seconds = secondsTotal % 60;

  return {
    totalMs: total,
    isExpired: total <= 0,
    days,
    hours,
    minutes,
    seconds,
  };
}

function parseEndTime(endTimeIso: string | null | undefined): number | null {
  if (!endTimeIso) return null;
  const ts = Date.parse(endTimeIso);
  if (Number.isNaN(ts)) return null;
  return ts;
}

/**
 * useCountdown
 * - يقبل ISO string مثل: 2026-08-28T12:30:00.000Z
 * - أو null/undefined لتعطيل العداد
 */
export function useCountdown(endTimeIso: string | null | undefined): CountdownParts | null {
  const endTs = useMemo(() => parseEndTime(endTimeIso), [endTimeIso]);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!endTs) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [endTs]);

  if (!endTs) return null;
  return splitMs(endTs - now);
}

