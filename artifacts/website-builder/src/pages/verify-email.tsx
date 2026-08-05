import { useState } from "react";
import { useLocation, useSearch } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { MailCheck, KeyRound } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetMeQueryKey } from "@workspace/api-client-react";

export default function VerifyEmail() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const emailFromParam = params.get("email") || "";

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [verified, setVerified] = useState(false);

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!otp.trim() || otp.trim().length !== 6) {
      toast({ variant: "destructive", title: "خطأ", description: "أدخل الرمز المكون من 6 أرقام" });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/verify-signup-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailFromParam, otp: otp.trim() }),
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ variant: "destructive", title: "خطأ", description: data.error });
        return;
      }
      // Store user in query cache and redirect
      queryClient.setQueryData(getGetMeQueryKey(), data.user);
      setVerified(true);
      toast({ title: "🎉 تم تأكيد حسابك بنجاح!", description: `أهلاً بك ${data.user.fullName}` });
      setTimeout(() => setLocation("/order"), 1500);
    } catch {
      toast({ variant: "destructive", title: "خطأ", description: "حدث خطأ، حاول مجدداً" });
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    setResendLoading(true);
    try {
      const res = await fetch("/api/auth/send-signup-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailFromParam }),
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ variant: "destructive", title: "خطأ", description: data.error });
        return;
      }
      toast({ title: "تم الإرسال", description: "تحقق من صندوق بريدك" });
    } catch {
      toast({ variant: "destructive", title: "خطأ", description: "فشل إعادة الإرسال" });
    } finally {
      setResendLoading(false);
    }
  }

  if (verified) {
    return (
      <div className="flex-1 flex items-center justify-center p-4 bg-muted/30">
        <Card className="w-full max-w-md shadow-xl border-none text-center">
          <CardHeader>
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
              <MailCheck className="w-9 h-9 text-green-600" />
            </div>
            <CardTitle className="text-2xl text-green-700">تم تأكيد حسابك!</CardTitle>
            <CardDescription>جاري توجيهك...</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex-1 flex items-center justify-center p-4 bg-muted/30">
      <Card className="w-full max-w-md shadow-xl border-none">
        <CardHeader className="space-y-2 text-center">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-2">
            <KeyRound className="w-6 h-6 text-primary" />
          </div>
          <CardTitle className="text-2xl">تأكيد البريد الإلكتروني</CardTitle>
          <CardDescription>
            أرسلنا رمز تأكيد مكوناً من 6 أرقام إلى{" "}
            <span className="font-semibold text-foreground">{emailFromParam}</span>
            {" "}— صالح لمدة 5 دقائق
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleVerify} className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="otp">رمز التأكيد</Label>
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
                autoFocus
              />
            </div>
            <Button type="submit" className="w-full h-12 text-lg" disabled={loading}>
              {loading ? "جاري التحقق..." : "تأكيد الحساب"}
            </Button>
          </form>
        </CardContent>

        <CardFooter className="flex flex-col items-center gap-2 border-t pt-6">
          <p className="text-sm text-muted-foreground">
            لم يصل الرمز؟{" "}
            <button
              type="button"
              onClick={handleResend}
              disabled={resendLoading}
              className="text-primary font-semibold hover:underline disabled:opacity-50"
            >
              {resendLoading ? "جاري الإرسال..." : "إعادة الإرسال"}
            </button>
          </p>
          <button
            type="button"
            onClick={() => setLocation("/register")}
            className="text-xs text-muted-foreground hover:underline"
          >
            ← العودة للتسجيل
          </button>
        </CardFooter>
      </Card>
    </div>
  );
}
