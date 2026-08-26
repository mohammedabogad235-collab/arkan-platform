import { useState } from "react";
import { useListTestimonials, useCreateTestimonial, getListTestimonialsQueryKey } from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Star, Send, CheckCircle } from "lucide-react";
import { motion } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export default function Testimonials() {
  const { data: testimonials, isLoading } = useListTestimonials();
  const { user, isAuthenticated } = useAuth();
  const createTestimonial = useCreateTestimonial();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [form, setForm] = useState({ clientName: user?.fullName || "", rating: 5, comment: "" });
  const [submitted, setSubmitted] = useState(false);

  const activeTestimonials = (Array.isArray(testimonials) ? testimonials : []).filter((t) => t?.isActive);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.comment.trim()) return;
    createTestimonial.mutate(
      { data: { clientName: form.clientName || user?.fullName || "مجهول", rating: form.rating, comment: form.comment, isActive: false } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListTestimonialsQueryKey() });
          setSubmitted(true);
          setForm({ clientName: user?.fullName || "", rating: 5, comment: "" });
        },
        onError: () => {
          toast({ variant: "destructive", title: "خطأ", description: "تعذر إرسال رأيك، حاول مجدداً" });
        },
      }
    );
  };

  return (
    <div className="container mx-auto px-4 py-16 max-w-6xl">
      <div className="text-center max-w-3xl mx-auto mb-16">
        <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-6">آراء عملائنا</h1>
        <p className="text-muted-foreground text-xl leading-relaxed">
          نفخر بالثقة التي يوليها إيانا عملاؤنا الكرام. تصفح تجاربهم في العمل معنا لبناء مواقعهم الإلكترونية.
        </p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <Card key={i} className="animate-pulse h-64 bg-muted rounded-xl border-none" />
          ))}
        </div>
      ) : activeTestimonials.length === 0 ? (
        <div className="text-center py-20 bg-muted/30 rounded-2xl border border-dashed">
          <p className="text-xl text-muted-foreground">لا توجد آراء للعملاء حالياً.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {(Array.isArray(activeTestimonials) ? activeTestimonials : []).map((testimonial, i) => (
            <motion.div
              key={testimonial.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
            >
              <Card className="h-full bg-card hover:shadow-xl transition-shadow duration-300 border-border/50">
                <CardContent className="p-8 flex flex-col h-full">
                  <div className="flex gap-1 mb-6 text-secondary">
                    {Array.from({ length: 5 }).map((_, j) => (
                      <Star key={j} className={`w-5 h-5 ${j < testimonial.rating ? 'fill-current' : 'text-muted'}`} />
                    ))}
                  </div>
                  <p className="text-foreground text-lg mb-8 leading-relaxed flex-1">
                    "{testimonial.comment}"
                  </p>
                  <div className="flex items-center gap-4 mt-auto pt-6 border-t border-border/50">
                    <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-2xl shrink-0">
                      {testimonial.clientName.charAt(0)}
                    </div>
                    <div>
                      <h4 className="font-bold text-lg">{testimonial.clientName}</h4>
                      <p className="text-sm text-muted-foreground">عميل مميز</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      <div className="mt-20 max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold mb-2">شاركنا رأيك</h2>
          <p className="text-muted-foreground">
            {isAuthenticated
              ? "نقدّر وقتك ورأيك — سيظهر تقييمك بعد مراجعته"
              : "سجّل الدخول أولاً لتتمكن من إضافة رأيك"}
          </p>
        </div>

        {!isAuthenticated ? (
          <div className="text-center py-10 bg-muted/30 rounded-2xl border border-dashed">
            <p className="text-muted-foreground mb-4">يجب تسجيل الدخول لإضافة رأيك</p>
            <a href="/login">
              <Button>تسجيل الدخول</Button>
            </a>
          </div>
        ) : submitted ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center py-12 bg-green-50 rounded-2xl border border-green-200"
          >
            <CheckCircle className="w-14 h-14 text-green-500 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-green-700 mb-2">شكراً لك!</h3>
            <p className="text-green-600">تم استلام رأيك وسيظهر بعد مراجعته من الفريق</p>
            <Button variant="outline" className="mt-6" onClick={() => setSubmitted(false)}>إضافة رأي آخر</Button>
          </motion.div>
        ) : (
          <Card className="shadow-lg border-border/50">
            <CardContent className="p-8">
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-1.5">
                  <Label>الاسم</Label>
                  <Input
                    value={form.clientName}
                    onChange={e => setForm(f => ({ ...f, clientName: e.target.value }))}
                    placeholder="اسمك الكامل"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>تقييمك</Label>
                  <div className="flex gap-2">
                    {[1, 2, 3, 4, 5].map(star => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setForm(f => ({ ...f, rating: star }))}
                        className="p-1 transition-transform hover:scale-110"
                      >
                        <Star
                          className={`w-8 h-8 transition-colors ${
                            star <= form.rating ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground"
                          }`}
                        />
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>رأيك عن خدماتنا</Label>
                  <Textarea
                    value={form.comment}
                    onChange={e => setForm(f => ({ ...f, comment: e.target.value }))}
                    placeholder="شاركنا تجربتك معنا..."
                    rows={4}
                    required
                    className="resize-none"
                  />
                </div>

                <Button type="submit" className="w-full" disabled={createTestimonial.isPending}>
                  <Send className="w-4 h-4 ms-2" />
                  {createTestimonial.isPending ? "جاري الإرسال..." : "إرسال التقييم"}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
