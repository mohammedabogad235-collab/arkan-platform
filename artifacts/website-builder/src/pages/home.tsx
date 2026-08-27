import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { useListPackages, useListTestimonials } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { CheckCircle2, Star, MonitorSmartphone, Code, Zap, HeadphonesIcon, Phone, Mail, MapPin, MessageCircle, Facebook, Instagram, Twitter, Smartphone, Download, AlertTriangle, ShieldCheck } from "lucide-react";
import { motion } from "framer-motion";
import { ErrorBoundary } from "@/components/error-boundary";
import { useSettings } from "@/lib/use-settings";
import { Capacitor } from "@capacitor/core";

function HomeContent() {
  const {
    data: packages,
    isLoading: isLoadingPackages,
    error: packagesError,
  } = useListPackages();
  const {
    data: testimonials,
    isLoading: isLoadingTestimonials,
    error: testimonialsError,
  } = useListTestimonials();
  const { data: settings, error: settingsError } = useSettings();

  const activePackages = Array.isArray(packages) ? packages.filter((p) => p?.isActive) : [];
  const activeTestimonials = Array.isArray(testimonials)
    ? testimonials.filter((t) => t?.isActive)
    : [];
  const homeDataErrors = [packagesError, testimonialsError, settingsError]
    .filter(Boolean)
    .map((error) => (error instanceof Error ? error.message : "Unknown data loading error"));
  const isWeb = Capacitor.getPlatform() === "web";
  const apkDownloadHref =
    "https://drive.google.com/drive/folders/1OrsQuXQyYC6ZFPxcvhPQ0p-Rh-TemxjO?usp=drive_link";

  return (
    <div className="flex flex-col w-full overflow-hidden">
      {homeDataErrors.length > 0 && (
        <section className="container mx-auto px-4 pt-6">
          <div className="rounded-lg border border-red-500 bg-red-50 p-4 text-red-700">
            <h2 className="mb-2 text-lg font-bold">Home data error</h2>
            <pre className="whitespace-pre-wrap break-words text-sm">
              {homeDataErrors.join("\n\n")}
            </pre>
          </div>
        </section>
      )}

      {/* Hero Section */}
      <section className="relative py-20 lg:py-32 overflow-hidden bg-primary/5">
        <div className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-primary/10 via-transparent to-transparent" />
        <div className="container px-4 mx-auto relative z-10">
          <div className="flex flex-col items-center text-center max-w-4xl mx-auto space-y-8">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <Badge variant="secondary" className="px-4 py-1.5 text-sm mb-4 bg-primary/10 text-primary hover:bg-primary/20">
                بوابتك للنجاح الرقمي
              </Badge>
              <h1 className="text-4xl md:text-6xl lg:text-7xl font-extrabold tracking-tight text-foreground leading-tight">
                ابنِ موقعك الإلكتروني <span className="text-primary block mt-2">باحترافية وسهولة</span>
              </h1>
              <p className="mt-6 text-xl text-muted-foreground leading-relaxed max-w-2xl mx-auto">
                نقدم لك حلولاً متكاملة لتصميم وتطوير مواقع إلكترونية عصرية، سريعة، ومتوافقة مع جميع الأجهزة لتعزيز حضورك الرقمي وزيادة مبيعاتك.
              </p>
            </motion.div>
            
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="flex flex-col sm:flex-row flex-wrap items-center justify-center gap-4 w-full mt-6"
            >
              <Link href="/order" className="w-full sm:w-auto">
                <Button size="lg" className="w-full text-lg h-14 px-8 rounded-xl shadow-lg shadow-primary/25">
                  ابدأ بناء موقعك
                </Button>
              </Link>
              <Link href="/testimonials" className="w-full sm:w-auto">
                <Button size="lg" variant="outline" className="w-full text-lg h-14 px-8 rounded-xl bg-background">
                  تصفح أعمالنا
                </Button>
              </Link>

              {/* زر التحميل الفخم جداً - يظهر في المتصفح فقط وتحت الأزرار الرئيسية مباشرة */}
              {isWeb && (
                <div className="w-full sm:w-auto">
                  <Dialog>
                    <DialogTrigger asChild>
                      <button
                        type="button"
                        className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-4 bg-gradient-to-r from-blue-600 to-violet-600 text-white font-bold rounded-xl shadow-lg hover:shadow-xl hover:scale-105 transition-all text-sm sm:text-base"
                      >
                        <Smartphone className="w-5 h-5 text-white" />
                        <span>تحميل تطبيق أركان ويب للأندرويد</span>
                      </button>
                    </DialogTrigger>

                    <DialogContent className="p-0 overflow-hidden max-w-xl" dir="rtl">
                      {/* Header */}
                      <div className="relative px-6 py-6 sm:px-8 bg-neutral-950 text-white border-b border-white/10">
                          <DialogTitle className="text-xl sm:text-2xl font-extrabold tracking-tight text-right">
                            تحميل تطبيق أركان ويب للأندرويد
                          </DialogTitle>
                          <DialogDescription className="text-sm sm:text-base text-muted-foreground text-right leading-relaxed">
                            اتبع الخطوات التالية للتثبيت بشكل آمن على جهازك.
                          </DialogDescription>
                        </DialogHeader>

                        <div className="grid gap-4">
                          {/* Step 1 */}
                          <div className="rounded-2xl border bg-muted/20 p-4">
                            <div className="flex items-start gap-4">
                              <div className="mt-0.5 h-11 w-11 shrink-0 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
                                <Download className="h-5 w-5" />
                              </div>
                              <div className="space-y-1">
                                <p className="font-extrabold text-right">الخطوة 1: تحميل الـ APK بأمان</p>
                                <p className="text-sm text-muted-foreground text-right leading-relaxed">
                                  قم بتحميل التطبيق من الرابط الرسمي.
                                </p>
                              </div>
                            </div>
                          </div>

                          {/* Step 2 */}
                          <div className="rounded-2xl border bg-muted/20 p-4">
                            <div className="flex items-start gap-4">
                              <div className="mt-0.5 h-11 w-11 shrink-0 rounded-2xl bg-amber-500/10 text-amber-600 flex items-center justify-center">
                                <AlertTriangle className="h-5 w-5" />
                              </div>
                              <div className="space-y-1">
                                <p className="font-extrabold text-right">الخطوة 2: عند ظهور Play Protect</p>
                                <p className="text-sm text-muted-foreground text-right leading-relaxed">
                                  اضغط <span className="font-semibold">More details</span> / <span className="font-semibold">(التفاصيل)</span>.
                                </p>
                              </div>
                            </div>
                          </div>

                          {/* Step 3 */}
                          <div className="rounded-2xl border bg-muted/20 p-4">
                            <div className="flex items-start gap-4">
                              <div className="mt-0.5 h-11 w-11 shrink-0 rounded-2xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
                                <ShieldCheck className="h-5 w-5" />
                              </div>
                              <div className="space-y-1">
                                <p className="font-extrabold text-right">الخطوة 3: التثبيت على أي حال</p>
                                <p className="text-sm text-muted-foreground text-right leading-relaxed">
                                  اختر <span className="font-semibold">Install anyway</span> / <span className="font-semibold">(التثبيت على أي حال)</span>.
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>

                        <a
                          href={apkDownloadHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-full flex items-center justify-center gap-2 py-4 mt-6 text-lg font-extrabold text-white bg-gradient-to-r from-emerald-500 to-green-600 rounded-2xl shadow-[0_10px_20px_rgba(16,185,129,0.3)] hover:scale-[1.02] transition-all"
                        >
                          <Download className="h-6 w-6" />
                          <span>تحميل التطبيق الآن 🚀</span>
                        </a>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              )}
            </motion.div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 bg-background">
        <div className="container px-4 mx-auto">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl font-bold mb-4">لماذا تختار منصتنا؟</h2>
            <p className="text-muted-foreground text-lg">نضمن لك تجربة فريدة ومتميزة من خلال مجموعة من المزايا الحصرية التي تلبي كافة احتياجاتك.</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {[
              { icon: MonitorSmartphone, title: "تصميم متجاوب", desc: "مواقع تعمل بكفاءة على جميع الشاشات والأجهزة المحمولة." },
              { icon: Code, title: "كود نظيف وآمن", desc: "استخدام أحدث التقنيات البرمجية لضمان أمان وسرعة الموقع." },
              { icon: Zap, title: "أداء فائق السرعة", desc: "تحسين سرعة التحميل لتقديم تجربة مستخدم ممتازة." },
              { icon: HeadphonesIcon, title: "دعم فني متواصل", desc: "فريق دعم متخصص للإجابة على استفساراتك وحل المشكلات." }
            ].map((feature, i) => (
              <motion.div 
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
              >
                <Card className="border-none shadow-md hover:shadow-xl transition-shadow duration-300 h-full">
                  <CardHeader>
                    <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4 text-primary">
                      <feature.icon className="w-6 h-6" />
                    </div>
                    <CardTitle className="text-xl">{feature.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground">{feature.desc}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Packages Section */}
      <section className="py-20 bg-muted/50 relative">
        <div className="container px-4 mx-auto relative z-10">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl font-bold mb-4">باقات تناسب جميع الاحتياجات</h2>
            <p className="text-muted-foreground text-lg">اختر الباقة المناسبة لطبيعة عملك وميزانيتك.</p>
          </div>

          {isLoadingPackages ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {[1, 2, 3].map(i => (
                <Card key={i} className="animate-pulse">
                  <CardHeader className="h-32 bg-muted rounded-t-xl" />
                  <CardContent className="space-y-4 pt-6">
                    <div className="h-4 bg-muted rounded w-3/4" />
                    <div className="h-4 bg-muted rounded w-full" />
                    <div className="h-4 bg-muted rounded w-5/6" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {(Array.isArray(activePackages) ? activePackages : []).map((pkg, i) => (
                <motion.div
                  key={pkg.id}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: i * 0.1 }}
                >
                  <Card className={`relative h-full flex flex-col ${i === 1 ? 'border-primary shadow-xl scale-105 z-10' : 'border-border shadow-md'}`}>
                    {i === 1 && (
                      <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2">
                        <Badge className="bg-primary text-primary-foreground px-3 py-1">الأكثر طلباً</Badge>
                      </div>
                    )}
                    <CardHeader className="text-center pb-8 border-b">
                      <CardTitle className="text-2xl mb-2">{pkg.name}</CardTitle>
                      <CardDescription className="text-base h-12">{pkg.description}</CardDescription>
                      <div className="mt-6 flex flex-col items-center justify-center gap-2">
                        <span className="text-3xl font-bold">{pkg.priceEgp} <span className="text-lg text-muted-foreground font-normal">جنيه 🇪🇬</span></span>
                        <span className="text-xl font-semibold text-muted-foreground">{pkg.priceSar} <span className="text-base font-normal">ريال 🇸🇦</span></span>
                      </div>
                    </CardHeader>
                    <CardContent className="flex-1 pt-8">
                      <ul className="space-y-4">
                        {(pkg.features ?? "").split("\n").filter(Boolean).map((feature, idx) => (
                          <li key={idx} className="flex items-start gap-3">
                            <CheckCircle2 className="w-5 h-5 text-primary shrink-0" />
                            <span className="text-muted-foreground">{feature}</span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                    <CardFooter className="pt-6 border-t mt-auto">
                      <Link href="/order" className="w-full">
                        <Button className="w-full h-12 text-md" variant={i === 1 ? "default" : "outline"}>
                          اطلب الباقة
                        </Button>
                      </Link>
                    </CardFooter>
                  </Card>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Testimonials Snippet */}
      <section className="py-20 bg-background">
        <div className="container px-4 mx-auto">
          <div className="flex justify-between items-end mb-12">
            <div>
              <h2 className="text-3xl font-bold mb-4">ماذا يقول عملاؤنا؟</h2>
              <p className="text-muted-foreground text-lg">نفخر بثقة عملائنا في خدماتنا.</p>
            </div>
            <Link href="/testimonials">
              <Button variant="ghost" className="hidden sm:flex gap-2">
                عرض المزيد
              </Button>
            </Link>
          </div>

          {isLoadingTestimonials ? (
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
               {[1, 2, 3].map(i => (
                 <Card key={i} className="animate-pulse h-48 bg-muted rounded-xl" />
               ))}
             </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {(Array.isArray(activeTestimonials) ? activeTestimonials : []).slice(0, 3).map((testimonial) => (
                <Card key={testimonial.id} className="bg-muted/30 border-none">
                  <CardContent className="p-6">
                    <div className="flex gap-1 mb-4 text-secondary">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star key={i} className={`w-5 h-5 ${i < (testimonial.rating ?? 0) ? 'fill-current' : 'text-muted'}`} />
                      ))}
                    </div>
                    <p className="text-foreground text-lg mb-6 leading-relaxed line-clamp-3">"{testimonial.comment ?? ""}"</p>
                    <div className="flex items-center gap-3 mt-auto">
                      <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-xl shrink-0">
                        {(testimonial.clientName ?? "?").charAt(0)}
                      </div>
                      <div>
                        <h4 className="font-bold text-base">{testimonial.clientName ?? "Unknown client"}</h4>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
          
          <div className="mt-8 flex justify-center sm:hidden">
             <Link href="/testimonials">
              <Button variant="outline" className="w-full">
                عرض المزيد
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Contact Section */}
      {(settings?.phone1 || settings?.phone2 || settings?.email || settings?.whatsapp || settings?.address) && (
        <section className="py-20 bg-muted/30">
          <div className="container px-4 mx-auto">
            <div className="text-center max-w-2xl mx-auto mb-12">
              <h2 className="text-3xl font-bold mb-4">تواصل معنا</h2>
              <p className="text-muted-foreground text-lg">نحن هنا للإجابة على استفساراتك في أي وقت.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
              {settings?.phone1 && (
                <motion.a
                  href={`tel:${settings.phone1}`}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4 }}
                  className="flex flex-col items-center gap-3 p-6 bg-background rounded-2xl border shadow-sm hover:shadow-md transition-shadow text-center group"
                >
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                    <Phone className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">هاتف</p>
                    <p className="font-semibold" dir="ltr">{settings.phone1}</p>
                    {settings.phone2 && <p className="font-semibold text-sm text-muted-foreground mt-0.5" dir="ltr">{settings.phone2}</p>}
                  </div>
                </motion.a>
              )}

              {settings?.whatsapp && (
                <motion.a
                  href={`https://wa.me/${settings.whatsapp.replace(/[^0-9]/g, "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: 0.05 }}
                  className="flex flex-col items-center gap-3 p-6 bg-background rounded-2xl border shadow-sm hover:shadow-md transition-shadow text-center group"
                >
                  <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center text-green-600 group-hover:bg-green-500 group-hover:text-white transition-colors">
                    <MessageCircle className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">واتساب</p>
                    <p className="font-semibold" dir="ltr">{settings.whatsapp}</p>
                  </div>
                </motion.a>
              )}

              {settings?.email && (
                <motion.a
                  href={`mailto:${settings.email}`}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: 0.1 }}
                  className="flex flex-col items-center gap-3 p-6 bg-background rounded-2xl border shadow-sm hover:shadow-md transition-shadow text-center group"
                >
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                    <Mail className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">البريد الإلكتروني</p>
                    <p className="font-semibold text-sm break-all">{settings.email}</p>
                  </div>
                </motion.a>
              )}

              {settings?.address && (
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: 0.15 }}
                  className="flex flex-col items-center gap-3 p-6 bg-background rounded-2xl border shadow-sm text-center"
                >
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                    <MapPin className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">العنوان</p>
                    <p className="font-semibold text-sm leading-relaxed">{settings.address}</p>
                  </div>
                </motion.div>
              )}
            </div>

            {/* Social Links */}
            {(settings?.facebookUrl || settings?.instagramUrl || settings?.twitterUrl) && (
              <div className="flex justify-center gap-4 mt-10">
                {settings.facebookUrl && (
                  <a href={settings.facebookUrl} target="_blank" rel="noopener noreferrer"
                    className="w-11 h-11 rounded-xl bg-background border flex items-center justify-center text-muted-foreground hover:text-[#1877f2] hover:border-[#1877f2]/30 hover:bg-[#1877f2]/5 transition-all shadow-sm">
                    <Facebook className="w-5 h-5" />
                  </a>
                )}
                {settings.instagramUrl && (
                  <a href={settings.instagramUrl} target="_blank" rel="noopener noreferrer"
                    className="w-11 h-11 rounded-xl bg-background border flex items-center justify-center text-muted-foreground hover:text-[#e1306c] hover:border-[#e1306c]/30 hover:bg-[#e1306c]/5 transition-all shadow-sm">
                    <Instagram className="w-5 h-5" />
                  </a>
                )}
                {settings.twitterUrl && (
                  <a href={settings.twitterUrl} target="_blank" rel="noopener noreferrer"
                    className="w-11 h-11 rounded-xl bg-background border flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-foreground/30 hover:bg-foreground/5 transition-all shadow-sm">
                    <Twitter className="w-5 h-5" />
                  </a>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {/* CTA Section */}
      <section className="py-24 relative overflow-hidden">
        <div className="absolute inset-0 bg-primary" />
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10 mix-blend-overlay" />
        <div className="container px-4 mx-auto relative z-10 text-center">
          <h2 className="text-3xl md:text-5xl font-bold text-primary-foreground mb-6">جاهز لإطلاق موقعك؟</h2>
          <p className="text-primary-foreground/80 text-xl mb-10 max-w-2xl mx-auto">
            انضم إلى المئات من أصحاب الأعمال الذين حققوا نجاحاً باهراً من خلال مواقعهم الإلكترونية الاحترافية.
          </p>
          <Link href="/order">
            <Button size="lg" variant="secondary" className="text-lg h-14 px-10 rounded-xl shadow-2xl hover:scale-105 transition-transform duration-300">
              ابدأ الآن بطلب موقعك
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}

export default function Home() {
  return (
    <ErrorBoundary title="Home runtime error">
      <HomeContent />
    </ErrorBoundary>
  );
}
