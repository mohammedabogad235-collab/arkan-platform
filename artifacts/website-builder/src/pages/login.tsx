import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useMemo, useState, useEffect } from "react";
import * as z from "zod";
import { useLogin, getGetMeQueryKey } from "@workspace/api-client-react";
import { Link, useLocation } from "wouter";
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
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Eye, EyeOff, Fingerprint } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { getApiErrorData, getApiErrorStatus } from "@/lib/api-error";
import { Capacitor } from "@capacitor/core";

async function loadBiometricAuthModule(): Promise<any> {
  try {
    const dynamicImport = new Function("return import('@capacitor-community/biometric-auth')") as () => Promise<any>;
    return await dynamicImport();
  } catch {
    return null;
  }
}

const loginSchema = z.object({
  identifier: z.string().min(3, { message: "أدخل رقم الهاتف أو البريد أو اسم المستخدم" }),
  password: z.string().min(6, { message: "كلمة المرور يجب أن تكون 6 أحرف على الأقل" }),
  rememberMe: z.boolean().optional().default(false),
});

export default function Login() {
  const login = useLogin();
  const [, setLocation] = useLocation();
  const { isAuthenticated, isLoading, user } = useAuth();

  // توجيه تلقائي لو المستخدم مسجل دخول بالفعل
  useEffect(() => {
    if (!isLoading && isAuthenticated && user) {
      if (user.role === "admin" || user.role === "subadmin") {
        setLocation("/admin");
      } else {
        setLocation("/");
      }
    }
  }, [isAuthenticated, isLoading, user, setLocation]);

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showPassword, setShowPassword] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricLoading, setBiometricLoading] = useState(false);

  const isNative = useMemo(() => Capacitor.getPlatform() !== "web", []);

  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      identifier: "",
      password: "",
      rememberMe: false,
    },
  });

  useEffect(() => {
    let cancelled = false;
    if (!isNative) {
      setBiometricAvailable(false);
      return;
    }

    (async () => {
      try {
        const mod = await loadBiometricAuthModule();
        const plugin = mod?.BiometricAuth;
        if (!plugin?.checkBiometry) {
          if (!cancelled) setBiometricAvailable(false);
          return;
        }

        const result = await plugin.checkBiometry();
        if (!cancelled) setBiometricAvailable(Boolean(result?.isAvailable ?? result));
      } catch {
        if (!cancelled) setBiometricAvailable(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isNative]);

  function onSubmit(values: z.infer<typeof loginSchema>) {
    const loginPayload = { identifier: values.identifier, password: values.password, rememberMe: Boolean(values.rememberMe) } as any;

    login.mutate(
      { data: loginPayload },
      {
        onSuccess: (data) => {
          queryClient.setQueryData(getGetMeQueryKey(), data.user);
          toast({
            title: "تم تسجيل الدخول بنجاح",
            description: `أهلاً بك ${data.user.fullName}`,
          });

          // Enable biometric login on native platforms (stores the last successful credentials).
          // This is only used after a successful biometric prompt on next login attempt.
          try {
            if (isNative && biometricAvailable) {
              localStorage.setItem(
                "biometric_login_v1",
                JSON.stringify({ identifier: values.identifier, password: values.password }),
              );
            }
          } catch {
            // ignore
          }
          
          // التوجيه الصحيح للأدمن والمشرف الفرعي إلى لوحة التحكم
          if (data.user.role === "admin" || data.user.role === "subadmin") {
            setLocation("/admin");
          } else {
            setLocation("/order");
          }
        },
        onError: (error) => {
          const errData = getApiErrorData(error);
          const status = getApiErrorStatus(error);

          if (errData?.pendingVerification && errData?.email) {
            toast({ title: "حساب غير مؤكد", description: "يجب تأكيد بريدك أولاً" });
            setLocation(`/verify-email?email=${encodeURIComponent(errData.email)}`);
            return;
          }

          if (status === 404) {
            toast({
              variant: "destructive",
              title: "هذا الحساب غير موجود",
              description: "تحقق من البريد/الهاتف/اسم المستخدم أو أنشئ حساباً جديداً",
            });
            return;
          }

          if (status === 401) {
            toast({
              variant: "destructive",
              title: "بيانات الدخول غير صحيحة",
              description: errData?.error || "تحقق من كلمة المرور وحاول مجدداً",
            });
            return;
          }

          toast({
            variant: "destructive",
            title: "فشل تسجيل الدخول",
            description: errData?.error || "يرجى التحقق من بيانات الدخول",
          });
        },
      }
    );
  }

  const handleBiometricLogin = async () => {
    if (!biometricAvailable || biometricLoading || login.isPending) return;

    setBiometricLoading(true);
    try {
      const storedRaw = localStorage.getItem("biometric_login_v1");
      const stored = storedRaw ? (JSON.parse(storedRaw) as { identifier?: string; password?: string }) : null;
      if (!stored?.identifier || !stored?.password) {
        toast({
          variant: "destructive",
          title: "غير مُفعّل بعد",
          description: "سجّل دخول مرة واحدة بكلمة المرور لتفعيل الدخول بالبصمة.",
        });
        return;
      }

      const mod = await loadBiometricAuthModule();
      if (!mod?.BiometricAuth?.authenticate) {
        toast({
          variant: "destructive",
          title: "البصمة غير متاحة",
          description: "استخدم تسجيل الدخول اليدوي في هذه الجلسة.",
        });
        return;
      }

      await mod.BiometricAuth.authenticate({
        reason: "تسجيل الدخول باستخدام البصمة / Face ID",
        cancelTitle: "إلغاء",
      });

      const biometricPayload = { identifier: stored.identifier, password: stored.password, rememberMe: true } as any;

      login.mutate(
        { data: biometricPayload },
        {
          onSuccess: (data) => {
            queryClient.setQueryData(getGetMeQueryKey(), data.user);
            toast({ title: "تم تسجيل الدخول بنجاح" });
            if (data.user.role === "admin" || data.user.role === "subadmin") {
              setLocation("/admin");
            } else {
              setLocation("/order");
            }
          },
          onError: () => {
            toast({
              variant: "destructive",
              title: "فشل تسجيل الدخول",
              description: "تحقق من بيانات الدخول أو أعد تسجيل الدخول يدوياً.",
            });
          },
        },
      );
    } catch {
      // user cancelled or auth failed
    } finally {
      setBiometricLoading(false);
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center p-4 bg-muted/30">
      <Card className="w-full max-w-md shadow-xl border-none">
        <CardHeader className="space-y-2 text-center">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-bold text-2xl mx-auto mb-2">م</div>
          <CardTitle className="text-2xl">تسجيل الدخول</CardTitle>
          <CardDescription>
            أدخل بيانات حسابك للمتابعة
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="identifier"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>رقم الهاتف أو البريد أو اسم المستخدم</FormLabel>
                    <FormControl>
                      <Input placeholder="رقم الجوال أو البريد أو username" {...field} className="h-12 text-lg" dir="ltr" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="rememberMe"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-xl border bg-background/40 p-4">
                    <div className="space-y-1 leading-none">
                      <FormLabel className="text-sm">تذكرني</FormLabel>
                      <p className="text-xs text-muted-foreground">لو غير مُفعّل، تنتهي الجلسة عند إغلاق المتصفح/التطبيق.</p>
                    </div>
                    <FormControl>
                      <Checkbox checked={Boolean(field.value)} onCheckedChange={(v) => field.onChange(v === true)} />
                    </FormControl>
                  </FormItem>
                )}
              />

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
                          placeholder="أدخل كلمة المرور"
                          {...field}
                          className="h-12 text-lg pe-12"
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

              <div className="flex items-center gap-3">
                <Button type="submit" className="flex-1 h-12 text-lg" disabled={login.isPending || biometricLoading}>
                  {login.isPending ? "جاري تسجيل الدخول..." : "تسجيل الدخول"}
                </Button>

                {biometricAvailable && (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={handleBiometricLogin}
                    disabled={login.isPending || biometricLoading}
                    className="h-12 w-12"
                    title="Login with Biometrics"
                  >
                    <Fingerprint className="h-5 w-5" />
                  </Button>
                )}
              </div>
            </form>
          </Form>
        </CardContent>
        <CardFooter className="flex flex-col items-center gap-3 border-t pt-6">
          <Link href="/forgot-password" className="text-sm text-muted-foreground hover:text-primary transition-colors">
            نسيت كلمة المرور؟
          </Link>
          <p className="text-sm text-muted-foreground">
            ليس لديك حساب؟{" "}
            <Link href="/register" className="text-primary font-semibold hover:underline">
              سجل الآن
            </Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
