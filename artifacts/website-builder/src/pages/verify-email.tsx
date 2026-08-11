import { useState } from "react";
import { useLocation, useSearch } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { MailCheck } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetMeQueryKey } from "@workspace/api-client-react";
import { formatCountdown, useOtpCountdown } from "@/lib/use-otp-countdown";
import { apiFetch } from "@/lib/api-fetch";

export default function VerifyEmail() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const email = params.get("email") || "";

  const [otp, setOtp] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const countdown = useOtpCountdown({
    key: `signup:${email.toLowerCase()}`,
    seconds: 60,
    autoStart: true,
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!otp.trim() || otp.trim().length !== 6) {
      toast({ variant: "destructive", title: "خطأ", description: "أدخل الرمز المكون من 6 أرقام" });
      return;
    }
    setIsLoading(true);
    try {
      const res = await apiFetch("/api/auth/verify-signup-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp: otp.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ variant: "destructive", title: "خطأ", description: data.error });
        return;
      }
      queryClient.setQueryData(getGetMeQueryKey(), data.user);
      toast({ title: "تم تأكيد حسابك بنجاح", description: `أهلاً بك ${data.user.fullName}` });
      setLocation("/order");
    } catch {
      toast({ variant: "destructive", title: "خطأ", description: "حدث خطأ، حاول مجدداً" });
    } finally {
      setIsLoading(false);
    }
  }

  async function handleResend() {
    setResendLoading(true);
    try {
      const res = await apiFetch("/api/auth/send-signup-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ variant: "destructive", title: "خطأ", description: data.error });
        return;
      }
      toast({ title: "تم الإرسال", description: "تحقق من صندوق بريدك" });
      countdown.start();
    } catch {
      toast({ variant: "destructive", title: "خطأ", description: "فشل إعادة الإرسال" });
    } finally {
      setResendLoading(false);
    }
  }

  return (
    <div className="flex-1 flex items-center justify-center p-4 bg-muted/30">
      <Card className="w-full max-w-md shadow-xl border-none">
        <CardHeader className="space-y-2 text-center">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-2">
            <MailCheck className="w-6 h-6 text-primary" />
          </div>
          <CardTitle className="text-2xl">تأكيد البريد الإلكتروني</CardTitle>
          <CardDescription>
            أرسلنا رمز تأكيد مكوناً من 6 أرقام إلى{" "}
            <span className="font-semibold text-foreground">{email}</span> — صالح لمدة 5 دقائق
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <label htmlFor="otp" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                رمز التأكيد
              </label>
              <Input
                id="otp"
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="123456"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                className="h-14 text-center text-2xl tracking-widest font-mono"
                dir="ltr"
                required
                autoFocus
              />
            </div>
            <Button type="submit" className="w-full h-12 text-lg" disabled={isLoading}>
              {isLoading ? "جاري التحقق..." : "تأكيد الحساب"}
            </Button>
          </form>
        </CardContent>
        <div className="flex justify-center border-t pt-6 pb-6">
          <p className="text-sm text-muted-foreground">
            {!countdown.canResend ? (
              `يمكنك إعادة الإرسال بعد ${formatCountdown(countdown.remaining)}`
            ) : (
              <button onClick={handleResend} disabled={resendLoading} className="text-primary font-semibold hover:underline disabled:opacity-50">
                {resendLoading ? "جاري الإرسال..." : "إعادة إرسال الرمز"}
              </button>
            )}
          </p>
        </div>
      </Card>
    </div>
  );
}
