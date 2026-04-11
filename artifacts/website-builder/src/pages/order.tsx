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
import { AlertCircle, CheckCircle2, Info } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const orderSchema = z.object({
  siteName: z.string().min(2, { message: "اسم الموقع مطلوب" }),
  siteType: z.string().min(1, { message: "يرجى اختيار نوع الموقع" }),
  details: z.string().min(10, { message: "يرجى كتابة تفاصيل كافية عن موقعك" }),
  currency: z.string().min(1, { message: "يرجى اختيار العملة" }),
  paymentMethodId: z.coerce.number().nullable().optional(),
});

export default function Order() {
  const createOrder = useCreateOrder();
  const { data: paymentMethods, isLoading: paymentsLoading } = useListPaymentMethods();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const activePaymentMethods = paymentMethods?.filter(p => p.isActive) || [];

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

  function onSubmit(values: z.infer<typeof orderSchema>) {
    createOrder.mutate(
      { data: values },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
          toast({
            title: "تم استلام طلبك بنجاح",
            description: "سيتم التواصل معك قريباً لتحديد الباقة المناسبة والبدء في التنفيذ.",
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
    <div className="container mx-auto px-4 py-12 max-w-3xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2">طلب موقع جديد</h1>
        <p className="text-muted-foreground text-lg">
          أخبرنا عن موقعك وسنتواصل معك لتحديد الباقة والسعر المناسب.
        </p>
      </div>

      <Alert className="mb-6 bg-blue-50 border-blue-200 text-blue-800">
        <Info className="h-5 w-5 text-blue-600" />
        <AlertTitle className="font-bold mb-1">كيف تسير العملية؟</AlertTitle>
        <AlertDescription className="space-y-1 text-sm">
          <p>بعد إرسال طلبك، سيقوم فريقنا بمراجعته وتحديد الباقة والسعر المناسب ثم التواصل معك.</p>
          <p>يتم دفع <strong>50% كمقدم</strong> للبدء، و50% المتبقية عند التسليم.</p>
        </AlertDescription>
      </Alert>

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
                <h3 className="text-xl font-semibold border-b pb-2">تفضيلات الدفع</h3>

                <FormField
                  control={form.control}
                  name="currency"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-base">العملة المفضلة للدفع</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
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
                      <FormLabel className="text-base">طريقة الدفع المفضلة (اختياري)</FormLabel>
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
                  <div className="p-4 bg-muted rounded-lg text-sm whitespace-pre-line text-muted-foreground border">
                    <p className="font-semibold text-foreground mb-1">تفاصيل الدفع:</p>
                    {activePaymentMethods.find(p => p.id === form.watch("paymentMethodId"))?.details}
                  </div>
                )}
              </div>

              <Alert className="bg-amber-50 border-amber-200">
                <AlertCircle className="h-5 w-5 text-amber-600" />
                <AlertTitle className="text-amber-800 font-bold">ملاحظة</AlertTitle>
                <AlertDescription className="text-amber-700">
                  سيقوم فريقنا بتحديد الباقة والسعر المناسب بناءً على متطلباتك والتواصل معك خلال 24 ساعة.
                </AlertDescription>
              </Alert>

              <div className="pt-4 border-t flex justify-end">
                <Button type="submit" size="lg" className="h-14 px-12 text-lg" disabled={createOrder.isPending}>
                  <CheckCircle2 className="ms-2 h-5 w-5" />
                  {createOrder.isPending ? "جاري الإرسال..." : "إرسال الطلب"}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
