import { useState } from "react";
import { useLogin } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetMeQueryKey } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Shield, Eye, EyeOff } from "lucide-react";
import { useEffect } from "react";

export default function AdminLogin() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  const login = useLogin();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { user, isLoading, isAuthenticated } = useAuth();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      if (user?.role === "admin") {
        setLocation("/admin");
      } else {
        setLocation("/");
      }
    }
  }, [isLoading, isAuthenticated, user, setLocation]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    login.mutate(
      { data: { username, password } },
      {
        onSuccess: (data) => {
          queryClient.setQueryData(getGetMeQueryKey(), data);
          if (data.role === "admin") {
            setLocation("/admin");
          } else {
            setError("هذا الحساب لا يملك صلاحيات الأدمن.");
          }
        },
        onError: () => {
          setError("اسم المستخدم أو كلمة المرور غير صحيحة.");
        },
      }
    );
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0f172a]">
        <div className="text-white/60 text-sm">جاري التحميل...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#0f172a] relative overflow-hidden" dir="rtl">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-transparent to-primary/5 pointer-events-none" />
      <div className="absolute top-[-200px] left-[-200px] w-[500px] h-[500px] rounded-full bg-primary/10 blur-3xl pointer-events-none" />
      <div className="absolute bottom-[-200px] right-[-200px] w-[500px] h-[500px] rounded-full bg-primary/5 blur-3xl pointer-events-none" />

      <div className="relative z-10 w-full max-w-md px-6">
        <div className="flex flex-col items-center mb-10 gap-3">
          <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center shadow-lg shadow-primary/30">
            <Shield className="w-8 h-8 text-white" />
          </div>
          <div className="text-center">
            <h1 className="text-3xl font-extrabold text-white tracking-wide">أركان</h1>
            <p className="text-white/50 text-sm mt-1">لوحة تحكم الإدارة</p>
          </div>
        </div>

        <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-8 shadow-2xl">
          <h2 className="text-white font-bold text-xl mb-1">تسجيل الدخول</h2>
          <p className="text-white/40 text-sm mb-7">أدخل بيانات حساب الأدمن للمتابعة</p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <Label htmlFor="username" className="text-white/70 text-sm font-medium">اسم المستخدم</Label>
              <Input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="أدخل اسم المستخدم"
                required
                autoComplete="username"
                className="bg-white/10 border-white/20 text-white placeholder:text-white/30 focus:border-primary focus-visible:ring-primary/30 h-11"
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="password" className="text-white/70 text-sm font-medium">كلمة المرور</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="أدخل كلمة المرور"
                  required
                  autoComplete="current-password"
                  className="bg-white/10 border-white/20 text-white placeholder:text-white/30 focus:border-primary focus-visible:ring-primary/30 h-11 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="bg-red-500/15 border border-red-500/30 text-red-400 text-sm rounded-lg px-4 py-2.5">
                {error}
              </div>
            )}

            <Button
              type="submit"
              className="w-full h-11 text-base font-bold bg-primary hover:bg-primary/90 shadow-lg shadow-primary/25 mt-1"
              disabled={login.isPending}
            >
              {login.isPending ? "جاري الدخول..." : "دخول"}
            </Button>
          </form>
        </div>

        <p className="text-center text-white/20 text-xs mt-8">
          أركان © {new Date().getFullYear()} — جميع الحقوق محفوظة
        </p>
      </div>
    </div>
  );
}
