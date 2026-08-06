import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowRight, Shield } from "lucide-react";
import { useSettings } from "@/lib/use-settings";

const DEFAULT_PRIVACY = [
  {
    title: "1. التزامنا بحماية خصوصيتك",
    body: "نأخذ خصوصية مستخدمينا على محمل الجد. توضح هذه السياسة كيفية جمع بياناتك الشخصية واستخدامها وحمايتها. باستخدامك لخدماتنا، فإنك توافق على ممارسات جمع البيانات المبينة هنا.",
  },
  {
    title: "2. البيانات التي نجمعها",
    body: "نجمع بيانات الحساب (الاسم، البريد الإلكتروني، رقم الهاتف، اسم المستخدم وكلمة المرور المشفرة)، وبيانات الطلبات (تفاصيل المشاريع، الباقة المختارة، تفضيلات الدفع)، والبيانات التقنية الضرورية (سجلات الدخول، نوع المتصفح).",
  },
  {
    title: "3. كيف نستخدم بياناتك",
    body: "نستخدم البيانات لإنشاء وإدارة حسابك، ومعالجة طلباتك والتواصل بشأنها، وتقديم الدعم الفني، وإرسال إشعارات عن حالة مشاريعك، وتحسين خدماتنا وتجربة المستخدم.",
  },
  {
    title: "4. حماية بياناتك",
    body: "نتخذ تدابير أمنية صارمة تشمل: تشفير كلمات المرور، استخدام جلسات آمنة (HTTPS)، والتحكم في وصول المدراء المعتمدين فقط إلى بيانات المستخدمين.",
  },
  {
    title: "5. مشاركة البيانات مع الأطراف الثالثة",
    body: "لا نبيع أو نشارك بياناتك الشخصية مع أطراف ثالثة لأغراض تجارية. قد نشارك بياناتك فقط بموافقتك الصريحة، أو للامتثال للقانون، أو لحماية حقوقنا القانونية.",
  },
  {
    title: "6. حقوقك كمستخدم",
    body: "يحق لك الاطلاع على بياناتك المحفوظة، وطلب تصحيح أي بيانات غير دقيقة، وطلب حذف حسابك وبياناتك، والاعتراض على استخدام بياناتك لأغراض معينة.",
  },
  {
    title: "7. ملفات تعريف الارتباط",
    body: "نستخدم ملفات تعريف الارتباط الضرورية فقط للحفاظ على جلسة تسجيل دخولك. لا نستخدمها للتتبع الإعلاني أو مشاركتها مع أطراف ثالثة.",
  },
  {
    title: "8. التواصل معنا",
    body: "إذا كان لديك أسئلة أو مخاوف بشأن سياسة الخصوصية، تواصل معنا مباشرة من خلال المنصة وسنرد عليك في أقرب وقت.",
  },
];

// Calculate the date once outside the component.
const lastUpdatedDate = new Date().toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" });

export default function Privacy() {
  const { data: settings, isLoading } = useSettings();
  const customContent = settings?.privacyPolicy?.trim() || "";

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
            <Shield className="h-5 w-5 text-primary" />
          </div>
          <h1 className="text-3xl font-bold">سياسة الخصوصية</h1>
        </div>
        <p className="text-muted-foreground">
          آخر تحديث: {lastUpdatedDate}
        </p>
      </div>

      {isLoading ? (
        <div className="bg-card rounded-2xl border p-12 text-center text-muted-foreground">جاري التحميل...</div>
      ) : customContent ? (
        <div className="bg-card rounded-2xl border shadow-sm p-8">
          <div className="prose prose-lg max-w-none text-foreground leading-loose whitespace-pre-wrap">{customContent}</div>
        </div>
      ) : (
        <div className="prose prose-lg max-w-none space-y-6 text-foreground">
          {DEFAULT_PRIVACY.map((section, i) => (
            <section key={i} className="bg-card rounded-2xl p-6 border shadow-sm">
              <h2 className="text-xl font-bold mb-4 text-primary">{section.title}</h2>
              <p className="text-muted-foreground leading-relaxed">{section.body}</p>
            </section>
          ))}
          <div className="bg-primary/5 border border-primary/20 rounded-2xl p-6 text-center">
            <p className="text-muted-foreground mb-2">خصوصيتك تهمنا — نلتزم بحماية بياناتك دائماً</p>
            <p className="font-semibold text-foreground text-sm">
              آخر مراجعة: {new Date().toLocaleDateString("ar-EG", { year: "numeric", month: "long" })}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
