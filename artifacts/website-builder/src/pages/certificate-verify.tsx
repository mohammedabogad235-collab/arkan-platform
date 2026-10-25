import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  ExternalLink,
  FileCheck2,
  QrCode,
  Search,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { apiFetch } from "@/lib/api-fetch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type VerificationStatus =
  | "idle"
  | "loading"
  | "valid"
  | "cancelled"
  | "not-found"
  | "invalid"
  | "error";

type PublicCertificate = {
  serialNumber: string;
  recipientName: string;
  programTitle: string;
  issuerName: string;
  issueDate: string | null;
  status: string;
  partners?: string[];
  pdfUrl?: string;
};

type VerificationResponse = {
  valid?: boolean;
  cancelled?: boolean;
  error?: string;
  certificate?: PublicCertificate;
};

const SERIAL_PATTERN = /^AW-CERT-\d{4}-\d{6}$/;

function certificateSerialFromQr(rawValue: string): string | null {
  const value = rawValue.trim();
  let serial = value;

  try {
    const url = new URL(value);
    if (url.pathname.replace(/\/+$/, "") !== "/certificate/verify") return null;
    serial = url.searchParams.get("serial") ?? "";
  } catch {
    // QR codes may contain the serial directly instead of a URL.
  }

  return SERIAL_PATTERN.test(serial) ? serial : null;
}

export default function CertificateVerify() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const [searchValue, setSearchValue] = useState("");
  const [status, setStatus] = useState<VerificationStatus>("idle");
  const [certificate, setCertificate] = useState<PublicCertificate | null>(null);
  const [message, setMessage] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [copied, setCopied] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanFrameRef = useRef<number | null>(null);
  const verificationRequestRef = useRef(0);
  const skipUrlVerificationRef = useRef<string | null>(null);
  const params = new URLSearchParams(search);
  const serial = (params.get("serial") ?? "").trim();

  const verifyCertificate = async (rawSerial: string) => {
    const value = rawSerial.trim();
    const requestId = ++verificationRequestRef.current;
    setCertificate(null);
    setMessage("");

    if (!value) {
      setStatus("idle");
      return;
    }

    if (!SERIAL_PATTERN.test(value)) {
      setStatus("invalid");
      return;
    }

    setStatus("loading");
    try {
      const response = await apiFetch(
        `/api/certificates/verify?serial=${encodeURIComponent(value)}`,
      );
      const data = (await response.json().catch(() => ({}))) as VerificationResponse;
      if (requestId !== verificationRequestRef.current) return;

      if (response.status === 410 || data.cancelled) {
        setStatus("cancelled");
        setCertificate(data.certificate ?? null);
        setMessage(data.error || "تم إلغاء هذه الشهادة وهي غير صالحة للاستخدام.");
        return;
      }

      if (response.status === 404) {
        setStatus("not-found");
        setMessage(data.error || "لم يتم العثور على شهادة بهذا الرقم.");
        return;
      }

      if (!response.ok) {
        setStatus("error");
        setMessage(data.error || "تعذر إكمال التحقق حالياً. حاول مرة أخرى.");
        return;
      }

      if (!data.valid || !data.certificate) {
        setStatus("error");
        setMessage("تعذر قراءة نتيجة التحقق من الخادم. حاول مرة أخرى.");
        return;
      }

      setStatus("valid");
      setCertificate(data.certificate);
    } catch {
      if (requestId !== verificationRequestRef.current) return;
      setStatus("error");
      setMessage("تعذر الاتصال بالخادم. تحقق من اتصالك بالإنترنت ثم حاول مرة أخرى.");
    }
  };

  useEffect(() => {
    if (!serial) {
      verificationRequestRef.current += 1;
      setSearchValue("");
      setCertificate(null);
      setMessage("");
      setStatus("idle");
      return;
    }

    setSearchValue(serial);
    if (skipUrlVerificationRef.current === serial) {
      skipUrlVerificationRef.current = null;
      return;
    }

    void verifyCertificate(serial);
  }, [serial]);

  const handleLookup = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = searchValue.trim();
    if (!value) {
      verificationRequestRef.current += 1;
      setCertificate(null);
      setMessage("");
      setStatus("idle");
      return;
    }

    if (serial !== value) {
      skipUrlVerificationRef.current = value;
      setLocation(`/certificate/verify?serial=${encodeURIComponent(value)}`);
    }
    void verifyCertificate(value);
  };

  const handleSearchChange = (value: string) => {
    verificationRequestRef.current += 1;
    setSearchValue(value);
    setCertificate(null);
    setMessage("");
    setStatus("idle");
  };

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (scanFrameRef.current !== null) cancelAnimationFrame(scanFrameRef.current);
    scanFrameRef.current = null;
    setCameraOpen(false);
  };

  useEffect(() => {
    if (!cameraOpen) return;

    let isActive = true;
    const startCamera = async () => {
      setCameraError("");
      const Detector = (window as Window & {
        BarcodeDetector?: new (options: { formats: string[] }) => {
          detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue: string }>>;
        };
      }).BarcodeDetector;

      if (!Detector) {
        setCameraError("هذا المتصفح لا يدعم قراءة QR بالكاميرا. استخدم الإدخال اليدوي.");
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError("يتطلب مسح QR اتصالاً آمناً (HTTPS) وإتاحة الكاميرا.");
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (!isActive) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => resolve());
        });

        const video = videoRef.current;
        if (!video) throw new Error("Camera preview is unavailable.");
        video.srcObject = stream;
        await video.play();
        const detector = new Detector({ formats: ["qr_code"] });

        const scan = async () => {
          if (!isActive || !streamRef.current || !videoRef.current) return;
          try {
            if (videoRef.current.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
              const codes = await detector.detect(videoRef.current);
              for (const code of codes) {
                const scannedSerial = certificateSerialFromQr(code.rawValue);
                if (!scannedSerial) continue;
                setSearchValue(scannedSerial);
                setCameraOpen(false);
                if (serial !== scannedSerial) {
                  skipUrlVerificationRef.current = scannedSerial;
                  setLocation(`/certificate/verify?serial=${encodeURIComponent(scannedSerial)}`);
                }
                void verifyCertificate(scannedSerial);
                return;
              }
            }
          } catch {
            if (isActive) setCameraError("تعذر قراءة رمز QR. تأكد من وضوح الرمز ثم حاول مجدداً.");
            return;
          }
          if (isActive && streamRef.current) {
            scanFrameRef.current = requestAnimationFrame(() => void scan());
          }
        };

        scanFrameRef.current = requestAnimationFrame(() => void scan());
      } catch (error) {
        if (!isActive) return;
        setCameraError(
          error instanceof Error && error.name === "NotAllowedError"
            ? "تم رفض إذن الكاميرا. يمكنك إدخال رقم الشهادة يدوياً."
            : "تعذر تشغيل الكاميرا. تحقق من إعدادات المتصفح وحاول مجدداً.",
        );
      }
    };

    void startCamera();
    return () => {
      isActive = false;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      if (scanFrameRef.current !== null) cancelAnimationFrame(scanFrameRef.current);
      scanFrameRef.current = null;
    };
  }, [cameraOpen, serial, setLocation]);

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    if (scanFrameRef.current !== null) cancelAnimationFrame(scanFrameRef.current);
  }, []);

  const handleCopyLink = async () => {
    if (!certificate) return;
    const link = `${window.location.origin}/certificate/verify?serial=${encodeURIComponent(certificate.serialNumber)}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setMessage("تعذر نسخ الرابط. يمكنك نسخه من شريط العنوان.");
    }
  };

  const displayStatus = () => {
    if (status === "idle") {
      return (
        <div className="flex min-h-48 flex-col items-center justify-center rounded-2xl border border-dashed bg-slate-50 p-6 text-center">
          <ShieldCheck className="mb-3 h-10 w-10 text-primary/70" />
          <p className="font-semibold text-slate-800">أدخل رقم الشهادة لبدء التحقق</p>
          <p className="mt-1 text-sm text-muted-foreground">لن يتم البحث قبل إدخال رقم وإرسال الطلب.</p>
        </div>
      );
    }

    if (status === "loading") {
      return (
        <div className="flex min-h-48 flex-col items-center justify-center rounded-2xl border bg-white p-6 text-center">
          <span className="mb-3 h-9 w-9 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
          <p className="font-semibold">جارٍ التحقق من قاعدة بيانات الشهادات...</p>
        </div>
      );
    }

    const isValid = status === "valid";
    const isCancelled = status === "cancelled";
    const isNotFound = status === "not-found";
    const isInvalid = status === "invalid";
    const resultColor = isValid
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : isCancelled
        ? "border-amber-200 bg-amber-50 text-amber-900"
        : "border-red-200 bg-red-50 text-red-800";
    const ResultIcon = isValid ? CheckCircle2 : isCancelled ? AlertCircle : XCircle;
    const title = isValid
      ? "الشهادة صحيحة وسارية"
      : isCancelled
        ? "الشهادة ملغاة"
        : isNotFound
          ? "الشهادة غير موجودة"
          : isInvalid
            ? "رقم الشهادة غير صالح"
            : "تعذر إكمال التحقق";

    return (
      <div className={`rounded-2xl border p-5 ${resultColor}`} role="status" aria-live="polite">
        <div className="flex items-start gap-3">
          <ResultIcon className="mt-0.5 h-6 w-6 shrink-0" />
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold">{title}</h2>
            {message && <p className="mt-1 text-sm leading-6">{message}</p>}
            {certificate && (
              <>
                <div className="mt-4 grid gap-3 rounded-xl border border-black/5 bg-white/80 p-4 text-sm sm:grid-cols-2">
                  <p><span className="text-muted-foreground">اسم المستفيد:</span><br /><strong>{certificate.recipientName || "-"}</strong></p>
                  <p><span className="text-muted-foreground">اسم الشهادة:</span><br /><strong>{certificate.programTitle || "-"}</strong></p>
                  <p><span className="text-muted-foreground">الجهة المصدرة:</span><br /><strong>{certificate.issuerName || "Arkan Web"}</strong></p>
                  <p><span className="text-muted-foreground">تاريخ الإصدار:</span><br /><strong>{certificate.issueDate ? new Date(certificate.issueDate).toLocaleDateString("ar-EG") : "-"}</strong></p>
                  <p><span className="text-muted-foreground">المؤسسات الشريكة:</span><br /><strong>{certificate.partners?.length ? certificate.partners.join("، ") : "لا توجد مؤسسات شريكة مسجلة"}</strong></p>
                  <p className="sm:col-span-2"><span className="text-muted-foreground">رقم الشهادة:</span><br /><strong dir="ltr">{certificate.serialNumber}</strong></p>
                </div>
                {isValid && (
                  <>
                    {certificate.pdfUrl && (
                      <div className="mt-4 overflow-hidden rounded-xl border bg-white">
                        <iframe
                          src={certificate.pdfUrl}
                          title="معاينة الشهادة المصدرة"
                          className="h-64 w-full sm:h-80"
                          loading="lazy"
                        />
                      </div>
                    )}
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button type="button" size="sm" variant="outline" onClick={() => void handleCopyLink()}>
                      <Copy className="ms-2 h-4 w-4" />
                      {copied ? "تم نسخ رابط التحقق" : "نسخ رابط التحقق"}
                    </Button>
                    {certificate.pdfUrl && (
                      <Button asChild type="button" size="sm" variant="outline">
                        <a href={certificate.pdfUrl} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="ms-2 h-4 w-4" />
                          عرض الشهادة كاملة
                        </a>
                      </Button>
                    )}
                    {certificate.pdfUrl && (
                      <Button asChild type="button" size="sm" variant="outline">
                        <a href={`${certificate.pdfUrl}?download=1`} rel="noopener noreferrer">
                          <FileCheck2 className="ms-2 h-4 w-4" />
                          تنزيل PDF
                        </a>
                      </Button>
                    )}
                  </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-b from-primary/[0.06] via-background to-slate-50 px-4 py-10 sm:py-14" dir="rtl">
      <div className="mx-auto max-w-5xl">
        <header className="mx-auto mb-8 max-w-3xl text-center">
          <Badge variant="secondary" className="mb-3 gap-2 px-3 py-1.5">
            <FileCheck2 className="h-4 w-4" />
            خدمة عامة وآمنة
          </Badge>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">التحقق من الشهادات</h1>
          <p className="mx-auto mt-3 max-w-2xl leading-7 text-muted-foreground">
            تأكد من صحة الشهادة وحالتها بالبحث عن رقمها أو بمسح رمز QR المطبوع عليها.
          </p>
        </header>

        <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
          <Card className="h-fit border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <Search className="h-5 w-5 text-primary" />
                أدخل رقم الشهادة
              </CardTitle>
              <CardDescription>اكتب الرقم كما يظهر على الشهادة، ثم اضغط تحقق أو Enter.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <form onSubmit={handleLookup} className="space-y-3">
                <label htmlFor="certificate-serial" className="text-sm font-medium">رقم الشهادة</label>
                <input
                  id="certificate-serial"
                  value={searchValue}
                  onChange={(event) => handleSearchChange(event.target.value)}
                  placeholder="AW-CERT-2026-000001"
                  className="w-full rounded-xl border bg-background px-4 py-3 text-left font-mono outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
                  dir="ltr"
                  autoComplete="off"
                  aria-label="رقم الشهادة"
                />
                <Button type="submit" className="w-full" disabled={!searchValue.trim() || status === "loading"}>
                  <Search className="ms-2 h-4 w-4" />
                  تحقق من الشهادة
                </Button>
              </form>

              <div className="relative flex items-center gap-3 text-xs text-muted-foreground before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border">
                أو
              </div>

              <Button type="button" variant="outline" className="w-full" onClick={() => {
                setCameraError("");
                setCameraOpen(true);
              }}>
                <QrCode className="ms-2 h-4 w-4" />
                مسح رمز QR بالكاميرا
              </Button>
              <p className="text-xs leading-5 text-muted-foreground">
                يتطلب المسح السماح باستخدام الكاميرا ومتصفحاً يدعم قراءة QR. يمكنك دائماً استخدام رقم الشهادة يدوياً.
              </p>
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-xl">نتيجة التحقق</CardTitle>
              <CardDescription>تُعرض هنا البيانات العامة فقط بعد الرجوع إلى سجل الشهادات.</CardDescription>
            </CardHeader>
            <CardContent>{displayStatus()}</CardContent>
          </Card>
        </div>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          هل تحتاج مساعدة؟ <Link href="/"><a className="font-medium text-primary hover:underline">العودة إلى موقع أركان</a></Link>
        </p>
      </div>

      <Dialog open={cameraOpen} onOpenChange={(open) => {
        if (!open) stopCamera();
        else setCameraOpen(true);
      }}>
        <DialogContent dir="rtl" className="w-[calc(100%-2rem)] max-w-xl">
          <DialogHeader>
            <DialogTitle>مسح رمز QR للشهادة</DialogTitle>
            <DialogDescription>وجّه الكاميرا نحو رمز QR حتى يظهر داخل الإطار.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="overflow-hidden rounded-xl bg-black">
              <video
                ref={videoRef}
                className="aspect-video max-h-[55vh] w-full object-contain"
                autoPlay
                playsInline
                muted
                aria-label="معاينة كاميرا مسح رمز QR"
              />
            </div>
            {cameraError && <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{cameraError}</p>}
            <Button type="button" variant="outline" className="w-full" onClick={stopCamera}>إغلاق الكاميرا</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
