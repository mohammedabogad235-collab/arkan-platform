import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { Eye, EyeOff, Phone, Lock, CheckCircle } from "lucide-react";

const phoneSchema = z.object({
  phone: z.string().min(10, { message: "أدخل رقم جوال صحيح" }),
});

const resetSchema = z.object({
  newPassword: z.string().min(6, { message: "كلمة المرور يجب أن تكون 6 أحرف على الأقل" }),
  confirmPassword: z.string().min(6, { message: "تأكيد كلمة المرور مطلوب" }),
}).refine(d => d.newPassword === d.confirmPassword, {
  message: "كلمتا المرور غير متطابقتين",
  path: ["confirmPassword"],
});

export default function ForgotPassword() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [step, setStep] = useState<"phone" | "reset" | "done">("phone");
  const [phone, setPhone] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);

  const phoneForm = useForm<z.infer<typeof phoneSchema>>({
    resolver: zodResolver(phoneSchema),
    defaultValues: { phone: "" },
  });

  const resetForm = useForm<z.infer<typeof resetSchema>>({
    resolver: zodResolver(resetSchema),
    defaultValues: { newPassword: "", confirmPassword: "" },
  });

  async function onVerifyPhone(values: z.infer<typeof phoneSchema>) {
    setLoading(true);
    try {
      const res = await fetch("/api/auth/verify-phone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: values.phone }),
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ variant: "destructive", title: "خطأ", description: data.error });
        return;
      }
      setPhone(values.phone);
      setStep("reset");
    } catch {
      toast({ variant: "destructive", title: "خطأ", description: "حدث خطأ، حاول مجدداً" });
    } finally {
      setLoading(false);
    }
  }

  async function onResetPassword(values: z.infer<typeof resetSchema>) {
    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password-by-phone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, newPassword: values.newPassword }),
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ variant: "destructive", title: "خطأ", description: data.error });
        return;
      }
      setStep("done");
    } catch {
      toast({ variant: "destructive", title: "خطأ", description: "حدث خطأ، حاول مجدداً" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex-1 flex items-center justify-center p-4 bg-muted/30">
      <Card className="w-full max-w-md shadow-xl border-none">

        {/* ── Step 1: Phone ── */}
        {step === "phone" && (
          <>
            <CardHeader className="space-y-2 text-center">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-2">
                <Phone className="w-6 h-6 text-primary" />
              </div>
              <CardTitle className="text-2xl">نسيت كلمة المرور؟</CardTitle>
              <CardDescription>أدخل رقم جوالك المسجّل وسنساعدك في إعادة تعيين كلمة المرور</CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...phoneForm}>
                <form onSubmit={phoneForm.handleSubmit(onVerifyPhone)} className="space-y-5">
                  <FormField
                    control={phoneForm.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>رقم الجوال</FormLabel>
                        <FormControl>
                          <Input placeholder="01xxxxxxxxx" {...field} className="h-12 text-lg" dir="ltr" type="tel" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button type="submit" className="w-full h-12 text-lg" disabled={loading}>
                    {loading ? "جاري التحقق..." : "التالي"}
                  </Button>
                </form>
              </Form>
            </CardContent>
            <CardFooter className="flex justify-center border-t pt-6">
              <p className="text-sm text-muted-foreground">
                تذكرت كلمة المرور؟{" "}
                <Link href="/login" className="text-primary font-semibold hover:underline">تسجيل الدخول</Link>
              </p>
            </CardFooter>
          </>
        )}

        {/* ── Step 2: New Password ── */}
        {step === "reset" && (
          <>
            <CardHeader className="space-y-2 text-center">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-2">
                <Lock className="w-6 h-6 text-primary" />
              </div>
              <CardTitle className="text-2xl">تعيين كلمة مرور جديدة</CardTitle>
              <CardDescription>اختر كلمة مرور جديدة لحسابك</CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...resetForm}>
                <form onSubmit={resetForm.handleSubmit(onResetPassword)} className="space-y-5">
                  <FormField
                    control={resetForm.control}
                    name="newPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>كلمة المرور الجديدة</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Input
                              type={showPassword ? "text" : "password"}
                              placeholder="أدخل كلمة المرور الجديدة"
                              {...field}
                              className="h-12 text-lg pe-12"
                              dir="ltr"
                            />
                            <button type="button" onClick={() => setShowPassword(!showPassword)}
                              className="absolute inset-y-0 end-0 flex items-center pe-3 text-muted-foreground hover:text-foreground"
                              tabIndex={-1}>
                              {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                            </button>
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={resetForm.control}
                    name="confirmPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>تأكيد كلمة المرور</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Input
                              type={showConfirm ? "text" : "password"}
                              placeholder="أعد إدخال كلمة المرور"
                              {...field}
                              className="h-12 text-lg pe-12"
                              dir="ltr"
                            />
                            <button type="button" onClick={() => setShowConfirm(!showConfirm)}
                              className="absolute inset-y-0 end-0 flex items-center pe-3 text-muted-foreground hover:text-foreground"
                              tabIndex={-1}>
                              {showConfirm ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                            </button>
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button type="submit" className="w-full h-12 text-lg" disabled={loading}>
                    {loading ? "جاري الحفظ..." : "حفظ كلمة المرور"}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </>
        )}

        {/* ── Step 3: Done ── */}
        {step === "done" && (
          <>
            <CardHeader className="space-y-2 text-center">
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-2">
                <CheckCircle className="w-9 h-9 text-green-600" />
              </div>
              <CardTitle className="text-2xl text-green-700">تم بنجاح!</CardTitle>
              <CardDescription>تم تغيير كلمة المرور بنجاح، يمكنك الآن تسجيل الدخول</CardDescription>
            </CardHeader>
            <CardContent className="text-center">
              <Button className="w-full h-12 text-lg mt-2" onClick={() => setLocation("/login")}>
                تسجيل الدخول
              </Button>
            </CardContent>
          </>
        )}
      </Card>
    </div>
  );
}
