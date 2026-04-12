import { useAuth } from "@/lib/auth";
import { useListOrders, getListOrdersQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CalendarDays, Package as PackageIcon, CreditCard, Upload, CheckCircle2, Image, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { useReceiptUpload } from "@/lib/use-receipt-upload";
import { useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useSettings } from "@/lib/use-settings";

const statusMap: Record<string, { label: string, variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "قيد الانتظار", variant: "outline" },
  in_progress: { label: "جاري التنفيذ", variant: "default" },
  completed: { label: "مكتمل", variant: "secondary" },
  cancelled: { label: "ملغي", variant: "destructive" },
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
        <div className="space-y-6">
          {orders.map((order) => {
            const requireDeposit = settings?.requireDeposit ?? true;
            const depositPct = settings?.depositPercentageValue ?? 50;
            const showReceiptUpload = requireDeposit && order.status === "pending" && !order.receiptUrl;
            const receiptUploaded = !!order.receiptUrl;

            return (
              <Card key={order.id} className="overflow-hidden hover:shadow-md transition-shadow">
                <CardHeader className="bg-muted/30 border-b flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4">
                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      <CardTitle className="text-xl">{order.siteName}</CardTitle>
                      <Badge variant={statusMap[order.status]?.variant || "outline"} className="text-sm px-3">
                        {statusMap[order.status]?.label || order.status}
                      </Badge>
                    </div>
                    <CardDescription className="text-base flex items-center gap-2">
                      <CalendarDays className="w-4 h-4" />
                      {format(new Date(order.createdAt), "dd MMMM yyyy", { locale: ar })}
                    </CardDescription>
                  </div>
                  <div className="text-left sm:text-right w-full sm:w-auto flex flex-col gap-1">
                    <span className="text-sm text-muted-foreground">نوع الموقع</span>
                    <span className="font-semibold">{order.siteType}</span>
                  </div>
                </CardHeader>

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
                        : `يُطلب منك دفع مقدّم ${depositPct}% من قيمة الطلب ثم رفع الإيصال لبدء التنفيذ.`}
                    </span>
                  </div>
                )}

                <CardContent className="pt-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="col-span-2 space-y-4">
                      <div>
                        <h4 className="text-sm font-semibold text-muted-foreground mb-1">التفاصيل</h4>
                        <p className="text-base leading-relaxed whitespace-pre-line bg-muted/20 p-4 rounded-lg border">
                          {order.details}
                        </p>
                      </div>
                      {order.notes && (
                        <div>
                          <h4 className="text-sm font-semibold text-muted-foreground mb-1">ملاحظات الإدارة</h4>
                          <p className="text-base leading-relaxed whitespace-pre-line bg-secondary/10 p-4 rounded-lg border border-secondary/20">
                            {order.notes}
                          </p>
                        </div>
                      )}
                    </div>
                    <div className="space-y-4 bg-muted/10 p-4 rounded-xl border border-border/50">
                      <div>
                        <h4 className="text-sm font-semibold text-muted-foreground flex items-center gap-2 mb-2">
                          <PackageIcon className="w-4 h-4" />
                          الباقة / الميزانية
                        </h4>
                        {order.package ? (
                          <p className="font-semibold">{order.package.name}</p>
                        ) : (
                          <p className="font-semibold">
                            ميزانية مخصصة: {order.customBudget} {order.currency === 'EGP' ? 'جنيه 🇪🇬' : 'ريال 🇸🇦'}
                          </p>
                        )}
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-muted-foreground flex items-center gap-2 mb-2">
                          <CreditCard className="w-4 h-4" />
                          طريقة الدفع
                        </h4>
                        <p className="font-semibold">{order.paymentMethod?.name || "لم يتم التحديد"}</p>
                      </div>
                      <div className="pt-3 border-t">
                        <h4 className="text-sm font-semibold text-muted-foreground mb-3">حالة الدفع</h4>
                        <div className="space-y-2">
                          {requireDeposit && (
                            <div className="flex justify-between items-center">
                              <span className="text-sm">المقدم ({depositPct}%)</span>
                              <Badge variant={order.depositPaid ? "default" : "outline"} className="text-xs">
                                {order.depositPaid ? "✓ تم الدفع" : "بانتظار الدفع"}
                              </Badge>
                            </div>
                          )}
                          <div className="flex justify-between items-center">
                            <span className="text-sm">المتبقي</span>
                            <Badge variant={order.finalPaid ? "default" : "outline"} className="text-xs">
                              {order.finalPaid ? "✓ تم الدفع" : "بانتظار الدفع"}
                            </Badge>
                          </div>
                        </div>
                      </div>
                      {showReceiptUpload && (
                        <div className="pt-3 border-t">
                          <h4 className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-2">
                            <Image className="w-4 h-4" />
                            إيصال الدفع
                          </h4>
                          <ReceiptUploader orderId={order.id} />
                        </div>
                      )}
                      {receiptUploaded && order.status === "pending" && (
                        <div className="pt-3 border-t">
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
      )}
    </div>
  );
}
