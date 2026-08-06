import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Eye, EyeOff, Mail, KeyRound, Lock, CheckCircle } from "lucide-react";
import { formatCountdown, useOtpCountdown } from "@/lib/use-otp-countdown";

export default function ForgotPassword() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [step, setStep] = useState<"email" | "otp" | "done">("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);

  const countdown = useOtpCountdown({
    key: `reset:${email.trim().toLowerCase()}`,
    seconds: 60,
  });

  useEffect(() => {
    // عند الانتقال للخطوة الثانية بدون مؤقت نشغّله تلقائياً (مثلاً عند Refresh)
    if (step === "otp" && countdown.remaining <= 0) {
      countdown.start();
    }
  }, [step, countdown]);

  // ── Step 1: send OTP ──
  async function handleSendOtp(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) {
        toast({
          variant: "destructive",
          title: "تعذر الإرسال",
          description: data?.error || "حدث خطأ أثناء إرسال الرمز",
        });
        return;
      }
      toast({ title: "تم الإرسال", description: "تحقق من صندوق بريدك الإلكتروني" });
      setStep("otp");
      countdown.start();
    } catch {
      toast({ variant: "destructive", title: "خطأ", description: "حدث خطأ، حاول مجدداً" });
    } finally {
      setLoading(false);
    }
  }

  // ── Step 2: verify OTP + reset password ──
  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast({ variant: "destructive", title: "خطأ", description: "كلمتا المرور غير متطابقتين" });
      return;
    }
    if (newPassword.length < 6) {
      toast({ variant: "destructive", title: "خطأ", description: "كلمة المرور يجب أن تكون 6 أحرف على الأقل" });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), otp: otp.trim(), newPassword }),
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

  // ── Resend OTP ──
  async function handleResend() {
    if (!countdown.canResend) return;
    setLoading(true);
    try {
      const res = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) { toast({ variant: "destructive", title: "خطأ", description: data.error }); return; }
      toast({ title: "تم إعادة الإرسال", description: "تحقق من صندوق البريد مجدداً" });
      countdown.start();
    } catch {
      toast({ variant: "destructive", title: "خطأ", description: "فشل إعادة الإرسال" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex-1 flex items-center justify-center p-4 bg-muted/30">
      <Card className="w-full max-w-md shadow-xl border-none">

        {/* ── Step 1: Email ── */}
        {step === "email" && (
          <>
            <CardHeader className="space-y-2 text-center">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-2">
                <Mail className="w-6 h-6 text-primary" />
              </div>
              <CardTitle className="text-2xl">نسيت كلمة المرور؟</CardTitle>
              <CardDescription>أدخل بريدك الإلكتروني المسجّل وسنرسل لك رمز التحقق (OTP)</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSendOtp} className="space-y-5">
                <div className="space-y-1.5">
                  <Label htmlFor="email">البريد الإلكتروني</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="example@email.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="h-12 text-base"
                    dir="ltr"
                    required
                  />
                </div>
                <Button type="submit" className="w-full h-12 text-lg" disabled={loading}>
                  {loading ? "جاري الإرسال..." : "إرسال رمز التحقق"}
                </Button>
              </form>
            </CardContent>
            <CardFooter className="flex justify-center border-t pt-6">
              <p className="text-sm text-muted-foreground">
                تذكرت كلمة المرور؟{" "}
                <Link href="/login" className="text-primary font-semibold hover:underline">تسجيل الدخول</Link>
              </p>
            </CardFooter>
          </>
        )}

        {/* ── Step 2: OTP + New Password ── */}
        {step === "otp" && (
          <>
            <CardHeader className="space-y-2 text-center">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-2">
                <KeyRound className="w-6 h-6 text-primary" />
              </div>
              <CardTitle className="text-2xl">أدخل رمز التحقق</CardTitle>
              <CardDescription>
                أرسلنا رمزاً مكوناً من 6 أرقام إلى{" "}
                <span className="font-semibold text-foreground">{email}</span>
                {" "}— صالح لمدة 5 دقائق
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleVerifyOtp} className="space-y-4">
                {/* OTP input */}
                <div className="space-y-1.5">
                  <Label htmlFor="otp">رمز التحقق (OTP)</Label>
                  <Input
                    id="otp"
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="123456"
                    value={otp}
                    onChange={e => setOtp(e.target.value.replace(/\D/g, ""))}
                    className="h-14 text-center text-2xl tracking-widest font-mono"
                    dir="ltr"
                    required
                  />
                </div>

                {/* New password */}
                <div className="space-y-1.5">
                  <Label htmlFor="newPassword">كلمة المرور الجديدة</Label>
                  <div className="relative">
                    <Input
                      id="newPassword"
                      type={showPassword ? "text" : "password"}
                      placeholder="أدخل كلمة المرور الجديدة"
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      className="h-12 text-lg pe-12"
                      dir="ltr"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 end-0 flex items-center pe-3 text-muted-foreground hover:text-foreground"
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                </div>

                {/* Confirm password */}
                <div className="space-y-1.5">
                  <Label htmlFor="confirmPassword">تأكيد كلمة المرور</Label>
                  <div className="relative">
                    <Input
                      id="confirmPassword"
                      type={showConfirm ? "text" : "password"}
                      placeholder="أعد إدخال كلمة المرور"
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      className="h-12 text-lg pe-12"
                      dir="ltr"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirm(!showConfirm)}
                      className="absolute inset-y-0 end-0 flex items-center pe-3 text-muted-foreground hover:text-foreground"
                      tabIndex={-1}
                    >
                      {showConfirm ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                </div>

                <Button type="submit" className="w-full h-12 text-lg" disabled={loading}>
                  {loading ? "جاري التحقق..." : "تعيين كلمة المرور"}
                </Button>
              </form>
            </CardContent>
            <CardFooter className="flex flex-col items-center gap-3 border-t pt-6">
              <p className="text-sm text-muted-foreground">
                {!countdown.canResend ? (
                  `يمكنك إعادة الإرسال بعد ${formatCountdown(countdown.remaining)}`
                ) : (
                  <>
                    لم يصل الرمز؟{" "}
                    <button
                      type="button"
                      onClick={handleResend}
                      disabled={loading}
                      className="text-primary font-semibold hover:underline disabled:opacity-50"
                    >
                      إعادة الإرسال
                    </button>
                  </>
                )}
              </p>
              <button
                type="button"
                onClick={() => setStep("email")}
                className="text-xs text-muted-foreground hover:underline"
              >
                ← تغيير البريد الإلكتروني
              </button>
            </CardFooter>
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
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <Lock className="w-5 h-5 text-primary" />
              </div>
              <Button className="w-full h-12 text-lg" onClick={() => setLocation("/login")}>
                تسجيل الدخول
              </Button>
            </CardContent>
          </>
        )}
      </Card>
    </div>
  );
}
