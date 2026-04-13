import { useAuth } from "@/lib/auth";
import { useListOrders, useListPaymentMethods, getListOrdersQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { CalendarDays, Package as PackageIcon, CreditCard, Upload, CheckCircle2, Image, AlertCircle, XCircle, Hash, Info, ExternalLink, PartyPopper, Lock, Tag } from "lucide-react";
import { Input } from "@/components/ui/input";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { useReceiptUpload } from "@/lib/use-receipt-upload";
import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useSettings } from "@/lib/use-settings";

const statusMap: Record<string, { label: string, variant: "default" | "secondary" | "destructive" | "outline", color: string }> = {
  pending:     { label: "قيد الانتظار", variant: "outline",     color: "text-amber-600 border-amber-300 bg-amber-50" },
  in_progress: { label: "جاري التنفيذ", variant: "default",     color: "text-blue-700 border-blue-300 bg-blue-50" },
  completed:   { label: "مكتمل",         variant: "secondary",   color: "text-green-700 border-green-300 bg-green-50" },
  cancelled:   { label: "ملغي",           variant: "destructive", color: "text-red-700 border-red-300 bg-red-50" },
};

function ReceiptUploader({ orderId }: { orderId: number }) {
  const { uploadFile, isUploading, error } = useReceiptUpload();
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast({ variant: "destructive", title: "الملف كبير جداً", description: "الحد الأقصى 10 ميجابايت" });
      return;
    }

    const result = await uploadFile(file);
    if (!result) return;

    const res = await fetch(`/api/orders/${orderId}/receipt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ receiptUrl: result.url }),
    });

    if (res.ok) {
      queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
      toast({ title: "تم رفع الإيصال", description: "سيتم مراجعته من قِبل الإدارة وتحديث حالة طلبك" });
    } else {
      toast({ variant: "destructive", title: "خطأ", description: "تعذر حفظ الإيصال، حاول مرة أخرى" });
    }

    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="space-y-2">
      <input ref={inputRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={handleFile} />
      <Button
        variant="outline"
        size="sm"
        className="w-full border-dashed border-primary text-primary hover:bg-primary/5"
        disabled={isUploading}
        onClick={() => inputRef.current?.click()}
      >
        <Upload className="w-4 h-4 me-2" />
        {isUploading ? "جاري الرفع..." : "رفع إيصال الدفع"}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function FinalReceiptUploader({ orderId }: { orderId: number }) {
  const { uploadFile, isUploading, error } = useReceiptUpload();
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast({ variant: "destructive", title: "الملف كبير جداً", description: "الحد الأقصى 10 ميجابايت" });
      return;
    }

    const result = await uploadFile(file);
    if (!result) return;

    const res = await fetch(`/api/orders/${orderId}/final-receipt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ receiptUrl: result.url }),
    });

    if (res.ok) {
      queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
      toast({ title: "تم رفع إيصال الدفع النهائي", description: "سيتم مراجعته من قِبل الإدارة وتسليم الصلاحيات" });
    } else {
      toast({ variant: "destructive", title: "خطأ", description: "تعذر حفظ الإيصال، حاول مرة أخرى" });
    }

    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="space-y-2">
      <input ref={inputRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={handleFile} />
      <Button
        variant="outline"
        size="sm"
        className="w-full border-dashed border-blue-500 text-blue-600 hover:bg-blue-50"
        disabled={isUploading}
        onClick={() => inputRef.current?.click()}
      >
        <Upload className="w-4 h-4 me-2" />
        {isUploading ? "جاري الرفع..." : "رفع إيصال سداد المبلغ المتبقي"}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function CancelOrderButton({ order }: { order: any }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const hasPaid = order.depositPaid || order.finalPaid;

  const handleCancel = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/orders/${order.id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
        toast({ title: "تم إلغاء الطلب", description: hasPaid ? "تم إلغاء طلبك — لا يتم استرداد المبالغ المدفوعة." : "تم إلغاء طلبك بنجاح." });
      } else {
        const data = await res.json();
        toast({ variant: "destructive", title: "خطأ", description: data.error || "تعذر إلغاء الطلب" });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-destructive border-destructive/30 hover:bg-destructive/5 hover:text-destructive border gap-1.5">
          <XCircle className="w-4 h-4" />
          إلغاء الطلب
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent dir="rtl">
        <AlertDialogHeader>
          <AlertDialogTitle>تأكيد إلغاء الطلب</AlertDialogTitle>
          <AlertDialogDescription className="leading-relaxed">
            {hasPaid
              ? "⚠️ لقد قمت بالدفع مسبقاً — إلغاء الطلب لا يُتيح استرداد المبالغ المدفوعة. هل أنت متأكد من الإلغاء؟"
              : "هل أنت متأكد من إلغاء هذا الطلب؟ لن تتمكن من التراجع عن هذا الإجراء."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-row-reverse gap-2 sm:flex-row-reverse">
          <AlertDialogCancel>تراجع</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleCancel}
            disabled={loading}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {loading ? "جاري الإلغاء..." : "تأكيد الإلغاء"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function CouponApplier({ orderId, onApplied }: { orderId: number; onApplied: () => void }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const { toast } = useToast();

  const handleApply = async () => {
    if (!code.trim()) return;
    setStatus("loading");
    setErrorMsg("");
    try {
      const res = await fetch(`/api/orders/${orderId}/apply-coupon`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ code: code.trim().toUpperCase() }),
      });
      let data: any = {};
      try { data = await res.json(); } catch { /* ignore parse error */ }
      if (!res.ok) {
        setStatus("error");
        setErrorMsg(data.error || "الكود غير صحيح أو غير نشط");
      } else {
        toast({ title: "تم تطبيق الكوبون بنجاح!" });
        onApplied();
        setOpen(false);
        setCode("");
        setStatus("idle");
      }
    } catch {
      setStatus("error");
      setErrorMsg("تعذّر الاتصال، تحقق من الإنترنت وأعد المحاولة");
    }
  };

  if (!open) {
    return (
      <div className="border-t pt-4">
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors"
        >
          <Tag className="w-3.5 h-3.5" />
          هل لديك كود خصم؟ أضفه الآن
        </button>
      </div>
    );
  }

  return (
    <div className="border-t pt-4 space-y-2">
      <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
        <Tag className="w-3.5 h-3.5" />
        إضافة كود خصم
      </p>
      <div className="flex gap-2">
        <Input
          value={code}
          onChange={e => { setCode(e.target.value.toUpperCase()); setStatus("idle"); setErrorMsg(""); }}
          placeholder="أدخل الكود"
          dir="ltr"
          className="font-mono tracking-widest uppercase flex-1 h-9 text-sm"
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleApply(); } }}
        />
        <Button size="sm" onClick={handleApply} disabled={!code.trim() || status === "loading"} className="h-9 shrink-0">
          {status === "loading" ? "..." : "تطبيق"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => { setOpen(false); setCode(""); setStatus("idle"); setErrorMsg(""); }} className="h-9 shrink-0 text-muted-foreground">
          إلغاء
        </Button>
      </div>
      {status === "error" && <p className="text-xs text-destructive">{errorMsg}</p>}
    </div>
  );
}

export default function MyOrders() {
  const { user } = useAuth();
  const { data: orders, isLoading } = useListOrders({ userId: user?.id });
  const { data: settings } = useSettings();
  const { data: allPaymentMethods } = useListPaymentMethods();
  const activePMs = (allPaymentMethods || []).filter((pm: any) => pm.isActive);

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-12">
        <h1 className="text-3xl font-bold mb-8">طلباتي</h1>
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="h-24 bg-muted/50 rounded-t-xl" />
              <CardContent className="h-32" />
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-12 max-w-5xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2">طلباتي السابقة</h1>
        <p className="text-muted-foreground text-lg">تابع حالة طلباتك ومراحل تنفيذ مواقعك.</p>
      </div>

      {(!orders || orders.length === 0) ? (
        <Card className="text-center py-16 border-dashed border-2">
          <CardContent className="flex flex-col items-center justify-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-primary mb-4">
              <PackageIcon className="w-8 h-8" />
            </div>
            <h3 className="text-2xl font-semibold">لا يوجد طلبات حالياً</h3>
            <p className="text-muted-foreground max-w-md mx-auto">
              لم تقم بتقديم أي طلبات لبناء موقع حتى الآن. ابدأ الآن باختيار الباقة المناسبة لك.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-10">
          {[
            { status: "pending",     label: "قيد الانتظار", dot: "bg-amber-400", badge: "text-amber-700 bg-amber-50 border-amber-200" },
            { status: "in_progress", label: "جاري التنفيذ", dot: "bg-blue-400",  badge: "text-blue-700 bg-blue-50 border-blue-200" },
            { status: "completed",   label: "مكتمل",        dot: "bg-green-400", badge: "text-green-700 bg-green-50 border-green-200" },
            { status: "cancelled",   label: "ملغي",          dot: "bg-red-400",   badge: "text-red-700 bg-red-50 border-red-200" },
          ].map(({ status: grpStatus, label: grpLabel, dot, badge }) => {
            const groupOrders = orders.filter(o => o.status === grpStatus);
            if (groupOrders.length === 0) return null;
            return (
              <div key={grpStatus}>
                {/* Group header */}
                <div className="flex items-center gap-3 mb-5">
                  <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${dot}`} />
                  <h3 className="text-sm font-bold tracking-wide text-muted-foreground">{grpLabel}</h3>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${badge}`}>{groupOrders.length}</span>
                  <div className="flex-1 h-px bg-border/60" />
                </div>
                <div className="space-y-6">
                {groupOrders.map((order) => {
            const requireDeposit = settings?.requireDeposit ?? true;
            const depositPct = order.depositPercentage ?? settings?.depositPercentageValue ?? 50;
            const totalAmount = order.totalAmount ? Number(order.totalAmount) : null;
            const depositAmount = totalAmount ? Math.round(totalAmount * depositPct / 100) : null;
            const remainingAmount = totalAmount && depositAmount !== null ? totalAmount - depositAmount : null;
            const currencyLabel = order.currency === "EGP" ? "جنيه" : "ريال";

            const priceSet = totalAmount !== null && totalAmount > 0;
            const showReceiptUpload = order.status === "pending" && priceSet && !order.receiptUrl;
            const receiptUploaded = !!order.receiptUrl;
            const canCancel = order.status === "pending" || order.status === "in_progress";
            const statusCfg = statusMap[order.status] || { label: order.status, color: "", variant: "outline" as const };

            return (
              <Card key={order.id} className="overflow-hidden hover:shadow-lg transition-shadow border border-border/60">
                {/* Card Header */}
                <CardHeader className="bg-gradient-to-l from-muted/40 to-muted/10 border-b px-6 py-5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-3 mb-2 flex-wrap">
                        <CardTitle className="text-xl font-bold">{order.siteName}</CardTitle>
                        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusCfg.color}`}>
                          {statusCfg.label}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1.5">
                          <Hash className="w-3.5 h-3.5" />
                          <span className="font-mono font-medium text-foreground">#{String(order.id).padStart(5, "0")}</span>
                        </span>
                        <span className="flex items-center gap-1.5">
                          <CalendarDays className="w-3.5 h-3.5" />
                          {format(new Date(order.createdAt), "dd MMMM yyyy", { locale: ar })}
                        </span>
                        <span className="text-muted-foreground/60">|</span>
                        <span>{order.siteType}</span>
                      </div>
                    </div>
                    {canCancel && (
                      <div className="shrink-0">
                        <CancelOrderButton order={order} />
                      </div>
                    )}
                  </div>
                </CardHeader>

                {/* Deposit / Receipt Alert */}
                {order.status === "pending" && (
                  receiptUploaded ? (
                    <div className="px-6 py-3 border-b text-sm flex items-start gap-3 bg-green-50 text-green-800">
                      <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                      <span>تم رفع إيصال الدفع — بانتظار تأكيد الإدارة لبدء التنفيذ.</span>
                    </div>
                  ) : priceSet ? (
                    <div className="px-6 py-4 border-b bg-amber-50 space-y-4">
                      <div className="flex items-start gap-3 text-amber-800 text-sm">
                        <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                        <div className="space-y-2 flex-1">
                          <p className="font-semibold text-base">
                            {requireDeposit
                              ? `يُطلب منك دفع مقدّم ${depositPct}% — المبلغ: ${depositAmount} ${currencyLabel}`
                              : `يُطلب منك سداد كامل المبلغ: ${totalAmount} ${currencyLabel}`}
                          </p>
                          {/* Show linked payment method OR all active ones from settings */}
                          {order.paymentMethod ? (
                            <div className="space-y-1">
                              <p className="text-amber-800 font-medium">ادفع عبر: <strong>{order.paymentMethod.name}</strong></p>
                              {order.paymentMethod.details && (
                                <div className="text-amber-900 text-xs whitespace-pre-line font-mono bg-amber-100 border border-amber-200 rounded-xl px-3 py-2.5 leading-relaxed">
                                  {order.paymentMethod.details}
                                </div>
                              )}
                            </div>
                          ) : activePMs.length > 0 ? (
                            <div className="space-y-2">
                              <p className="text-amber-800 font-medium">حسابات الدفع المتاحة:</p>
                              {activePMs.map((pm: any) => (
                                <div key={pm.id} className="bg-amber-100 border border-amber-200 rounded-xl px-3 py-2.5 space-y-0.5">
                                  <p className="font-semibold text-xs text-amber-900">{pm.name}</p>
                                  {pm.details && (
                                    <p className="text-amber-800 text-xs whitespace-pre-line font-mono leading-relaxed">{pm.details}</p>
                                  )}
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </div>
                      <div className="pt-1">
                        <ReceiptUploader orderId={order.id} />
                      </div>
                    </div>
                  ) : (
                    <div className="px-6 py-4 border-b bg-blue-50 space-y-3">
                      <div className="flex items-start gap-3 text-blue-700 text-sm">
                        <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                        <span className="font-medium">طلبك قيد المراجعة — يرجى الانتظار حتى تحديد السعر من قِبل الإدارة.</span>
                      </div>
                      {/* Always show payment account details */}
                      {(order.paymentMethod || activePMs.length > 0) && (
                        <div className="space-y-2 pt-1">
                          <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide">حسابات الدفع</p>
                          {order.paymentMethod ? (
                            <div className="bg-white border border-blue-200 rounded-xl px-3 py-2.5 space-y-0.5">
                              <p className="font-semibold text-xs text-blue-900">{order.paymentMethod.name}</p>
                              {order.paymentMethod.details && (
                                <p className="text-blue-800 text-xs whitespace-pre-line font-mono leading-relaxed">{order.paymentMethod.details}</p>
                              )}
                            </div>
                          ) : activePMs.map((pm: any) => (
                            <div key={pm.id} className="bg-white border border-blue-200 rounded-xl px-3 py-2.5 space-y-0.5">
                              <p className="font-semibold text-xs text-blue-900">{pm.name}</p>
                              {pm.details && (
                                <p className="text-blue-800 text-xs whitespace-pre-line font-mono leading-relaxed">{pm.details}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                )}

                {/* Completed: Delivered URL */}
                {order.status === "completed" && order.deliveredUrl && (
                  <div className="px-6 py-4 border-b bg-gradient-to-l from-green-50 to-emerald-50 space-y-3">
                    <div className="flex items-center gap-2 text-green-700 font-semibold text-sm">
                      <PartyPopper className="w-4 h-4" />
                      تم تسليم موقعك بنجاح! 🎉
                    </div>
                    <a
                      href={order.deliveredUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 bg-white border border-green-200 rounded-xl px-4 py-3 text-sm font-medium text-green-700 hover:bg-green-50 transition-colors"
                    >
                      <ExternalLink className="w-4 h-4 shrink-0" />
                      <span className="truncate">{order.deliveredUrl}</span>
                    </a>
                    <p className="text-xs text-green-600">يمكنك زيارة موقعك والتحقق من كافة الصفحات.</p>
                  </div>
                )}

                {/* Completed: Remaining payment notice + receipt upload */}
                {order.status === "completed" && !order.finalPaid && remainingAmount !== null && (
                  <div className="px-6 py-4 border-b bg-blue-50 border-blue-100 text-sm text-blue-800 space-y-3">
                    <div className="flex items-start gap-3">
                      <Lock className="w-4 h-4 mt-0.5 shrink-0 text-blue-500" />
                      <div>
                        <p className="font-semibold mb-1">الموقع مكتمل — يُرجى سداد المبلغ المتبقي لاستلام كافة الصلاحيات</p>
                        <p>
                          المبلغ المتبقي: <strong>{remainingAmount.toFixed(0)} {currencyLabel}</strong>
                          {order.paymentMethod && <span className="text-blue-700"> — عبر {order.paymentMethod.name}</span>}
                        </p>
                        {order.paymentMethod?.details && (
                          <p className="mt-1 text-xs text-blue-600 whitespace-pre-line">{order.paymentMethod.details}</p>
                        )}
                      </div>
                    </div>
                    {order.finalReceiptUrl ? (
                      <div className="flex items-center gap-2 bg-blue-100 rounded-lg px-3 py-2 text-blue-700">
                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                        <span>تم رفع إيصال السداد — بانتظار تأكيد الإدارة وتسليم الصلاحيات.</span>
                        <a href={order.finalReceiptUrl} target="_blank" rel="noopener noreferrer" className="ms-auto text-xs underline underline-offset-2 hover:text-blue-900 shrink-0">
                          <Image className="w-3.5 h-3.5 inline me-0.5" />عرض الإيصال
                        </a>
                      </div>
                    ) : (
                      <FinalReceiptUploader orderId={order.id} />
                    )}
                  </div>
                )}

                {/* Completed: All paid — full access granted */}
                {order.status === "completed" && order.finalPaid && (
                  <div className="px-6 py-3 border-b bg-emerald-50 text-emerald-700 text-sm flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    تم السداد الكامل — جميع الصلاحيات مُسلَّمة.
                  </div>
                )}

                <CardContent className="pt-6 pb-6 px-6">
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                    {/* Details column (takes 2 cols on large screens) */}
                    <div className="lg:col-span-2 space-y-5">
                      <div>
                        <h4 className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                          <Info className="w-4 h-4" />
                          تفاصيل الطلب
                        </h4>
                        <div className="bg-muted/20 p-4 rounded-xl border text-base leading-relaxed whitespace-pre-line break-words">
                          {order.details}
                        </div>
                      </div>
                      {order.notes && (
                        <div>
                          <h4 className="text-sm font-semibold text-muted-foreground mb-2">ملاحظات الإدارة</h4>
                          <div className="bg-secondary/10 p-4 rounded-xl border border-secondary/20 text-base leading-relaxed whitespace-pre-line break-words">
                            {order.notes}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Sidebar */}
                    <div className="space-y-4 bg-muted/10 p-5 rounded-2xl border border-border/50">

                      {/* Package / Budget */}
                      <div>
                        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5 mb-2">
                          <PackageIcon className="w-3.5 h-3.5" />
                          الباقة / الميزانية
                        </h4>
                        {order.package ? (
                          <p className="font-semibold">{order.package.name}</p>
                        ) : (
                          <p className="font-semibold">
                            ميزانية مخصصة: {order.customBudget} {order.currency === "EGP" ? "جنيه 🇪🇬" : "ريال 🇸🇦"}
                          </p>
                        )}
                      </div>

                      {/* Payment Method */}
                      <div className="border-t pt-4">
                        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5 mb-2">
                          <CreditCard className="w-3.5 h-3.5" />
                          طريقة الدفع
                        </h4>
                        {order.paymentMethod ? (
                          <div className="space-y-1">
                            <p className="font-semibold text-sm">{order.paymentMethod.name}</p>
                            {order.paymentMethod.details && (
                              <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line break-words">
                                {order.paymentMethod.details}
                              </p>
                            )}
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">لم يتم التحديد</p>
                        )}
                      </div>

                      {/* Financial Summary */}
                      <div className="border-t pt-4">
                        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">ملخص مالي</h4>
                        <div className="space-y-2 text-sm">
                          {order.couponCode && (
                            <div className="flex justify-between items-center bg-purple-50 rounded-lg px-2 py-1.5">
                              <span className="text-purple-700 flex items-center gap-1 text-xs">
                                🎟 كوبون: <span className="font-mono font-bold">{order.couponCode}</span>
                              </span>
                              {order.discountAmount ? <span className="text-purple-600 font-semibold text-xs">وفّرت {order.discountAmount} {currencyLabel}</span> : null}
                            </div>
                          )}
                          {totalAmount ? (
                            <>
                              <div className="flex justify-between items-center">
                                <span className="text-muted-foreground">إجمالي الطلب</span>
                                <span className="font-bold text-base">{totalAmount} {currencyLabel}</span>
                              </div>
                              {requireDeposit && depositAmount !== null && (
                                <div className="flex justify-between items-center">
                                  <span className="text-muted-foreground">المقدم ({depositPct}%)</span>
                                  <div className="flex items-center gap-2">
                                    <span className="font-semibold">{depositAmount} {currencyLabel}</span>
                                    <Badge variant={order.depositPaid ? "default" : "outline"} className="text-[10px] px-1.5 py-0">
                                      {order.depositPaid ? "✓ مدفوع" : "معلق"}
                                    </Badge>
                                  </div>
                                </div>
                              )}
                              {requireDeposit && remainingAmount !== null && (
                                <div className="flex justify-between items-center">
                                  <span className="text-muted-foreground">المتبقي</span>
                                  <div className="flex items-center gap-2">
                                    <span className="font-semibold">{remainingAmount} {currencyLabel}</span>
                                    <Badge variant={order.finalPaid ? "default" : "outline"} className="text-[10px] px-1.5 py-0">
                                      {order.finalPaid ? "✓ مدفوع" : "معلق"}
                                    </Badge>
                                  </div>
                                </div>
                              )}
                              {!requireDeposit && (
                                <div className="flex justify-between items-center">
                                  <span className="text-muted-foreground">حالة الدفع</span>
                                  <Badge variant={order.finalPaid ? "default" : "outline"} className="text-xs">
                                    {order.finalPaid ? "✓ مدفوع" : "معلق"}
                                  </Badge>
                                </div>
                              )}
                            </>
                          ) : (
                            <>
                              <p className="text-muted-foreground text-xs">لم يُحدد المبلغ بعد — ستصلك رسالة من الإدارة.</p>
                              <div className="flex justify-between items-center">
                                <span className="text-muted-foreground">المقدم ({depositPct}%)</span>
                                <Badge variant={order.depositPaid ? "default" : "outline"} className="text-xs">
                                  {order.depositPaid ? "✓ مدفوع" : "معلق"}
                                </Badge>
                              </div>
                              <div className="flex justify-between items-center">
                                <span className="text-muted-foreground">المتبقي</span>
                                <Badge variant={order.finalPaid ? "default" : "outline"} className="text-xs">
                                  {order.finalPaid ? "✓ مدفوع" : "معلق"}
                                </Badge>
                              </div>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Apply Coupon (only if no coupon applied yet and order not cancelled) */}
                      {!order.couponCode && order.status !== "cancelled" && (
                        <CouponApplier orderId={order.id} onApplied={() => queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() })} />
                      )}

                      {/* Receipt Upload */}
                      {showReceiptUpload && (
                        <div className="border-t pt-4">
                          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5 mb-2">
                            <Image className="w-3.5 h-3.5" />
                            إيصال الدفع
                          </h4>
                          <ReceiptUploader orderId={order.id} />
                        </div>
                      )}
                      {receiptUploaded && order.status === "pending" && (
                        <div className="border-t pt-4">
                          <a href={order.receiptUrl!} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-primary hover:underline">
                            <Image className="w-4 h-4" />
                            عرض الإيصال المرفوع
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
