import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowRight, FileText } from "lucide-react";
import { useSettings } from "@/lib/use-settings";

export default function Terms() {
  const { data: settings, isLoading } = useSettings();
  const content = (settings as any)?.termsAndConditions || "";

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
        <p className="text-muted-foreground">
          آخر تحديث: {new Date().toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" })}
        </p>
      </div>

      {isLoading ? (
        <div className="bg-white rounded-2xl border p-12 text-center text-muted-foreground">جاري التحميل...</div>
      ) : content ? (
        <div className="bg-white rounded-2xl border shadow-sm p-8">
          <p className="text-foreground leading-loose whitespace-pre-wrap text-base">{content}</p>
        </div>
      ) : (
        <div className="bg-muted/30 rounded-2xl border p-12 text-center">
          <FileText className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground font-medium">لم تُضف الشروط والأحكام بعد</p>
          <p className="text-sm text-muted-foreground mt-1">يمكن للأدمن إضافتها من لوحة التحكم ← الإعدادات</p>
        </div>
      )}
    </div>
  );
}
