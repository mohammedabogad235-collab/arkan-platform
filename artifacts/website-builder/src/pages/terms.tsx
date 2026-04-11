import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowRight, FileText } from "lucide-react";

export default function Terms() {
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
            <FileText className="h-5 w-5 text-primary" />
          </div>
          <h1 className="text-3xl font-bold">الشروط والأحكام</h1>
        </div>
        <p className="text-muted-foreground">آخر تحديث: {new Date().toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" })}</p>
      </div>

      <div className="prose prose-lg max-w-none space-y-8 text-foreground">

        <section className="bg-card rounded-2xl p-6 border shadow-sm">
          <h2 className="text-xl font-bold mb-4 text-primary">1. قبول الشروط</h2>
          <p className="text-muted-foreground leading-relaxed">
            باستخدامك لمنصة بناء المواقع وخدماتها، فإنك توافق على الالتزام بهذه الشروط والأحكام. إذا كنت لا توافق على أي من هذه الشروط، فيرجى عدم استخدام خدماتنا. نحتفظ بالحق في تعديل هذه الشروط في أي وقت، وسيتم إخطارك بأي تغييرات جوهرية.
          </p>
        </section>

        <section className="bg-card rounded-2xl p-6 border shadow-sm">
          <h2 className="text-xl font-bold mb-4 text-primary">2. الخدمات المقدمة</h2>
          <p className="text-muted-foreground leading-relaxed mb-3">
            تقدم المنصة خدمات تصميم وتطوير المواقع الإلكترونية وتشمل على سبيل المثال لا الحصر:
          </p>
          <ul className="list-none space-y-2">
            {[
              "تصميم وتطوير المواقع الإلكترونية المخصصة",
              "المتاجر الإلكترونية وأنظمة إدارة المحتوى",
              "المواقع التعريفية للشركات والأفراد",
              "المنصات التعليمية والمدونات",
              "الاستشارات التقنية والتحسينات",
            ].map((item, i) => (
              <li key={i} className="flex items-center gap-2 text-muted-foreground">
                <span className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </section>

        <section className="bg-card rounded-2xl p-6 border shadow-sm">
          <h2 className="text-xl font-bold mb-4 text-primary">3. سياسة الدفع</h2>
          <div className="space-y-3 text-muted-foreground leading-relaxed">
            <p>يتم الدفع على مرحلتين:</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 my-4">
              <div className="bg-primary/5 rounded-xl p-4 border border-primary/20">
                <div className="text-2xl font-bold text-primary mb-1">50%</div>
                <div className="font-semibold text-foreground mb-1">دفعة مقدمة</div>
                <div className="text-sm">تُدفع قبل البدء في العمل لضمان الجدية والالتزام</div>
              </div>
              <div className="bg-muted rounded-xl p-4 border">
                <div className="text-2xl font-bold mb-1">50%</div>
                <div className="font-semibold text-foreground mb-1">دفعة التسليم</div>
                <div className="text-sm">تُدفع عند تسليم الموقع النهائي وقبوله من العميل</div>
              </div>
            </div>
            <p>لا تُسترد الدفعة المقدمة في حالة إلغاء العميل للمشروع بعد البدء في التنفيذ. في حالة وجود خلل في العمل يعود لخطأ منا، يحق للعميل طلب التعديل بشكل مجاني.</p>
          </div>
        </section>

        <section className="bg-card rounded-2xl p-6 border shadow-sm">
          <h2 className="text-xl font-bold mb-4 text-primary">4. مدة التنفيذ</h2>
          <p className="text-muted-foreground leading-relaxed">
            تختلف مدة تنفيذ المشاريع حسب حجم وتعقيد الطلب. يتم تحديد المدة الزمنية بشكل واضح في اتفاقية العمل قبل البدء. قد تتأثر المدة الزمنية بمدى التزام العميل بتقديم المحتوى والبيانات المطلوبة في الوقت المحدد.
          </p>
        </section>

        <section className="bg-card rounded-2xl p-6 border shadow-sm">
          <h2 className="text-xl font-bold mb-4 text-primary">5. حقوق الملكية الفكرية</h2>
          <p className="text-muted-foreground leading-relaxed">
            بعد إتمام الدفع الكامل، تنتقل ملكية الموقع المصمم بالكامل إلى العميل. يحتفظ الفريق بحق عرض المشروع في معرض الأعمال ما لم يطلب العميل خلاف ذلك. يُحظر على العميل إعادة بيع أو توزيع الكود المصدري أو التصاميم لأطراف ثالثة.
          </p>
        </section>

        <section className="bg-card rounded-2xl p-6 border shadow-sm">
          <h2 className="text-xl font-bold mb-4 text-primary">6. حسابات المستخدمين</h2>
          <p className="text-muted-foreground leading-relaxed">
            أنت مسؤول عن الحفاظ على سرية بيانات تسجيل دخولك وكلمة المرور. يُحظر مشاركة بيانات الدخول مع أشخاص آخرين. في حالة الاشتباه بأي وصول غير مصرح به، يجب إخطارنا فوراً.
          </p>
        </section>

        <section className="bg-card rounded-2xl p-6 border shadow-sm">
          <h2 className="text-xl font-bold mb-4 text-primary">7. التواصل والدعم</h2>
          <p className="text-muted-foreground leading-relaxed">
            نلتزم بالرد على جميع استفسارات العملاء خلال 24 ساعة في أيام العمل. يمكن التواصل معنا عبر البريد الإلكتروني أو من خلال المنصة مباشرة. يُقدم الدعم الفني للمواقع التي تم تسليمها لمدة شهر من تاريخ التسليم بشكل مجاني.
          </p>
        </section>

        <section className="bg-card rounded-2xl p-6 border shadow-sm">
          <h2 className="text-xl font-bold mb-4 text-primary">8. تعديل الشروط</h2>
          <p className="text-muted-foreground leading-relaxed">
            نحتفظ بالحق في تعديل هذه الشروط والأحكام في أي وقت. سيتم إشعار المستخدمين المسجلين بأي تغييرات جوهرية عبر البريد الإلكتروني. استمرار استخدام الخدمة بعد نشر التعديلات يعني قبولك لها.
          </p>
        </section>

        <div className="bg-primary/5 border border-primary/20 rounded-2xl p-6 text-center">
          <p className="text-muted-foreground mb-3">هل لديك أسئلة حول شروطنا وأحكامنا؟</p>
          <p className="font-semibold text-foreground">تواصل معنا وسنكون سعداء بمساعدتك</p>
        </div>
      </div>
    </div>
  );
}
