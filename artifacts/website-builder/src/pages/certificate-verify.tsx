import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle } from "lucide-react";
import { apiFetch } from "@/lib/api-fetch";

export default function CertificateVerify() {
  const [location, setLocation] = useLocation();
  const [loading, setLoading] = useState(true);
  const [valid, setValid] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const [certificate, setCertificate] = useState<any>(null);
  const [error, setError] = useState("");
  const [searchValue, setSearchValue] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanFrameRef = useRef<number | null>(null);

  const params = useMemo(() => new URLSearchParams(location.split("?")[1] ?? ""), [location]);
  const serial = (params.get("serial") ?? "").trim();

  useEffect(() => {
    setSearchValue(serial);
  }, [serial]);

  useEffect(() => {
    let isMounted = true;

    async function checkCertificate() {
      setLoading(true);
      setError("");
      setValid(false);
      setCancelled(false);
      setCertificate(null);

      if (!serial) {
        if (isMounted) setLoading(false);
        return;
      }

      if (!/^AW-CERT-\d{4}-\d{6}$/.test(serial)) {
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
          if (data?.cancelled) {
            if (isMounted) {
              setValid(false);
              setCancelled(true);
              setError("تم إلغاء هذه الشهادة وهي غير صالحة للاستخدام.");
            }
            return;
          }
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

  const handleLookup = (event: React.FormEvent) => {
    event.preventDefault();
    setLocation(`/certificate/verify?serial=${encodeURIComponent(searchValue.trim())}`);
  };

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (scanFrameRef.current !== null) cancelAnimationFrame(scanFrameRef.current);
    scanFrameRef.current = null;
    setCameraOpen(false);
  };

  const startCamera = async () => {
    setCameraError("");
    const Detector = (window as Window & {
      BarcodeDetector?: new (options: { formats: string[] }) => {
        detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue: string }>>;
      };
    }).BarcodeDetector;
    if (!Detector) {
      setCameraError("هذا المتصفح لا يدعم قراءة QR بالكاميرا. أدخل رقم الشهادة يدوياً.");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("يتطلب مسح QR اتصالاً آمناً (HTTPS) وإتاحة الكاميرا.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      streamRef.current = stream;
      if (!videoRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        return;
      }
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      setCameraOpen(true);
      const detector = new Detector({ formats: ["qr_code"] });
      const scan = async () => {
        const video = videoRef.current;
        if (!video || !streamRef.current) return;
        if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
          scanFrameRef.current = requestAnimationFrame(() => void scan());
          return;
        }
        try {
          const codes = await detector.detect(video);
          for (const code of codes) {
            let scannedSerial = code.rawValue.trim();
            try {
              const scannedUrl = new URL(scannedSerial);
              scannedSerial = scannedUrl.searchParams.get("serial") || scannedSerial;
            } catch {
              // QR content can be a serial number rather than a URL.
            }
            const match = scannedSerial.match(/AW-CERT-\d{4}-\d{6}/);
            if (match) {
              setSearchValue(match[0]);
              stopCamera();
              setLocation(`/certificate/verify?serial=${encodeURIComponent(match[0])}`);
              return;
            }
          }
        } catch {
          setCameraError("تعذر قراءة رمز QR. تأكد من وضوح الرمز ثم حاول مجدداً.");
          stopCamera();
          return;
        }
        if (streamRef.current) scanFrameRef.current = requestAnimationFrame(() => void scan());
      };
      scanFrameRef.current = requestAnimationFrame(() => void scan());
    } catch (error) {
      setCameraError(error instanceof Error && error.name === "NotAllowedError"
        ? "تم رفض إذن الكاميرا. يمكنك إدخال رقم الشهادة يدوياً."
        : "تعذر تشغيل الكاميرا. تحقق من إعدادات المتصفح وحاول مجدداً.");
      stopCamera();
    }
  };

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    if (scanFrameRef.current !== null) cancelAnimationFrame(scanFrameRef.current);
  }, []);

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
            <form onSubmit={handleLookup} className="flex flex-col gap-2 sm:flex-row">
              <input
                value={searchValue}
                onChange={(event) => setSearchValue(event.target.value)}
                placeholder="أدخل رقم الشهادة للتحقق"
                className="min-w-0 flex-1 rounded-md border bg-background px-3 py-2"
                dir="ltr"
                aria-label="رقم الشهادة"
              />
              <Button type="submit" disabled={!searchValue.trim() || loading}>التحقق من الشهادة</Button>
            </form>
            <div className="space-y-2">
              {!cameraOpen ? (
                <Button type="button" variant="outline" onClick={() => void startCamera()}>مسح رمز QR بالكاميرا</Button>
              ) : (
                <Button type="button" variant="outline" onClick={stopCamera}>إيقاف الكاميرا</Button>
              )}
              <video ref={videoRef} className={`${cameraOpen ? "" : "hidden"} max-h-72 w-full rounded-lg bg-black object-contain`} autoPlay playsInline muted aria-label="كاميرا مسح رمز QR" />
              {cameraError && <p role="alert" className="text-sm text-amber-700">{cameraError}</p>}
            </div>
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
                    <p><strong>تاريخ الإصدار:</strong> {certificate.issueDate ? new Date(certificate.issueDate).toLocaleDateString("ar-EG") : "-"}</p>
                    <p><strong>الحالة:</strong> سارية</p>
                  </div>
                )}
              </>
            ) : (
              <>
                <Badge variant="outline" className={cancelled ? "border-amber-200 text-amber-800 bg-amber-50" : "border-red-200 text-red-700 bg-red-50"}>
                  {cancelled ? "الشهادة ملغاة" : "الشهادة غير موجودة"}
                </Badge>
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
