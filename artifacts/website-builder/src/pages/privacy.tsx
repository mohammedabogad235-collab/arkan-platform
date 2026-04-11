import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowRight, Shield } from "lucide-react";

export default function Privacy() {
  return (
    <div className="container mx-auto px-4 py-12 max-w-4xl">
      <div className="mb-8">
        <Link href="/">
          <Button variant="ghost" className="mb-4 gap-2">
            <ArrowRight className="h-4 w-4" />
            العودة للرئيسية
          </Button>
        </Link>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Shield className="h-5 w-5 text-primary" />
          </div>
          <h1 className="text-3xl font-bold">سياسة الخصوصية</h1>
        </div>
        <p className="text-muted-foreground">آخر تحديث: {new Date().toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" })}</p>
      </div>

      <div className="prose prose-lg max-w-none space-y-8 text-foreground">

        <section className="bg-card rounded-2xl p-6 border shadow-sm">
          <h2 className="text-xl font-bold mb-4 text-primary">1. التزامنا بحماية خصوصيتك</h2>
          <p className="text-muted-foreground leading-relaxed">
            نحن في منصة بناء المواقع نأخذ خصوصية مستخدمينا على محمل الجد. توضح هذه السياسة كيفية جمع بياناتك الشخصية واستخدامها وحمايتها. باستخدامك لخدماتنا، فإنك توافق على ممارسات جمع البيانات المبينة في هذه السياسة.
          </p>
        </section>

        <section className="bg-card rounded-2xl p-6 border shadow-sm">
          <h2 className="text-xl font-bold mb-4 text-primary">2. البيانات التي نجمعها</h2>
          <p className="text-muted-foreground leading-relaxed mb-4">نجمع الأنواع التالية من البيانات:</p>

          <div className="space-y-4">
            <div className="bg-muted/50 rounded-xl p-4">
              <h3 className="font-semibold text-foreground mb-2">بيانات الحساب</h3>
              <ul className="space-y-1 text-sm text-muted-foreground">
                <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-primary" />الاسم الكامل</li>
                <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-primary" />البريد الإلكتروني</li>
                <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-primary" />رقم الهاتف</li>
                <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-primary" />اسم المستخدم وكلمة المرور المشفرة</li>
              </ul>
            </div>
            <div className="bg-muted/50 rounded-xl p-4">
              <h3 className="font-semibold text-foreground mb-2">بيانات الطلبات</h3>
              <ul className="space-y-1 text-sm text-muted-foreground">
                <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-primary" />تفاصيل المشاريع المطلوبة</li>
                <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-primary" />تفضيلات الدفع والباقة المختارة</li>
                <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-primary" />تاريخ ووقت الطلبات</li>
              </ul>
            </div>
            <div className="bg-muted/50 rounded-xl p-4">
              <h3 className="font-semibold text-foreground mb-2">البيانات التقنية</h3>
              <ul className="space-y-1 text-sm text-muted-foreground">
                <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-primary" />سجلات الدخول والخروج</li>
                <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-primary" />نوع المتصفح ونظام التشغيل</li>
              </ul>
            </div>
          </div>
        </section>

        <section className="bg-card rounded-2xl p-6 border shadow-sm">
          <h2 className="text-xl font-bold mb-4 text-primary">3. كيف نستخدم بياناتك</h2>
          <p className="text-muted-foreground leading-relaxed mb-3">نستخدم البيانات المجمعة للأغراض التالية:</p>
          <ul className="space-y-2">
            {[
              "إنشاء وإدارة حسابك على المنصة",
              "معالجة طلباتك والتواصل معك بشأنها",
              "تقديم الدعم الفني والإجابة على استفساراتك",
              "إرسال إشعارات حول حالة مشاريعك",
              "تحسين خدماتنا وتجربة المستخدم",
              "الامتثال للمتطلبات القانونية والتنظيمية",
            ].map((item, i) => (
              <li key={i} className="flex items-center gap-2 text-muted-foreground">
                <span className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </section>

        <section className="bg-card rounded-2xl p-6 border shadow-sm">
          <h2 className="text-xl font-bold mb-4 text-primary">4. حماية بياناتك</h2>
          <p className="text-muted-foreground leading-relaxed mb-4">
            نتخذ تدابير أمنية صارمة لحماية بياناتك الشخصية:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { title: "تشفير كلمات المرور", desc: "يتم تخزين كلمات المرور بشكل مشفر ولا يمكن لأحد الاطلاع عليها" },
              { title: "جلسات آمنة", desc: "نستخدم ملفات تعريف الارتباط الآمنة لحماية جلسات تسجيل الدخول" },
              { title: "تشفير البيانات", desc: "يتم نقل جميع البيانات عبر اتصالات مشفرة (HTTPS)" },
              { title: "تحكم في الوصول", desc: "يمكن للمدراء المعتمدين فقط الوصول إلى بيانات المستخدمين" },
            ].map((item, i) => (
              <div key={i} className="bg-muted/50 rounded-xl p-4">
                <h3 className="font-semibold text-foreground mb-1">{item.title}</h3>
                <p className="text-sm text-muted-foreground">{item.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-card rounded-2xl p-6 border shadow-sm">
          <h2 className="text-xl font-bold mb-4 text-primary">5. مشاركة البيانات مع الأطراف الثالثة</h2>
          <p className="text-muted-foreground leading-relaxed">
            لا نبيع أو نشارك بياناتك الشخصية مع أطراف ثالثة لأغراض تجارية. قد نشارك بياناتك فقط في الحالات التالية:
          </p>
          <ul className="mt-3 space-y-2">
            {[
              "بموافقتك الصريحة المسبقة",
              "للامتثال لأحكام القانون أو أوامر المحاكم",
              "لحماية حقوقنا القانونية في حالة النزاعات",
            ].map((item, i) => (
              <li key={i} className="flex items-center gap-2 text-muted-foreground">
                <span className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </section>

        <section className="bg-card rounded-2xl p-6 border shadow-sm">
          <h2 className="text-xl font-bold mb-4 text-primary">6. حقوقك كمستخدم</h2>
          <p className="text-muted-foreground leading-relaxed mb-4">لديك الحق في:</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[
              "الاطلاع على بياناتك الشخصية المحفوظة لدينا",
              "طلب تصحيح أي بيانات غير دقيقة",
              "طلب حذف حسابك وبياناتك",
              "الاعتراض على استخدام بياناتك لأغراض معينة",
            ].map((item, i) => (
              <div key={i} className="bg-muted/50 rounded-xl p-3 flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center font-bold flex-shrink-0 mt-0.5">{i + 1}</span>
                <p className="text-sm text-muted-foreground">{item}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-card rounded-2xl p-6 border shadow-sm">
          <h2 className="text-xl font-bold mb-4 text-primary">7. ملفات تعريف الارتباط</h2>
          <p className="text-muted-foreground leading-relaxed">
            نستخدم ملفات تعريف الارتباط (Cookies) الضرورية فقط للحفاظ على جلسة تسجيل دخولك وضمان أمانها. لا نستخدم ملفات تعريف الارتباط لأغراض التتبع الإعلاني أو مشاركتها مع أطراف ثالثة.
          </p>
        </section>

        <section className="bg-card rounded-2xl p-6 border shadow-sm">
          <h2 className="text-xl font-bold mb-4 text-primary">8. التواصل معنا</h2>
          <p className="text-muted-foreground leading-relaxed">
            إذا كان لديك أي أسئلة أو مخاوف بشأن سياسة الخصوصية أو طريقة تعاملنا مع بياناتك الشخصية، يرجى التواصل معنا مباشرة من خلال المنصة وسنرد عليك في أقرب وقت ممكن.
          </p>
        </section>

        <div className="bg-primary/5 border border-primary/20 rounded-2xl p-6 text-center">
          <p className="text-muted-foreground mb-2">خصوصيتك تهمنا — نلتزم بحماية بياناتك دائماً</p>
          <p className="font-semibold text-foreground text-sm">آخر مراجعة لهذه السياسة: {new Date().toLocaleDateString("ar-EG", { year: "numeric", month: "long" })}</p>
        </div>
      </div>
    </div>
  );
}
