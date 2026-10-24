import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle } from "lucide-react";
import { apiFetch } from "@/lib/api-fetch";

export default function CertificateVerify() {
  const [location] = useLocation();
  const [loading, setLoading] = useState(true);
  const [valid, setValid] = useState(false);
  const [certificate, setCertificate] = useState<any>(null);
  const [error, setError] = useState("");

  const params = useMemo(() => new URLSearchParams(location.split("?")[1] ?? ""), [location]);
  const serial = (params.get("serial") ?? "").trim();

  useEffect(() => {
    let isMounted = true;

    async function checkCertificate() {
      setLoading(true);
      setError("");
      setValid(false);
      setCertificate(null);

      if (!serial || !/^AW-CERT-\d{4}-\d{6}$/.test(serial)) {
        if (isMounted) {
          setLoading(false);
          setError("رقم الشهادة غير صالح أو غير موجود.");
        }
        return;
      }

      try {
        const res = await apiFetch(`/api/certificates/verify?serial=${encodeURIComponent(serial)}`);
        const data = await res.json().catch(() => ({}));

        if (!res.ok || !data?.valid) {
          throw new Error(data?.error || "الشهادة غير موجودة");
        }

        if (isMounted) {
          setValid(true);
          setCertificate(data.certificate ?? null);
        }
      } catch (err: any) {
        if (isMounted) setError(err?.message || "تعذر التحقق من الشهادة.");
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    checkCertificate();
    return () => {
      isMounted = false;
    };
  }, [serial]);

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-16" dir="rtl">
      <div className="mx-auto max-w-2xl">
        <Card className="border shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-2xl">
              {loading ? <span className="h-5 w-5 rounded-full border-2 border-slate-300 border-t-primary animate-spin" /> : valid ? <CheckCircle2 className="text-emerald-600" /> : <XCircle className="text-red-500" />}
              التحقق من الشهادة
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <p className="text-sm text-muted-foreground">جاري التحقق من الشهادة...</p>
            ) : valid ? (
              <>
                <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">الشهادة صالحة</Badge>
                <p className="text-lg">رقم الشهادة: <strong>{serial}</strong></p>
                <p className="text-sm text-muted-foreground">تم التحقق من هذا الرقم بنجاح في نظام Arkan Web Certificate Studio.</p>
                {certificate && (
                  <div className="rounded-xl border bg-muted/20 p-4 text-sm space-y-2">
                    <p><strong>المتدرب:</strong> {certificate.recipientName || "-"}</p>
                    <p><strong>البرنامج:</strong> {certificate.programTitle || "-"}</p>
                    <p><strong>الجهة المصدرة:</strong> {certificate.issuerName || "Arkan Web"}</p>
                    <p><strong>الحالة:</strong> {certificate.status || "issued"}</p>
                  </div>
                )}
              </>
            ) : (
              <>
                <Badge variant="outline" className="border-red-200 text-red-700 bg-red-50">الشهادة غير موجودة أو رقم غير صالح</Badge>
                <p className="text-sm text-muted-foreground">{error || "يرجى التحقق من الرابط أو رقم الشهادة."}</p>
              </>
            )}
            <Button onClick={() => window.location.href = "/"}>العودة إلى الرئيسية</Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
