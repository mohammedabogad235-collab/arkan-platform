import { useState, useEffect } from "react";
import { useSettings, useUpdateSettings, SETTINGS_KEY } from "@/lib/use-settings";
import {
  useGetAdminStats,
  useListOrders,
  useUpdateOrder,
  useDeleteOrder,
  useListPackages,
  useCreatePackage,
  useUpdatePackage,
  useListTestimonials,
  useUpdateTestimonial,
  useListPaymentMethods,
  useCreatePaymentMethod,
  useUpdatePaymentMethod,
  useListUsers,
  useDeleteUser,
  useDeletePackage,
  useDeletePaymentMethod,
  useDeleteTestimonial,
  getGetAdminStatsQueryKey,
  getListOrdersQueryKey,
  getListUsersQueryKey,
  getListPackagesQueryKey,
  getListPaymentMethodsQueryKey,
  getListTestimonialsQueryKey,
} from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Users, ShoppingCart, DollarSign, CheckCircle, Trash2, Plus, Pencil,
  ShieldCheck, ShieldOff, UserPlus, Settings, Eye, EyeOff,
  TrendingUp, FileImage, BadgeCheck, Percent, MessageSquare,
  CreditCard, Package, BarChart3, Globe, Phone, Mail, MapPin,
  Facebook, Instagram, Twitter, ChevronDown, ChevronUp, Check, X,
  Clock, Banknote, Star, ArrowUpRight,
} from "lucide-react";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  pending:    { label: "قيد الانتظار", color: "text-amber-700", bg: "bg-amber-50 border-amber-200", dot: "bg-amber-500" },
  in_progress:{ label: "جاري التنفيذ",  color: "text-blue-700",  bg: "bg-blue-50 border-blue-200",   dot: "bg-blue-500" },
  completed:  { label: "مكتمل",         color: "text-green-700", bg: "bg-green-50 border-green-200", dot: "bg-green-500" },
  cancelled:  { label: "ملغي",          color: "text-red-700",   bg: "bg-red-50 border-red-200",     dot: "bg-red-400" },
};

const NAV = [
  { id: "overview", label: "الإحصائيات", icon: BarChart3 },
  { id: "orders",   label: "الطلبات",    icon: ShoppingCart },
  { id: "finances", label: "المالية",    icon: TrendingUp },
  { id: "users",    label: "المستخدمين", icon: Users },
  { id: "packages", label: "الباقات",    icon: Package },
  { id: "payments", label: "طرق الدفع", icon: CreditCard },
  { id: "reviews",  label: "الآراء",     icon: MessageSquare },
  { id: "settings", label: "الإعدادات", icon: Settings },
];

function StatCard({ icon: Icon, label, value, sub, color }: { icon: any; label: string; value: string | number; sub?: string; color: string }) {
  return (
    <div className={`rounded-2xl p-5 border flex items-center gap-4 bg-white shadow-sm hover:shadow-md transition-shadow`}>
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
        <Icon className="w-6 h-6" />
      </div>
      <div className="min-w-0">
        <p className="text-sm text-muted-foreground mb-0.5 truncate">{label}</p>
        <p className="text-2xl font-bold text-foreground leading-tight">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${cfg.bg} ${cfg.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

function OrderCard({ order, expanded, onToggle, onStatusChange, onPaymentChange, onDelete, onConfirmReceipt }: {
  order: any;
  expanded: boolean;
  onToggle: (id: number) => void;
  onStatusChange: (id: number, status: string) => void;
  onPaymentChange: (id: number, field: string, val: boolean) => void;
  onDelete: (id: number) => void;
  onConfirmReceipt: (id: number) => void;
}) {
  const pct = order.depositPercentage ?? 50;
  const deposit = order.totalAmount ? (order.totalAmount * pct) / 100 : null;
  const remaining = order.totalAmount && deposit !== null ? order.totalAmount - deposit : null;

  return (
    <div className="bg-white rounded-2xl border shadow-sm hover:shadow-md transition-all overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between px-5 py-4 border-b bg-muted/20 cursor-pointer select-none"
        onClick={() => onToggle(order.id)}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Globe className="w-4 h-4 text-primary" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-foreground truncate">{order.siteName}</span>
              <StatusBadge status={order.status} />
              {order.receiptUrl && !order.depositPaid && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-orange-50 text-orange-700 border border-orange-200">
                  <FileImage className="w-3 h-3" /> إيصال بانتظار التأكيد
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{order.siteType} · #{order.id}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-muted-foreground hidden sm:block">
            {format(new Date(order.createdAt), "dd MMM yyyy", { locale: ar })}
          </span>
          <div className="p-1.5 rounded-lg text-muted-foreground">
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </div>
      </div>

      {/* Summary row */}
      <div className="px-5 py-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <div className="flex items-center gap-2">
          <Users className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="font-medium">{order.user?.fullName}</span>
          <span className="text-muted-foreground">{order.user?.phone}</span>
        </div>
        {order.totalAmount ? (
          <div className="flex items-center gap-1 font-semibold text-primary">
            <DollarSign className="w-3.5 h-3.5" />
            {order.totalAmount.toLocaleString()} {order.currency}
          </div>
        ) : (
          <span className="text-muted-foreground text-xs">لم يُحدَّد المبلغ بعد</span>
        )}
        <div className="flex items-center gap-2 ms-auto">
          {order.depositPaid && <Badge className="bg-green-100 text-green-700 border-green-200 text-xs">✓ مقدم</Badge>}
          {order.finalPaid && <Badge className="bg-blue-100 text-blue-700 border-blue-200 text-xs">✓ متبقي</Badge>}
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t bg-muted/10 px-5 py-4 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Left: Details */}
            <div className="space-y-3">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">تفاصيل الطلب</h4>
              <p className="text-sm leading-relaxed bg-white p-3 rounded-xl border whitespace-pre-line break-words overflow-hidden">{order.details}</p>
              {order.package && (
                <div className="flex items-center gap-2 text-sm">
                  <Package className="w-4 h-4 text-muted-foreground" />
                  <span>الباقة: <strong>{order.package.name}</strong></span>
                </div>
              )}
              {order.customBudget && (
                <div className="flex items-center gap-2 text-sm">
                  <DollarSign className="w-4 h-4 text-muted-foreground" />
                  <span>ميزانية مخصصة: <strong>{order.customBudget} {order.currency}</strong></span>
                </div>
              )}
              {order.paymentMethod && (
                <div className="flex items-center gap-2 text-sm">
                  <CreditCard className="w-4 h-4 text-muted-foreground" />
                  <span>طريقة الدفع: <strong>{order.paymentMethod.name}</strong></span>
                </div>
              )}
            </div>

            {/* Right: Financial */}
            <div className="space-y-3">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">الحالة المالية</h4>
              <div className="bg-white rounded-xl border p-4 space-y-3">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">إجمالي المبلغ</span>
                  <span className="font-bold">{order.totalAmount ? `${order.totalAmount.toLocaleString()} ${order.currency}` : "—"}</span>
                </div>
                {deposit !== null && (
                  <>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground">المقدم ({pct}%)</span>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-amber-600">{deposit.toFixed(0)} {order.currency}</span>
                        <Switch checked={order.depositPaid} onCheckedChange={v => onPaymentChange(order.id, "depositPaid", v)} className="scale-75" />
                      </div>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground">المتبقي ({100 - pct}%)</span>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-blue-600">{remaining?.toFixed(0)} {order.currency}</span>
                        <Switch checked={order.finalPaid} onCheckedChange={v => onPaymentChange(order.id, "finalPaid", v)} className="scale-75" />
                      </div>
                    </div>
                  </>
                )}
                {!order.totalAmount && (
                  <div className="flex gap-2">
                    <Switch checked={order.depositPaid} onCheckedChange={v => onPaymentChange(order.id, "depositPaid", v)} className="scale-75" />
                    <Label className="text-xs text-muted-foreground">مقدم</Label>
                    <Switch checked={order.finalPaid} onCheckedChange={v => onPaymentChange(order.id, "finalPaid", v)} className="scale-75 ms-3" />
                    <Label className="text-xs text-muted-foreground">متبقي</Label>
                  </div>
                )}
              </div>

              {/* Receipt */}
              {order.receiptUrl && (
                <div className="bg-white rounded-xl border p-3 flex items-center justify-between">
                  <a href={order.receiptUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-primary hover:underline">
                    <FileImage className="w-4 h-4" />
                    عرض إيصال الدفع
                  </a>
                  {!order.depositPaid && (
                    <Button size="sm" className="bg-green-600 hover:bg-green-700 h-7 text-xs gap-1" onClick={() => onConfirmReceipt(order.id)}>
                      <BadgeCheck className="w-3.5 h-3.5" />
                      تأكيد الإيصال
                    </Button>
                  )}
                  {order.depositPaid && (
                    <Badge className="bg-green-50 text-green-700 border-green-200 text-xs">✓ مؤكد</Badge>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-3 pt-2 border-t">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">الحالة:</span>
              <Select value={order.status} onValueChange={v => onStatusChange(order.id, v)}>
                <SelectTrigger className="h-8 w-40 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">قيد الانتظار</SelectItem>
                  <SelectItem value="in_progress">جاري التنفيذ</SelectItem>
                  <SelectItem value="completed">مكتمل</SelectItem>
                  <SelectItem value="cancelled">ملغي</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              variant="destructive"
              size="sm"
              className="ms-auto h-8 text-xs gap-1"
              onClick={() => onDelete(order.id)}
            >
              <Trash2 className="w-3.5 h-3.5" />
              حذف الطلب
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Admin() {
  const { data: stats } = useGetAdminStats();
  const { data: orders } = useListOrders();
  const { data: users } = useListUsers();
  const { data: packages } = useListPackages();
  const { data: paymentMethods } = useListPaymentMethods();
  const { data: testimonials } = useListTestimonials();

  const updateOrder = useUpdateOrder();
  const deleteOrder = useDeleteOrder();
  const deleteUser = useDeleteUser();
  const deletePackage = useDeletePackage();
  const createPackage = useCreatePackage();
  const updatePackage = useUpdatePackage();
  const deletePaymentMethod = useDeletePaymentMethod();
  const createPaymentMethod = useCreatePaymentMethod();
  const updatePaymentMethod = useUpdatePaymentMethod();
  const deleteTestimonial = useDeleteTestimonial();
  const updateTestimonial = useUpdateTestimonial();

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("overview");
  const [expandedOrders, setExpandedOrders] = useState<Set<number>>(new Set());

  const toggleOrder = (id: number) =>
    setExpandedOrders(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  // Settings
  const { data: siteSettings } = useSettings();
  const updateSettings = useUpdateSettings();
  const [contactForm, setContactForm] = useState({ phone1: "", phone2: "", email: "", whatsapp: "", address: "", facebookUrl: "", instagramUrl: "", twitterUrl: "" });
  const [contactSaving, setContactSaving] = useState(false);
  const [depositRequire, setDepositRequire] = useState(true);
  const [depositPct, setDepositPct] = useState(50);
  const [depositSaving, setDepositSaving] = useState(false);

  useEffect(() => {
    if (siteSettings) {
      setContactForm({ phone1: siteSettings.phone1 || "", phone2: siteSettings.phone2 || "", email: siteSettings.email || "", whatsapp: siteSettings.whatsapp || "", address: siteSettings.address || "", facebookUrl: siteSettings.facebookUrl || "", instagramUrl: siteSettings.instagramUrl || "", twitterUrl: siteSettings.twitterUrl || "" });
      setDepositRequire(siteSettings.requireDeposit ?? true);
      setDepositPct(siteSettings.depositPercentageValue ?? 50);
    }
  }, [siteSettings]);

  // Auth
  const [createAdminOpen, setCreateAdminOpen] = useState(false);
  const [adminForm, setAdminForm] = useState({ fullName: "", phone: "", email: "", username: "", password: "" });
  const [adminFormLoading, setAdminFormLoading] = useState(false);
  const [pwForm, setPwForm] = useState({ newPassword: "", confirm: "" });
  const [pwLoading, setPwLoading] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);

  // Packages
  const emptyPkg = { name: "", description: "", priceEgp: 0, priceSar: 0, features: "", isActive: true };
  const [pkgDialogOpen, setPkgDialogOpen] = useState(false);
  const [pkgEditTarget, setPkgEditTarget] = useState<{ id: number } | null>(null);
  const [pkgForm, setPkgForm] = useState(emptyPkg);

  // Payment methods
  const emptyPm = { name: "", details: "", isActive: true };
  const [pmDialogOpen, setPmDialogOpen] = useState(false);
  const [pmEditTarget, setPmEditTarget] = useState<{ id: number } | null>(null);
  const [pmForm, setPmForm] = useState(emptyPm);

  const apiFetch = async (url: string, options: RequestInit) => {
    const res = await fetch(url, { ...options, credentials: "include" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
    return data;
  };

  const handleUpdateOrderStatus = (orderId: number, status: string) => {
    updateOrder.mutate({ id: orderId, data: { status } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetAdminStatsQueryKey() });
        toast({ title: "تم التحديث" });
      },
      onError: () => toast({ variant: "destructive", title: "خطأ", description: "تعذر تحديث الحالة" }),
    });
  };

  const handleUpdateOrderPayment = (orderId: number, field: string, value: boolean) => {
    updateOrder.mutate({ id: orderId, data: { [field]: value } }, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() }),
      onError: () => toast({ variant: "destructive", title: "خطأ", description: "تعذر تحديث الدفع" }),
    });
  };

  const handleDeleteOrder = (orderId: number) => {
    if (!confirm("هل أنت متأكد من حذف هذا الطلب؟")) return;
    deleteOrder.mutate({ id: orderId }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetAdminStatsQueryKey() });
        toast({ title: "تم الحذف" });
      },
      onError: () => toast({ variant: "destructive", title: "خطأ" }),
    });
  };

  const handleConfirmReceipt = async (orderId: number) => {
    try {
      await apiFetch(`/api/orders/${orderId}/confirm-receipt`, { method: "POST" });
      queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetAdminStatsQueryKey() });
      toast({ title: "تم التأكيد", description: "تم قبول الإيصال وبدء تنفيذ الطلب" });
    } catch (err: any) {
      toast({ variant: "destructive", title: "خطأ", description: err?.message });
    }
  };

  const handleDeleteUser = (userId: number) => {
    if (!confirm("هل أنت متأكد من حذف هذا المستخدم؟")) return;
    deleteUser.mutate({ id: userId }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetAdminStatsQueryKey() });
        toast({ title: "تم الحذف" });
      },
    });
  };

  const handleToggleRole = async (userId: number, currentRole: string) => {
    const newRole = currentRole === "admin" ? "user" : "admin";
    try {
      await apiFetch(`/api/users/${userId}/role`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role: newRole }) });
      queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
      toast({ title: "تم التحديث", description: `تم تغيير الصلاحية إلى ${newRole === "admin" ? "مدير" : "مستخدم"}` });
    } catch (err: any) {
      toast({ variant: "destructive", title: "خطأ", description: err?.message });
    }
  };

  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminFormLoading(true);
    try {
      await apiFetch("/api/admin/create-admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(adminForm) });
      queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
      toast({ title: "تم الإنشاء", description: "تم إنشاء حساب الأدمن بنجاح" });
      setCreateAdminOpen(false);
      setAdminForm({ fullName: "", phone: "", email: "", username: "", password: "" });
    } catch (err: any) {
      toast({ variant: "destructive", title: "خطأ", description: err?.message });
    } finally { setAdminFormLoading(false); }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pwForm.newPassword !== pwForm.confirm) { toast({ variant: "destructive", title: "خطأ", description: "كلمتا المرور غير متطابقتين" }); return; }
    if (pwForm.newPassword.length < 6) { toast({ variant: "destructive", title: "خطأ", description: "كلمة المرور يجب أن تكون 6 أحرف على الأقل" }); return; }
    setPwLoading(true);
    try {
      await apiFetch("/api/admin/change-password", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ newPassword: pwForm.newPassword }) });
      toast({ title: "تم التحديث", description: "تم تغيير كلمة المرور بنجاح" });
      setPwForm({ newPassword: "", confirm: "" });
    } catch (err: any) {
      toast({ variant: "destructive", title: "خطأ", description: err?.message });
    } finally { setPwLoading(false); }
  };

  const handleDeletePackage = (id: number) => {
    if (!confirm("هل أنت متأكد؟")) return;
    deletePackage.mutate({ id }, { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListPackagesQueryKey() }); toast({ title: "تم الحذف" }); } });
  };

  const openAddPkg = () => { setPkgEditTarget(null); setPkgForm(emptyPkg); setPkgDialogOpen(true); };
  const openEditPkg = (pkg: any) => { setPkgEditTarget({ id: pkg.id }); setPkgForm({ name: pkg.name, description: pkg.description, priceEgp: pkg.priceEgp, priceSar: pkg.priceSar, features: pkg.features, isActive: pkg.isActive }); setPkgDialogOpen(true); };

  const handleSavePkg = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = { ...pkgForm, priceEgp: Number(pkgForm.priceEgp), priceSar: Number(pkgForm.priceSar) };
    if (pkgEditTarget) {
      updatePackage.mutate({ id: pkgEditTarget.id, data: payload }, { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListPackagesQueryKey() }); toast({ title: "تم التحديث" }); setPkgDialogOpen(false); }, onError: () => toast({ variant: "destructive", title: "خطأ" }) });
    } else {
      createPackage.mutate({ data: payload }, { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListPackagesQueryKey() }); toast({ title: "تمت الإضافة" }); setPkgDialogOpen(false); }, onError: () => toast({ variant: "destructive", title: "خطأ" }) });
    }
  };

  const handleDeletePaymentMethod = (id: number) => {
    if (!confirm("هل أنت متأكد؟")) return;
    deletePaymentMethod.mutate({ id }, { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListPaymentMethodsQueryKey() }); toast({ title: "تم الحذف" }); } });
  };

  const openAddPm = () => { setPmEditTarget(null); setPmForm(emptyPm); setPmDialogOpen(true); };
  const openEditPm = (pm: any) => { setPmEditTarget({ id: pm.id }); setPmForm({ name: pm.name, details: pm.details, isActive: pm.isActive }); setPmDialogOpen(true); };

  const handleSavePm = (e: React.FormEvent) => {
    e.preventDefault();
    if (pmEditTarget) {
      updatePaymentMethod.mutate({ id: pmEditTarget.id, data: pmForm }, { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListPaymentMethodsQueryKey() }); toast({ title: "تم التحديث" }); setPmDialogOpen(false); }, onError: () => toast({ variant: "destructive", title: "خطأ" }) });
    } else {
      createPaymentMethod.mutate({ data: pmForm }, { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListPaymentMethodsQueryKey() }); toast({ title: "تمت الإضافة" }); setPmDialogOpen(false); }, onError: () => toast({ variant: "destructive", title: "خطأ" }) });
    }
  };

  const handleDeleteTestimonial = (id: number) => {
    if (!confirm("هل أنت متأكد؟")) return;
    deleteTestimonial.mutate({ id }, { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListTestimonialsQueryKey() }); toast({ title: "تم الحذف" }); } });
  };

  const handleToggleTestimonial = (id: number, current: boolean) => {
    updateTestimonial.mutate({ id, data: { isActive: !current } }, {
      onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListTestimonialsQueryKey() }); toast({ title: current ? "تم الإخفاء" : "تم النشر" }); },
      onError: () => toast({ variant: "destructive", title: "خطأ" }),
    });
  };

  const handleSaveContact = async (e: React.FormEvent) => {
    e.preventDefault(); setContactSaving(true);
    updateSettings.mutate(contactForm, {
      onSuccess: () => { queryClient.invalidateQueries({ queryKey: SETTINGS_KEY }); toast({ title: "تم الحفظ" }); setContactSaving(false); },
      onError: () => { toast({ variant: "destructive", title: "خطأ" }); setContactSaving(false); },
    });
  };

  const handleSaveDeposit = async (e: React.FormEvent) => {
    e.preventDefault(); setDepositSaving(true);
    updateSettings.mutate({ requireDeposit: depositRequire, depositPercentageValue: depositPct }, {
      onSuccess: () => { queryClient.invalidateQueries({ queryKey: SETTINGS_KEY }); toast({ title: "تم الحفظ" }); setDepositSaving(false); },
      onError: () => { toast({ variant: "destructive", title: "خطأ" }); setDepositSaving(false); },
    });
  };

  const allOrders = orders || [];
  const totalRevenue = allOrders.reduce((s, o) => s + (o.totalAmount || 0), 0);
  const depositCollected = allOrders.filter(o => o.depositPaid).reduce((s, o) => { const p = o.depositPercentage ?? 50; return s + ((o.totalAmount || 0) * p / 100); }, 0);
  const finalCollected = allOrders.filter(o => o.finalPaid).reduce((s, o) => { const p = o.depositPercentage ?? 50; return s + ((o.totalAmount || 0) * (100 - p) / 100); }, 0);
  const pendingReceipts = allOrders.filter(o => o.receiptUrl && !o.depositPaid).length;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col" dir="rtl">
      {/* Top header */}
      <header className="bg-white border-b px-6 py-3 flex items-center justify-between sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <ShieldCheck className="w-4 h-4 text-white" />
          </div>
          <div>
            <span className="font-bold text-base">أركان</span>
            <span className="text-xs text-muted-foreground ms-2">لوحة التحكم</span>
          </div>
        </div>
        {pendingReceipts > 0 && (
          <div className="flex items-center gap-2 bg-orange-50 border border-orange-200 text-orange-700 text-xs px-3 py-1.5 rounded-full cursor-pointer hover:bg-orange-100 transition-colors" onClick={() => setActiveTab("orders")}>
            <FileImage className="w-3.5 h-3.5" />
            {pendingReceipts} إيصال بانتظار التأكيد
          </div>
        )}
      </header>

      <div className="flex flex-1">
        {/* Sidebar */}
        <aside className="w-52 bg-white border-l sticky top-14 self-start h-[calc(100vh-3.5rem)] flex flex-col py-4 shadow-sm shrink-0">
          <nav className="flex flex-col gap-1 px-3 flex-1">
            {NAV.map(item => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all w-full text-right ${isActive ? "bg-primary text-white shadow-sm shadow-primary/20" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  {item.label}
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Main content */}
        <main className="flex-1 p-6 min-w-0">

          {/* ─── Overview ─── */}
          {activeTab === "overview" && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-bold">مرحباً بك في لوحة التحكم</h1>
                <p className="text-muted-foreground text-sm mt-1">نظرة عامة على أداء المنصة</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                <StatCard icon={ShoppingCart} label="إجمالي الطلبات" value={stats?.totalOrders || 0} sub={`${stats?.pendingOrders || 0} قيد الانتظار`} color="bg-blue-100 text-blue-600" />
                <StatCard icon={CheckCircle} label="طلبات مكتملة" value={stats?.completedOrders || 0} color="bg-green-100 text-green-600" />
                <StatCard icon={Users} label="المستخدمين" value={stats?.totalUsers || 0} color="bg-purple-100 text-purple-600" />
                <StatCard icon={DollarSign} label="إجمالي الإيرادات" value={`${totalRevenue.toLocaleString()}`} sub="قيمة جميع الطلبات" color="bg-amber-100 text-amber-600" />
              </div>

              {/* Recent orders */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-bold">آخر الطلبات</h2>
                  <Button variant="ghost" size="sm" onClick={() => setActiveTab("orders")} className="text-primary gap-1">
                    عرض الكل <ArrowUpRight className="w-3.5 h-3.5" />
                  </Button>
                </div>
                <div className="space-y-3">
                  {allOrders.slice(-5).reverse().map(order => (
                    <div key={order.id} className="bg-white rounded-xl border px-4 py-3 flex items-center gap-4">
                      <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                        <Globe className="w-4 h-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold truncate">{order.siteName}</p>
                        <p className="text-xs text-muted-foreground">{order.user?.fullName} · {format(new Date(order.createdAt), "dd MMM", { locale: ar })}</p>
                      </div>
                      <StatusBadge status={order.status} />
                    </div>
                  ))}
                  {allOrders.length === 0 && <p className="text-muted-foreground text-sm text-center py-8">لا توجد طلبات حتى الآن</p>}
                </div>
              </div>
            </div>
          )}

          {/* ─── Orders ─── */}
          {activeTab === "orders" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-2xl font-bold">الطلبات</h1>
                  <p className="text-muted-foreground text-sm mt-1">{allOrders.length} طلب إجمالاً</p>
                </div>
                <div className="flex items-center gap-2">
                  {[
                    { label: "الكل", value: "" },
                    { label: "انتظار", value: "pending" },
                    { label: "تنفيذ", value: "in_progress" },
                    { label: "مكتمل", value: "completed" },
                  ].map(f => (
                    <button key={f.value} onClick={() => {}} className="px-3 py-1.5 text-xs rounded-lg bg-white border text-muted-foreground hover:border-primary hover:text-primary transition-colors">
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
              {allOrders.length === 0 ? (
                <div className="bg-white rounded-2xl border p-16 text-center">
                  <ShoppingCart className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-muted-foreground">لا توجد طلبات حتى الآن</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {[...allOrders].reverse().map(order => (
                    <OrderCard
                      key={order.id}
                      order={order}
                      expanded={expandedOrders.has(order.id)}
                      onToggle={toggleOrder}
                      onStatusChange={handleUpdateOrderStatus}
                      onPaymentChange={handleUpdateOrderPayment}
                      onDelete={handleDeleteOrder}
                      onConfirmReceipt={handleConfirmReceipt}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ─── Finances ─── */}
          {activeTab === "finances" && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-bold">التقرير المالي</h1>
                <p className="text-muted-foreground text-sm mt-1">ملخص الإيرادات والمدفوعات</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                <StatCard icon={DollarSign}  label="إجمالي قيمة الطلبات"  value={totalRevenue.toLocaleString()}       color="bg-primary/10 text-primary" />
                <StatCard icon={Banknote}    label="مقدمات محصلة"         value={depositCollected.toFixed(0)}          color="bg-amber-100 text-amber-600" />
                <StatCard icon={CheckCircle} label="مبالغ نهائية محصلة"   value={finalCollected.toFixed(0)}            color="bg-green-100 text-green-600" />
                <StatCard icon={Clock}       label="إيصالات بانتظار تأكيد" value={pendingReceipts}                     color="bg-orange-100 text-orange-600" />
              </div>
              <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b">
                  <h2 className="font-bold text-base">تفاصيل الطلبات المالية</h2>
                </div>
                <div className="divide-y">
                  {allOrders.filter(o => o.totalAmount).length === 0 && (
                    <p className="text-center text-muted-foreground py-10 text-sm">لا توجد طلبات بمبالغ محددة</p>
                  )}
                  {allOrders.filter(o => o.totalAmount).map(order => {
                    const p = order.depositPercentage ?? 50;
                    const dep = (order.totalAmount! * p) / 100;
                    const rem = order.totalAmount! - dep;
                    return (
                      <div key={order.id} className="px-6 py-4 flex flex-wrap items-center gap-4">
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold">{order.siteName}</p>
                          <p className="text-xs text-muted-foreground">{order.user?.fullName}</p>
                        </div>
                        <StatusBadge status={order.status} />
                        <div className="text-sm">
                          <span className="text-muted-foreground">الإجمالي: </span>
                          <strong>{order.totalAmount!.toLocaleString()} {order.currency}</strong>
                        </div>
                        <div className="flex gap-3 text-sm">
                          <span className={`flex items-center gap-1 ${order.depositPaid ? "text-green-600" : "text-muted-foreground"}`}>
                            {order.depositPaid ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                            مقدم {dep.toFixed(0)}
                          </span>
                          <span className={`flex items-center gap-1 ${order.finalPaid ? "text-green-600" : "text-muted-foreground"}`}>
                            {order.finalPaid ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                            متبقي {rem.toFixed(0)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ─── Users ─── */}
          {activeTab === "users" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-2xl font-bold">المستخدمين</h1>
                  <p className="text-muted-foreground text-sm mt-1">{users?.length || 0} مستخدم</p>
                </div>
                <Button size="sm" onClick={() => setCreateAdminOpen(true)} className="gap-1.5">
                  <UserPlus className="w-4 h-4" /> إضافة أدمن
                </Button>
              </div>
              <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
                <div className="divide-y">
                  {users?.map(user => (
                    <div key={user.id} className="px-5 py-4 flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-base shrink-0">
                        {user.fullName?.[0] || "U"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold">{user.fullName}</p>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                          <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{user.email}</span>
                          {user.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{user.phone}</span>}
                        </div>
                      </div>
                      <Badge variant={user.role === "admin" ? "default" : "outline"} className="shrink-0">
                        {user.role === "admin" ? "مدير" : "مستخدم"}
                      </Badge>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Button variant="outline" size="icon" className="h-8 w-8" title={user.role === "admin" ? "إزالة من المديرين" : "ترقية لمدير"} onClick={() => handleToggleRole(user.id, user.role)}>
                          {user.role === "admin" ? <ShieldOff className="h-3.5 w-3.5 text-orange-500" /> : <ShieldCheck className="h-3.5 w-3.5 text-green-600" />}
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => handleDeleteUser(user.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                  {(!users || users.length === 0) && (
                    <p className="text-center text-muted-foreground py-10 text-sm">لا يوجد مستخدمون</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ─── Packages ─── */}
          {activeTab === "packages" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-2xl font-bold">الباقات</h1>
                  <p className="text-muted-foreground text-sm mt-1">إدارة باقات التصميم</p>
                </div>
                <Button size="sm" onClick={openAddPkg} className="gap-1.5"><Plus className="w-4 h-4" /> إضافة باقة</Button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {packages?.map(pkg => (
                  <div key={pkg.id} className={`bg-white rounded-2xl border shadow-sm p-5 flex flex-col gap-3 ${!pkg.isActive ? "opacity-60" : ""}`}>
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-bold text-base">{pkg.name}</p>
                        <p className="text-sm text-muted-foreground mt-0.5">{pkg.description}</p>
                      </div>
                      <Badge variant={pkg.isActive ? "default" : "outline"} className="shrink-0 ms-2">
                        {pkg.isActive ? "مفعّلة" : "غير مفعّلة"}
                      </Badge>
                    </div>
                    <div className="flex gap-3 text-sm">
                      <div className="flex-1 bg-muted/30 rounded-lg p-2.5 text-center">
                        <p className="text-xs text-muted-foreground">مصر</p>
                        <p className="font-bold text-primary">{pkg.priceEgp.toLocaleString()} ج.م</p>
                      </div>
                      <div className="flex-1 bg-muted/30 rounded-lg p-2.5 text-center">
                        <p className="text-xs text-muted-foreground">السعودية</p>
                        <p className="font-bold text-primary">{pkg.priceSar.toLocaleString()} ر.س</p>
                      </div>
                    </div>
                    {pkg.features && (
                      <div className="text-xs text-muted-foreground">
                        {pkg.features.split(",").slice(0, 3).map((f: string, i: number) => (
                          <span key={i} className="inline-flex items-center gap-1 me-2"><Check className="w-3 h-3 text-green-500" />{f.trim()}</span>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-2 pt-1 border-t mt-1">
                      <Button variant="outline" size="sm" className="flex-1 gap-1" onClick={() => openEditPkg(pkg)}><Pencil className="w-3.5 h-3.5" />تعديل</Button>
                      <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive gap-1" onClick={() => handleDeletePackage(pkg.id)}><Trash2 className="w-3.5 h-3.5" />حذف</Button>
                    </div>
                  </div>
                ))}
                {(!packages || packages.length === 0) && (
                  <div className="col-span-3 bg-white rounded-2xl border p-16 text-center">
                    <Package className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                    <p className="text-muted-foreground text-sm">لا توجد باقات — اضغط "إضافة باقة" للبدء</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ─── Payment methods ─── */}
          {activeTab === "payments" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-2xl font-bold">طرق الدفع</h1>
                  <p className="text-muted-foreground text-sm mt-1">إدارة طرق الدفع المتاحة للعملاء</p>
                </div>
                <Button size="sm" onClick={openAddPm} className="gap-1.5"><Plus className="w-4 h-4" /> إضافة طريقة</Button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {paymentMethods?.map(pm => (
                  <div key={pm.id} className={`bg-white rounded-2xl border shadow-sm p-5 ${!pm.isActive ? "opacity-60" : ""}`}>
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                          <CreditCard className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="font-bold">{pm.name}</p>
                          <Badge variant={pm.isActive ? "default" : "outline"} className="text-xs mt-0.5">
                            {pm.isActive ? "مفعّلة" : "غير مفعّلة"}
                          </Badge>
                        </div>
                      </div>
                      <div className="flex gap-1.5">
                        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => openEditPm(pm)}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => handleDeletePaymentMethod(pm.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground whitespace-pre-line bg-muted/20 rounded-lg p-3 leading-relaxed">{pm.details}</p>
                  </div>
                ))}
                {(!paymentMethods || paymentMethods.length === 0) && (
                  <div className="col-span-2 bg-white rounded-2xl border p-16 text-center">
                    <CreditCard className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                    <p className="text-muted-foreground text-sm">لا توجد طرق دفع</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ─── Reviews ─── */}
          {activeTab === "reviews" && (
            <div className="space-y-4">
              <div>
                <h1 className="text-2xl font-bold">آراء العملاء</h1>
                <p className="text-muted-foreground text-sm mt-1">راجع وانشر آراء عملائك</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {testimonials?.map(t => (
                  <div key={t.id} className={`bg-white rounded-2xl border shadow-sm p-5 ${!t.isActive ? "opacity-70 border-dashed" : ""}`}>
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                          {t.clientName?.[0] || "?"}
                        </div>
                        <div>
                          <p className="font-bold">{t.clientName}</p>
                          <div className="flex gap-0.5 mt-0.5">
                            {Array.from({ length: 5 }).map((_, j) => (
                              <Star key={j} className={`w-3.5 h-3.5 ${j < t.rating ? "text-yellow-400 fill-yellow-400" : "text-muted-foreground/30"}`} />
                            ))}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Badge variant={t.isActive ? "default" : "outline"} className="text-xs">
                          {t.isActive ? "منشور" : "بانتظار"}
                        </Badge>
                        <Button variant="outline" size="icon" className="h-7 w-7" title={t.isActive ? "إيقاف" : "نشر"} onClick={() => handleToggleTestimonial(t.id, t.isActive)}>
                          {t.isActive ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDeleteTestimonial(t.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed bg-muted/20 rounded-lg p-3">"{t.comment}"</p>
                  </div>
                ))}
                {(!testimonials || testimonials.length === 0) && (
                  <div className="col-span-2 bg-white rounded-2xl border p-16 text-center">
                    <MessageSquare className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                    <p className="text-muted-foreground text-sm">لا توجد آراء حتى الآن</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ─── Settings ─── */}
          {activeTab === "settings" && (
            <div className="space-y-6 max-w-2xl">
              <div>
                <h1 className="text-2xl font-bold">الإعدادات</h1>
                <p className="text-muted-foreground text-sm mt-1">ضبط إعدادات الموقع والتواصل</p>
              </div>

              {/* Contact info */}
              <div className="bg-white rounded-2xl border shadow-sm p-6">
                <h2 className="font-bold mb-1 flex items-center gap-2"><Phone className="w-4 h-4 text-primary" />بيانات التواصل</h2>
                <p className="text-sm text-muted-foreground mb-5">تظهر في أسفل الصفحة الرئيسية</p>
                <form onSubmit={handleSaveContact} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5"><Label>رقم الهاتف الأول</Label><Input value={contactForm.phone1} onChange={e => setContactForm(f => ({ ...f, phone1: e.target.value }))} placeholder="+20 100 000 0000" dir="ltr" /></div>
                    <div className="space-y-1.5"><Label>رقم الهاتف الثاني</Label><Input value={contactForm.phone2} onChange={e => setContactForm(f => ({ ...f, phone2: e.target.value }))} placeholder="+20 100 000 0000" dir="ltr" /></div>
                    <div className="space-y-1.5"><Label>البريد الإلكتروني</Label><Input type="email" value={contactForm.email} onChange={e => setContactForm(f => ({ ...f, email: e.target.value }))} placeholder="info@example.com" dir="ltr" /></div>
                    <div className="space-y-1.5"><Label>واتساب</Label><Input value={contactForm.whatsapp} onChange={e => setContactForm(f => ({ ...f, whatsapp: e.target.value }))} placeholder="+20 100 000 0000" dir="ltr" /></div>
                    <div className="space-y-1.5 sm:col-span-2"><Label className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />العنوان</Label><Input value={contactForm.address} onChange={e => setContactForm(f => ({ ...f, address: e.target.value }))} placeholder="القاهرة، مصر" /></div>
                  </div>
                  <div className="border-t pt-4">
                    <p className="text-sm font-medium text-muted-foreground mb-3">روابط السوشيال ميديا</p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="space-y-1.5"><Label className="flex items-center gap-1"><Facebook className="w-3.5 h-3.5 text-blue-600" />فيسبوك</Label><Input value={contactForm.facebookUrl} onChange={e => setContactForm(f => ({ ...f, facebookUrl: e.target.value }))} placeholder="https://facebook.com/..." dir="ltr" /></div>
                      <div className="space-y-1.5"><Label className="flex items-center gap-1"><Instagram className="w-3.5 h-3.5 text-pink-500" />إنستغرام</Label><Input value={contactForm.instagramUrl} onChange={e => setContactForm(f => ({ ...f, instagramUrl: e.target.value }))} placeholder="https://instagram.com/..." dir="ltr" /></div>
                      <div className="space-y-1.5"><Label className="flex items-center gap-1"><Twitter className="w-3.5 h-3.5" />تويتر / X</Label><Input value={contactForm.twitterUrl} onChange={e => setContactForm(f => ({ ...f, twitterUrl: e.target.value }))} placeholder="https://x.com/..." dir="ltr" /></div>
                    </div>
                  </div>
                  <Button type="submit" disabled={contactSaving} className="gap-1.5">
                    {contactSaving ? "جاري الحفظ..." : "حفظ بيانات التواصل"}
                  </Button>
                </form>
              </div>

              {/* Deposit settings */}
              <div className="bg-white rounded-2xl border shadow-sm p-6">
                <h2 className="font-bold mb-1 flex items-center gap-2"><Percent className="w-4 h-4 text-primary" />إعدادات المقدّم</h2>
                <p className="text-sm text-muted-foreground mb-5">تحكم في اشتراط دفع مقدم ونسبته</p>
                <form onSubmit={handleSaveDeposit} className="space-y-4">
                  <div className="flex items-center justify-between bg-muted/20 rounded-xl p-4 border">
                    <div>
                      <p className="font-medium text-sm">اشتراط دفع مقدّم</p>
                      <p className="text-xs text-muted-foreground mt-0.5">يُطلب من العميل رفع إيصال قبل بدء التنفيذ</p>
                    </div>
                    <Switch checked={depositRequire} onCheckedChange={setDepositRequire} />
                  </div>
                  {depositRequire && (
                    <div className="space-y-1.5">
                      <Label>نسبة المقدم</Label>
                      <div className="flex items-center gap-3">
                        <Input type="number" min={1} max={100} value={depositPct} onChange={e => setDepositPct(Number(e.target.value))} className="w-28" />
                        <span className="text-muted-foreground font-bold">%</span>
                        <span className="text-sm text-muted-foreground">من إجمالي قيمة الطلب</span>
                      </div>
                    </div>
                  )}
                  <Button type="submit" disabled={depositSaving} className="gap-1.5">
                    {depositSaving ? "جاري الحفظ..." : "حفظ إعدادات المقدّم"}
                  </Button>
                </form>
              </div>

              {/* Change password */}
              <div className="bg-white rounded-2xl border shadow-sm p-6 max-w-sm">
                <h2 className="font-bold mb-1">تغيير كلمة المرور</h2>
                <p className="text-sm text-muted-foreground mb-5">تغيير كلمة مرور حساب الأدمن</p>
                <form onSubmit={handleChangePassword} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label>كلمة المرور الجديدة</Label>
                    <div className="relative">
                      <Input type={showNewPw ? "text" : "password"} value={pwForm.newPassword} onChange={e => setPwForm(f => ({ ...f, newPassword: e.target.value }))} required placeholder="6 أحرف على الأقل" className="pr-10" />
                      <button type="button" onClick={() => setShowNewPw(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" tabIndex={-1}>
                        {showNewPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>تأكيد كلمة المرور</Label>
                    <div className="relative">
                      <Input type={showConfirmPw ? "text" : "password"} value={pwForm.confirm} onChange={e => setPwForm(f => ({ ...f, confirm: e.target.value }))} required placeholder="أعد كتابة كلمة المرور" className="pr-10" />
                      <button type="button" onClick={() => setShowConfirmPw(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" tabIndex={-1}>
                        {showConfirmPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <Button type="submit" disabled={pwLoading}>{pwLoading ? "جاري الحفظ..." : "حفظ كلمة المرور"}</Button>
                </form>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* ─── Dialogs ─── */}

      {/* Create admin dialog */}
      <Dialog open={createAdminOpen} onOpenChange={setCreateAdminOpen}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader><DialogTitle>إنشاء حساب أدمن جديد</DialogTitle></DialogHeader>
          <form onSubmit={handleCreateAdmin} className="space-y-4 mt-2">
            {[{ label: "الاسم الكامل", key: "fullName", type: "text", ph: "أدخل الاسم" }, { label: "الهاتف", key: "phone", type: "text", ph: "أدخل رقم الهاتف" }, { label: "البريد الإلكتروني", key: "email", type: "email", ph: "example@email.com" }, { label: "اسم المستخدم", key: "username", type: "text", ph: "username" }, { label: "كلمة المرور", key: "password", type: "password", ph: "6 أحرف على الأقل" }].map(f => (
              <div key={f.key} className="space-y-1">
                <Label>{f.label}</Label>
                <Input type={f.type} value={(adminForm as any)[f.key]} onChange={e => setAdminForm(fm => ({ ...fm, [f.key]: e.target.value }))} required placeholder={f.ph} />
              </div>
            ))}
            <Button type="submit" className="w-full" disabled={adminFormLoading}>{adminFormLoading ? "جاري الإنشاء..." : "إنشاء الحساب"}</Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Package dialog */}
      <Dialog open={pkgDialogOpen} onOpenChange={setPkgDialogOpen}>
        <DialogContent className="max-w-lg" dir="rtl">
          <DialogHeader>
            <DialogTitle>{pkgEditTarget ? "تعديل الباقة" : "إضافة باقة جديدة"}</DialogTitle>
            <DialogDescription>{pkgEditTarget ? "عدّل تفاصيل الباقة ثم احفظ." : "أدخل تفاصيل الباقة الجديدة."}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSavePkg} className="space-y-4 mt-2">
            <div className="space-y-1.5"><Label>اسم الباقة</Label><Input value={pkgForm.name} onChange={e => setPkgForm(f => ({ ...f, name: e.target.value }))} required placeholder="الباقة الأساسية..." /></div>
            <div className="space-y-1.5"><Label>وصف الباقة</Label><Input value={pkgForm.description} onChange={e => setPkgForm(f => ({ ...f, description: e.target.value }))} required placeholder="وصف مختصر" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>السعر (جنيه)</Label><Input type="number" min={0} value={pkgForm.priceEgp} onChange={e => setPkgForm(f => ({ ...f, priceEgp: Number(e.target.value) }))} required /></div>
              <div className="space-y-1.5"><Label>السعر (ريال)</Label><Input type="number" min={0} value={pkgForm.priceSar} onChange={e => setPkgForm(f => ({ ...f, priceSar: Number(e.target.value) }))} required /></div>
            </div>
            <div className="space-y-1.5"><Label>المميزات (مفصولة بفاصلة)</Label><Input value={pkgForm.features} onChange={e => setPkgForm(f => ({ ...f, features: e.target.value }))} placeholder="ميزة 1, ميزة 2, ميزة 3" /></div>
            <div className="flex items-center gap-3"><Switch id="pkg-active" checked={pkgForm.isActive} onCheckedChange={v => setPkgForm(f => ({ ...f, isActive: v }))} /><Label htmlFor="pkg-active">{pkgForm.isActive ? "مفعّلة (تظهر للعملاء)" : "غير مفعّلة"}</Label></div>
            <Button type="submit" className="w-full" disabled={createPackage.isPending || updatePackage.isPending}>{createPackage.isPending || updatePackage.isPending ? "جاري الحفظ..." : pkgEditTarget ? "حفظ التعديلات" : "إضافة الباقة"}</Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Payment method dialog */}
      <Dialog open={pmDialogOpen} onOpenChange={setPmDialogOpen}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>{pmEditTarget ? "تعديل طريقة الدفع" : "إضافة طريقة دفع جديدة"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSavePm} className="space-y-4 mt-2">
            <div className="space-y-1.5"><Label>اسم الطريقة</Label><Input value={pmForm.name} onChange={e => setPmForm(f => ({ ...f, name: e.target.value }))} required placeholder="فودافون كاش، إنستاباي..." /></div>
            <div className="space-y-1.5">
              <Label>التفاصيل والمعلومات</Label>
              <textarea value={pmForm.details} onChange={e => setPmForm(f => ({ ...f, details: e.target.value }))} required placeholder="رقم المحفظة، رقم الحساب، اسم المستلم..." rows={4} className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none" />
            </div>
            <div className="flex items-center gap-3"><Switch id="pm-active" checked={pmForm.isActive} onCheckedChange={v => setPmForm(f => ({ ...f, isActive: v }))} /><Label htmlFor="pm-active">{pmForm.isActive ? "مفعّلة" : "غير مفعّلة"}</Label></div>
            <Button type="submit" className="w-full" disabled={createPaymentMethod.isPending || updatePaymentMethod.isPending}>{createPaymentMethod.isPending || updatePaymentMethod.isPending ? "جاري الحفظ..." : pmEditTarget ? "حفظ التعديلات" : "إضافة طريقة الدفع"}</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
