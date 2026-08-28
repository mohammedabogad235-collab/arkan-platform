import { useEffect, useMemo, useState } from "react";
import { Shield, Globe, Smartphone, Save, Link as LinkIcon, Timer } from "lucide-react";
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
  }, [initial]);

  const save = async () => {
    const payload: Partial<SystemStatus> = {
      webMaintenanceMode,
      webShowAppAlternative,
      webMaintenanceMessage,
      webMaintenanceEndTime: datetimeLocalToIso(webMaintenanceEndLocal),

      appMaintenanceMode,
      appUpdateRequired,
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
              <h1 className="text-3xl font-extrabold tracking-tight">غرفة التحكم</h1>
              <p className="text-white/70 mt-1">
                System Status, Root Kill-Switch & Cross-Routing (Web/App) مع عدّ تنازلي حي
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
        <div className="flex items-center justify-between gap-3 mb-6">
          <div className="text-white/70 text-sm">
            {isLoading ? "جارٍ التحميل..." : "جاهز للتعديل"}
          </div>
          <Button
            onClick={save}
            disabled={update.isPending}
            className="h-11 px-5 rounded-2xl bg-gradient-to-l from-cyan-500 to-fuchsia-600 hover:from-cyan-400 hover:to-fuchsia-500"
          >
            <Save className="w-4 h-4 ms-2" />
            {update.isPending ? "جارٍ الحفظ..." : "حفظ الإعدادات"}
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Web Card */}
          <Card className="bg-white/5 border-white/10 backdrop-blur-2xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="w-5 h-5" />
                Web Control
              </CardTitle>
              <CardDescription className="text-white/60">
                صيانة الويب + رسالة + عدّ تنازلي + تفعيل عرض بديل التطبيق
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
                <div>
                  <Label className="text-white">webMaintenanceMode</Label>
                  <p className="text-xs text-white/60 mt-1">حظر واجهة الويب بالكامل (مع استثناء الأدمن)</p>
                </div>
                <Switch checked={webMaintenanceMode} onCheckedChange={setWebMaintenanceMode} />
              </div>

              <div className="space-y-2">
                <Label className="text-white/80">webMaintenanceMessage</Label>
                <Textarea
                  value={webMaintenanceMessage}
                  onChange={(e) => setWebMaintenanceMessage(e.target.value)}
                  placeholder="اكتب رسالة الصيانة التي ستظهر للمستخدمين..."
                  className="min-h-28 bg-white/5 border-white/10 text-white placeholder:text-white/40"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-white/80" dir="ltr">
                  webMaintenanceEndTime
                </Label>
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
                <p className="text-xs text-white/50 flex items-center gap-2">
                  <Timer className="w-3.5 h-3.5" />
                  عند ضبط الوقت، سيظهر عدّ تنازلي حي للمستخدمين.
                </p>
              </div>

              <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
                <div>
                  <Label className="text-white">webShowAppAlternative</Label>
                  <p className="text-xs text-white/60 mt-1">عرض كارت بديل لتحميل التطبيق داخل شاشة الصيانة</p>
                </div>
                <Switch checked={webShowAppAlternative} onCheckedChange={setWebShowAppAlternative} />
              </div>
            </CardContent>
          </Card>

          {/* App Card */}
          <Card className="bg-white/5 border-white/10 backdrop-blur-2xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Smartphone className="w-5 h-5" />
                App Control
              </CardTitle>
              <CardDescription className="text-white/60">
                صيانة التطبيق + تحديث إجباري + عدّ تنازلي + روابط توجيه متبادل
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
                <div>
                  <Label className="text-white">appMaintenanceMode</Label>
                  <p className="text-xs text-white/60 mt-1">قفل واجهة التطبيق (Native)</p>
                </div>
                <Switch checked={appMaintenanceMode} onCheckedChange={setAppMaintenanceMode} />
              </div>

              <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
                <div>
                  <Label className="text-white">appUpdateRequired</Label>
                  <p className="text-xs text-white/60 mt-1">إظهار شاشة تحديث إجباري (مع زر تحميل بعد انتهاء العداد)</p>
                </div>
                <Switch checked={appUpdateRequired} onCheckedChange={setAppUpdateRequired} />
              </div>

              <div className="space-y-2">
                <Label className="text-white/80">appStatusMessage</Label>
                <Textarea
                  value={appStatusMessage}
                  onChange={(e) => setAppStatusMessage(e.target.value)}
                  placeholder="رسالة الحالة/الصيانة/التحديث داخل التطبيق..."
                  className="min-h-28 bg-white/5 border-white/10 text-white placeholder:text-white/40"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-white/80" dir="ltr">
                  appMaintenanceEndTime
                </Label>
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
                <p className="text-xs text-white/50 flex items-center gap-2">
                  <Timer className="w-3.5 h-3.5" />
                  نفس نهاية الوقت تُستخدم للعدّ التنازلي للتحديث الإجباري أيضاً.
                </p>
              </div>

              <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
                <div>
                  <Label className="text-white">appShowWebAlternative</Label>
                  <p className="text-xs text-white/60 mt-1">عرض زر تحويل للويب داخل شاشة التطبيق المقفلة</p>
                </div>
                <Switch checked={appShowWebAlternative} onCheckedChange={setAppShowWebAlternative} />
              </div>

              <div className="space-y-2">
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
                  هذا الرابط يُستخدم لزر التحميل في الويب والتطبيق عند تفعيل التحديث الإجباري.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

