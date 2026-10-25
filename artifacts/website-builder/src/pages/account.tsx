import { useMemo } from "react";
import { Link } from "wouter";
import { useListOrders } from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  ArrowLeft,
  BadgeCheck,
  CalendarDays,
  CheckCircle2,
  Clock3,
  MessageCircle,
  Plus,
  ShoppingBag,
  Sparkles,
} from "lucide-react";
import { format } from "date-fns";
import { ar } from "date-fns/locale";

function orderStatus(status: string) {
  if (status === "completed") return { label: "مكتمل", style: "border-emerald-200 bg-emerald-50 text-emerald-700" };
  if (status === "in_progress" || status === "started" || status === "processing") {
    return { label: "جاري التنفيذ", style: "border-blue-200 bg-blue-50 text-blue-700" };
  }
  if (status === "cancelled") return { label: "ملغي", style: "border-red-200 bg-red-50 text-red-700" };
  if (status === "payment_required") return { label: "بانتظار الدفع", style: "border-amber-200 bg-amber-50 text-amber-700" };
  return { label: "قيد المراجعة", style: "border-slate-200 bg-slate-100 text-slate-700" };
}

export default function AccountDashboard() {
  const { user } = useAuth();
  const { data, isLoading, error } = useListOrders();
  const orders = Array.isArray(data) ? data : [];
  const recentOrders = useMemo(
    () => [...orders].sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime()).slice(0, 3),
    [orders],
  );
  const inProgressCount = orders.filter((order) => ["in_progress", "started", "processing"].includes(order.status)).length;
  const completedCount = orders.filter((order) => order.status === "completed").length;

  return (
    <div className="min-h-full bg-slate-50 px-4 py-6 sm:px-6 sm:py-10" dir="rtl">
      <div className="mx-auto max-w-6xl space-y-6 sm:space-y-8">
        <section className="relative isolate overflow-hidden rounded-[2rem] bg-gradient-to-br from-slate-950 via-[#10234a] to-blue-800 px-5 py-8 text-white shadow-xl shadow-blue-950/10 sm:px-9 sm:py-10">
          <div className="pointer-events-none absolute -left-16 -top-24 -z-10 h-64 w-64 rounded-full bg-amber-300/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-32 right-1/3 -z-10 h-72 w-72 rounded-full bg-cyan-300/15 blur-3xl" />
          <div className="flex flex-col gap-7 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold text-blue-100">
                <Sparkles className="h-4 w-4 text-amber-300" />
                مساحة أركان الخاصة بك
              </div>
              <h1 className="text-2xl font-extrabold leading-tight tracking-tight sm:text-4xl">
                أهلاً {user?.fullName?.trim().split(/\s+/)[0] || "بك"}، نورت أركان
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-blue-100/80 sm:text-base">
                تابع مشاريعك ومدفوعاتك، وتواصل مع فريقنا من مكان واحد. نحن هنا لنحوّل فكرتك إلى تجربة رقمية مميزة.
              </p>
            </div>
            <Button asChild className="h-12 shrink-0 rounded-xl bg-amber-400 px-5 font-bold text-slate-950 hover:bg-amber-300">
              <Link href="/order">
                <Plus className="ms-2 h-4 w-4" />
                اطلب موقعاً جديداً
              </Link>
            </Button>
          </div>
        </section>

        {error && (
          <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            تعذر تحميل طلباتك الآن. حاول تحديث الصفحة، أو تواصل مع الدعم إذا استمرت المشكلة.
          </div>
        )}

        <section aria-label="ملخص طلباتي" className="grid gap-4 sm:grid-cols-3">
          {[
            { label: "إجمالي الطلبات", value: isLoading ? "—" : orders.length, icon: ShoppingBag, accent: "bg-blue-50 text-blue-700" },
            { label: "قيد التنفيذ", value: isLoading ? "—" : inProgressCount, icon: Clock3, accent: "bg-amber-50 text-amber-700" },
            { label: "مشاريع مكتملة", value: isLoading ? "—" : completedCount, icon: CheckCircle2, accent: "bg-emerald-50 text-emerald-700" },
          ].map((item) => (
            <Card key={item.label} className="rounded-2xl border-slate-200/80 shadow-sm">
              <CardContent className="flex items-center gap-4 p-5 sm:p-6">
                <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${item.accent}`}>
                  <item.icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{item.label}</p>
                  <p className="mt-1 text-2xl font-extrabold text-slate-900">{item.value}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </section>

        <section className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(260px,0.8fr)]">
          <Card className="overflow-hidden rounded-2xl border-slate-200/80 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-5 sm:px-6">
              <div>
                <h2 className="text-lg font-bold text-slate-900">آخر تحديثات مشاريعك</h2>
                <p className="mt-1 text-sm text-muted-foreground">تابع حالة الطلبات التي تعمل عليها مع فريقنا.</p>
              </div>
              <Button asChild variant="ghost" size="sm" className="text-primary">
                <Link href="/my-orders">كل الطلبات <ArrowLeft className="me-1 h-4 w-4" /></Link>
              </Button>
            </div>
            <CardContent className="p-4 sm:p-6">
              {isLoading ? (
                <div className="space-y-3" aria-label="جاري تحميل الطلبات">
                  {[1, 2].map((item) => <div key={item} className="h-20 animate-pulse rounded-xl bg-slate-100" />)}
                </div>
              ) : recentOrders.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-9 text-center">
                  <ShoppingBag className="mx-auto h-9 w-9 text-slate-400" />
                  <h3 className="mt-3 font-bold text-slate-800">لسه ما عندكش طلبات</h3>
                  <p className="mx-auto mt-1 max-w-sm text-sm leading-6 text-muted-foreground">
                    ابدأ بمشاركة فكرتك، وسيساعدك فريق أركان في اختيار الحل المناسب.
                  </p>
                  <Button asChild className="mt-4 rounded-xl"><Link href="/order">ابدأ طلبك الأول</Link></Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {recentOrders.map((order) => {
                    const status = orderStatus(order.status);
                    return (
                      <article key={order.id} className="flex min-w-0 flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="max-w-full truncate font-bold text-slate-900">{order.siteName}</h3>
                            <Badge variant="outline" className={status.style}>{status.label}</Badge>
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                            <span className="inline-flex items-center gap-1"><BadgeCheck className="h-3.5 w-3.5" />طلب #{String(order.id).padStart(5, "0")}</span>
                            <span className="inline-flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />{format(new Date(order.updatedAt || order.createdAt), "dd MMM yyyy", { locale: ar })}</span>
                          </div>
                        </div>
                        <span className="shrink-0 text-sm font-semibold text-primary">{order.siteType}</span>
                      </article>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card className="rounded-2xl border-slate-200/80 shadow-sm">
              <CardContent className="p-5 sm:p-6">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <MessageCircle className="h-5 w-5" />
                </div>
                <h2 className="mt-4 text-lg font-bold text-slate-900">محتاج مساعدة؟</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  فريق الدعم جاهز للإجابة عن أسئلتك ومتابعة أي تفاصيل تخص مشروعك.
                </p>
                <Button asChild variant="outline" className="mt-4 w-full rounded-xl border-primary/20 text-primary hover:bg-primary/5">
                  <Link href="/chat">ابدأ محادثة مع الدعم <ArrowLeft className="me-2 h-4 w-4" /></Link>
                </Button>
              </CardContent>
            </Card>
            <Card className="rounded-2xl border-amber-200 bg-gradient-to-br from-amber-50 to-white shadow-sm">
              <CardContent className="p-5 sm:p-6">
                <h2 className="font-bold text-slate-900">جاهز لفكرتك التالية؟</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">ابدأ طلباً جديداً وسنساعدك في كل خطوة.</p>
                <Button asChild variant="link" className="mt-2 h-auto px-0 text-amber-700">
                  <Link href="/order">إنشاء طلب جديد <ArrowLeft className="me-2 h-4 w-4" /></Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </section>
      </div>
    </div>
  );
}
