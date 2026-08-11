import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { useCreateOrder, useListPaymentMethods, getListOrdersQueryKey } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { AlertCircle, CheckCircle2, Info, ArrowLeft, FileCheck, ShieldAlert, ChevronDown, ChevronUp, ExternalLink, CreditCard, Tag } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useSettings } from "@/lib/use-settings";
import { useState } from "react";
import { apiFetch } from "@/lib/api-fetch";

const orderSchema = z.object({
  siteName: z.string().min(2, { message: "اسم الموقع مطلوب" }),
  siteType: z.string().min(1, { message: "يرجى اختيار نوع الموقع" }),
  details: z.string().min(10, { message: "يرجى كتابة تفاصيل كافية عن موقعك" }),
  currency: z.string().min(1, { message: "يرجى اختيار العملة" }),
  paymentMethodId: z.coerce.number().nullable().optional(),
});

function ReceiptStep({
  orderId,
  paymentMethod,
  depositPct,
  currency,
  onDone,
}: {
  orderId: number;
  paymentMethod: any;
  depositPct: number;
  currency: string;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [uploaded, setUploaded] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    transferAccount: "",
    accountName: "",
    transferAmount: "",
  });

  const handleSubmit = async () => {
    const payload = {
      transferAccount: formData.transferAccount.trim(),
      accountName: formData.accountName.trim(),
      transferAmount: formData.transferAmount.trim(),
    };

    if (!payload.transferAccount || !payload.accountName || !payload.transferAmount) {
      toast({ variant: "destructive", title: "البيانات غير مكتملة", description: "يرجى تعبئة كل حقول التحويل قبل الإرسال" });
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await apiFetch(`/api/orders/${orderId}/receipt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
        setUploaded(true);
        toast({ title: "تم إرسال بيانات التحويل بنجاح", description: "سيتم مراجعتها من الإدارة قريباً وبدء التنفيذ" });
      } else {
        const data = await res.json().catch(() => ({}));
        toast({ variant: "destructive", title: "خطأ", description: data.error || "تعذر حفظ بيانات التحويل" });
      }
    } catch {
      toast({ variant: "destructive", title: "خطأ", description: "حدث خطأ في الاتصال، يرجى المحاولة مرة أخرى" });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (uploaded) {
    return (
      <div className="text-center py-10 space-y-4">
        <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto">
          <FileCheck className="w-10 h-10 text-green-600" />
        </div>
        <h3 className="text-2xl font-bold text-green-700">تم إرسال بيانات الدفع بنجاح!</h3>
        <p className="text-muted-foreground max-w-md mx-auto">
          ستقوم الإدارة بمراجعة بيانات التحويل والتأكيد خلال وقت قصير، ثم سيبدأ تنفيذ موقعك.
        </p>
        <Button onClick={onDone} className="mt-4 gap-2">
          متابعة طلباتي
          <ArrowLeft className="w-4 h-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white font-bold text-sm shrink-0">2</div>
        <div>
          <h3 className="font-bold text-lg">بيانات تحويل الدفعة المقدمة</h3>
          <p className="text-sm text-muted-foreground">قم بتحويل المقدم ثم أدخل بيانات التحويل لتأكيد الدفع</p>
        </div>
      </div>

      {paymentMethod && (
        <div className="bg-muted/30 border rounded-xl p-5 space-y-2">
          <p className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">تفاصيل الدفع — {paymentMethod.name}</p>
          <p className="text-base leading-relaxed whitespace-pre-line">{paymentMethod.details}</p>
          <div className="mt-3 pt-3 border-t flex items-center gap-2 text-sm">
            <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
            <span className="text-amber-700">
              قم بتحويل <strong>{depositPct}% كمقدم</strong> بالعملة {currency === "EGP" ? "المصرية" : "السعودية"} ثم أدخل البيانات أدناه
            </span>
          </div>
        </div>
      )}

      {!paymentMethod && (
        <Alert className="bg-amber-50 border-amber-200">
          <AlertCircle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-amber-700">
            قم بتحويل <strong>{depositPct}% كمقدم</strong> عبر أي طريقة دفع متاحة، ثم أدخل تفاصيل التحويل أدناه.
          </AlertDescription>
        </Alert>
      )}

      <div className="space-y-4 pt-2">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label>رقم الجوال أو الحساب</Label>
            <Input
              value={formData.transferAccount}
              onChange={(e) => setFormData((current) => ({ ...current, transferAccount: e.target.value }))}
              placeholder="01000000000"
              className="bg-white"
              dir="ltr"
            />
          </div>
          <div className="space-y-1.5">
            <Label>اسم صاحب الحساب</Label>
            <Input
              value={formData.accountName}
              onChange={(e) => setFormData((current) => ({ ...current, accountName: e.target.value }))}
              placeholder="الاسم الثلاثي"
              className="bg-white"
            />
          </div>
          <div className="space-y-1.5">
            <Label>المبلغ المحول</Label>
            <Input
              value={formData.transferAmount}
              onChange={(e) => setFormData((current) => ({ ...current, transferAmount: e.target.value }))}
              placeholder="مثال: 500"
              className="bg-white"
              dir="ltr"
            />
          </div>
        </div>

        <Button
          type="button"
          className="w-full h-12 text-base gap-2"
          disabled={isSubmitting}
          onClick={handleSubmit}
        >
          <CreditCard className="w-5 h-5" />
          {isSubmitting ? "جاري الإرسال..." : "تأكيد بيانات التحويل"}
        </Button>
      </div>

      <p className="text-center text-sm text-muted-foreground">
        يمكنك إدخال بيانات التحويل لاحقاً من صفحة{" "}
        <button onClick={onDone} className="text-primary underline">طلباتي</button>
      </p>
    </div>
  );
}

export default function Order() {
  const createOrder = useCreateOrder();
  const { data: paymentMethods, isLoading: paymentsLoading } = useListPaymentMethods();
  const { data: settings } = useSettings();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<"form" | "receipt">("form");
  const [createdOrderId, setCreatedOrderId] = useState<number | null>(null);
  const [selectedCurrency, setSelectedCurrency] = useState("EGP");
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [termsOpen, setTermsOpen] = useState(true);
  const [couponInput, setCouponInput] = useState("");
  const [couponStatus, setCouponStatus] = useState<"idle" | "checking" | "valid" | "invalid">("idle");
  const [couponData, setCouponData] = useState<{ discountType: string; discountValue: number; discountAmount: number } | null>(null);
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(null);

  const requireDeposit = settings?.requireDeposit ?? true;
  const depositPct = settings?.depositPercentageValue ?? 50;

  const form = useForm<z.infer<typeof orderSchema>>({
    resolver: zodResolver(orderSchema),
    defaultValues: {
      siteName: "",
      siteType: "",
      details: "",
      currency: "EGP",
      paymentMethodId: null,
    },
  });

  const watchedPaymentMethodId = form.watch("paymentMethodId");
  const watchedCurrency = form.watch("currency");
  const allActivePaymentMethods = paymentMethods?.filter(p => p.isActive) || [];
  const activePaymentMethods = allActivePaymentMethods.filter(
    p => (p as any).currency === watchedCurrency || (p as any).currency === "both" || !(p as any).currency
  );
  const selectedPaymentMethod = activePaymentMethods.find(p => p.id === watchedPaymentMethodId) || null;

  const validateCoupon = async () => {
    if (!couponInput.trim()) return;
    setCouponStatus("checking");
    try {
      const res = await apiFetch("/api/coupons/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: couponInput.trim().toUpperCase() }),
      });
      const data = await res.json();
      if (res.ok && data.valid) {
        setCouponStatus("valid");
        setCouponData({ discountType: data.coupon.discountType, discountValue: data.coupon.discountValue, discountAmount: data.discountAmount });
        setAppliedCoupon(couponInput.trim().toUpperCase());
      } else {
        setCouponStatus("invalid");
        setCouponData(null);
        setAppliedCoupon(null);
        toast({ variant: "destructive", title: data.error || "الكود غير صالح أو غير موجود" });
      }
    } catch {
      setCouponStatus("invalid");
      toast({ variant: "destructive", title: "تعذّر التحقق من الكود، حاول مرة أخرى" });
    }
  };

  function onSubmit(values: z.infer<typeof orderSchema>) {
    setSelectedCurrency(values.currency);
    const dataWithCoupon = appliedCoupon ? { ...values, couponCode: appliedCoupon } : values;
    createOrder.mutate(
      { data: dataWithCoupon as any },
      {
        onSuccess: (data: any) => {
          queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
          const orderId = data?.id ?? data?.order?.id ?? null;
          if (requireDeposit && orderId) {
            setCreatedOrderId(orderId);
            setStep("receipt");
          } else {
            toast({
              title: "تم استلام طلبك بنجاح",
              description: "سيتم التواصل معك قريباً للبدء في التنفيذ.",
            });
            setLocation("/my-orders");
          }
        },
        onError: (error) => {
          toast({
            variant: "destructive",
            title: "حدث خطأ",
            description: (error as any).error?.error || "تعذر إرسال الطلب",
          });
        },
      }
    );
  }

  return (
    <div className="container mx-auto px-4 py-12 max-w-3xl">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-4">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${step === "form" ? "bg-primary text-white" : "bg-green-500 text-white"}`}>
            {step === "form" ? "1" : <CheckCircle2 className="w-4 h-4" />}
          </div>
          <div className="flex-1 h-1 rounded-full bg-muted">
            <div className={`h-full rounded-full bg-primary transition-all duration-500 ${step === "receipt" ? "w-full" : "w-0"}`} />
          </div>
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${step === "receipt" ? "bg-primary text-white" : "bg-muted text-muted-foreground"}`}>
            2
          </div>
        </div>
        <h1 className="text-3xl font-bold text-foreground mb-2">
          {step === "form" ? "طلب موقع جديد" : "تم استلام طلبك!"}
        </h1>
        <p className="text-muted-foreground text-lg">
          {step === "form"
            ? "أخبرنا عن موقعك وسنتواصل معك لتحديد الباقة والسعر المناسب."
            : "الخطوة الأخيرة: ادفع المقدم وأدخل بيانات التحويل لبدء التنفيذ فوراً."}
        </p>
      </div>

      {step === "form" && (
        <Alert className="mb-6 bg-blue-50 border-blue-200 text-blue-800">
          <Info className="h-5 w-5 text-blue-600" />
          <AlertTitle className="font-bold mb-1">كيف تسير العملية؟</AlertTitle>
          <AlertDescription className="space-y-1 text-sm">
            <p>١. أرسل طلبك بتفاصيل موقعك.</p>
            {requireDeposit
              ? <p>٢. يتم دفع <strong>{depositPct}% كمقدم</strong> للبدء، و<strong>{100 - depositPct}% المتبقية</strong> عند التسليم.</p>
              : <p>٢. سيتواصل معك فريقنا خلال 24 ساعة لتحديد الباقة والسعر.</p>}
            <p>٣. يبدأ التنفيذ بعد تأكيد الدفع والتسليم عند الاكتمال.</p>
          </AlertDescription>
        </Alert>
      )}

      <Card className="shadow-lg border-t-4 border-t-primary">
        <CardContent className="pt-8">

              {step === "receipt" && createdOrderId && (
            <div className="text-center py-10 space-y-5">
              <div className="w-20 h-20 rounded-full bg-blue-100 flex items-center justify-center mx-auto">
                <FileCheck className="w-10 h-10 text-blue-600" />
              </div>
              <h3 className="text-2xl font-bold text-blue-700">تم استلام طلبك بنجاح!</h3>
              <p className="text-muted-foreground max-w-md mx-auto leading-relaxed">
                سيقوم فريقنا بمراجعة طلبك وتحديد السعر والمبلغ المطلوب دفعه كمقدم.
                <br />
                ستجد تفاصيل الدفع وخانة إدخال بيانات التحويل في صفحة <strong>طلباتي</strong> قريباً.
              </p>
              <Button onClick={() => setLocation("/my-orders")} className="mt-2 gap-2">
                متابعة طلباتي
                <ArrowLeft className="w-4 h-4" />
              </Button>
            </div>
          )}

          {step === "form" && (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">

                <div className="space-y-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">1</div>
                    <h3 className="text-xl font-semibold">معلومات الموقع</h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField
                      control={form.control}
                      name="siteName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-base">الاسم المقترح للموقع</FormLabel>
                          <FormControl>
                            <Input placeholder="مثال: متجر الأناقة" {...field} className="h-12" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="siteType"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-base">نوع الموقع</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger className="h-12">
                                <SelectValue placeholder="اختر نوع الموقع" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="شركة">موقع تعريفي لشركة</SelectItem>
                              <SelectItem value="متجر إلكتروني">متجر إلكتروني</SelectItem>
                              <SelectItem value="موقع شخصي">موقع شخصي / سيرة ذاتية</SelectItem>
                              <SelectItem value="موقع تعليمي">منصة تعليمية</SelectItem>
                              <SelectItem value="موقع طبي">عيادة / مركز طبي</SelectItem>
                              <SelectItem value="أخرى">أخرى</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="details"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-base">تفاصيل ومتطلبات الموقع</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="اشرح لنا الفكرة والصفحات المطلوبة وأي تفضيلات خاصة (ألوان، تصميم، مميزات...)&#10;كلما كانت التفاصيل أكثر، كلما كان التنفيذ أدق."
                            className="min-h-[140px] resize-y"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="space-y-4 pt-2">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">2</div>
                    <h3 className="text-xl font-semibold">تفضيلات الدفع</h3>
                  </div>

                  <FormField
                    control={form.control}
                    name="currency"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-base">العملة المفضلة للدفع</FormLabel>
                        <Select
                          onValueChange={(val) => {
                            field.onChange(val);
                            form.setValue("paymentMethodId", null);
                          }}
                          defaultValue={field.value}
                        >
                          <FormControl>
                            <SelectTrigger className="h-12 max-w-xs">
                              <SelectValue placeholder="اختر العملة" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="EGP">جنيه مصري 🇪🇬</SelectItem>
                            <SelectItem value="SAR">ريال سعودي 🇸🇦</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="paymentMethodId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-base">
                          طريقة الدفع {requireDeposit ? <span className="text-amber-600">(مطلوبة للمقدم)</span> : "(اختياري)"}
                          {watchedCurrency && <span className="text-xs text-muted-foreground ms-2">— حسابات {watchedCurrency === "EGP" ? "🇪🇬 مصر" : "🇸🇦 السعودية"}</span>}
                        </FormLabel>
                        {!paymentsLoading && activePaymentMethods.length === 0 ? (
                          <div className="h-12 flex items-center px-4 rounded-xl border border-dashed text-sm text-muted-foreground bg-muted/20">
                            لا توجد طرق دفع متاحة لهذه العملة حالياً
                          </div>
                        ) : (
                          <Select
                            onValueChange={(val) => field.onChange(val ? Number(val) : null)}
                            value={field.value ? field.value.toString() : ""}
                          >
                            <FormControl>
                              <SelectTrigger className="h-12">
                                <SelectValue placeholder="اختر طريقة الدفع" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {activePaymentMethods.map(p => (
                                <SelectItem key={p.id} value={p.id.toString()}>
                                  {p.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {selectedPaymentMethod && (
                    <div className="p-4 bg-muted rounded-xl text-sm border space-y-2">
                      <p className="font-semibold text-foreground">تفاصيل الدفع — {selectedPaymentMethod.name}</p>
                      <p className="text-muted-foreground whitespace-pre-line leading-relaxed">{selectedPaymentMethod.details}</p>
                      {requireDeposit && (
                        <div className="flex items-center gap-2 pt-2 border-t text-amber-700 bg-amber-50 -mx-4 -mb-4 px-4 py-2 rounded-b-xl">
                          <AlertCircle className="w-4 h-4 shrink-0" />
                          <span>بعد إرسال الطلب، ستُطلب منك الدفع عبر هذه الطريقة وإدخال بيانات التحويل لبدء التنفيذ.</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {!requireDeposit && (
                  <Alert className="bg-amber-50 border-amber-200">
                    <AlertCircle className="h-5 w-5 text-amber-600" />
                    <AlertTitle className="text-amber-800 font-bold">ملاحظة</AlertTitle>
                    <AlertDescription className="text-amber-700">
                      سيقوم فريقنا بتحديد الباقة والسعر المناسب بناءً على متطلباتك والتواصل معك خلال 24 ساعة.
                    </AlertDescription>
                  </Alert>
                )}

                <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 flex gap-3 items-start text-sm text-amber-800">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-amber-500" />
                  <span>
                    <strong>ملاحظة:</strong> بعد إرسال الطلب، سيقوم فريقنا بقراءة التفاصيل وتحديد المبلغ المطلوب للدفع، وسيتم التواصل معك قريباً.
                  </span>
                </div>

                {/* Coupon code */}
                <div className="rounded-xl bg-muted/20 border px-4 py-4 space-y-3">
                  <p className="text-sm font-semibold flex items-center gap-2">
                    <FileCheck className="w-4 h-4 text-primary" />
                    كود خصم (اختياري)
                  </p>
                  {couponStatus === "valid" && appliedCoupon ? (
                    <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-xl px-4 py-3">
                      <div className="flex items-center gap-2 text-green-700 text-sm font-medium">
                        <CheckCircle2 className="w-4 h-4" />
                        تم تطبيق الكود: <span className="font-mono font-bold">{appliedCoupon}</span>
                        {couponData && (
                          <span className="text-xs text-green-600">
                            — {couponData.discountType === "percentage" ? `خصم ${couponData.discountValue}%` : `خصم ${couponData.discountValue} ثابت`}
                          </span>
                        )}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-red-500 hover:text-red-700 h-7 text-xs"
                        onClick={() => { setAppliedCoupon(null); setCouponStatus("idle"); setCouponInput(""); setCouponData(null); }}
                      >
                        إزالة
                      </Button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <Input
                        value={couponInput}
                        onChange={e => { setCouponInput(e.target.value.toUpperCase()); if (couponStatus !== "idle") setCouponStatus("idle"); }}
                        placeholder="أدخل كود الخصم"
                        dir="ltr"
                        className="font-mono tracking-widest uppercase flex-1"
                        onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); validateCoupon(); } }}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={validateCoupon}
                        disabled={!couponInput.trim() || couponStatus === "checking"}
                        className="shrink-0"
                      >
                        {couponStatus === "checking" ? "جاري التحقق..." : "تطبيق"}
                      </Button>
                    </div>
                  )}
                </div>

                {/* Terms & Conditions */}
                <div className="rounded-xl bg-red-50 border border-red-200 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setTermsOpen(o => !o)}
                    className="w-full flex items-center justify-between gap-2 px-4 py-3 text-sm text-red-800 hover:bg-red-100/50 transition-colors"
                  >
                    <span className="flex items-center gap-2 font-semibold">
                      <ShieldAlert className="w-4 h-4 shrink-0 text-red-500" />
                      الشروط والأحكام
                    </span>
                    {termsOpen ? <ChevronUp className="w-4 h-4 text-red-400" /> : <ChevronDown className="w-4 h-4 text-red-400" />}
                  </button>

                  {termsOpen && (
                    <div className="px-4 pb-4 space-y-3">
                      <ul className="list-disc list-inside space-y-1 text-xs text-red-700">
                        <li>
                          يُدفع مقدّم بنسبة <strong>{depositPct}%</strong> من قيمة الطلب — وهو <strong>غير قابل للاسترداد</strong> بعد بدء التنفيذ.
                        </li>
                        <li>
                          المبلغ المتبقي (<strong>{100 - depositPct}%</strong>) يُسدَّد عند الانتهاء من الموقع وقبل استلام الصلاحيات الكاملة.
                        </li>
                        <li>بإرسالك للطلب فأنت توافق على هذه الشروط.</li>
                      </ul>
                      <a
                        href="/terms"
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => setTermsOpen(false)}
                        className="inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-800 underline underline-offset-2"
                      >
                        <ExternalLink className="w-3 h-3" />
                        اقرأ الشروط والأحكام كاملة
                      </a>
                    </div>
                  )}

                  <div className="flex items-center gap-2.5 px-4 py-3 border-t border-red-200/60">
                    <Checkbox
                      id="terms"
                      checked={agreedToTerms}
                      onCheckedChange={(v) => {
                        setAgreedToTerms(!!v);
                        if (v) setTermsOpen(false);
                      }}
                    />
                    <Label htmlFor="terms" className="text-sm font-medium cursor-pointer select-none text-red-800">
                      قرأت الشروط والأحكام وأوافق عليها
                    </Label>
                  </div>
                </div>

                <div className="pt-4 border-t flex justify-end">
                  <Button type="submit" size="lg" className="h-14 px-12 text-lg gap-2" disabled={createOrder.isPending || !agreedToTerms}>
                    <CheckCircle2 className="h-5 w-5" />
                    {createOrder.isPending ? "جاري الإرسال..." : requireDeposit ? "إرسال الطلب والانتقال للدفع" : "إرسال الطلب"}
                  </Button>
                </div>
              </form>
            </Form>
          )}

        </CardContent>
      </Card>
    </div>
  );
}