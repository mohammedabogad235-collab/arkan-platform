import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch, apiFetchJson, resolveApiUrl } from "@/lib/api-fetch";
import { useToast } from "@/hooks/use-toast";

type Box = { x: number; y: number; width: number; height: number };
type Signer = { name: string; title: string; role: string; signatureUrl: string; style: string; fontSize: number };
type Partner = {
  id: number;
  name: string;
  logoUrl?: string | null;
  signatureUrl?: string | null;
  signatureName?: string | null;
  signatureTitle?: string | null;
  sortOrder: number;
};
type CertificateTemplate = {
  id: number;
  name: string;
  orientation: string;
  width: number;
  height: number;
  backgroundUrl?: string | null;
  logoUrl?: string | null;
  signatureUrl?: string | null;
  layoutConfig?: Record<string, any>;
};
type CertificateIssue = {
  id: number;
  templateId: number;
  serialNumber: string;
  validationUrl: string;
  recipientName: string;
  recipientEmail?: string | null;
  recipientPhone?: string | null;
  programTitle: string;
  description?: string | null;
  issuerName: string;
  status: string;
  issueDate: string;
  deletedAt?: string | null;
  metadata?: { signatures?: Signer[]; partnerIds?: number[]; layoutConfig?: Record<string, any> };
};

const initialBoxes: Record<string, Box> = {
  logo: { x: 8, y: 8, width: 18, height: 12 },
  recipientName: { x: 22, y: 28, width: 56, height: 12 },
  programTitle: { x: 22, y: 41, width: 56, height: 8 },
  issuerName: { x: 14, y: 72, width: 28, height: 6 },
  signature: { x: 58, y: 57, width: 18, height: 12 },
  serialNumber: { x: 28, y: 80, width: 44, height: 6 },
  issueDate: { x: 28, y: 88, width: 44, height: 5 },
  qrCode: { x: 78, y: 10, width: 12, height: 12 },
};

const emptyTemplate = {
  name: "",
  orientation: "landscape",
  width: 1200,
  height: 800,
  backgroundUrl: "",
  logoUrl: "",
  signatureUrl: "",
};

const emptyCertificate = {
  templateId: "",
  recipientName: "",
  recipientEmail: "",
  recipientPhone: "",
  programTitle: "",
  issuerName: "Arkan Web",
  description: "",
};

const emptyPartner = {
  name: "",
  logoUrl: "",
  signatureUrl: "",
  signatureName: "",
  signatureTitle: "",
  sortOrder: "0",
};

function Field({
  label,
  value,
  onChange,
  type = "text",
  dir,
}: {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  type?: string;
  dir?: "ltr" | "rtl";
}) {
  return (
    <label className="block space-y-1.5 text-sm">
      <span className="font-medium">{label}</span>
      <input
        className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
        type={type}
        value={value}
        dir={dir}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function ImageUploadField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);

  const upload = async (file?: File) => {
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await apiFetch("/api/certificates/upload", { method: "POST", body: form });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || typeof result.publicUrl !== "string") {
        throw new Error(result.error || "تعذر رفع الصورة");
      }
      onChange(result.publicUrl);
      toast({ title: "تم رفع الصورة بنجاح" });
    } catch (error) {
      toast({ variant: "destructive", title: "تعذر رفع الصورة", description: (error as Error).message });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-2">
      <Field label={label} value={value} dir="ltr" onChange={onChange} />
      <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-xs hover:bg-muted">
        {uploading ? "جارٍ الرفع..." : "رفع صورة"}
        <input
          className="sr-only"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          disabled={uploading}
          onChange={(event) => {
            void upload(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
      </label>
      <p className="text-xs text-muted-foreground">لضمان تضمين الصورة بأمان في ملفات PDF، استخدم زر الرفع إلى مخزن الشهادات.</p>
    </div>
  );
}

function boxFor(layout: Record<string, any>, key: string, fallback: Box): Box {
  const box = layout?.[key] ?? fallback;
  const x = Math.min(Math.max(Number(box.x ?? fallback.x) || 0, 0), 99);
  const y = Math.min(Math.max(Number(box.y ?? fallback.y) || 0, 0), 99);
  return {
    x,
    y,
    width: Math.min(Math.max(Number(box.width ?? fallback.width) || 1, 1), 100 - x),
    height: Math.min(Math.max(Number(box.height ?? fallback.height) || 1, 1), 100 - y),
  };
}

function alignmentFor(layout: Record<string, any>, key: string): "left" | "center" | "right" {
  const value = layout?.[key]?.align;
  return value === "left" || value === "right" || value === "center" ? value : key === "issuerName" ? "left" : "center";
}

export default function CertificateStudio() {
  const { toast } = useToast();
  const [templates, setTemplates] = useState<CertificateTemplate[]>([]);
  const [issues, setIssues] = useState<CertificateIssue[]>([]);
  const [trashIssues, setTrashIssues] = useState<CertificateIssue[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [stats, setStats] = useState({ total: 0, issued: 0, cancelled: 0, drafts: 0, trash: 0 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [templateId, setTemplateId] = useState("");
  const [templateForm, setTemplateForm] = useState(emptyTemplate);
  const [layout, setLayout] = useState<Record<string, any>>(initialBoxes);
  const layoutRef = useRef(layout);
  const pendingIssueLayoutRef = useRef<Record<string, any> | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const [layoutUndo, setLayoutUndo] = useState<Record<string, any>[]>([]);
  const [layoutRedo, setLayoutRedo] = useState<Record<string, any>[]>([]);
  const [partnerForm, setPartnerForm] = useState(emptyPartner);
  const [partnerEditId, setPartnerEditId] = useState<number | null>(null);
  const [certificateForm, setCertificateForm] = useState(emptyCertificate);
  const [certificateId, setCertificateId] = useState<number | null>(null);
  const [editingStatus, setEditingStatus] = useState("");
  const [signers, setSigners] = useState<Signer[]>([]);
  const [selectedPartners, setSelectedPartners] = useState<number[]>([]);
  const [verificationInput, setVerificationInput] = useState("");
  const [verificationLoading, setVerificationLoading] = useState(false);
  const [verificationResult, setVerificationResult] = useState<any>(null);
  const [showTrash, setShowTrash] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selectedIssueIds, setSelectedIssueIds] = useState<number[]>([]);
  const [page, setPage] = useState(1);

  const selectedTemplate = useMemo(
    () => templates.find((template) => String(template.id) === templateId),
    [templates, templateId],
  );
  const selectedPartnerRecords = partners.filter((partner) => selectedPartners.includes(partner.id));

  const refresh = async () => {
    const [templateData, issueData, partnerData, statsData] = await Promise.all([
      apiFetchJson<CertificateTemplate[]>("/api/certificates/templates"),
      apiFetchJson<CertificateIssue[]>("/api/certificates"),
      apiFetchJson<Partner[]>("/api/certificates/partners"),
      apiFetchJson<typeof stats>("/api/certificates/admin/stats"),
    ]);
    setTemplates(templateData);
    setIssues(issueData);
    setPartners(partnerData);
    setStats(statsData);
    if (!templateId && templateData[0]) setTemplateId(String(templateData[0].id));
  };

  const loadTrash = async () => {
    const items = await apiFetchJson<CertificateIssue[]>("/api/certificates/trash");
    setTrashIssues(items);
  };

  const filteredIssues = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase();
    return (showTrash ? trashIssues : issues).filter((issue) => {
      const matchesSearch = !normalizedSearch || [
        issue.recipientName,
        issue.serialNumber,
        issue.programTitle,
        issue.issuerName,
      ].some((value) => value?.toLocaleLowerCase().includes(normalizedSearch));
      return matchesSearch && (!statusFilter || issue.status === statusFilter);
    });
  }, [issues, trashIssues, showTrash, search, statusFilter]);

  const pageSize = 10;
  const pageCount = Math.max(1, Math.ceil(filteredIssues.length / pageSize));
  const pagedIssues = filteredIssues.slice((page - 1) * pageSize, page * pageSize);

  const applyLayout = (next: Record<string, any>) => {
    setLayoutUndo((history) => [...history.slice(-29), layoutRef.current]);
    setLayoutRedo([]);
    layoutRef.current = next;
    setLayout(next);
  };

  const undoLayout = () => {
    if (!layoutUndo.length) return;
    const previous = layoutUndo[layoutUndo.length - 1];
    setLayoutUndo((history) => history.slice(0, -1));
    setLayoutRedo((history) => [...history, layoutRef.current]);
    layoutRef.current = previous;
    setLayout(previous);
  };

  const redoLayout = () => {
    if (!layoutRedo.length) return;
    const next = layoutRedo[layoutRedo.length - 1];
    setLayoutRedo((history) => history.slice(0, -1));
    setLayoutUndo((history) => [...history, layoutRef.current]);
    layoutRef.current = next;
    setLayout(next);
  };

  const startDrag = (event: React.PointerEvent, key: string, originalBox: Box) => {
    if (!previewRef.current || event.button !== 0) return;
    event.preventDefault();
    const bounds = previewRef.current.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    const originalLayout = layoutRef.current;
    let currentBox = originalBox;
    const applyBox = (box: Box) => {
      const nextLayout = { ...layoutRef.current };
      if (key.startsWith("signature:")) {
        const index = Number(key.split(":")[1]);
        const signatureBoxes = [...(nextLayout.signatureBoxes || [])];
        signatureBoxes[index] = box;
        nextLayout.signatureBoxes = signatureBoxes;
      } else if (key.startsWith("partnerLogo:") || key.startsWith("partnerSignature:")) {
        const [groupKey, partnerId] = key.split(":");
        const group = groupKey === "partnerLogo" ? "partnerLogoBoxes" : "partnerSignatureBoxes";
        nextLayout[group] = { ...nextLayout[group], [partnerId]: box };
      } else {
        nextLayout[key] = box;
      }
      layoutRef.current = nextLayout;
      setLayout(nextLayout);
    };
    const move = (pointerEvent: PointerEvent) => {
      if (pointerEvent.pointerId !== event.pointerId) return;
      currentBox = {
        ...originalBox,
        x: Math.min(Math.max(originalBox.x + ((pointerEvent.clientX - startX) / bounds.width) * 100, 0), 100 - originalBox.width),
        y: Math.min(Math.max(originalBox.y + ((pointerEvent.clientY - startY) / bounds.height) * 100, 0), 100 - originalBox.height),
      };
      applyBox(currentBox);
    };
    const finish = (pointerEvent: PointerEvent) => {
      if (pointerEvent.pointerId !== event.pointerId) return;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      if (currentBox !== originalBox) {
        setLayoutUndo((history) => [...history.slice(-29), originalLayout]);
        setLayoutRedo([]);
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
  };

  useEffect(() => {
    refresh()
      .catch((error: Error) => toast({ variant: "destructive", title: "تعذر تحميل بيانات الشهادات", description: error.message }))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedTemplate) return;
    setTemplateForm({
      name: selectedTemplate.name,
      orientation: selectedTemplate.orientation || "landscape",
      width: selectedTemplate.width || 1200,
      height: selectedTemplate.height || 800,
      backgroundUrl: selectedTemplate.backgroundUrl || "",
      logoUrl: selectedTemplate.logoUrl || "",
      signatureUrl: selectedTemplate.signatureUrl || "",
    });
    const nextLayout = { ...initialBoxes, ...(pendingIssueLayoutRef.current || selectedTemplate.layoutConfig || {}) };
    pendingIssueLayoutRef.current = null;
    layoutRef.current = nextLayout;
    setLayout(nextLayout);
    setLayoutUndo([]);
    setLayoutRedo([]);
  }, [selectedTemplate?.id]);

  const updateTemplateField = (key: keyof typeof emptyTemplate, value: string) => {
    setTemplateForm((form) => ({
      ...form,
      [key]: key === "width" || key === "height" ? Number(value) : value,
    }));
  };

  const updateBox = (key: string, field: keyof Box, value: string) => {
    const fallback = initialBoxes[key] || { x: 10, y: 10, width: 18, height: 12 };
    const current = boxFor(layoutRef.current, key, fallback);
    const number = Number(value);
    const safeValue = Number.isFinite(number) ? Math.min(Math.max(number, 0), 100) : current[field];
    applyLayout({
      ...layoutRef.current,
      [key]: {
        ...boxFor(layoutRef.current, key, fallback),
        [field]: safeValue,
      },
    });
  };

  const updatePartnerBox = (group: "partnerLogoBoxes" | "partnerSignatureBoxes", partnerId: number, field: keyof Box, value: string, fallback: Box) => {
    const number = Number(value);
    const current = boxFor({ position: layoutRef.current[group]?.[String(partnerId)] }, "position", fallback);
    applyLayout({
      ...layoutRef.current,
      [group]: {
        ...layoutRef.current[group],
        [String(partnerId)]: {
          ...current,
          [field]: Number.isFinite(number) ? Math.min(Math.max(number, 0), 100) : current[field],
        },
      },
    });
  };

  const saveTemplate = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const body = {
        ...templateForm,
        layoutConfig: layout,
        isActive: true,
      };
      const result = templateId
        ? await apiFetchJson<CertificateTemplate>(`/api/certificates/templates/${templateId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          })
        : await apiFetchJson<CertificateTemplate>("/api/certificates/templates", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
      await refresh();
      setTemplateId(String(result.id));
      toast({ title: "تم حفظ تصميم القالب" });
    } catch (error) {
      toast({ variant: "destructive", title: "تعذر حفظ القالب", description: (error as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const duplicateTemplate = async () => {
    if (!templateId) return;
    try {
      const copy = await apiFetchJson<CertificateTemplate>(`/api/certificates/templates/${templateId}/duplicate`, { method: "POST" });
      await refresh();
      setTemplateId(String(copy.id));
      toast({ title: "تم نسخ القالب", description: copy.name });
    } catch (error) {
      toast({ variant: "destructive", title: "تعذر نسخ القالب", description: (error as Error).message });
    }
  };

  const savePartner = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const body = { ...partnerForm, sortOrder: Number(partnerForm.sortOrder) };
      await apiFetchJson(partnerEditId ? `/api/certificates/partners/${partnerEditId}` : "/api/certificates/partners", {
        method: partnerEditId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setPartnerForm(emptyPartner);
      setPartnerEditId(null);
      await refresh();
      toast({ title: partnerEditId ? "تم تحديث المؤسسة" : "تمت إضافة المؤسسة" });
    } catch (error) {
      toast({ variant: "destructive", title: "تعذر حفظ المؤسسة", description: (error as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const editPartner = (partner: Partner) => {
    setPartnerEditId(partner.id);
    setPartnerForm({
      name: partner.name,
      logoUrl: partner.logoUrl || "",
      signatureUrl: partner.signatureUrl || "",
      signatureName: partner.signatureName || "",
      signatureTitle: partner.signatureTitle || "",
      sortOrder: String(partner.sortOrder),
    });
  };

  const deletePartner = async (partner: Partner) => {
    if (!window.confirm(`هل تريد حذف المؤسسة «${partner.name}»؟`)) return;
    try {
      await apiFetchJson(`/api/certificates/partners/${partner.id}`, { method: "DELETE" });
      setSelectedPartners((ids) => ids.filter((id) => id !== partner.id));
      await refresh();
      toast({ title: "تم حذف المؤسسة" });
    } catch (error) {
      toast({ variant: "destructive", title: "تعذر حذف المؤسسة", description: (error as Error).message });
    }
  };

  const beginEditCertificate = (issue: CertificateIssue) => {
    setCertificateId(issue.id);
    setEditingStatus(issue.status);
    setTemplateId(String(issue.templateId));
    const issueLayout = issue.metadata?.layoutConfig;
    pendingIssueLayoutRef.current = issueLayout || null;
    if (String(issue.templateId) === templateId) {
      const currentTemplate = templates.find((item) => item.id === issue.templateId);
      const nextLayout = { ...initialBoxes, ...(issueLayout || currentTemplate?.layoutConfig || {}) };
      layoutRef.current = nextLayout;
      setLayout(nextLayout);
      setLayoutUndo([]);
      setLayoutRedo([]);
      pendingIssueLayoutRef.current = null;
    }
    setCertificateForm({
      templateId: String(issue.templateId),
      recipientName: issue.recipientName || "",
      recipientEmail: issue.recipientEmail || "",
      recipientPhone: issue.recipientPhone || "",
      programTitle: issue.programTitle || "",
      issuerName: issue.issuerName || "Arkan Web",
      description: issue.description || "",
    });
    setSigners(issue.metadata?.signatures || []);
    setSelectedPartners(issue.metadata?.partnerIds || []);
    setVerificationInput(issue.serialNumber);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const clearCertificateForm = () => {
    setCertificateId(null);
    setEditingStatus("");
    setCertificateForm(emptyCertificate);
    setSigners([]);
    setSelectedPartners([]);
    setVerificationInput("");
    const selected = templates.find((item) => String(item.id) === templateId);
    if (selected) {
      const nextLayout = { ...initialBoxes, ...(selected.layoutConfig || {}) };
      layoutRef.current = nextLayout;
      setLayout(nextLayout);
      setLayoutUndo([]);
      setLayoutRedo([]);
    }
  };

  const certificatePayload = () => ({
    ...certificateForm,
    templateId: Number(certificateForm.templateId),
    layoutConfig: layout,
    signatures: signers,
    partnerIds: selectedPartners,
    metadata: { signatures: signers, partnerIds: selectedPartners, layoutConfig: layout },
  });

  const saveCertificate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!certificateForm.templateId) {
      toast({ variant: "destructive", title: "اختر قالب الشهادة أولاً" });
      return;
    }
    if (templateId !== certificateForm.templateId) {
      setTemplateId(certificateForm.templateId);
      toast({ title: "تم تحميل تصميم القالب المحدد", description: "راجع المعاينة ثم احفظ الشهادة مرة أخرى." });
      return;
    }
    setSaving(true);
    try {
      const body = certificatePayload();
      const result = certificateId
        ? await apiFetchJson<CertificateIssue>(`/api/certificates/${certificateId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          })
        : await apiFetchJson<CertificateIssue>("/api/certificates/issue", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
      setCertificateId(result.id);
      setEditingStatus(result.status);
      setVerificationInput(result.serialNumber);
      await refresh();
      toast({
        title: editingStatus === "draft" ? "تم تحديث المسودة" : certificateId ? "تم تحديث الشهادة" : "تم إصدار الشهادة",
        description: result.serialNumber,
      });
    } catch (error) {
      toast({ variant: "destructive", title: "تعذر حفظ الشهادة", description: (error as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const saveDraft = async () => {
    if (certificateId && editingStatus !== "draft") {
      toast({ variant: "destructive", title: "لا يمكن تحويل شهادة صادرة إلى مسودة" });
      return;
    }
    if (!certificateForm.templateId) {
      toast({ variant: "destructive", title: "اختر قالب الشهادة أولاً" });
      return;
    }
    setSaving(true);
    try {
      const body = certificatePayload();
      const result = certificateId
        ? await apiFetchJson<CertificateIssue>(`/api/certificates/${certificateId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          })
        : await apiFetchJson<CertificateIssue>("/api/certificates/drafts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
      setCertificateId(result.id);
      setEditingStatus(result.status);
      await refresh();
      toast({ title: "تم حفظ المسودة", description: "لم تصدر الشهادة بعد ولا يمكن التحقق منها." });
    } catch (error) {
      toast({ variant: "destructive", title: "تعذر حفظ المسودة", description: (error as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const issueDraft = async (issue: CertificateIssue) => {
    if (!window.confirm(`إصدار الشهادة للمستفيد «${issue.recipientName}» الآن؟`)) return;
    try {
      const result = await apiFetchJson<CertificateIssue>(`/api/certificates/${issue.id}/issue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipientName: issue.recipientName,
          programTitle: issue.programTitle,
        }),
      });
      await refresh();
      toast({ title: "تم إصدار الشهادة", description: result.serialNumber });
    } catch (error) {
      toast({ variant: "destructive", title: "تعذر إصدار المسودة", description: (error as Error).message });
    }
  };

  const cancelCertificate = async (issue: CertificateIssue) => {
    if (!window.confirm(`سيتم إلغاء الشهادة ${issue.serialNumber} ولن تظهر كشهادة صالحة في صفحة التحقق. متابعة؟`)) return;
    try {
      await apiFetchJson(`/api/certificates/${issue.id}/cancel`, { method: "PATCH" });
      await refresh();
      toast({ title: "تم إلغاء الشهادة" });
    } catch (error) {
      toast({ variant: "destructive", title: "تعذر إلغاء الشهادة", description: (error as Error).message });
    }
  };

  const moveToTrash = async (issue: CertificateIssue) => {
    if (!window.confirm(`نقل الشهادة ${issue.serialNumber} إلى سلة المحذوفات؟ يمكن استعادتها خلال 30 يوماً.`)) return;
    try {
      await apiFetchJson(`/api/certificates/${issue.id}`, { method: "DELETE" });
      await refresh();
      toast({ title: "نُقلت الشهادة إلى سلة المحذوفات" });
    } catch (error) {
      toast({ variant: "destructive", title: "تعذر نقل الشهادة", description: (error as Error).message });
    }
  };

  const moveSelectedToTrash = async () => {
    if (!selectedIssueIds.length || !window.confirm(`نقل ${selectedIssueIds.length} شهادة إلى سلة المحذوفات؟`)) return;
    try {
      await apiFetchJson("/api/certificates/bulk/trash", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedIssueIds }),
      });
      setSelectedIssueIds([]);
      await Promise.all([refresh(), loadTrash()]);
      toast({ title: "تم نقل الشهادات إلى السلة" });
    } catch (error) {
      toast({ variant: "destructive", title: "تعذر نقل الشهادات", description: (error as Error).message });
    }
  };

  const restoreIssues = async (ids: number[]) => {
    try {
      await apiFetchJson("/api/certificates/bulk/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      setSelectedIssueIds([]);
      await Promise.all([refresh(), loadTrash()]);
      toast({ title: "تمت استعادة الشهادات" });
    } catch (error) {
      toast({ variant: "destructive", title: "تعذرت استعادة الشهادات", description: (error as Error).message });
    }
  };

  const permanentlyDeleteIssues = async (ids: number[]) => {
    if (!window.confirm(`سيتم حذف ${ids.length} شهادة نهائياً ولا يمكن استعادتها. متابعة؟`)) return;
    try {
      await apiFetchJson("/api/certificates/bulk/permanent-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      setSelectedIssueIds([]);
      await Promise.all([refresh(), loadTrash()]);
      toast({ title: "تم الحذف النهائي" });
    } catch (error) {
      toast({ variant: "destructive", title: "تعذر الحذف النهائي", description: (error as Error).message });
    }
  };

  const downloadCollection = async (format: "zip" | "xlsx", ids: number[]) => {
    try {
      const query = new URLSearchParams();
      if (ids.length) query.set("ids", ids.join(","));
      if (!ids.length && search.trim()) query.set("search", search.trim());
      if (!ids.length && statusFilter) query.set("status", statusFilter);
      if (showTrash) query.set("trash", "true");
      const response = await apiFetch(`/api/certificates/${format === "zip" ? "export-zip" : "export.xlsx"}?${query.toString()}`);
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || `HTTP ${response.status}`);
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = format === "zip" ? "certificates.zip" : "certificates.xlsx";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      toast({ variant: "destructive", title: "تعذر تنزيل الملفات", description: (error as Error).message });
    }
  };

  const openPdf = async (issue: CertificateIssue, preview: boolean) => {
    const target = preview ? window.open("", "_blank") : null;
    try {
      const response = await apiFetch(`/api/certificates/${issue.id}/${preview ? "preview" : "export"}`);
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || `HTTP ${response.status}`);
      }
      const pdfUrl = URL.createObjectURL(await response.blob());
      if (preview && target) {
        target.location.href = pdfUrl;
      } else if (preview) {
        window.location.href = pdfUrl;
      } else {
        const downloadLink = document.createElement("a");
        downloadLink.href = pdfUrl;
        downloadLink.download = `certificate-${issue.serialNumber}.pdf`;
        document.body.appendChild(downloadLink);
        downloadLink.click();
        downloadLink.remove();
      }
      window.setTimeout(() => URL.revokeObjectURL(pdfUrl), 60_000);
    } catch (error) {
      target?.close();
      toast({ variant: "destructive", title: "تعذر فتح الشهادة", description: (error as Error).message });
    }
  };

  const openDraftPdf = async () => {
    if (!certificateForm.templateId) {
      toast({ variant: "destructive", title: "اختر قالب الشهادة أولاً" });
      return;
    }
    if (templateId !== certificateForm.templateId) {
      setTemplateId(certificateForm.templateId);
      toast({ title: "تم تحميل تصميم القالب المحدد", description: "راجع المعاينة ثم أعد فتح معاينة PDF." });
      return;
    }
    const target = window.open("", "_blank");
    try {
      const response = await apiFetch("/api/certificates/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...certificateForm,
          templateId: Number(certificateForm.templateId),
          serialNumber: activeSerial,
          issueId: certificateId,
          signatures: signers,
          partnerIds: selectedPartners,
          layoutConfig: layout,
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || `HTTP ${response.status}`);
      }
      const pdfUrl = URL.createObjectURL(await response.blob());
      if (target) target.location.href = pdfUrl;
      else window.location.href = pdfUrl;
      window.setTimeout(() => URL.revokeObjectURL(pdfUrl), 60_000);
    } catch (error) {
      target?.close();
      toast({ variant: "destructive", title: "تعذرت معاينة PDF", description: (error as Error).message });
    }
  };

  const verifyCertificate = async (event: React.FormEvent) => {
    event.preventDefault();
    setVerificationLoading(true);
    setVerificationResult(null);
    try {
      const result = await apiFetchJson(`/api/certificates/verify?serial=${encodeURIComponent(verificationInput.trim())}`);
      setVerificationResult(result);
    } catch (error) {
      setVerificationResult({ valid: false, error: (error as Error).message });
    } finally {
      setVerificationLoading(false);
    }
  };

  const activeIssue = issues.find((issue) => issue.id === certificateId);
  const activeSerial = editingStatus === "issued" && activeIssue?.status === "issued" && activeIssue.serialNumber === verificationInput
    ? verificationInput
    : "";
  const previewWidth = Math.max(Number(templateForm.width) || 1200, 1);
  const previewHeight = Math.max(Number(templateForm.height) || 800, 1);
  const signatureBoxes: Box[] = signers.map((_, index) => {
    const configured = layout.signatureBoxes?.[index];
    const defaultWidth = 70 / Math.max(signers.length, 1);
    const fallback = {
      x: 15 + index * defaultWidth,
      y: 63,
      width: Math.min(defaultWidth, 24),
      height: 15,
    };
    return boxFor({ position: configured || fallback }, "position", fallback);
  });

  if (loading) return <div className="py-16 text-center text-muted-foreground">جاري تحميل استوديو الشهادات...</div>;

  return (
    <div className="space-y-6" dir="rtl">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">استوديو الشهادات</h1>
          <p className="mt-1 text-sm text-muted-foreground">قوالب قابلة للتعديل، شركاء وتوقيعات متعددة، إصدار وتحقق فعلي.</p>
        </div>
        <button className="rounded-lg border px-4 py-2 text-sm" onClick={() => refresh().catch((error: Error) => toast({ variant: "destructive", title: "تعذر التحديث", description: error.message }))}>
          تحديث البيانات
        </button>
      </header>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="space-y-4 rounded-2xl border bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold">تصميم القالب</h2>
          <label className="block space-y-1.5 text-sm">
            <span className="font-medium">قالب محفوظ</span>
            <select className="w-full rounded-lg border bg-background px-3 py-2" value={templateId} onChange={(event) => {
              const value = event.target.value;
              setTemplateId(value);
              if (!value) {
                setTemplateForm(emptyTemplate);
                applyLayout(initialBoxes);
              }
            }}>
              <option value="">قالب جديد</option>
              {templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
            </select>
          </label>
          {templateId && <button type="button" className="rounded-lg border px-3 py-2 text-sm" onClick={duplicateTemplate}>نسخ القالب المحدد</button>}
          <form onSubmit={saveTemplate} className="space-y-3">
            <Field label="اسم القالب" value={templateForm.name} onChange={(value) => updateTemplateField("name", value)} />
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1.5 text-sm">
                <span className="font-medium">اتجاه الصفحة</span>
                <select className="w-full rounded-lg border bg-background px-3 py-2" value={templateForm.orientation} onChange={(event) => updateTemplateField("orientation", event.target.value)}>
                  <option value="landscape">أفقي</option>
                  <option value="portrait">عمودي</option>
                </select>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <Field label="العرض" type="number" value={templateForm.width} onChange={(value) => updateTemplateField("width", value)} />
                <Field label="الارتفاع" type="number" value={templateForm.height} onChange={(value) => updateTemplateField("height", value)} />
              </div>
            </div>
            <ImageUploadField label="خلفية القالب" value={templateForm.backgroundUrl} onChange={(value) => updateTemplateField("backgroundUrl", value)} />
            <div className="grid gap-3 sm:grid-cols-2">
              <ImageUploadField label="شعار الجهة المصدرة" value={templateForm.logoUrl} onChange={(value) => updateTemplateField("logoUrl", value)} />
              <ImageUploadField label="صورة توقيع افتراضي (اختياري)" value={templateForm.signatureUrl} onChange={(value) => updateTemplateField("signatureUrl", value)} />
            </div>
            <div className="space-y-2 border-t pt-3">
              <p className="text-sm font-semibold">مواضع العناصر (%)</p>
              {[
                ["recipientName", "اسم المستفيد"],
                ["programTitle", "اسم البرنامج"],
                ["issuerName", "الجهة المصدرة"],
                ["signature", "التوقيع الافتراضي"],
                ["serialNumber", "رقم الشهادة"],
                ["issueDate", "تاريخ الإصدار"],
                ["qrCode", "رمز QR"],
                ["logo", "شعار القالب"],
              ].map(([key, label]) => (
                <div key={key} className="grid grid-cols-5 items-end gap-2 rounded-lg bg-muted/30 p-2">
                  <span className="col-span-5 text-xs font-medium sm:col-span-1">{label}</span>
                  {(["x", "y", "width", "height"] as const).map((part) => (
                    <Field key={part} label={part === "x" ? "أفقي" : part === "y" ? "عمودي" : part === "width" ? "عرض" : "ارتفاع"} type="number" value={boxFor(layout, key, initialBoxes[key])[part]} onChange={(value) => updateBox(key, part, value)} />
                  ))}
                  {["recipientName", "programTitle", "issuerName", "serialNumber", "issueDate"].includes(key) && (
                    <label className="col-span-5 flex items-center gap-2 text-xs sm:col-span-2">
                      المحاذاة
                      <select
                        className="rounded border bg-background px-2 py-1"
                        value={alignmentFor(layout, key)}
                        onChange={(event) => applyLayout({ ...layoutRef.current, [key]: { ...boxFor(layoutRef.current, key, initialBoxes[key]), align: event.target.value } })}
                      >
                        <option value="right">يمين</option>
                        <option value="center">وسط</option>
                        <option value="left">يسار</option>
                      </select>
                    </label>
                  )}
                </div>
              ))}
            </div>
            <button disabled={saving} className="w-full rounded-lg bg-primary px-4 py-2.5 font-semibold text-primary-foreground disabled:opacity-60">
              {saving ? "جارٍ الحفظ..." : templateId ? "حفظ تعديلات القالب" : "إنشاء القالب"}
            </button>
          </form>
        </section>

        <section className="space-y-4 rounded-2xl border bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-bold">معاينة مباشرة</h2>
            <div className="flex gap-2">
              <button type="button" className="rounded border px-3 py-1.5 text-sm disabled:opacity-40" disabled={!layoutUndo.length} onClick={undoLayout}>تراجع</button>
              <button type="button" className="rounded border px-3 py-1.5 text-sm disabled:opacity-40" disabled={!layoutRedo.length} onClick={redoLayout}>إعادة</button>
            </div>
          </div>
          <div
            ref={previewRef}
            className="relative mx-auto w-full overflow-hidden border-8 border-amber-700/60 bg-amber-50 shadow-inner"
            style={{
              aspectRatio: `${previewWidth} / ${previewHeight}`,
              containerType: "inline-size",
              backgroundImage: templateForm.backgroundUrl ? `url("${templateForm.backgroundUrl}")` : undefined,
              backgroundSize: "100% 100%",
              backgroundPosition: "center",
            }}
          >
            {!templateForm.backgroundUrl && <div className="absolute inset-3 border border-amber-600/60" />}
            {templateForm.logoUrl && <img onPointerDown={(event) => startDrag(event, "logo", boxFor(layout, "logo", initialBoxes.logo))} src={templateForm.logoUrl} className="absolute cursor-move touch-none object-contain" style={{ left: `${boxFor(layout, "logo", initialBoxes.logo).x}%`, top: `${boxFor(layout, "logo", initialBoxes.logo).y}%`, width: `${boxFor(layout, "logo", initialBoxes.logo).width}%`, height: `${boxFor(layout, "logo", initialBoxes.logo).height}%` }} alt="" />}
            {templateForm.signatureUrl && <img onPointerDown={(event) => startDrag(event, "signature", boxFor(layout, "signature", initialBoxes.signature))} src={templateForm.signatureUrl} className="absolute cursor-move touch-none object-contain" style={{ left: `${boxFor(layout, "signature", initialBoxes.signature).x}%`, top: `${boxFor(layout, "signature", initialBoxes.signature).y}%`, width: `${boxFor(layout, "signature", initialBoxes.signature).width}%`, height: `${boxFor(layout, "signature", initialBoxes.signature).height}%` }} alt="التوقيع الافتراضي" />}
            <span onPointerDown={(event) => startDrag(event, "recipientName", boxFor(layout, "recipientName", initialBoxes.recipientName))} className="absolute flex cursor-move touch-none overflow-hidden text-[clamp(12px,2vw,28px)] font-bold text-slate-900" style={{ left: `${boxFor(layout, "recipientName", initialBoxes.recipientName).x}%`, top: `${boxFor(layout, "recipientName", initialBoxes.recipientName).y}%`, width: `${boxFor(layout, "recipientName", initialBoxes.recipientName).width}%`, height: `${boxFor(layout, "recipientName", initialBoxes.recipientName).height}%`, alignItems: "center", justifyContent: alignmentFor(layout, "recipientName") === "left" ? "flex-start" : alignmentFor(layout, "recipientName") === "right" ? "flex-end" : "center", textAlign: alignmentFor(layout, "recipientName") }}>
              {certificateForm.recipientName || "اسم صاحب الشهادة"}
            </span>
            <span onPointerDown={(event) => startDrag(event, "programTitle", boxFor(layout, "programTitle", initialBoxes.programTitle))} className="absolute flex cursor-move touch-none overflow-hidden text-[clamp(9px,1.5vw,18px)] text-slate-700" style={{ left: `${boxFor(layout, "programTitle", initialBoxes.programTitle).x}%`, top: `${boxFor(layout, "programTitle", initialBoxes.programTitle).y}%`, width: `${boxFor(layout, "programTitle", initialBoxes.programTitle).width}%`, height: `${boxFor(layout, "programTitle", initialBoxes.programTitle).height}%`, alignItems: "center", justifyContent: alignmentFor(layout, "programTitle") === "left" ? "flex-start" : alignmentFor(layout, "programTitle") === "right" ? "flex-end" : "center", textAlign: alignmentFor(layout, "programTitle") }}>
              {certificateForm.programTitle || "اسم الشهادة / البرنامج"}
            </span>
            <span onPointerDown={(event) => startDrag(event, "issuerName", boxFor(layout, "issuerName", initialBoxes.issuerName))} className="absolute flex cursor-move touch-none overflow-hidden text-[clamp(7px,1vw,13px)] text-slate-600" style={{ left: `${boxFor(layout, "issuerName", initialBoxes.issuerName).x}%`, top: `${boxFor(layout, "issuerName", initialBoxes.issuerName).y}%`, width: `${boxFor(layout, "issuerName", initialBoxes.issuerName).width}%`, height: `${boxFor(layout, "issuerName", initialBoxes.issuerName).height}%`, alignItems: "center", justifyContent: alignmentFor(layout, "issuerName") === "left" ? "flex-start" : alignmentFor(layout, "issuerName") === "right" ? "flex-end" : "center", textAlign: alignmentFor(layout, "issuerName") }}>
              {certificateForm.issuerName || "الجهة المصدرة"}
            </span>
            <span onPointerDown={(event) => startDrag(event, "serialNumber", boxFor(layout, "serialNumber", initialBoxes.serialNumber))} className="absolute flex cursor-move touch-none overflow-hidden text-[clamp(7px,1vw,12px)] font-mono" style={{ left: `${boxFor(layout, "serialNumber", initialBoxes.serialNumber).x}%`, top: `${boxFor(layout, "serialNumber", initialBoxes.serialNumber).y}%`, width: `${boxFor(layout, "serialNumber", initialBoxes.serialNumber).width}%`, height: `${boxFor(layout, "serialNumber", initialBoxes.serialNumber).height}%`, alignItems: "center", justifyContent: alignmentFor(layout, "serialNumber") === "left" ? "flex-start" : alignmentFor(layout, "serialNumber") === "right" ? "flex-end" : "center", textAlign: alignmentFor(layout, "serialNumber") }}>
              رقم الشهادة: {activeSerial || "سيصدر بعد الاعتماد"}
            </span>
            <span onPointerDown={(event) => startDrag(event, "issueDate", boxFor(layout, "issueDate", initialBoxes.issueDate))} className="absolute flex cursor-move touch-none items-center justify-center overflow-hidden text-center text-[clamp(6px,0.8vw,10px)] text-slate-600" style={{ left: `${boxFor(layout, "issueDate", initialBoxes.issueDate).x}%`, top: `${boxFor(layout, "issueDate", initialBoxes.issueDate).y}%`, width: `${boxFor(layout, "issueDate", initialBoxes.issueDate).width}%`, height: `${boxFor(layout, "issueDate", initialBoxes.issueDate).height}%` }}>
              تاريخ الإصدار: {new Date().toLocaleDateString("ar-EG")}
            </span>
            {activeSerial ? (
              <img onPointerDown={(event) => startDrag(event, "qrCode", boxFor(layout, "qrCode", initialBoxes.qrCode))} src={resolveApiUrl(`/api/certificates/qr?serial=${encodeURIComponent(activeSerial)}`)} alt="رمز التحقق QR" className="absolute cursor-move touch-none bg-white" style={{ left: `${boxFor(layout, "qrCode", initialBoxes.qrCode).x}%`, top: `${boxFor(layout, "qrCode", initialBoxes.qrCode).y}%`, width: `${boxFor(layout, "qrCode", initialBoxes.qrCode).width}%`, height: `${boxFor(layout, "qrCode", initialBoxes.qrCode).height}%` }} />
            ) : (
              <div className="absolute flex items-center justify-center border border-dashed border-slate-400 bg-white/70 text-[clamp(6px,0.7vw,10px)] text-slate-500" style={{ left: `${boxFor(layout, "qrCode", initialBoxes.qrCode).x}%`, top: `${boxFor(layout, "qrCode", initialBoxes.qrCode).y}%`, width: `${boxFor(layout, "qrCode", initialBoxes.qrCode).width}%`, height: `${boxFor(layout, "qrCode", initialBoxes.qrCode).height}%` }}>بعد الإصدار</div>
            )}
            {selectedPartnerRecords.map((partner, index) => {
              const defaultWidth = 70 / Math.max(selectedPartnerRecords.length, 1);
              const logoBox = boxFor(
                { position: layout.partnerLogoBoxes?.[String(partner.id)] ?? layout.partnerBoxes?.[String(partner.id)] },
                "position",
                { x: 15 + index * defaultWidth, y: 5, width: Math.min(defaultWidth, 20), height: 14 },
              );
              const signatureBox = boxFor(
                { position: layout.partnerSignatureBoxes?.[String(partner.id)] },
                "position",
                { x: logoBox.x, y: 68, width: logoBox.width, height: 20 },
              );
              return (
                <div key={partner.id}>
                  {partner.logoUrl && <img onPointerDown={(event) => startDrag(event, `partnerLogo:${partner.id}`, logoBox)} src={partner.logoUrl} className="absolute cursor-move touch-none object-contain" style={{ left: `${logoBox.x}%`, top: `${logoBox.y}%`, width: `${logoBox.width}%`, height: `${logoBox.height}%` }} alt={partner.name} />}
                  <div onPointerDown={(event) => startDrag(event, `partnerSignature:${partner.id}`, signatureBox)} className="absolute flex cursor-move touch-none flex-col items-center justify-center overflow-hidden text-center text-[clamp(6px,0.8vw,10px)]" style={{ left: `${signatureBox.x}%`, top: `${signatureBox.y}%`, width: `${signatureBox.width}%`, height: `${signatureBox.height}%` }}>
                    {partner.signatureUrl && <img src={partner.signatureUrl} className="max-h-[40%] max-w-full object-contain" alt="" />}
                    <span>{partner.name}</span>
                    {partner.signatureName && <span className="font-[cursive] italic">{partner.signatureName}</span>}
                    {partner.signatureTitle && <span>{partner.signatureTitle}</span>}
                  </div>
                </div>
              );
            })}
            {signers.map((signer, index) => {
              const box = signatureBoxes[index] || initialBoxes.signature;
              return (
                <div key={index} onPointerDown={(event) => startDrag(event, `signature:${index}`, box)} className="absolute flex cursor-move touch-none flex-col items-center justify-center overflow-hidden text-center" style={{ left: `${box.x}%`, top: `${box.y}%`, width: `${box.width}%`, height: `${box.height}%` }}>
                  {signer.signatureUrl && <img src={signer.signatureUrl} className="max-h-[50%] max-w-full object-contain" alt="" />}
                  <span
                    className={signer.style === "classic" ? "font-serif" : signer.style === "bold" ? "font-bold" : "font-[cursive] italic"}
                    style={{ fontSize: `${Math.max(8, Number(signer.fontSize || 18)) / previewWidth * 100}cqw` }}
                  >
                    {signer.name || "التوقيع"}
                  </span>
                  <span className="text-[clamp(6px,0.7vw,10px)]">{signer.title || signer.role}</span>
                </div>
              );
            })}
          </div>
          <p className="text-center text-xs text-muted-foreground">الموضع والحجم نسبيان إلى مساحة الشهادة؛ ملف PDF يُنشأ من إعدادات التصميم المحفوظة نفسها.</p>
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="space-y-4 rounded-2xl border bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-bold">{partnerEditId ? "تعديل مؤسسة شريكة" : "إضافة مؤسسة شريكة"}</h2>
            {partnerEditId && <button className="text-sm text-primary underline" onClick={() => { setPartnerEditId(null); setPartnerForm(emptyPartner); }}>إلغاء التعديل</button>}
          </div>
          <form onSubmit={savePartner} className="grid gap-3 sm:grid-cols-2">
            <Field label="اسم المؤسسة" value={partnerForm.name} onChange={(value) => setPartnerForm({ ...partnerForm, name: value })} />
            <Field label="ترتيب العرض" type="number" value={partnerForm.sortOrder} onChange={(value) => setPartnerForm({ ...partnerForm, sortOrder: value })} />
            <ImageUploadField label="شعار المؤسسة" value={partnerForm.logoUrl} onChange={(value) => setPartnerForm({ ...partnerForm, logoUrl: value })} />
            <ImageUploadField label="صورة توقيع المؤسسة" value={partnerForm.signatureUrl} onChange={(value) => setPartnerForm({ ...partnerForm, signatureUrl: value })} />
            <Field label="اسم مسؤول التوقيع" value={partnerForm.signatureName} onChange={(value) => setPartnerForm({ ...partnerForm, signatureName: value })} />
            <Field label="صفة المسؤول" value={partnerForm.signatureTitle} onChange={(value) => setPartnerForm({ ...partnerForm, signatureTitle: value })} />
            <button disabled={saving} className="rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground sm:col-span-2">{saving ? "جارٍ الحفظ..." : partnerEditId ? "حفظ المؤسسة" : "إضافة المؤسسة"}</button>
          </form>
          <div className="divide-y rounded-xl border">
            {partners.map((partner) => (
              <div key={partner.id} className="flex flex-wrap items-center gap-3 p-3">
                {partner.logoUrl && <img src={partner.logoUrl} alt="" className="h-10 w-10 rounded object-contain" />}
                <div className="min-w-0 flex-1"><p className="font-semibold">{partner.name}</p><p className="text-xs text-muted-foreground">الترتيب: {partner.sortOrder} {partner.signatureName ? `· ${partner.signatureName} ${partner.signatureTitle || ""}` : ""}</p></div>
                <button className="text-sm text-primary" onClick={() => editPartner(partner)}>تعديل</button>
                <button className="text-sm text-destructive" onClick={() => deletePartner(partner)}>حذف</button>
              </div>
            ))}
            {!partners.length && <p className="p-4 text-sm text-muted-foreground">أضف المؤسسات التي يمكن اختيارها لشهاداتك.</p>}
          </div>
        </section>

        <section className="space-y-4 rounded-2xl border bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-bold">{certificateId ? "تعديل شهادة" : "إصدار شهادة جديدة"}</h2>
            {certificateId && <button className="text-sm text-primary underline" onClick={clearCertificateForm}>إصدار شهادة جديدة</button>}
          </div>
          <form onSubmit={saveCertificate} className="space-y-3">
            <label className="block space-y-1.5 text-sm">
              <span className="font-medium">قالب الشهادة</span>
              <select className="w-full rounded-lg border bg-background px-3 py-2" value={certificateForm.templateId} onChange={(event) => { setCertificateForm({ ...certificateForm, templateId: event.target.value }); setTemplateId(event.target.value); }}>
                <option value="">اختر قالباً</option>
                {templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
              </select>
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="اسم المستفيد" value={certificateForm.recipientName} onChange={(value) => setCertificateForm({ ...certificateForm, recipientName: value })} />
              <Field label="اسم الشهادة / البرنامج" value={certificateForm.programTitle} onChange={(value) => setCertificateForm({ ...certificateForm, programTitle: value })} />
              <Field label="الجهة المصدرة" value={certificateForm.issuerName} onChange={(value) => setCertificateForm({ ...certificateForm, issuerName: value })} />
              <Field label="البريد (داخلي)" value={certificateForm.recipientEmail} dir="ltr" onChange={(value) => setCertificateForm({ ...certificateForm, recipientEmail: value })} />
            </div>
            <Field label="وصف / ملاحظات داخلية" value={certificateForm.description} onChange={(value) => setCertificateForm({ ...certificateForm, description: value })} />
            <div className="space-y-2 border-t pt-3">
              <div className="flex items-center justify-between"><p className="font-semibold">التوقيعات على هذه الشهادة</p><button type="button" className="text-sm text-primary" onClick={() => setSigners([...signers, { name: "", title: "", role: "", signatureUrl: "", style: "script", fontSize: 18 }])}>+ إضافة توقيع</button></div>
              {signers.map((signer, index) => (
                <div key={index} className="space-y-2 rounded-lg border bg-muted/20 p-3">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Field label="اسم صاحب التوقيع" value={signer.name} onChange={(value) => setSigners(signers.map((item, i) => i === index ? { ...item, name: value } : item))} />
                    <Field label="الصفة / المسمى" value={signer.title} onChange={(value) => setSigners(signers.map((item, i) => i === index ? { ...item, title: value } : item))} />
                    <Field label="الجهة (اختياري)" value={signer.role} onChange={(value) => setSigners(signers.map((item, i) => i === index ? { ...item, role: value } : item))} />
                    <ImageUploadField label="صورة التوقيع (اختياري)" value={signer.signatureUrl} onChange={(value) => setSigners(signers.map((item, i) => i === index ? { ...item, signatureUrl: value } : item))} />
                    <label className="block space-y-1.5 text-sm">
                      <span className="font-medium">نمط الاسم</span>
                      <select className="w-full rounded-lg border bg-background px-3 py-2" value={signer.style || "script"} onChange={(event) => setSigners(signers.map((item, i) => i === index ? { ...item, style: event.target.value } : item))}>
                        <option value="script">يدوي مائل</option>
                        <option value="classic">كلاسيكي</option>
                        <option value="bold">عريض</option>
                      </select>
                    </label>
                    <Field label="حجم الاسم في PDF" type="number" value={signer.fontSize || 18} onChange={(value) => setSigners(signers.map((item, i) => i === index ? { ...item, fontSize: Number(value) } : item))} />
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {(["x", "y", "width", "height"] as const).map((part) => <Field key={part} label={{ x: "أفقي %", y: "عمودي %", width: "عرض %", height: "ارتفاع %" }[part]} type="number" value={signatureBoxes[index]?.[part] ?? 10} onChange={(value) => {
                      const next = [...signatureBoxes];
                      const number = Number(value);
                      next[index] = { ...(next[index] || initialBoxes.signature), [part]: Number.isFinite(number) ? Math.min(Math.max(number, 0), 100) : next[index]?.[part] ?? 10 };
                      applyLayout({ ...layoutRef.current, signatureBoxes: next });
                    }} />)}
                  </div>
                  <button type="button" className="text-sm text-destructive" onClick={() => { setSigners(signers.filter((_, i) => i !== index)); applyLayout({ ...layoutRef.current, signatureBoxes: signatureBoxes.filter((_, i) => i !== index) }); }}>حذف هذا التوقيع</button>
                </div>
              ))}
              {!signers.length && <p className="text-xs text-muted-foreground">أضف توقيعاً أو أكثر؛ سيُعرض الاسم بخط مائل مميز مع صفته.</p>}
            </div>
            <div className="space-y-2 border-t pt-3">
              <p className="font-semibold">المؤسسات المشاركة في هذه الشهادة فقط</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {partners.map((partner, index) => {
                  const selected = selectedPartners.includes(partner.id);
                  const selectedIndex = Math.max(selectedPartners.indexOf(partner.id), 0);
                  const defaultWidth = 70 / Math.max(selectedPartners.length, 1);
                  const defaultLogoBox = { x: 15 + selectedIndex * defaultWidth, y: 5, width: Math.min(defaultWidth, 20), height: 14 };
                  const logoBox = boxFor({ position: layout.partnerLogoBoxes?.[String(partner.id)] ?? layout.partnerBoxes?.[String(partner.id)] }, "position", defaultLogoBox);
                  const signatureBox = boxFor({ position: layout.partnerSignatureBoxes?.[String(partner.id)] }, "position", { x: logoBox.x, y: 68, width: logoBox.width, height: 20 });
                  return (
                    <div key={partner.id} className="space-y-2 rounded-lg border p-3">
                      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={selected} onChange={(event) => {
                        const nextIds = event.target.checked
                          ? [...selectedPartners, partner.id]
                          : selectedPartners.filter((id) => id !== partner.id);
                        setSelectedPartners(nextIds.sort((left, right) => partners.findIndex((item) => item.id === left) - partners.findIndex((item) => item.id === right)));
                      }} />{partner.name}</label>
                      {selected && <div className="space-y-2">
                        <div><p className="text-xs font-semibold">موضع وحجم الشعار</p><div className="grid grid-cols-4 gap-1">
                          {(["x", "y", "width", "height"] as const).map((part) => <Field key={part} label={{ x: "أفقي", y: "عمودي", width: "عرض", height: "ارتفاع" }[part]} type="number" value={logoBox[part]} onChange={(value) => updatePartnerBox("partnerLogoBoxes", partner.id, part, value, defaultLogoBox)} />)}
                        </div></div>
                        <div><p className="text-xs font-semibold">موضع وحجم التوقيع والبيانات</p><div className="grid grid-cols-4 gap-1">
                          {(["x", "y", "width", "height"] as const).map((part) => <Field key={part} label={{ x: "أفقي", y: "عمودي", width: "عرض", height: "ارتفاع" }[part]} type="number" value={signatureBox[part]} onChange={(value) => updatePartnerBox("partnerSignatureBoxes", partner.id, part, value, { x: logoBox.x, y: 68, width: logoBox.width, height: 20 })} />)}
                        </div></div>
                      </div>}
                    </div>
                  );
                })}
                {!partners.length && <p className="text-xs text-muted-foreground">أضف المؤسسات من القسم المجاور أولاً.</p>}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button disabled={saving} className="flex-1 rounded-lg bg-primary px-4 py-2.5 font-semibold text-primary-foreground disabled:opacity-60">{saving ? "جارٍ الحفظ..." : editingStatus === "draft" ? "حفظ المسودة" : certificateId ? "حفظ التعديلات" : "إصدار الشهادة"}</button>
              {(!certificateId || editingStatus === "draft") && <button type="button" disabled={saving} className="rounded-lg border px-4 py-2.5 disabled:opacity-60" onClick={saveDraft}>{saving ? "جارٍ الحفظ..." : "حفظ كمسودة"}</button>}
              <button type="button" className="rounded-lg border px-4 py-2" onClick={openDraftPdf}>معاينة PDF</button>
            </div>
          </form>
        </section>
      </div>

      <section className="space-y-3 rounded-2xl border bg-white p-5 shadow-sm">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
          {[
            ["الإجمالي", stats.total],
            ["صادرة", stats.issued],
            ["ملغاة", stats.cancelled],
            ["مسودات", stats.drafts],
            ["سلة المحذوفات", stats.trash],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg bg-muted/40 p-3 text-center">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-xl font-bold">{value}</p>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold">{showTrash ? "سلة المحذوفات" : "إدارة الشهادات"} ({filteredIssues.length})</h2>
          <div className="flex flex-wrap gap-2">
            <a className="rounded-lg border px-3 py-2 text-sm" href="/certificate/verify" target="_blank" rel="noreferrer">صفحة التحقق العامة</a>
            <button type="button" className="rounded-lg border px-3 py-2 text-sm" onClick={async () => {
              if (!showTrash) {
                try {
                  await loadTrash();
                } catch (error) {
                  toast({ variant: "destructive", title: "تعذر تحميل سلة المحذوفات", description: (error as Error).message });
                  return;
                }
              }
              setShowTrash(!showTrash);
              setSelectedIssueIds([]);
              setPage(1);
            }}>{showTrash ? "عرض الشهادات" : `سلة المحذوفات (${stats.trash})`}</button>
          </div>
        </div>
        <form onSubmit={verifyCertificate} className="flex flex-wrap gap-2">
          <input className="min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm" placeholder="رقم الشهادة للتحقق" value={verificationInput} onChange={(event) => setVerificationInput(event.target.value)} />
          <button disabled={verificationLoading} className="rounded-lg bg-slate-800 px-3 py-2 text-sm text-white">{verificationLoading ? "جارٍ التحقق..." : "التحقق من الشهادة"}</button>
        </form>
        {verificationResult && <div className={`rounded-lg p-3 text-sm ${verificationResult.valid ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>{verificationResult.valid ? `شهادة صحيحة — ${verificationResult.certificate?.recipientName} · ${verificationResult.certificate?.programTitle}` : verificationResult.error || "الشهادة غير صالحة أو ملغاة"}</div>}
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-[220px] flex-1 space-y-1 text-sm">
            <span>بحث</span>
            <input className="w-full rounded-lg border px-3 py-2" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="الاسم أو رقم الشهادة أو العنوان" />
          </label>
          <label className="space-y-1 text-sm">
            <span>الحالة</span>
            <select className="block rounded-lg border bg-background px-3 py-2" value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }}>
              <option value="">كل الحالات</option>
              <option value="issued">صادرة</option>
              <option value="cancelled">ملغاة</option>
              <option value="draft">مسودات</option>
            </select>
          </label>
          <button type="button" className="rounded-lg border px-3 py-2 text-sm" disabled={!filteredIssues.length || showTrash} onClick={() => void downloadCollection("zip", selectedIssueIds)}>تنزيل PDF بصيغة ZIP</button>
          <button type="button" className="rounded-lg border px-3 py-2 text-sm" disabled={!filteredIssues.length} onClick={() => void downloadCollection("xlsx", selectedIssueIds)}>تصدير Excel</button>
        </div>
        {selectedIssueIds.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-primary/5 p-3 text-sm">
            <span>تم تحديد {selectedIssueIds.length} شهادة</span>
            {showTrash ? (
              <>
                <button type="button" className="rounded border px-3 py-1.5" onClick={() => void restoreIssues(selectedIssueIds)}>استعادة المحدد</button>
                <button type="button" className="rounded border border-destructive px-3 py-1.5 text-destructive" onClick={() => void permanentlyDeleteIssues(selectedIssueIds)}>حذف نهائي</button>
              </>
            ) : (
              <button type="button" className="rounded border border-destructive px-3 py-1.5 text-destructive" onClick={() => void moveSelectedToTrash()}>نقل المحدد للسلة</button>
            )}
          </div>
        )}
        <div className="divide-y rounded-xl border">
          {pagedIssues.length > 0 && (
            <label className="flex items-center gap-2 border-b bg-muted/20 p-3 text-sm">
              <input type="checkbox" checked={pagedIssues.every((issue) => selectedIssueIds.includes(issue.id))} onChange={(event) => {
                const pageIds = pagedIssues.map((issue) => issue.id);
                setSelectedIssueIds((selected) => event.target.checked
                  ? [...new Set([...selected, ...pageIds])]
                  : selected.filter((id) => !pageIds.includes(id)));
              }} />
              تحديد شهادات هذه الصفحة
            </label>
          )}
          {pagedIssues.map((issue) => (
            <div key={issue.id} className="flex flex-wrap items-center gap-3 p-3">
              <input type="checkbox" aria-label={`تحديد ${issue.recipientName}`} checked={selectedIssueIds.includes(issue.id)} onChange={(event) => setSelectedIssueIds((selected) => event.target.checked ? [...selected, issue.id] : selected.filter((id) => id !== issue.id))} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{issue.recipientName} <span className="text-xs text-muted-foreground">· {issue.status === "issued" ? "صادرة" : issue.status === "draft" ? "مسودة" : "ملغاة"}</span></p>
                <p className="text-sm text-muted-foreground">{issue.programTitle} · {issue.serialNumber}</p>
                {showTrash && issue.deletedAt && <p className="text-xs text-muted-foreground">تاريخ الحذف: {new Date(issue.deletedAt).toLocaleDateString("ar-EG")}</p>}
              </div>
              {!showTrash && issue.status === "issued" && <>
                <img src={resolveApiUrl(`/api/certificates/qr?serial=${encodeURIComponent(issue.serialNumber)}`)} alt="QR" className="h-12 w-12" />
                <a className="text-sm text-primary underline" href={`/certificate/verify?serial=${encodeURIComponent(issue.serialNumber)}`} target="_blank" rel="noreferrer">رابط التحقق</a>
              </>}
              {!showTrash && <>
                <button className="text-sm text-primary" onClick={() => beginEditCertificate(issue)}>تعديل</button>
                <button className="text-sm text-primary" onClick={() => openPdf(issue, true)}>معاينة</button>
                {issue.status !== "draft" && <button className="text-sm text-primary" onClick={() => openPdf(issue, false)}>تنزيل PDF</button>}
                {issue.status === "draft" && <button className="text-sm text-emerald-700" onClick={() => void issueDraft(issue)}>إصدار</button>}
                {issue.status === "issued" && <button className="text-sm text-amber-700" onClick={() => void cancelCertificate(issue)}>إلغاء الشهادة</button>}
                <button className="text-sm text-destructive" onClick={() => void moveToTrash(issue)}>نقل إلى السلة</button>
              </>}
              {showTrash && <>
                <button className="text-sm text-primary" onClick={() => void restoreIssues([issue.id])}>استعادة</button>
                <button className="text-sm text-destructive" onClick={() => void permanentlyDeleteIssues([issue.id])}>حذف نهائي</button>
              </>}
            </div>
          ))}
          {!pagedIssues.length && <p className="p-6 text-center text-sm text-muted-foreground">{showTrash ? "سلة المحذوفات فارغة." : "لا توجد شهادات مطابقة."}</p>}
        </div>
        {pageCount > 1 && <div className="flex items-center justify-center gap-3 text-sm">
          <button type="button" className="rounded border px-3 py-1.5 disabled:opacity-40" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>السابق</button>
          <span>صفحة {page} من {pageCount}</span>
          <button type="button" className="rounded border px-3 py-1.5 disabled:opacity-40" disabled={page >= pageCount} onClick={() => setPage((current) => current + 1)}>التالي</button>
        </div>}
      </section>
    </div>
  );
}
