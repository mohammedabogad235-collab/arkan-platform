import { useAuth } from "@/lib/auth";
import { useListOrders, getListOrdersQueryKey } from "@workspace/api-client-react";
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
import { CalendarDays, Package as PackageIcon, CreditCard, Upload, CheckCircle2, Image, AlertCircle, XCircle, Hash, Info, ExternalLink, PartyPopper, Lock } from "lucide-react";
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
        <Button variant="outline" size="sm" className="text-destructive border-destructive/30 hover:bg-destructive/5">
          <XCircle className="w-4 h-4 me-2" />
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

export default function MyOrders() {
  const { user } = useAuth();
  const { data: orders, isLoading } = useListOrders({ userId: user?.id });
  const { data: settings } = useSettings();

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

            const showReceiptUpload = requireDeposit && order.status === "pending" && !order.receiptUrl;
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
                {requireDeposit && order.status === "pending" && (
                  <div className={`px-6 py-3 border-b text-sm flex items-start gap-3 ${receiptUploaded ? "bg-green-50 text-green-800" : "bg-amber-50 text-amber-800"}`}>
                    {receiptUploaded ? (
                      <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                    )}
                    <span>
                      {receiptUploaded
                        ? "تم رفع إيصال الدفع — بانتظار تأكيد الإدارة لبدء التنفيذ."
                        : depositAmount
                          ? `يُطلب منك دفع مقدّم ${depositPct}% (${depositAmount} ${currencyLabel}) من قيمة الطلب ثم رفع الإيصال لبدء التنفيذ.`
                          : `يُطلب منك دفع مقدّم ${depositPct}% من قيمة الطلب ثم رفع الإيصال لبدء التنفيذ.`}
                    </span>
                  </div>
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

                {/* Completed: Remaining payment notice */}
                {order.status === "completed" && !order.finalPaid && remainingAmount !== null && (
                  <div className="px-6 py-4 border-b bg-blue-50 border-blue-100 flex items-start gap-3 text-sm text-blue-800">
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
