import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="min-h-[80vh] w-full flex flex-col items-center justify-center bg-background px-4">
      <div className="text-center max-w-lg mx-auto">
        <h1 className="text-9xl font-black text-primary/20 mb-4">404</h1>
        <h2 className="text-3xl font-bold text-foreground mb-4">الصفحة غير موجودة</h2>
        <p className="text-lg text-muted-foreground mb-8">
          عذراً، الصفحة التي تبحث عنها غير موجودة أو تم نقلها. يرجى التحقق من الرابط والمحاولة مرة أخرى.
        </p>
        <Link href="/">
          <Button size="lg" className="h-14 px-8 text-lg rounded-xl shadow-lg">
            العودة للرئيسية
          </Button>
        </Link>
      </div>
    </div>
  );
}
