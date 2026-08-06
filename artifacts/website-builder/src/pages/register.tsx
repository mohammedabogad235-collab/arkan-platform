import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useState, useEffect } from "react";
import * as z from "zod";
import { useRegister } from "@workspace/api-client-react";
import { Link, useLocation } from "wouter";
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
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { getApiErrorData } from "@/lib/api-error";

const registerSchema = z.object({
  fullName: z.string().min(5, { message: "الاسم الكامل مطلوب (5 أحرف على الأقل)" }),
  phone: z.string().min(10, { message: "رقم الهاتف غير صالح" }),
  email: z.string().email({ message: "البريد الإلكتروني غير صالح" }),
  password: z.string().min(6, { message: "كلمة المرور يجب أن تكون 6 أحرف على الأقل" }),
});

export default function Register() {
  const register = useRegister();
  const [, setLocation] = useLocation();
  const { isAuthenticated, isLoading } = useAuth();
  const { toast } = useToast();
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      setLocation("/");
    }
  }, [isAuthenticated, isLoading, setLocation]);

  const form = useForm<z.infer<typeof registerSchema>>({
    resolver: zodResolver(registerSchema),
    defaultValues: { fullName: "", phone: "", email: "", password: "" },
  });

  function onSubmit(values: z.infer<typeof registerSchema>) {
    register.mutate(
      { data: values },
      {
        onSuccess: (data: any) => {
          // Account created but pending email verification
          if (data.pendingVerification) {
            toast({
              title: "تم إنشاء الحساب",
              description: "تحقق من بريدك الإلكتروني وأدخل رمز التأكيد",
            });
            setLocation(`/verify-email?email=${encodeURIComponent(data.email)}`);
            return;
          }
          // Fallback (should not happen with current backend)
          toast({ title: "تم إنشاء الحساب بنجاح" });
          setLocation("/");
        },
        onError: (error) => {
          const errData = getApiErrorData(error);
          const msg = errData?.error || "حدث خطأ أثناء إنشاء الحساب";
          const field = errData?.field;
          const pending = errData?.pendingVerification;

          if (pending) {
            toast({ title: "حساب موجود", description: "أُرسل رمز تأكيد جديد — تحقق من بريدك" });
            // The email isn't in the error response, so we use it from the form values.
            setLocation(`/verify-email?email=${encodeURIComponent(values.email)}`);
            return;
          }
          if (field === "phone") {
            form.setError("phone", { message: msg });
          } else if (field === "email") {
            form.setError("email", { message: msg });
          } else {
            toast({ variant: "destructive", title: "فشل التسجيل", description: msg });
          }
        },
      }
    );
  }

  return (
    <div className="flex-1 flex items-center justify-center p-4 bg-muted/30 py-12">
      <Card className="w-full max-w-xl shadow-xl border-none">
        <CardHeader className="space-y-2 text-center">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-bold text-2xl mx-auto mb-2">م</div>
          <CardTitle className="text-2xl">حساب جديد</CardTitle>
          <CardDescription>
            قم بإنشاء حسابك لتبدأ في طلب موقعك الإلكتروني
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="fullName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>الاسم الكامل</FormLabel>
                    <FormControl>
                      <Input placeholder="أدخل اسمك الكامل" {...field} className="h-11" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>البريد الإلكتروني</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="example@domain.com" {...field} className="h-11" dir="ltr" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>رقم الهاتف</FormLabel>
                      <FormControl>
                        <Input placeholder="رقم الجوال" {...field} className="h-11" dir="ltr" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>كلمة المرور</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input
                          type={showPassword ? "text" : "password"}
                          placeholder="على الأقل 6 أحرف"
                          {...field}
                          className="h-11 pe-12"
                          dir="ltr"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute inset-y-0 end-0 flex items-center pe-3 text-muted-foreground hover:text-foreground transition-colors"
                          tabIndex={-1}
                        >
                          {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                        </button>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full h-12 text-lg mt-6" disabled={register.isPending}>
                {register.isPending ? "جاري إنشاء الحساب..." : "إنشاء حساب"}
              </Button>
            </form>
          </Form>
        </CardContent>
        <CardFooter className="flex justify-center border-t pt-6">
          <p className="text-sm text-muted-foreground">
            لديك حساب بالفعل؟{" "}
            <Link href="/login" className="text-primary font-semibold hover:underline">
              سجل الدخول
            </Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
