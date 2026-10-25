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
import { apiFetch, resolveApiUrl } from "@/lib/api-fetch";
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
  serialNumber?: string;
  recipientName?: string;
  programTitle?: string;
  issuerName?: string;
  issueDate?: string | null;
  status: string;
  partners?: string[];
  pdfUrl?: string;
  imageUrl?: string;
  source?: string;
  verifiedAt?: string;
};

type VerificationResponse = {
  valid?: boolean;
  cancelled?: boolean;
  error?: string;
  certificate?: PublicCertificate;
};

type VerifySettings = {
  pageTitle: string;
  pageSubtitle: string;
  logoUrl: string;
  successTitle: string;
  successMessage: string;
  cancelledTitle: string;
  cancelledMessage: string;
  notFoundMessage: string;
  footerText: string;
  visibleFields: {
    recipientName: boolean;
    programTitle: boolean;
    issuerName: boolean;
    issueDate: boolean;
    partners: boolean;
    serialNumber: boolean;
  };
  showCertificatePreview: boolean;
  allowDownloadPdf: boolean;
  allowDownloadImage: boolean;
  showLegacyNote: boolean;
};

const DEFAULT_VERIFY_SETTINGS: VerifySettings = {
  pageTitle: "التحقق من الشهادات",
  pageSubtitle: "تأكد من صحة الشهادة وحالتها بالبحث عن رقمها أو بمسح رمز QR المطبوع عليها.",
  logoUrl: "",
  successTitle: "الشهادة صحيحة وسارية",
  successMessage: "هذه الشهادة موثقة وصادرة من Arkan Web.",
  cancelledTitle: "الشهادة ملغاة",
  cancelledMessage: "تم إلغاء هذه الشهادة وهي غير صالحة للاستخدام.",
  notFoundMessage: "لم يتم العثور على شهادة بهذا الرقم.",
  footerText: "",
  visibleFields: {
    recipientName: true,
    programTitle: true,
    issuerName: true,
    issueDate: true,
    partners: true,
    serialNumber: true,
  },
  showCertificatePreview: true,
  allowDownloadPdf: true,
  allowDownloadImage: true,
  showLegacyNote: true,
};

function isValidCertificateSerial(value: string): boolean {
  return value.length > 0 && value.length <= 100 && !/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/.test(value);
}

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

  return isValidCertificateSerial(serial) ? serial : null;
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
  const [imageLoadError, setImageLoadError] = useState(false);
  const [imageRetry, setImageRetry] = useState(0);
  const [fileAction, setFileAction] = useState<"pdf" | "image" | null>(null);
  const [fileActionError, setFileActionError] = useState("");
  const [settings, setSettings] = useState<VerifySettings>(DEFAULT_VERIFY_SETTINGS);
  const [settingsLoadError, setSettingsLoadError] = useState("");
  const [imageZoomOpen, setImageZoomOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanFrameRef = useRef<number | null>(null);
  const verificationRequestRef = useRef(0);
  const skipUrlVerificationRef = useRef<string | null>(null);
  const params = new URLSearchParams(search);
  const serial = (params.get("serial") ?? "").trim();
  const resolvedImageUrl = certificate?.imageUrl ? resolveApiUrl(certificate.imageUrl) : "";
  const previewImageUrl = resolvedImageUrl
    ? `${resolvedImageUrl}${resolvedImageUrl.includes("?") ? "&" : "?"}preview=${imageRetry}`
    : "";
  const pdfDownloadUrl = certificate?.pdfUrl
    ? `${certificate.pdfUrl}${certificate.pdfUrl.includes("?") ? "&" : "?"}download=1`
    : "";
  const imageDownloadUrl = certificate?.imageUrl
    ? `${certificate.imageUrl}${certificate.imageUrl.includes("?") ? "&" : "?"}download=1`
    : "";

  useEffect(() => {
    let active = true;
    apiFetch("/api/certificates/verify-settings")
      .then(async (response) => {
        if (!response.ok) throw new Error("تعذر تحميل إعدادات صفحة التحقق");
        const data = await response.json() as VerifySettings;
        if (active) setSettings({ ...DEFAULT_VERIFY_SETTINGS, ...data, visibleFields: { ...DEFAULT_VERIFY_SETTINGS.visibleFields, ...data.visibleFields } });
      })
      .catch((error: Error) => {
        if (active) setSettingsLoadError(error.message);
      });
    return () => { active = false; };
  }, []);

  const verifyCertificate = async (rawSerial: string) => {
    const value = rawSerial.trim();
    const requestId = ++verificationRequestRef.current;
    setCertificate(null);
    setMessage("");
    setImageLoadError(false);
    setFileActionError("");

    if (!value) {
      setStatus("idle");
      return;
    }

    if (!isValidCertificateSerial(value)) {
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
        setImageLoadError(false);
        setMessage(data.error || settings.cancelledMessage);
        return;
      }

      if (response.status === 404) {
        setStatus("not-found");
        setMessage(data.error || settings.notFoundMessage);
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
      setImageLoadError(false);
    } catch {
      if (requestId !== verificationRequestRef.current) return;
      setStatus("error");
      setMessage("تعذر الاتصال بالخادم. تحقق من اتصالك بالإنترنت ثم حاول مرة أخرى.");
    }
  };

  const downloadCertificateFile = async (url: string, type: "pdf" | "image") => {
    setFileAction(type);
    setFileActionError("");
    try {
      const response = await apiFetch(resolveApiUrl(url));
      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(payload.error || `تعذر تنزيل الملف (${response.status})`);
      }
      const blob = await response.blob();
      const expectedType = type === "pdf" ? "application/pdf" : "image/png";
      if (!blob.type.includes(expectedType)) {
        throw new Error("استجاب الخادم بصفحة بدلاً من ملف الشهادة. حاول تحديث الصفحة.");
      }
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `certificate-${certificate?.serialNumber || "verified"}.${type === "pdf" ? "pdf" : "png"}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch (error) {
      setFileActionError(error instanceof Error ? error.message : "تعذر تنزيل ملف الشهادة");
    } finally {
      setFileAction(null);
    }
  };

  const retryCertificateImage = () => {
    setImageLoadError(false);
    setImageRetry((retry) => retry + 1);
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
    const certificateSerial = certificate.serialNumber || serial || searchValue.trim();
    if (!certificateSerial) return;
    const link = `${window.location.origin}/certificate/verify?serial=${encodeURIComponent(certificateSerial)}`;
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
      ? settings.successTitle
      : isCancelled
        ? settings.cancelledTitle
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
                {isValid && <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1.5 text-sm font-bold text-emerald-800"><ShieldCheck className="h-4 w-4" />موثقة</div>}
                {isValid && settings.successMessage && <p className="mt-2 text-sm leading-6">{settings.successMessage}</p>}
                {settings.showLegacyNote && certificate.source === "legacy-certificate-image" && settings.visibleFields.issueDate && certificate.issueDate && certificate.verifiedAt && (
                  <p className="mt-2 rounded-lg border border-slate-200 bg-white/70 px-3 py-2 text-xs leading-5 text-slate-600">
                    تم توثيق هذه الشهادة إلكترونياً بتاريخ {new Date(certificate.verifiedAt).toLocaleDateString("ar-EG")} وصدرت أصلاً بتاريخ {new Date(certificate.issueDate).toLocaleDateString("ar-EG")}.
                  </p>
                )}
                {certificate.imageUrl && settings.showCertificatePreview && (
                  <div className="relative mt-4 overflow-hidden rounded-xl border bg-white">
                    {imageLoadError ? (
                      <div className="flex min-h-48 flex-col items-center justify-center gap-3 p-4 text-center text-sm text-muted-foreground">
                        <p>تعذر عرض صورة الشهادة. تحقق من اتصالك ثم أعد المحاولة.</p>
                        <Button type="button" size="sm" variant="outline" onClick={retryCertificateImage}>إعادة تحميل الصورة</Button>
                      </div>
                    ) : (
                      <button type="button" onClick={() => setImageZoomOpen(true)} className="block min-h-40 w-full" aria-label="تكبير معاينة الشهادة">
                        <img
                          src={previewImageUrl}
                          alt="معاينة صورة الشهادة"
                          className="max-h-96 w-full object-contain"
                          onError={() => setImageLoadError(true)}
                        />
                      </button>
                    )}
                    {isCancelled && <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/10"><span className="rotate-[-14deg] rounded-lg border-4 border-red-700 bg-white/80 px-8 py-3 text-3xl font-black text-red-700">ملغاة</span></div>}
                    {!imageLoadError && <button type="button" onClick={() => setImageZoomOpen(true)} className="absolute bottom-2 left-2 rounded-md bg-white/90 px-3 py-1.5 text-xs font-semibold shadow">تكبير الصورة</button>}
                  </div>
                )}
                <div className="mt-4 grid gap-3 rounded-xl border border-black/5 bg-white/80 p-4 text-sm sm:grid-cols-2">
                  {settings.visibleFields.recipientName && certificate.recipientName !== undefined && <p><span className="text-muted-foreground">اسم المستفيد:</span><br /><strong>{certificate.recipientName || "-"}</strong></p>}
                  {settings.visibleFields.programTitle && certificate.programTitle !== undefined && <p><span className="text-muted-foreground">اسم الشهادة:</span><br /><strong>{certificate.programTitle || "-"}</strong></p>}
                  {settings.visibleFields.issuerName && certificate.issuerName !== undefined && <p><span className="text-muted-foreground">الجهة المصدرة:</span><br /><strong>{certificate.issuerName || "Arkan Web"}</strong></p>}
                  {settings.visibleFields.issueDate && certificate.issueDate !== undefined && <p><span className="text-muted-foreground">تاريخ الإصدار:</span><br /><strong>{certificate.issueDate ? new Date(certificate.issueDate).toLocaleDateString("ar-EG") : "-"}</strong></p>}
                  {settings.visibleFields.partners && certificate.partners !== undefined && <p><span className="text-muted-foreground">المؤسسات الشريكة:</span><br /><strong>{certificate.partners?.length ? certificate.partners.join("، ") : "لا توجد مؤسسات شريكة مسجلة"}</strong></p>}
                  {settings.visibleFields.serialNumber && certificate.serialNumber !== undefined && <p className="sm:col-span-2"><span className="text-muted-foreground">رقم الشهادة:</span><br /><strong dir="ltr">{certificate.serialNumber}</strong></p>}
                </div>
                {(isValid || isCancelled) && (
                  <>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button type="button" size="sm" variant="outline" onClick={() => void handleCopyLink()}>
                      <Copy className="ms-2 h-4 w-4" />
                      {copied ? "تم نسخ رابط التحقق" : "نسخ رابط التحقق"}
                    </Button>
                    {isValid && settings.allowDownloadPdf && certificate.pdfUrl && (
                      <Button asChild type="button" size="sm" variant="outline">
                        <a href={resolveApiUrl(certificate.pdfUrl)} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="ms-2 h-4 w-4" />
                          عرض الشهادة كاملة
                        </a>
                      </Button>
                    )}
                    {isValid && settings.allowDownloadPdf && certificate.pdfUrl && (
                      <Button type="button" size="sm" variant="outline" disabled={fileAction !== null} onClick={() => void downloadCertificateFile(pdfDownloadUrl, "pdf")}>
                        <FileCheck2 className="ms-2 h-4 w-4" />
                        {fileAction === "pdf" ? "جارٍ تنزيل PDF..." : "تنزيل PDF"}
                      </Button>
                    )}
                    {isValid && settings.allowDownloadImage && certificate.imageUrl && (
                      <Button type="button" size="sm" variant="outline" disabled={fileAction !== null} onClick={() => void downloadCertificateFile(imageDownloadUrl, "image")}>
                        <FileCheck2 className="ms-2 h-4 w-4" />
                        {fileAction === "image" ? "جارٍ تنزيل الصورة..." : "تنزيل الصورة"}
                      </Button>
                    )}
                  </div>
                  {fileActionError && <p role="alert" className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{fileActionError}</p>}
                  </>
                )}
              </>
            )}
          </div>
          {settings.footerText && <footer className="mt-8 text-center text-sm leading-6 text-muted-foreground">{settings.footerText}</footer>}
        </div>
        <Dialog open={imageZoomOpen} onOpenChange={setImageZoomOpen}>
          <DialogContent className="max-w-6xl">
            <DialogHeader>
              <DialogTitle>معاينة الشهادة</DialogTitle>
              <DialogDescription>صورة الشهادة كما تظهر في ملف PDF.</DialogDescription>
            </DialogHeader>
              {certificate?.imageUrl && !imageLoadError && (
              <div className="relative overflow-auto rounded-lg bg-muted">
                  <img
                    src={previewImageUrl}
                    alt="صورة الشهادة مكبرة"
                    className="mx-auto max-h-[75vh] w-auto object-contain"
                    onError={() => setImageLoadError(true)}
                  />
                  {status === "cancelled" && <div className="pointer-events-none absolute inset-0 flex items-center justify-center"><span className="rotate-[-14deg] rounded-lg border-4 border-red-700 bg-white/80 px-8 py-3 text-3xl font-black text-red-700">ملغاة</span></div>}
                </div>
              )}
              {imageLoadError && <div className="space-y-3 rounded-lg border border-red-200 bg-red-50 p-4 text-center text-sm text-red-800"><p>تعذر تحميل صورة الشهادة المكبرة.</p><Button type="button" size="sm" variant="outline" onClick={retryCertificateImage}>إعادة تحميل الصورة</Button></div>}
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-b from-primary/[0.06] via-background to-slate-50 px-4 py-10 sm:py-14" dir="rtl">
      <div className="mx-auto max-w-5xl">
        <header className="mx-auto mb-8 max-w-3xl text-center">
          <Badge variant="secondary" className="mb-3 gap-2 px-3 py-1.5">
            <FileCheck2 className="h-4 w-4" />
            خدمة عامة وآمنة
          </Badge>
          {settings.logoUrl && <img src={settings.logoUrl} alt="" className="mx-auto mb-3 max-h-16 max-w-40 object-contain" />}
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">{settings.pageTitle}</h1>
          <p className="mx-auto mt-3 max-w-2xl leading-7 text-muted-foreground">
            {settings.pageSubtitle}
          </p>
        </header>
        {settingsLoadError && <p role="alert" className="mx-auto mb-4 max-w-3xl rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">تعذر تحميل إعدادات صفحة التحقق، يتم عرض النصوص الافتراضية. {settingsLoadError}</p>}

        <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
          <Card className="h-fit border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <Search className="h-5 w-5 text-primary" />
                تحقق باستخدام كود الشهادة
              </CardTitle>
              <CardDescription>اكتب كود الشهادة كما يظهر عليها، سواء كان مولداً تلقائياً أو مخصصاً.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <form onSubmit={handleLookup} className="space-y-3">
                <label htmlFor="certificate-serial" className="text-sm font-medium">كود الشهادة</label>
                <input
                  id="certificate-serial"
                  value={searchValue}
                  onChange={(event) => handleSearchChange(event.target.value)}
                  placeholder="AW-CERT-2026-000001 / CUSTOM-001"
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
          هل تحتاج مساعدة؟ <Link href="/" className="font-medium text-primary hover:underline">العودة إلى موقع أركان</Link>
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
