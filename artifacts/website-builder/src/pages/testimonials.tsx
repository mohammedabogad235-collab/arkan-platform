import { useListTestimonials } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Star } from "lucide-react";
import { motion } from "framer-motion";

export default function Testimonials() {
  const { data: testimonials, isLoading } = useListTestimonials();

  const activeTestimonials = testimonials?.filter(t => t.isActive) || [];

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
          {activeTestimonials.map((testimonial, i) => (
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
    </div>
  );
}
