import { useAuth } from "@/lib/auth";
import { useLogout } from "@workspace/api-client-react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { useQueryClient } from "@tanstack/react-query";
import { getGetMeQueryKey } from "@workspace/api-client-react";
import { LogOut, User as UserIcon, Menu, LayoutDashboard, Phone, Mail, MapPin, MessageCircle } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useState, useEffect } from "react";
import { useSettings } from "@/lib/use-settings";

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated } = useAuth();
  const logout = useLogout();
  const queryClient = useQueryClient();
  const [location, setLocation] = useLocation();
  const [open, setOpen] = useState(false);
  const { data: settings } = useSettings();

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [location]);

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSuccess: () => {
        queryClient.setQueryData(getGetMeQueryKey(), null);
        setLocation("/");
      },
    });
  };

  const isAdmin = user?.role === "admin";
  const isAdminPage = location.startsWith("/admin");

  if (isAdmin && isAdminPage) {
    return (
      <div className="min-h-screen flex flex-col bg-muted/30">
        <header className="sticky top-0 z-50 w-full border-b bg-[#0f172a] shadow-sm">
          <div className="container mx-auto px-4 h-14 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground shadow shadow-primary/30">
                <LayoutDashboard className="w-4 h-4" />
              </div>
              <div className="flex flex-col leading-tight">
                <span className="font-extrabold text-base text-white tracking-wide">أركان</span>
                <span className="text-[10px] text-white/40 font-medium">لوحة تحكم الإدارة</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Link href="/">
                <Button variant="outline" size="sm" className="border-white/20 text-white/70 hover:bg-white/10 hover:text-white bg-transparent">موقع العملاء</Button>
              </Link>
              <div className="flex items-center gap-2 text-sm text-white/50 border border-white/10 rounded-full px-3 py-1">
                <UserIcon className="w-3.5 h-3.5" />
                <span>{user?.fullName}</span>
              </div>
              <Button variant="ghost" size="icon" onClick={handleLogout} title="تسجيل الخروج" className="text-white/50 hover:text-white hover:bg-white/10">
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </header>

        <main className="flex-1 flex flex-col">
          {children}
        </main>
      </div>
    );
  }

  const NavLinks = () => (
    <>
      <Link href="/" className="text-sm font-medium text-foreground hover:text-primary transition-colors">
        الرئيسية
      </Link>
      <Link href="/testimonials" className="text-sm font-medium text-foreground hover:text-primary transition-colors">
        آراء العملاء
      </Link>
      {isAuthenticated && (
        <>
          <Link href="/my-orders" className="text-sm font-medium text-foreground hover:text-primary transition-colors">
            طلباتي
          </Link>
          {/* 👈 تم إضافة رابط المحادثة هنا ليظهر للعملاء المسجلين */}
          <Link href="/chat" className="text-sm font-medium text-foreground hover:text-primary transition-colors">
            المحادثة
          </Link>
        </>
      )}
      {isAdmin && (
        <Link href="/admin" className="text-sm font-medium text-primary hover:text-primary/80 transition-colors">
          لوحة التحكم
        </Link>
      )}
    </>
  );

  const hasContact = settings && (settings.phone1 || settings.phone2 || settings.email || settings.whatsapp || settings.address);
  const hasSocial = settings && (settings.facebookUrl || settings.instagramUrl || settings.twitterUrl);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2">
              <div className="w-8 h-8 rounded bg-primary flex items-center justify-center text-primary-foreground font-bold text-base">A</div>
              <span className="font-bold text-lg hidden sm:inline-block">Arkan</span>
            </Link>
            
            <nav className="hidden md:flex items-center gap-6 ms-6">
              <NavLinks />
            </nav>
          </div>

          <div className="flex items-center gap-4">
            {isAuthenticated ? (
              <div className="flex items-center gap-4">
                <Link href="/order" className="hidden sm:block">
                  <Button variant="default" size="sm">طلب موقع جديد</Button>
                </Link>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <UserIcon className="w-4 h-4" />
                  <span className="hidden sm:inline-block">{user?.fullName}</span>
                </div>
                <Button variant="ghost" size="icon" onClick={handleLogout} title="تسجيل الخروج">
                  <LogOut className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link href="/login">
                  <Button variant="ghost" size="sm">تسجيل الدخول</Button>
                </Link>
                <Link href="/register">
                  <Button variant="default" size="sm">حساب جديد</Button>
                </Link>
              </div>
            )}

            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild className="md:hidden">
                <Button variant="ghost" size="icon">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="flex flex-col gap-6 pt-12">
                <NavLinks />
                {isAuthenticated && (
                  <Link href="/order" onClick={() => setOpen(false)}>
                    <Button variant="default" className="w-full">طلب موقع جديد</Button>
                  </Link>
                )}
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col">
        {children}
      </main>

      <footer className="border-t bg-white mt-auto">
        {hasContact && (
          <div className="bg-primary/5 border-b">
            <div className="container mx-auto px-4 py-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {settings.phone1 && (
                  <a href={`tel:${settings.phone1}`} className="flex items-center gap-3 text-sm text-muted-foreground hover:text-primary transition-colors group">
                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors shrink-0">
                      <Phone className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground/70">هاتف</p>
                      <p className="font-medium text-foreground" dir="ltr">{settings.phone1}</p>
                    </div>
                  </a>
                )}
                {settings.phone2 && (
                  <a href={`tel:${settings.phone2}`} className="flex items-center gap-3 text-sm text-muted-foreground hover:text-primary transition-colors group">
                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors shrink-0">
                      <Phone className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground/70">هاتف 2</p>
                      <p className="font-medium text-foreground" dir="ltr">{settings.phone2}</p>
                    </div>
                  </a>
                )}
                {settings.whatsapp && (
                  <a href={`https://wa.me/${settings.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 text-sm text-muted-foreground hover:text-primary transition-colors group">
                    <div className="w-9 h-9 rounded-full bg-green-500/10 flex items-center justify-center group-hover:bg-green-500/20 transition-colors shrink-0">
                      <MessageCircle className="w-4 h-4 text-green-600" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground/70">واتساب</p>
                      <p className="font-medium text-foreground" dir="ltr">{settings.whatsapp}</p>
                    </div>
                  </a>
                )}
                {settings.email && (
                  <a href={`mailto:${settings.email}`} className="flex items-center gap-3 text-sm text-muted-foreground hover:text-primary transition-colors group">
                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors shrink-0">
                      <Mail className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground/70">البريد الإلكتروني</p>
                      <p className="font-medium text-foreground" dir="ltr">{settings.email}</p>
                    </div>
                  </a>
                )}
                {settings.address && (
                  <a href={`https://maps.google.com/?q=${encodeURIComponent(settings.address)}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 text-sm text-muted-foreground hover:text-primary transition-colors group sm:col-span-2 lg:col-span-1">
                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors shrink-0">
                      <MapPin className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground/70">العنوان</p>
                      <p className="font-medium text-foreground">{settings.address}</p>
                    </div>
                  </a>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="container mx-auto px-4 py-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-primary flex items-center justify-center text-primary-foreground font-bold text-sm">A</div>
            <span className="font-semibold text-muted-foreground">Arkan &copy; {new Date().getFullYear()}</span>
          </div>
          <div className="flex flex-wrap items-center gap-4 justify-center">
            {hasSocial && (
              <div className="flex items-center gap-3">
                {settings.facebookUrl && (
                  <a href={settings.facebookUrl} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary transition-colors text-sm">فيسبوك</a>
                )}
                {settings.instagramUrl && (
                  <a href={settings.instagramUrl} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary transition-colors text-sm">إنستغرام</a>
                )}
                {settings.twitterUrl && (
                  <a href={settings.twitterUrl} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary transition-colors text-sm">تويتر</a>
                )}
              </div>
            )}
            <div className="flex gap-4 text-sm text-muted-foreground">
              <Link href="/terms" className="hover:text-primary transition-colors">الشروط والأحكام</Link>
              <Link href="/privacy" className="hover:text-primary transition-colors">سياسة الخصوصية</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}