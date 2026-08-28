import { useEffect, useMemo, useState } from "react";
import { Shield, Globe, Smartphone, Save, Link as LinkIcon, Timer, BellRing, LaptopMinimal, RefreshCw } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useSystemStatus, useUpdateSystemStatus, type SystemStatus, SYSTEM_STATUS_KEY } from "@/lib/use-system-status";
import { useQueryClient } from "@tanstack/react-query";

function isoToDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const tzOffset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tzOffset).toISOString().slice(0, 16);
}

function datetimeLocalToIso(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

const DEFAULT_APK_LINK =
  "https://drive.google.com/drive/folders/1OrsQuXQyYC6ZFPxcvhPQ0p-Rh-TemxjO?usp=drive_link";

export default function AdminSystemStatus() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useSystemStatus();
  const update = useUpdateSystemStatus();

  const initial = useMemo<SystemStatus | null>(() => {
    if (!data) return null;
    return data;
  }, [data]);

  const [webMaintenanceMode, setWebMaintenanceMode] = useState(false);
  const [webShowAppAlternative, setWebShowAppAlternative] = useState(false);
  const [webMaintenanceMessage, setWebMaintenanceMessage] = useState("");
  const [webMaintenanceEndLocal, setWebMaintenanceEndLocal] = useState("");

  const [appMaintenanceMode, setAppMaintenanceMode] = useState(false);
  const [appUpdateRequired, setAppUpdateRequired] = useState(false);
  const [appShowWebAlternative, setAppShowWebAlternative] = useState(false);
  const [appStatusMessage, setAppStatusMessage] = useState("");
  const [appMaintenanceEndLocal, setAppMaintenanceEndLocal] = useState("");
  const [appUpdateLink, setAppUpdateLink] = useState(DEFAULT_APK_LINK);
  const [requiredAppVersion, setRequiredAppVersion] = useState("0.0.0");

  useEffect(() => {
    if (!initial) return;

    setWebMaintenanceMode(Boolean(initial.webMaintenanceMode));
    setWebShowAppAlternative(Boolean(initial.webShowAppAlternative));
    setWebMaintenanceMessage(initial.webMaintenanceMessage ?? "");
    setWebMaintenanceEndLocal(isoToDatetimeLocal(initial.webMaintenanceEndTime));

    setAppMaintenanceMode(Boolean(initial.appMaintenanceMode));
    setAppUpdateRequired(Boolean(initial.appUpdateRequired));
    setAppShowWebAlternative(Boolean(initial.appShowWebAlternative));
    setAppStatusMessage(initial.appStatusMessage ?? "");
    setAppMaintenanceEndLocal(isoToDatetimeLocal(initial.appMaintenanceEndTime));
    setAppUpdateLink(initial.appUpdateLink || DEFAULT_APK_LINK);
    setRequiredAppVersion((initial.requiredAppVersion ?? "0.0.0").trim() || "0.0.0");
  }, [initial]);

  const save = async () => {
    const payload: Partial<SystemStatus> = {
      webMaintenanceMode,
      webShowAppAlternative,
      webMaintenanceMessage,
      webMaintenanceEndTime: datetimeLocalToIso(webMaintenanceEndLocal),

      appMaintenanceMode,
      appUpdateRequired,
      requiredAppVersion: requiredAppVersion.trim() || "0.0.0",
      appShowWebAlternative,
      appStatusMessage,
      appMaintenanceEndTime: datetimeLocalToIso(appMaintenanceEndLocal),
      appUpdateLink: appUpdateLink.trim() || DEFAULT_APK_LINK,
    };

    update.mutate(payload, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: SYSTEM_STATUS_KEY });
        toast({ title: "تم الحفظ بنجاح" });
      },
      onError: (e) => {
        toast({ variant: "destructive", title: "فشل الحفظ", description: e.message });
      },
    });
  };

  const webCountdownEnabled = webMaintenanceEndLocal.trim().length > 0;
  const appCountdownEnabled = appMaintenanceEndLocal.trim().length > 0;

  return (
    <div className="min-h-screen bg-slate-950 text-white" dir="rtl">
      <div className="relative overflow-hidden border-b border-white/10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(56,189,248,0.18),transparent_55%),radial-gradient(circle_at_bottom_left,_rgba(217,70,239,0.18),transparent_55%)]" />
        <div className="relative container mx-auto px-4 py-10">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-white/10 border border-white/10 flex items-center justify-center backdrop-blur-2xl">
              <Shield className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight">حالة النظام والصيانة</h1>
              <p className="text-white/70 mt-1">
                إدارة صيانة الويب والتطبيق، التحديث الإجباري، العدّ التنازلي، وروابط التحويل البديلة من مكان واحد.
              </p>
            </div>
          </div>

          {(error instanceof Error || typeof error === "string") && (
            <div className="mt-6 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-red-200">
              تعذر تحميل الحالة: {error instanceof Error ? error.message : String(error)}
            </div>
          )}
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        <div className="mb-6 grid grid-cols-1 xl:grid-cols-[1.5fr_auto] gap-4 items-start">
          <Card className="bg-white/5 border-white/10 backdrop-blur-2xl rounded-3xl shadow-[0_0_60px_rgba(0,0,0,0.35)]">
            <CardContent className="p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-sm text-white/60">لوحة الإدارة</p>
                  <h2 className="mt-1 text-xl font-bold">التحكم الكامل في حالة النظام</h2>
                  <p className="mt-2 text-sm text-white/70">
                    فعّل وضع الصيانة للويب، افرض تحديث التطبيق، واضبط توقيت انتهاء الرسائل والشاشات المقفلة.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full lg:w-auto">
                  <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                    <p className="text-xs text-white/50">حالة الويب</p>
                    <p className="mt-1 font-semibold">{webMaintenanceMode ? "الصيانة مفعلة" : "الويب يعمل"}</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                    <p className="text-xs text-white/50">حالة التطبيق</p>
                    <p className="mt-1 font-semibold">{appMaintenanceMode ? "الصيانة مفعلة" : "التطبيق يعمل"}</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                    <p className="text-xs text-white/50">التحديث الإجباري</p>
                    <p className="mt-1 font-semibold">{appUpdateRequired ? "مفعل" : "غير مفعل"}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Button
            onClick={save}
            disabled={update.isPending}
            className="h-14 px-6 rounded-2xl bg-gradient-to-l from-cyan-500 to-fuchsia-600 hover:from-cyan-400 hover:to-fuchsia-500 text-base font-semibold shadow-[0_0_30px_rgba(34,211,238,0.22)]"
          >
            <BellRing className="w-4 h-4 ms-2" />
            {update.isPending ? "جارٍ الحفظ..." : "Save & Notify"}
          </Button>
        </div>

        <div className="flex items-center justify-between gap-3 mb-6">
          <div className="text-white/70 text-sm">
            {isLoading ? "جارٍ تحميل الإعدادات الحالية..." : "كل الحقول جاهزة للتعديل والحفظ"}
          </div>
          <div className="text-xs text-white/50">
            احفظ التغييرات بعد تعديل أي بطاقة بالأسفل.
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
          <Card className="bg-white/5 border-white/10 backdrop-blur-2xl rounded-3xl shadow-[0_0_60px_rgba(0,0,0,0.35)]">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="w-5 h-5" />
                Web Maintenance
              </CardTitle>
              <CardDescription className="text-white/60">
                تحكم كامل في إغلاق نسخة الويب مع رسالة مخصصة وخيار توجيه المستخدم للتطبيق.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 p-5">
                <div>
                  <Label className="text-white">webMaintenanceMode</Label>
                  <p className="text-xs text-white/60 mt-1">تعطيل نسخة الويب مؤقتاً مع الإبقاء على وصول الأدمن.</p>
                </div>
                <Switch checked={webMaintenanceMode} onCheckedChange={setWebMaintenanceMode} />
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-2">
                <Label className="text-white/80">webMaintenanceMessage</Label>
                <Textarea
                  value={webMaintenanceMessage}
                  onChange={(e) => setWebMaintenanceMessage(e.target.value)}
                  placeholder="اكتب رسالة الصيانة التي ستظهر لمستخدمي الويب..."
                  className="min-h-28 bg-white/5 border-white/10 text-white placeholder:text-white/40"
                />
              </div>

              <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 p-5">
                <div>
                  <Label className="text-white">webShowAppAlternative</Label>
                  <p className="text-xs text-white/60 mt-1">إظهار كارت بديل لتحميل التطبيق أثناء صيانة الويب.</p>
                </div>
                <Switch checked={webShowAppAlternative} onCheckedChange={setWebShowAppAlternative} />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white/5 border-white/10 backdrop-blur-2xl rounded-3xl shadow-[0_0_60px_rgba(0,0,0,0.35)]">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Smartphone className="w-5 h-5" />
                App Maintenance
              </CardTitle>
              <CardDescription className="text-white/60">
                قفل التطبيق مؤقتاً مع رسالة واضحة وخيار توجيه المستخدم إلى نسخة الويب.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 p-5">
                <div>
                  <Label className="text-white">appMaintenanceMode</Label>
                  <p className="text-xs text-white/60 mt-1">إظهار شاشة صيانة للتطبيق الأصلي.</p>
                </div>
                <Switch checked={appMaintenanceMode} onCheckedChange={setAppMaintenanceMode} />
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-2">
                <Label className="text-white/80">appStatusMessage</Label>
                <Textarea
                  value={appStatusMessage}
                  onChange={(e) => setAppStatusMessage(e.target.value)}
                  placeholder="اكتب رسالة الصيانة أو الحالة التي ستظهر داخل التطبيق..."
                  className="min-h-28 bg-white/5 border-white/10 text-white placeholder:text-white/40"
                />
              </div>

              <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 p-5">
                <div>
                  <Label className="text-white">appShowWebAlternative</Label>
                  <p className="text-xs text-white/60 mt-1">إظهار زر تحويل المستخدم إلى الويب أثناء إغلاق التطبيق.</p>
                </div>
                <Switch checked={appShowWebAlternative} onCheckedChange={setAppShowWebAlternative} />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white/5 border-white/10 backdrop-blur-2xl rounded-3xl shadow-[0_0_60px_rgba(0,0,0,0.35)]">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <RefreshCw className="w-5 h-5" />
                App Force Update
              </CardTitle>
              <CardDescription className="text-white/60">
                فعّل التحديث الإجباري وحدد رابط الـ APK الذي يظهر داخل الويب والتطبيق.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 p-5">
                <div>
                  <Label className="text-white">appUpdateRequired</Label>
                  <p className="text-xs text-white/60 mt-1">إظهار شاشة تحديث إجباري مع زر تحميل بعد انتهاء المؤقت.</p>
                </div>
                <Switch checked={appUpdateRequired} onCheckedChange={setAppUpdateRequired} />
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-2">
                <Label className="text-white/80">requiredAppVersion</Label>
                <Input
                  value={requiredAppVersion}
                  onChange={(e) => setRequiredAppVersion(e.target.value)}
                  placeholder="مثال: 1.2.3"
                  className="bg-white/5 border-white/10 text-white placeholder:text-white/40"
                  dir="ltr"
                />
                <p className="text-xs text-white/50">
                  سيتم حجب المستخدم فقط إذا كانت نسخة جهازه أقل من هذه القيمة (مثال: 1.4.0). اتركها <span dir="ltr">0.0.0</span> لتعطيل شرط النسخة.
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-2">
                <Label className="text-white/80">appUpdateLink</Label>
                <div className="relative">
                  <LinkIcon className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/60" />
                  <Input
                    value={appUpdateLink}
                    onChange={(e) => setAppUpdateLink(e.target.value)}
                    placeholder={DEFAULT_APK_LINK}
                    className="bg-white/5 border-white/10 text-white placeholder:text-white/40 pr-10"
                    dir="ltr"
                  />
                </div>
                <p className="text-xs text-white/50">
                  استخدم رابطاً مباشراً وواضحاً لتحميل آخر نسخة من التطبيق.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white/5 border-white/10 backdrop-blur-2xl rounded-3xl shadow-[0_0_60px_rgba(0,0,0,0.35)]">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Timer className="w-5 h-5" />
                Countdown Timers
              </CardTitle>
              <CardDescription className="text-white/60">
                اضبط وقت انتهاء صيانة الويب والتطبيق لعرض العدّ التنازلي بشكل حي للمستخدمين.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <LaptopMinimal className="w-4 h-4 text-cyan-300" />
                  <Label className="text-white/90" dir="ltr">
                    webMaintenanceEndTime
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    type="datetime-local"
                    value={webMaintenanceEndLocal}
                    onChange={(e) => setWebMaintenanceEndLocal(e.target.value)}
                    className="bg-white/5 border-white/10 text-white"
                    dir="ltr"
                  />
                  <Button
                    variant="secondary"
                    onClick={() => setWebMaintenanceEndLocal("")}
                    className="bg-white/10 text-white hover:bg-white/15 border border-white/10"
                  >
                    مسح
                  </Button>
                </div>
                <p className="text-xs text-white/50">
                  {webCountdownEnabled ? "تم تفعيل مؤقت نهاية صيانة الويب." : "يمكنك ترك الحقل فارغاً لتعطيل عدّاد الويب."}
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-fuchsia-300" />
                  <Label className="text-white/90" dir="ltr">
                    appMaintenanceEndTime
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    type="datetime-local"
                    value={appMaintenanceEndLocal}
                    onChange={(e) => setAppMaintenanceEndLocal(e.target.value)}
                    className="bg-white/5 border-white/10 text-white"
                    dir="ltr"
                  />
                  <Button
                    variant="secondary"
                    onClick={() => setAppMaintenanceEndLocal("")}
                    className="bg-white/10 text-white hover:bg-white/15 border border-white/10"
                  >
                    مسح
                  </Button>
                </div>
                <p className="text-xs text-white/50">
                  {appCountdownEnabled
                    ? "سيُستخدم هذا الوقت لعدّاد الصيانة والتحديث الإجباري داخل التطبيق."
                    : "يمكنك ترك الحقل فارغاً إذا لم تكن بحاجة إلى عدّ تنازلي للتطبيق."}
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <p className="text-sm font-semibold text-white">ملاحظات سريعة</p>
                <ul className="mt-3 space-y-2 text-sm text-white/70">
                  <li>يظهر عدّاد الويب فقط عند ضبط وقت نهاية صيانة الويب.</li>
                  <li>يظهر زر تحميل التحديث بعد انتهاء عدّاد التطبيق عند التحديث الإجباري.</li>
                  <li>تبقى صفحة الأدمن متاحة حتى أثناء تفعيل وضع الصيانة.</li>
                </ul>
              </div>
            </CardContent>
          </Card>

          <div className="xl:col-span-2">
            <Card className="bg-white/5 border-white/10 backdrop-blur-2xl rounded-3xl shadow-[0_0_60px_rgba(0,0,0,0.35)]">
              <CardContent className="p-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-white">جاهز لنشر التغييرات؟</p>
                  <p className="text-sm text-white/60 mt-1">
                    اضغط على الزر لحفظ آخر الإعدادات وتحديث حالة النظام فوراً.
                  </p>
                </div>
                <Label className="text-white/80" dir="ltr">
                  آخر خطوة
                </Label>
                <Button
                  onClick={save}
                  disabled={update.isPending}
                  className="h-12 px-6 rounded-2xl bg-gradient-to-l from-cyan-500 to-fuchsia-600 hover:from-cyan-400 hover:to-fuchsia-500 text-base font-semibold"
                >
                  <Save className="w-4 h-4 ms-2" />
                  {update.isPending ? "جارٍ الحفظ..." : "Save & Notify"}
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
