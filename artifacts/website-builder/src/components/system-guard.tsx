import type { PropsWithChildren } from "react";
import { Capacitor } from "@capacitor/core";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { ShieldAlert, Smartphone, Globe, DownloadCloud } from "lucide-react";
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

export function SystemGuard({ children }: PropsWithChildren) {
  const [location] = useLocation();
  const { data: status } = useSystemStatus();
  const platform = Capacitor.getPlatform();
  const isWeb = platform === "web";
  const webBlocked = isWeb && !!status?.webMaintenanceMode;
  const appBlocked = !isWeb && !!status?.appMaintenanceMode;
  const appUpdateBlocked = !isWeb && !!status?.appUpdateRequired;
  const blocked = webBlocked || appBlocked || appUpdateBlocked;
  const endTimeIso = webBlocked ? status?.webMaintenanceEndTime : status?.appMaintenanceEndTime;
  const countdown = useCountdown(endTimeIso);

  // ✅ Kill Switch Bypass: لوحة التحكم يجب ألا تُحجب أبداً
  if (location.startsWith("/admin")) return <>{children}</>;

  if (!status) return <>{children}</>;

  if (!blocked) return <>{children}</>;
  const canShowDownload = !appUpdateBlocked || !countdown || countdown.isExpired;

  const title = webBlocked
    ? "صيانة مؤقتة"
    : appUpdateBlocked
      ? "تحديث إجباري"
      : "التطبيق تحت الصيانة";

  const message = webBlocked
    ? status.webMaintenanceMessage || "نقوم الآن بأعمال صيانة لتحسين تجربتك. نرجو العودة قريباً."
    : status.appStatusMessage || (appUpdateBlocked ? "يوجد تحديث جديد للتطبيق يجب تثبيته للمتابعة." : "التطبيق تحت الصيانة حالياً.");

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center px-4 py-10"
      dir="rtl"
    >
      <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-2xl" />
      <div className="absolute -top-40 -left-40 w-[520px] h-[520px] rounded-full bg-fuchsia-600/15 blur-3xl" />
      <div className="absolute -bottom-40 -right-40 w-[520px] h-[520px] rounded-full bg-cyan-500/15 blur-3xl" />

      <motion.div
        initial={{ opacity: 0, scale: 0.98, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="relative w-full max-w-2xl"
      >
        <Card className="border-white/10 bg-white/5 backdrop-blur-2xl shadow-[0_0_60px_rgba(0,0,0,0.45)]">
          <CardContent className="p-6 sm:p-10 text-white">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-white/10 border border-white/10 flex items-center justify-center shrink-0">
                <ShieldAlert className="w-6 h-6 text-white" />
              </div>
              <div className="min-w-0">
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
                      <Button className="h-12 px-6 rounded-2xl bg-gradient-to-l from-cyan-500 to-fuchsia-600 hover:from-cyan-400 hover:to-fuchsia-500 shadow-[0_0_30px_rgba(217,70,239,0.25)]">
                        <DownloadCloud className="w-5 h-5 ms-2" />
                        تحميل تطبيق الأندرويد
                      </Button>
                    </a>
                  </div>
                </div>
              </div>
            )}

            {/* App Cross-Routing */}
            {!isWeb && (appBlocked || appUpdateBlocked) && status.appShowWebAlternative && (
              <div className="mt-6 flex flex-col sm:flex-row gap-3">
                <a href={DEFAULT_PUBLIC_WEBSITE_URL} target="_blank" rel="noreferrer" className="w-full sm:w-auto">
                  <Button variant="secondary" className="w-full h-12 rounded-2xl bg-white/10 text-white hover:bg-white/15 border border-white/10">
                    <Globe className="w-5 h-5 ms-2" />
                    Use our Website instead
                  </Button>
                </a>
              </div>
            )}

            {/* App Force Update Button */}
            {!isWeb && appUpdateBlocked && canShowDownload && (
              <div className="mt-8">
                <a href={status.appUpdateLink} target="_blank" rel="noreferrer">
                  <Button className="w-full h-14 text-lg rounded-2xl bg-gradient-to-l from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 shadow-[0_0_40px_rgba(251,146,60,0.25)]">
                    <DownloadCloud className="w-6 h-6 ms-2" />
                    Download Update 🚀
                  </Button>
                </a>
              </div>
            )}

            {/* App Force Update: hide download while timer runs */}
            {!isWeb && appUpdateBlocked && !canShowDownload && (
              <div className="mt-6 text-center text-white/70 text-sm">
                جاري تجهيز التحديث... يرجى الانتظار.
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
