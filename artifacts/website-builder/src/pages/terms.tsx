import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowRight, FileText } from "lucide-react";
import { useSettings } from "@/lib/use-settings";

const DEFAULT_TERMS = [
  {
    title: "1. قبول الشروط",
    body: "باستخدامك للمنصة وخدماتها، فإنك توافق على الالتزام بهذه الشروط والأحكام. إذا كنت لا توافق على أي من هذه الشروط، فيرجى عدم استخدام خدماتنا. نحتفظ بالحق في تعديل هذه الشروط في أي وقت، وسيتم إخطارك بأي تغييرات جوهرية.",
  },
  {
    title: "2. الخدمات المقدمة",
    body: "تقدم المنصة خدمات تصميم وتطوير المواقع الإلكترونية وتشمل: تصميم المواقع المخصصة، المتاجر الإلكترونية، المواقع التعريفية، المنصات التعليمية والمدونات، والاستشارات التقنية.",
  },
  {
    title: "3. سياسة الدفع",
    body: "يتم الدفع على مرحلتين: دفعة مقدمة (50%) قبل البدء في العمل لضمان الجدية، ودفعة التسليم (50%) عند تسليم الموقع النهائي وقبوله. لا تُسترد الدفعة المقدمة في حالة إلغاء العميل للمشروع بعد البدء.",
  },
  {
    title: "4. مدة التنفيذ",
    body: "تختلف مدة تنفيذ المشاريع حسب حجم وتعقيد الطلب. يتم تحديد المدة الزمنية بوضوح في اتفاقية العمل. قد تتأثر المدة بمدى التزام العميل بتقديم المحتوى والبيانات في الوقت المحدد.",
  },
  {
    title: "5. حقوق الملكية الفكرية",
    body: "بعد إتمام الدفع الكامل، تنتقل ملكية الموقع بالكامل إلى العميل. يحتفظ الفريق بحق عرض المشروع في معرض الأعمال ما لم يطلب العميل خلاف ذلك.",
  },
  {
    title: "6. حسابات المستخدمين",
    body: "أنت مسؤول عن الحفاظ على سرية بيانات تسجيل دخولك. يُحظر مشاركة بيانات الدخول مع أشخاص آخرين. في حالة الاشتباه بأي وصول غير مصرح، يجب إخطارنا فوراً.",
  },
  {
    title: "7. التواصل والدعم",
    body: "نلتزم بالرد على جميع الاستفسارات خلال 24 ساعة في أيام العمل. يُقدم الدعم الفني للمواقع المُسلَّمة لمدة شهر من تاريخ التسليم بشكل مجاني.",
  },
  {
    title: "8. تعديل الشروط",
    body: "نحتفظ بالحق في تعديل هذه الشروط في أي وقت. سيتم إشعار المستخدمين بأي تغييرات جوهرية. استمرار استخدام الخدمة بعد نشر التعديلات يعني قبولك لها.",
  },
];

// Calculate the date once outside the component to prevent re-calculation on every render.
const lastUpdatedDate = new Date().toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" });

export default function Terms() {
  const { data: settings, isLoading } = useSettings();
  const customContent = settings?.termsAndConditions?.trim() || "";

  return (
    // Added responsive padding
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-12 max-w-4xl">
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
        <p className="text-muted-foreground">
          آخر تحديث: {lastUpdatedDate}
        </p>
      </div>

      {isLoading ? (
        // Use theme-aware color `bg-card` instead of hardcoded `bg-white`
        <div className="bg-card rounded-2xl border p-12 text-center text-muted-foreground">جاري التحميل...</div>
      ) : customContent ? (
        // Use `prose` for consistent typography with the default content.
        <div className="bg-card rounded-2xl border shadow-sm p-8">
          <div className="prose prose-lg max-w-none text-foreground leading-loose whitespace-pre-wrap">{customContent}</div>
        </div>
      ) : (
        <div className="prose prose-lg max-w-none space-y-6 text-foreground">
          {(Array.isArray(DEFAULT_TERMS) ? DEFAULT_TERMS : []).map((section, i) => (
            <section key={i} className="bg-card rounded-2xl p-6 border shadow-sm">
              <h2 className="text-xl font-bold mb-4 text-primary">{section.title}</h2>
              <p className="text-muted-foreground leading-relaxed">{section.body}</p>
            </section>
          ))}
          <div className="bg-primary/5 border border-primary/20 rounded-2xl p-6 text-center">
            <p className="text-muted-foreground mb-3">هل لديك أسئلة حول شروطنا وأحكامنا؟</p>
            <p className="font-semibold text-foreground">تواصل معنا وسنكون سعداء بمساعدتك</p>
          </div>
        </div>
      )}
    </div>
  );
}
