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
import { AlertCircle, CheckCircle2, Info, Upload, ArrowLeft, FileCheck, ShieldAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useSettings } from "@/lib/use-settings";
import { useReceiptUpload } from "@/lib/use-receipt-upload";
import { useRef, useState } from "react";

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
  const { uploadFile, isUploading, error } = useReceiptUpload();
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [uploaded, setUploaded] = useState(false);

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
      credentials: "include",
    });

    if (res.ok) {
      queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
      setUploaded(true);
      toast({ title: "تم رفع الإيصال بنجاح", description: "سيتم مراجعته من الإدارة قريباً وبدء التنفيذ" });
    } else {
      toast({ variant: "destructive", title: "خطأ", description: "تعذر حفظ الإيصال" });
    }
    if (inputRef.current) inputRef.current.value = "";
  };

  if (uploaded) {
    return (
      <div className="text-center py-10 space-y-4">
        <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto">
          <FileCheck className="w-10 h-10 text-green-600" />
        </div>
        <h3 className="text-2xl font-bold text-green-700">تم رفع الإيصال بنجاح!</h3>
        <p className="text-muted-foreground max-w-md mx-auto">
          ستقوم الإدارة بمراجعة الإيصال والتأكيد خلال وقت قصير، ثم سيبدأ تنفيذ موقعك.
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
          <h3 className="font-bold text-lg">رفع إيصال الدفع</h3>
          <p className="text-sm text-muted-foreground">ادفع المقدم وارفع الإيصال لبدء التنفيذ</p>
        </div>
      </div>

      {paymentMethod && (
        <div className="bg-muted/30 border rounded-xl p-5 space-y-2">
          <p className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">تفاصيل الدفع — {paymentMethod.name}</p>
          <p className="text-base leading-relaxed whitespace-pre-line">{paymentMethod.details}</p>
          <div className="mt-3 pt-3 border-t flex items-center gap-2 text-sm">
            <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
            <span className="text-amber-700">
              ادفع <strong>{depositPct}% كمقدم</strong> بالعملة {currency === "EGP" ? "المصرية" : "السعودية"} ثم ارفع الإيصال هنا
            </span>
          </div>
        </div>
      )}

      {!paymentMethod && (
        <Alert className="bg-amber-50 border-amber-200">
          <AlertCircle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-amber-700">
            ادفع <strong>{depositPct}% كمقدم</strong> عبر أي طريقة دفع متاحة، ثم ارفع إيصال الدفع هنا.
          </AlertDescription>
        </Alert>
      )}

      <input ref={inputRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={handleFile} />
      <Button
        className="w-full h-14 text-base gap-2"
        disabled={isUploading}
        onClick={() => inputRef.current?.click()}
      >
        <Upload className="w-5 h-5" />
        {isUploading ? "جاري الرفع..." : "اختر إيصال الدفع وارفعه"}
      </Button>
      {error && <p className="text-sm text-destructive text-center">{error}</p>}

      <p className="text-center text-sm text-muted-foreground">
        يمكنك رفع الإيصال لاحقاً من صفحة{" "}
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

  function onSubmit(values: z.infer<typeof orderSchema>) {
    setSelectedCurrency(values.currency);
    createOrder.mutate(
      { data: values },
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
            : "الخطوة الأخيرة: ادفع المقدم وارفع الإيصال لبدء التنفيذ فوراً."}
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
            <ReceiptStep
              orderId={createdOrderId}
              paymentMethod={selectedPaymentMethod}
              depositPct={depositPct}
              currency={selectedCurrency}
              onDone={() => setLocation("/my-orders")}
            />
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
                          <span>بعد إرسال الطلب، ستُطلب منك الدفع عبر هذه الطريقة ورفع الإيصال لبدء التنفيذ.</span>
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

                {/* Terms & Conditions */}
                <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-4 space-y-3">
                  <div className="flex gap-2 items-start text-sm text-red-800">
                    <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0 text-red-500" />
                    <div className="space-y-1">
                      <p className="font-semibold">يُرجى قراءة الشروط والأحكام قبل الإرسال:</p>
                      <ul className="list-disc list-inside space-y-0.5 text-xs text-red-700">
                        <li>
                          يُدفع مقدّم بنسبة <strong>{depositPct}%</strong> من قيمة الطلب — وهو <strong>غير قابل للاسترداد</strong> بعد بدء التنفيذ.
                        </li>
                        <li>
                          المبلغ المتبقي (<strong>{100 - depositPct}%</strong>) يُسدَّد عند الانتهاء من الموقع وقبل استلام الصلاحيات الكاملة.
                        </li>
                        <li>بإرسالك للطلب فأنت توافق على هذه الشروط.</li>
                      </ul>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <Checkbox
                      id="terms"
                      checked={agreedToTerms}
                      onCheckedChange={(v) => setAgreedToTerms(!!v)}
                    />
                    <Label htmlFor="terms" className="text-sm font-medium cursor-pointer select-none">
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
