import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { useCreateOrder, useListPackages, useListPaymentMethods, getListOrdersQueryKey } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const orderSchema = z.object({
  siteName: z.string().min(2, { message: "اسم الموقع مطلوب" }),
  siteType: z.string().min(1, { message: "يرجى اختيار نوع الموقع" }),
  details: z.string().min(10, { message: "يرجى كتابة تفاصيل كافية عن موقعك" }),
  packageId: z.coerce.number().nullable().optional(),
  customBudget: z.coerce.number().nullable().optional(),
  currency: z.string().min(1, { message: "يرجى اختيار العملة" }),
  paymentMethodId: z.coerce.number().nullable().optional(),
}).refine(data => data.packageId || data.customBudget, {
  message: "يجب اختيار باقة أو تحديد ميزانية مخصصة",
  path: ["packageId"],
});

export default function Order() {
  const createOrder = useCreateOrder();
  const { data: packages, isLoading: packagesLoading } = useListPackages();
  const { data: paymentMethods, isLoading: paymentsLoading } = useListPaymentMethods();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const activePackages = packages?.filter(p => p.isActive) || [];
  const activePaymentMethods = paymentMethods?.filter(p => p.isActive) || [];

  const form = useForm<z.infer<typeof orderSchema>>({
    resolver: zodResolver(orderSchema),
    defaultValues: {
      siteName: "",
      siteType: "",
      details: "",
      packageId: null,
      customBudget: null,
      currency: "EGP",
      paymentMethodId: null,
    },
  });

  const currency = form.watch("currency");
  const selectedPackageId = form.watch("packageId");
  const selectedPackage = activePackages.find(p => p.id === selectedPackageId);

  function onSubmit(values: z.infer<typeof orderSchema>) {
    createOrder.mutate(
      { data: values },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
          toast({
            title: "تم استلام طلبك بنجاح",
            description: "سيتم التواصل معك قريباً للبدء في التنفيذ.",
          });
          setLocation("/my-orders");
        },
        onError: (error) => {
          toast({
            variant: "destructive",
            title: "حدث خطأ",
            description: error.error?.error || "تعذر إرسال الطلب",
          });
        },
      }
    );
  }

  return (
    <div className="container mx-auto px-4 py-12 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2">طلب موقع جديد</h1>
        <p className="text-muted-foreground text-lg">املأ البيانات التالية لنبدأ رحلة تصميم موقعك معاً.</p>
      </div>

      <Card className="shadow-lg border-t-4 border-t-primary">
        <CardContent className="pt-8">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
              
              <div className="space-y-4">
                <h3 className="text-xl font-semibold border-b pb-2">معلومات الموقع</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
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
                      <FormLabel className="text-base">تفاصيل ومميزات الموقع المطلوبة</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="اشرح لنا الفكرة، الصفحات المطلوبة، وأي ألوان أو تصاميم تفضلها..." 
                          className="min-h-[120px] resize-y" 
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="space-y-4 pt-4">
                <h3 className="text-xl font-semibold border-b pb-2">التسعير والباقات</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
                  <FormField
                    control={form.control}
                    name="currency"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-base">العملة المفضلة للدفع</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger className="h-12">
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
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="packageId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-base">اختر الباقة (اختياري)</FormLabel>
                        <Select 
                          onValueChange={(val) => {
                            field.onChange(val ? Number(val) : null);
                            if (val) form.setValue("customBudget", null);
                          }} 
                          value={field.value ? field.value.toString() : ""}
                        >
                          <FormControl>
                            <SelectTrigger className="h-12">
                              <SelectValue placeholder="اختر باقة جاهزة" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {!packagesLoading && activePackages.map(p => (
                              <SelectItem key={p.id} value={p.id.toString()}>
                                {p.name} - {currency === 'EGP' ? `${p.priceEgp} جنيه` : `${p.priceSar} ريال`}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormDescription>اختر إحدى باقاتنا المصممة مسبقاً</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="customBudget"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-base">أو حدد ميزانيتك التقديرية</FormLabel>
                        <FormControl>
                          <Input 
                            type="number" 
                            placeholder="مثال: 5000" 
                            className="h-12"
                            value={field.value || ""}
                            onChange={(e) => {
                              const val = e.target.value ? Number(e.target.value) : null;
                              field.onChange(val);
                              if (val) form.setValue("packageId", null);
                            }}
                          />
                        </FormControl>
                        <FormDescription>إذا كان طلبك خاصاً ولا يناسب الباقات</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              <div className="space-y-4 pt-4">
                <h3 className="text-xl font-semibold border-b pb-2">طريقة الدفع</h3>
                
                <Alert className="bg-primary/5 border-primary text-primary mb-6">
                  <AlertCircle className="h-5 w-5" />
                  <AlertTitle className="text-lg mb-1 font-bold">ملاحظة هامة حول الدفع</AlertTitle>
                  <AlertDescription className="text-base">
                    يتم دفع <strong>50% كمقدم</strong> للبدء في العمل، والـ 50% المتبقية بعد الانتهاء وتسليم الموقع.
                  </AlertDescription>
                </Alert>

                <FormField
                  control={form.control}
                  name="paymentMethodId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-base">طريقة الدفع المناسبة لك</FormLabel>
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
                          {!paymentsLoading && activePaymentMethods.map(p => (
                            <SelectItem key={p.id} value={p.id.toString()}>
                              {p.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {form.watch("paymentMethodId") && (
                  <div className="p-4 bg-muted rounded-lg text-sm whitespace-pre-line text-muted-foreground mt-2 border">
                    {activePaymentMethods.find(p => p.id === form.watch("paymentMethodId"))?.details}
                  </div>
                )}
              </div>

              <div className="pt-6 border-t flex justify-end">
                <Button type="submit" size="lg" className="h-14 px-12 text-lg" disabled={createOrder.isPending}>
                  <CheckCircle2 className="mr-2 h-5 w-5" />
                  {createOrder.isPending ? "جاري الإرسال..." : "تأكيد وإرسال الطلب"}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
