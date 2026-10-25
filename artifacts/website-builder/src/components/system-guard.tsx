import { useEffect, useMemo, useRef, useState, type PropsWithChildren } from "react";
import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { useLocation } from "wouter";
import { motion, useReducedMotion } from "framer-motion";
import { ShieldAlert, Smartphone, Globe, DownloadCloud, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useCountdown, type CountdownParts } from "@/hooks/use-countdown";
import { useSystemStatus } from "@/lib/use-system-status";

const DEFAULT_PUBLIC_WEBSITE_URL = "https://arkan-platform.onrender.com";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function CountdownBoxes({ countdown }: { countdown: CountdownParts | null }) {
  if (!countdown) return null;

  return (
    <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 w-full max-w-xl">
      {[
        { label: "أيام", value: countdown.days },
        { label: "ساعات", value: countdown.hours },
        { label: "دقائق", value: countdown.minutes },
        { label: "ثواني", value: countdown.seconds },
      ].map((item) => (
        <div
          key={item.label}
          className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-2xl p-4 text-center shadow-[0_0_0_1px_rgba(255,255,255,0.06)]"
        >
          <div className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            {pad2(item.value)}
          </div>
          <div className="mt-1 text-xs sm:text-sm text-white/70 font-semibold">{item.label}</div>
        </div>
      ))}
    </div>
  );
}

function normalizeVersion(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim();
  if (!v) return null;
  return v;
}

function compareVersions(aRaw: string, bRaw: string): number {
  // returns: -1 if a<b, 0 if a==b, 1 if a>b
  const aParts = aRaw.split(".").map((p) => Number((p.match(/\d+/)?.[0] ?? "0")));
  const bParts = bRaw.split(".").map((p) => Number((p.match(/\d+/)?.[0] ?? "0")));
  const max = Math.max(aParts.length, bParts.length);
  for (let i = 0; i < max; i += 1) {
    const ai = aParts[i] ?? 0;
    const bi = bParts[i] ?? 0;
    if (ai > bi) return 1;
    if (ai < bi) return -1;
  }
  return 0;
}

export function SystemGuard({ children }: PropsWithChildren) {
  const [location] = useLocation();
  const { data: status } = useSystemStatus();
  const prefersReducedMotion = useReducedMotion();
  const platform = Capacitor.getPlatform();
  const isWeb = platform === "web";
  const [currentAppVersion, setCurrentAppVersion] = useState<string | null>(null);
  const lastCountdownMsRef = useRef<number | null>(null);
  const reloadedRef = useRef(false);

  const requiredAppVersion = useMemo(() => {
    const v = normalizeVersion(status?.requiredAppVersion);
    return v ?? "0.0.0";
  }, [status?.requiredAppVersion]);

  useEffect(() => {
    if (isWeb) return;

    let cancelled = false;
    (async () => {
      try {
        const info = await CapacitorApp.getInfo();
        const v = normalizeVersion(info?.version);
        if (!cancelled) setCurrentAppVersion(v);
      } catch {
        if (!cancelled) setCurrentAppVersion(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isWeb]);

  const webBlocked = isWeb && !!status?.webMaintenanceMode;
  const appBlocked = !isWeb && !!status?.appMaintenanceMode;
  const forceUpdateBlocked = useMemo(() => {
    if (isWeb) return false;
    if (!status?.appUpdateRequired) return false;

    // if required version is not set properly, treat as no-block (0.0.0)
    const required = requiredAppVersion;
    if (!required || required === "0.0.0") return false;

    // حسب المطلوب: لا نحجب إلا إذا كانت نسخة الجهاز أقل من النسخة المطلوبة
    // إذا لم نتمكن من قراءة نسخة الجهاز، لا نُظهر الحجب لتجنب تعليق المستخدمين للأبد.
    if (!currentAppVersion) return false;

    return compareVersions(currentAppVersion, required) < 0;
  }, [currentAppVersion, isWeb, requiredAppVersion, status?.appUpdateRequired]);

  const blocked = webBlocked || appBlocked || forceUpdateBlocked;
  const endTimeIso = webBlocked ? status?.webMaintenanceEndTime : status?.appMaintenanceEndTime;
  const countdown = useCountdown(endTimeIso);

  // ✅ Auto-refresh when countdown hits 00:00:00 (so the app can re-check the latest status)
  useEffect(() => {
    if (!blocked) {
      lastCountdownMsRef.current = null;
      reloadedRef.current = false;
      return;
    }

    const ms = countdown?.totalMs;
    if (typeof ms !== "number") return;

    const prev = lastCountdownMsRef.current;
    lastCountdownMsRef.current = ms;

    if (reloadedRef.current) return;
    // useCountdown() يَعمل clamping للزمن إلى >= 0، لذلك "وصوله للصفر" يعني ms === 0
    if (typeof prev === "number" && prev > 0 && ms === 0) {
      reloadedRef.current = true;
      window.location.reload();
    }
  }, [blocked, countdown?.totalMs]);

  // ✅ Kill Switch Bypass: لوحة التحكم يجب ألا تُحجب أبداً
  if (location.startsWith("/admin")) return <>{children}</>;

  if (!status) return <>{children}</>;

  if (!blocked) return <>{children}</>;
  const canShowDownload = !forceUpdateBlocked || !countdown || countdown.isExpired;

  const title = webBlocked
    ? "صيانة مؤقتة"
    : forceUpdateBlocked
      ? "تحديث إجباري"
      : "التطبيق تحت الصيانة";

  const message = webBlocked
    ? status.webMaintenanceMessage || "نقوم الآن بأعمال صيانة لتحسين تجربتك. نرجو العودة قريباً."
    : status.appStatusMessage || (forceUpdateBlocked ? "يوجد تحديث جديد للتطبيق يجب تثبيته للمتابعة." : "التطبيق تحت الصيانة حالياً.");

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-start justify-center overflow-x-hidden overflow-y-auto px-4 py-8 sm:items-center sm:py-10"
      dir="rtl"
    >
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_#1e3a8a_0%,_#0b1224_45%,_#070b16_100%)]" />
      <motion.div
        aria-hidden="true"
        animate={prefersReducedMotion ? undefined : { x: [0, 24, 0], y: [0, -18, 0], scale: [1, 1.08, 1] }}
        transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
        className="absolute -top-40 -left-40 h-[520px] w-[520px] rounded-full bg-blue-500/20 blur-3xl"
      />
      <motion.div
        aria-hidden="true"
        animate={prefersReducedMotion ? undefined : { x: [0, -18, 0], y: [0, 20, 0], scale: [1, 1.12, 1] }}
        transition={{ duration: 16, repeat: Infinity, ease: "easeInOut" }}
        className="absolute -bottom-40 -right-40 h-[520px] w-[520px] rounded-full bg-amber-400/15 blur-3xl"
      />
      <div aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:48px_48px] [mask-image:linear-gradient(to_bottom,black,transparent)]" />

      <motion.div
        initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.98, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: prefersReducedMotion ? 0 : 0.35 }}
        className="relative w-full max-w-2xl"
      >
        <Card className="overflow-hidden border-white/15 bg-slate-950/55 text-white shadow-[0_24px_100px_rgba(2,6,23,0.55)] backdrop-blur-2xl">
          <div className="h-1.5 bg-gradient-to-l from-amber-300 via-blue-400 to-blue-600" />
          <CardContent className="p-6 sm:p-10 text-white">
            <div className="flex items-start gap-4">
              <div className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-blue-300/30 bg-gradient-to-br from-blue-500/30 to-amber-400/15 shadow-[0_0_32px_rgba(59,130,246,0.2)]">
                <motion.div
                  aria-hidden="true"
                  animate={prefersReducedMotion ? undefined : { rotate: 360 }}
                  transition={{ duration: 24, repeat: Infinity, ease: "linear" }}
                  className="absolute -inset-2 rounded-[1.35rem] border border-dashed border-amber-300/35"
                />
                <ShieldAlert className="h-6 w-6 text-amber-200" />
              </div>
              <div className="min-w-0">
                <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-blue-300/20 bg-blue-400/10 px-3 py-1 text-xs font-bold tracking-wide text-blue-100">
                  <Sparkles className="h-3.5 w-3.5 text-amber-300" />
                  أركان — نعمل على تحسين تجربتك
                </div>
                <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">{title}</h1>
                <p className="mt-2 text-white/75 leading-relaxed">{message}</p>
              </div>
            </div>

            <CountdownBoxes countdown={countdown} />

            {/* Web Cross-Routing */}
            {webBlocked && status.webShowAppAlternative && (
              <div className="mt-8">
                <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-2xl p-5">
                  <div className="flex items-center gap-2 text-white font-bold mb-2">
                    <Smartphone className="w-4 h-4" />
                    بديل سريع
                  </div>
                  <p className="text-white/85 leading-relaxed">
                    لو محمل التطبيق، تقدر تفتحه وتكمل طلبك من هناك دلوقتي! 📱
                  </p>
                  <p className="text-white/85 leading-relaxed mt-1">
                    ولو لسه محملتوش.. اضغط هنا لتحميل نسختك 👇
                  </p>
                  <div className="mt-4">
                    <a href={status.appUpdateLink} target="_blank" rel="noreferrer">
                      <Button className="h-12 rounded-2xl bg-gradient-to-l from-blue-500 to-blue-700 px-6 shadow-[0_0_30px_rgba(59,130,246,0.24)] hover:from-blue-400 hover:to-blue-600">
                        <DownloadCloud className="w-5 h-5 ms-2" />
                        تحميل تطبيق الأندرويد
                      </Button>
                    </a>
                  </div>
                </div>
              </div>
            )}

            {/* App Cross-Routing */}
            {!isWeb && (appBlocked || forceUpdateBlocked) && status.appShowWebAlternative && (
              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <a href={DEFAULT_PUBLIC_WEBSITE_URL} target="_blank" rel="noreferrer" className="w-full sm:w-auto">
                  <Button variant="secondary" className="h-12 w-full rounded-2xl border border-white/15 bg-white/10 text-white hover:bg-white/15 sm:w-auto">
                    <Globe className="w-5 h-5 ms-2" />
                    افتح موقع أركان
                  </Button>
                </a>
              </div>
            )}

            {/* App Force Update Button */}
            {!isWeb && forceUpdateBlocked && canShowDownload && (
              <div className="mt-8">
                <a href={status.appUpdateLink} target="_blank" rel="noreferrer">
                  <Button className="h-14 w-full rounded-2xl bg-gradient-to-l from-amber-400 to-amber-600 text-slate-950 shadow-[0_0_40px_rgba(251,191,36,0.2)] hover:from-amber-300 hover:to-amber-500">
                    <DownloadCloud className="w-6 h-6 ms-2" />
                    تحميل التحديث
                  </Button>
                </a>
              </div>
            )}

            {/* App Force Update: hide download while timer runs */}
            {!isWeb && forceUpdateBlocked && !canShowDownload && (
              <div className="mt-6 text-center text-white/70 text-sm">
                جاري تجهيز التحديث... يرجى الانتظار.
              </div>
            )}
            {(webBlocked || appBlocked) && (
              <Button
                variant="outline"
                onClick={() => window.location.reload()}
                className="mt-6 h-11 rounded-xl border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"
              >
                <RefreshCw className="ms-2 h-4 w-4" />
                تحقق من عودة الموقع
              </Button>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
