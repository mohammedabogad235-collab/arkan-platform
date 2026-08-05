import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
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
  Clock, Banknote, Star, ArrowUpRight, Tag, ToggleLeft, ToggleRight, Calendar, Shield, Lock, Unlock,
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

const ALL_NAV = [
  { id: "overview",   label: "الإحصائيات",     icon: BarChart3,     adminOnly: false },
  { id: "orders",     label: "الطلبات",         icon: ShoppingCart,  adminOnly: false },
  { id: "finances",   label: "المالية",         icon: TrendingUp,    adminOnly: false },
  { id: "users",      label: "المستخدمين",      icon: Users,         adminOnly: false },
  { id: "packages",   label: "الباقات",         icon: Package,       adminOnly: false },
  { id: "payments",   label: "طرق الدفع",       icon: CreditCard,    adminOnly: false },
  { id: "reviews",    label: "الآراء",           icon: MessageSquare, adminOnly: false },
  { id: "coupons",    label: "الكوبونات",        icon: Tag,           adminOnly: false },
  { id: "settings",     label: "الإعدادات",        icon: Settings,      adminOnly: false },
  { id: "otp-settings", label: "إعدادات OTP",     icon: Mail,          adminOnly: true  },
  { id: "subadmins",   label: "مشرفون فرعيون",   icon: Shield,        adminOnly: true  },
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

function DeliveredUrlInput({ order }: { order: any }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const updateOrder = useUpdateOrder();
  const [urlInput, setUrlInput] = useState(order.deliveredUrl ?? "");
  const [saving, setSaving] = useState(false);
  return (
    <div className="bg-white rounded-xl border p-3 space-y-1.5">
      <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
        <Globe className="w-3.5 h-3.5" />
        رابط الموقع المُسلَّم (يظهر للعميل بعد الاكتمال)
      </Label>
      <div className="flex gap-2">
        <Input
          type="url"
          placeholder="https://example.com"
          value={urlInput}
          onChange={e => setUrlInput(e.target.value)}
          className="h-9 text-sm"
          dir="ltr"
        />
        <Button size="sm" className="h-9 px-3 text-xs shrink-0" disabled={saving}
          onClick={() => {
            setSaving(true);
            updateOrder.mutate(
              { id: order.id, data: { deliveredUrl: urlInput.trim() || null } },
              {
                onSuccess: () => {
                  queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
                  toast({ title: "تم حفظ الرابط" });
                  setSaving(false);
                },
                onError: () => {
                  toast({ variant: "destructive", title: "خطأ", description: "تعذر حفظ الرابط" });
                  setSaving(false);
                },
              }
            );
          }}>
          {saving ? "..." : "حفظ"}
        </Button>
      </div>
    </div>
  );
}

function OrderCard({ order, expanded, onToggle, onStatusChange, onPaymentChange, onDelete, onConfirmReceipt, globalDepositPct, onAmountSave }: {
  order: any;
  expanded: boolean;
  onToggle: (id: number) => void;
  onStatusChange: (id: number, status: string) => void;
  onPaymentChange: (id: number, field: string, val: boolean) => void;
  onDelete: (id: number) => void;
  onConfirmReceipt: (id: number) => void;
  globalDepositPct?: number;
  onAmountSave: (id: number, amount: number | null, depositPct: number) => void;
}) {
  const pct = order.depositPercentage ?? globalDepositPct ?? 50;
  const [amountInput, setAmountInput] = useState(order.totalAmount?.toString() ?? "");
  const [savingAmount, setSavingAmount] = useState(false);
  const liveAmount = amountInput !== "" ? Number(amountInput) : null;
  const deposit = liveAmount ? Math.round((liveAmount * pct) / 100) : null;
  const remaining = liveAmount && deposit !== null ? liveAmount - deposit : null;

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
                  <FileImage className="w-3 h-3" /> إيصال مقدّم بانتظار التأكيد
                </span>
              )}
              {order.finalReceiptUrl && !order.finalPaid && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                  <FileImage className="w-3 h-3" /> إيصال متبقي بانتظار التأكيد
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
          {order.couponCode && <Badge className="bg-purple-50 text-purple-700 border-purple-200 text-xs font-mono">{order.couponCode}</Badge>}
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
                {/* Amount input + live breakdown */}
                <div className="space-y-2">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">إجمالي المبلغ ({order.currency})</Label>
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        min={0}
                        placeholder="أدخل المبلغ الإجمالي..."
                        value={amountInput}
                        onChange={e => setAmountInput(e.target.value)}
                        className="h-9 text-sm"
                      />
                      <Button
                        size="sm"
                        className="h-9 px-4 text-xs shrink-0"
                        disabled={savingAmount}
                        onClick={async () => {
                          setSavingAmount(true);
                          const amt = amountInput === "" ? null : Number(amountInput);
                          await onAmountSave(order.id, amt, pct);
                          setSavingAmount(false);
                        }}
                      >
                        {savingAmount ? "..." : "حفظ"}
                      </Button>
                    </div>
                  </div>
                  {/* Live breakdown preview */}
                  {liveAmount !== null && liveAmount > 0 && (() => {
                    const liveDiscount = order.discountAmount ? Number(order.discountAmount) : 0;
                    const liveEffective = Math.max(0, liveAmount - liveDiscount);
                    const liveDeposit = Math.round(liveEffective * pct / 100);
                    const liveRemaining = liveEffective - liveDeposit;
                    return (
                      <div className="rounded-lg bg-muted/30 border p-2.5 space-y-1.5 text-xs">
                        {liveDiscount > 0 && (
                          <>
                            <div className="flex justify-between text-muted-foreground line-through">
                              <span>الأصلي</span>
                              <span>{liveAmount.toLocaleString()} {order.currency}</span>
                            </div>
                            <div className="flex justify-between text-purple-700">
                              <span>خصم ({order.couponCode})</span>
                              <span>− {liveDiscount.toLocaleString()} {order.currency}</span>
                            </div>
                            <div className="flex justify-between text-green-700 font-semibold border-t pt-1">
                              <span>صافي</span>
                              <span>{liveEffective.toLocaleString()} {order.currency}</span>
                            </div>
                          </>
                        )}
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">المقدم ({pct}%)</span>
                          <span className="font-semibold text-amber-600">{liveDeposit.toLocaleString()} {order.currency}</span>
                        </div>
                        <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                          <div className="h-full bg-amber-400 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">المتبقي ({100 - pct}%)</span>
                          <span className="font-semibold text-blue-600">{liveRemaining.toLocaleString()} {order.currency}</span>
                        </div>
                      </div>
                    );
                  })()}
                </div>
                {(() => {
                  const savedAmt = order.totalAmount ? Number(order.totalAmount) : null;
                  const savedDiscount = order.discountAmount ? Number(order.discountAmount) : 0;
                  const savedEffective = savedAmt !== null ? Math.max(0, savedAmt - savedDiscount) : null;
                  const savedDeposit = savedEffective ? Math.round((savedEffective * pct) / 100) : null;
                  const savedRemaining = savedEffective && savedDeposit !== null ? savedEffective - savedDeposit : null;
                  return savedAmt ? (
                    <>
                      {/* Coupon breakdown */}
                      {order.couponCode && (
                        <div className="pt-1 border-t space-y-1 text-xs">
                          {savedDiscount > 0 ? (
                            <>
                              <div className="flex justify-between text-muted-foreground line-through">
                                <span>السعر الأصلي</span>
                                <span>{savedAmt.toLocaleString()} {order.currency}</span>
                              </div>
                              <div className="flex justify-between text-purple-700 bg-purple-50 rounded px-2 py-1">
                                <span className="flex items-center gap-1"><Tag className="w-3 h-3" /> خصم ({order.couponCode})</span>
                                <span className="font-bold">− {savedDiscount.toLocaleString()} {order.currency}</span>
                              </div>
                              <div className="flex justify-between text-green-700 font-bold">
                                <span>صافي المبلغ</span>
                                <span>{savedEffective?.toLocaleString()} {order.currency}</span>
                              </div>
                            </>
                          ) : (
                            <div className="flex justify-between text-purple-600 bg-purple-50 rounded px-2 py-1">
                              <span className="flex items-center gap-1"><Tag className="w-3 h-3" /> كوبون: {order.couponCode}</span>
                              <span className="text-purple-400 text-xs">الخصم سيُحسب بعد الحفظ</span>
                            </div>
                          )}
                        </div>
                      )}
                      <div className="flex justify-between items-center text-sm pt-1 border-t">
                        <span className="text-muted-foreground">المقدم ({pct}%)</span>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-amber-600">{savedDeposit?.toLocaleString()} {order.currency}</span>
                          <Switch checked={order.depositPaid} onCheckedChange={v => onPaymentChange(order.id, "depositPaid", v)} className="scale-75" />
                        </div>
                      </div>
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-muted-foreground">المتبقي ({100 - pct}%)</span>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-blue-600">{savedRemaining?.toLocaleString()} {order.currency}</span>
                          <Switch checked={order.finalPaid} onCheckedChange={v => onPaymentChange(order.id, "finalPaid", v)} className="scale-75" />
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      {order.couponCode && (
                        <div className="pt-1 border-t">
                          <div className="flex justify-between text-purple-600 bg-purple-50 rounded px-2 py-1 text-xs">
                            <span className="flex items-center gap-1"><Tag className="w-3 h-3" /> كوبون: {order.couponCode}</span>
                            <span className="text-purple-400">سيُطبّق عند تحديد المبلغ</span>
                          </div>
                        </div>
                      )}
                      <div className="flex gap-2 pt-1 border-t">
                        <Switch checked={order.depositPaid} onCheckedChange={v => onPaymentChange(order.id, "depositPaid", v)} className="scale-75" />
                        <Label className="text-xs text-muted-foreground">مقدم</Label>
                        <Switch checked={order.finalPaid} onCheckedChange={v => onPaymentChange(order.id, "finalPaid", v)} className="scale-75 ms-3" />
                        <Label className="text-xs text-muted-foreground">متبقي</Label>
                      </div>
                    </>
                  );
                })()}
              </div>

              {/* Delivered URL */}
              <DeliveredUrlInput order={order} />

              {/* Deposit Receipt */}
              {order.receiptUrl && (
                <div className="bg-white rounded-xl border p-3 flex items-center justify-between">
                  <a href={order.receiptUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-primary hover:underline">
                    <FileImage className="w-4 h-4" />
                    إيصال الدفع المقدّم
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

              {/* Final Receipt */}
              {order.finalReceiptUrl && (
                <div className="bg-white rounded-xl border border-blue-200 p-3 flex items-center justify-between">
                  <a href={order.finalReceiptUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-blue-600 hover:underline">
                    <FileImage className="w-4 h-4" />
                    إيصال سداد المبلغ المتبقي
                  </a>
                  {!order.finalPaid && (
                    <Button size="sm" className="bg-blue-600 hover:bg-blue-700 h-7 text-xs gap-1" onClick={() => onPaymentChange(order.id, "finalPaid", true)}>
                      <BadgeCheck className="w-3.5 h-3.5" />
                      تأكيد الدفع الكامل
                    </Button>
                  )}
                  {order.finalPaid && (
                    <Badge className="bg-blue-50 text-blue-700 border-blue-200 text-xs">✓ مؤكد</Badge>
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

const DEFAULT_TERMS_TEXT = `1. قبول الشروط
باستخدامك للمنصة وخدماتها، فإنك توافق على الالتزام بهذه الشروط والأحكام. إذا كنت لا توافق على أي من هذه الشروط، فيرجى عدم استخدام خدماتنا. نحتفظ بالحق في تعديل هذه الشروط في أي وقت، وسيتم إخطارك بأي تغييرات جوهرية.

2. الخدمات المقدمة
تقدم المنصة خدمات تصميم وتطوير المواقع الإلكترونية وتشمل: تصميم المواقع المخصصة، المتاجر الإلكترونية، المواقع التعريفية، المنصات التعليمية والمدونات، والاستشارات التقنية.

3. سياسة الدفع
يتم الدفع على مرحلتين: دفعة مقدمة (50%) قبل البدء في العمل لضمان الجدية، ودفعة التسليم (50%) عند تسليم الموقع النهائي وقبوله. لا تُسترد الدفعة المقدمة في حالة إلغاء العميل للمشروع بعد البدء.

4. مدة التنفيذ
تختلف مدة تنفيذ المشاريع حسب حجم وتعقيد الطلب. يتم تحديد المدة الزمنية بوضوح في اتفاقية العمل. قد تتأثر المدة بمدى التزام العميل بتقديم المحتوى والبيانات في الوقت المحدد.

5. حقوق الملكية الفكرية
بعد إتمام الدفع الكامل، تنتقل ملكية الموقع بالكامل إلى العميل. يحتفظ الفريق بحق عرض المشروع في معرض الأعمال ما لم يطلب العميل خلاف ذلك.

6. حسابات المستخدمين
أنت مسؤول عن الحفاظ على سرية بيانات تسجيل دخولك. يُحظر مشاركة بيانات الدخول مع أشخاص آخرين. في حالة الاشتباه بأي وصول غير مصرح، يجب إخطارنا فوراً.

7. التواصل والدعم
نلتزم بالرد على جميع الاستفسارات خلال 24 ساعة في أيام العمل. يُقدم الدعم الفني للمواقع المُسلَّمة لمدة شهر من تاريخ التسليم بشكل مجاني.

8. تعديل الشروط
نحتفظ بالحق في تعديل هذه الشروط في أي وقت. سيتم إشعار المستخدمين بأي تغييرات جوهرية. استمرار استخدام الخدمة بعد نشر التعديلات يعني قبولك لها.`;

const DEFAULT_PRIVACY_TEXT = `1. التزامنا بحماية خصوصيتك
نأخذ خصوصية مستخدمينا على محمل الجد. توضح هذه السياسة كيفية جمع بياناتك الشخصية واستخدامها وحمايتها. باستخدامك لخدماتنا، فإنك توافق على ممارسات جمع البيانات المبينة هنا.

2. البيانات التي نجمعها
نجمع بيانات الحساب (الاسم، البريد الإلكتروني، رقم الهاتف، اسم المستخدم وكلمة المرور المشفرة)، وبيانات الطلبات (تفاصيل المشاريع، الباقة المختارة، تفضيلات الدفع)، والبيانات التقنية الضرورية.

3. كيف نستخدم بياناتك
نستخدم البيانات لإنشاء وإدارة حسابك، ومعالجة طلباتك والتواصل بشأنها، وتقديم الدعم الفني، وإرسال إشعارات عن حالة مشاريعك، وتحسين خدماتنا.

4. حماية بياناتك
نتخذ تدابير أمنية صارمة تشمل: تشفير كلمات المرور، استخدام جلسات آمنة (HTTPS)، والتحكم في وصول المدراء المعتمدين فقط إلى بيانات المستخدمين.

5. مشاركة البيانات مع الأطراف الثالثة
لا نبيع أو نشارك بياناتك الشخصية مع أطراف ثالثة لأغراض تجارية. قد نشارك بياناتك فقط بموافقتك الصريحة، أو للامتثال للقانون، أو لحماية حقوقنا القانونية.

6. حقوقك كمستخدم
يحق لك الاطلاع على بياناتك المحفوظة، وطلب تصحيح أي بيانات غير دقيقة، وطلب حذف حسابك وبياناتك، والاعتراض على استخدام بياناتك لأغراض معينة.

7. ملفات تعريف الارتباط
نستخدم ملفات تعريف الارتباط الضرورية فقط للحفاظ على جلسة تسجيل دخولك. لا نستخدمها للتتبع الإعلاني أو مشاركتها مع أطراف ثالثة.

8. التواصل معنا
إذا كان لديك أسئلة أو مخاوف بشأن سياسة الخصوصية، تواصل معنا مباشرة من خلال المنصة وسنرد عليك في أقرب وقت.`;

const PERMISSIONS_LIST = [
  { id: "overview",  label: "الإحصائيات" },
  { id: "orders",    label: "الطلبات" },
  { id: "finances",  label: "المالية" },
  { id: "users",     label: "المستخدمين" },
  { id: "packages",  label: "الباقات" },
  { id: "payments",  label: "طرق الدفع" },
  { id: "reviews",   label: "الآراء" },
  { id: "coupons",   label: "الكوبونات" },
  { id: "settings",  label: "الإعدادات" },
];

export default function Admin() {
  const { user: currentUser } = useAuth();
  const isMainAdmin = currentUser?.role === "admin";
  const userPermissions: string[] = (currentUser as any)?.permissions || [];

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

  // Profile dialog for sub-admins
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileForm, setProfileForm] = useState({ phone: "", email: "", password: "", confirm: "" });
  const [profileSaving, setProfileSaving] = useState(false);

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
  const [termsText, setTermsText] = useState("");
  const [privacyText, setPrivacyText] = useState("");
  const [savedTermsText, setSavedTermsText] = useState("");
  const [savedPrivacyText, setSavedPrivacyText] = useState("");
  const [termsSaving, setTermsSaving] = useState(false);
  const [privacySaving, setPrivacySaving] = useState(false);

  // OTP Settings
  const [otpForm, setOtpForm] = useState({ emailUser: "", emailPass: "" });
  const [savedOtpForm, setSavedOtpForm] = useState({ emailUser: "", emailPass: "" });
  const [otpSaving, setOtpSaving] = useState(false);
  const [otpTestLoading, setOtpTestLoading] = useState(false);
  const [otpTestEmail, setOtpTestEmail] = useState("");

  useEffect(() => {
    if (siteSettings) {
      setContactForm({ phone1: siteSettings.phone1 || "", phone2: siteSettings.phone2 || "", email: siteSettings.email || "", whatsapp: siteSettings.whatsapp || "", address: siteSettings.address || "", facebookUrl: siteSettings.facebookUrl || "", instagramUrl: siteSettings.instagramUrl || "", twitterUrl: siteSettings.twitterUrl || "" });
      setDepositRequire(siteSettings.requireDeposit ?? true);
      setDepositPct(siteSettings.depositPercentageValue ?? 50);
      const loadedTerms = (siteSettings as any).termsAndConditions || DEFAULT_TERMS_TEXT;
      const loadedPrivacy = (siteSettings as any).privacyPolicy || DEFAULT_PRIVACY_TEXT;
      setTermsText(loadedTerms);
      setPrivacyText(loadedPrivacy);
      setSavedTermsText(loadedTerms);
      setSavedPrivacyText(loadedPrivacy);
      const emailUser = (siteSettings as any).emailUser || "";
      const emailPass = (siteSettings as any).emailPass || "";
      setOtpForm({ emailUser, emailPass });
      setSavedOtpForm({ emailUser, emailPass });
    }
  }, [siteSettings]);

  useEffect(() => {
    if (activeTab === "coupons") fetchCoupons();
    if (activeTab === "subadmins") fetchSubadmins();
  }, [activeTab]);

  // For sub-admins: set initial tab to first permitted tab
  useEffect(() => {
    if (currentUser?.role === "subadmin") {
      const perms: string[] = (currentUser as any).permissions || [];
      const firstAllowed = ALL_NAV.find(n => !n.adminOnly && perms.includes(n.id));
      if (firstAllowed) setActiveTab(firstAllowed.id);
      // Pre-fill profile form with current sub-admin data
      setProfileForm(f => ({
        ...f,
        phone: (currentUser as any).phone?.startsWith("sub_") ? "" : ((currentUser as any).phone || ""),
        email: (currentUser as any).email?.includes("@subadmin.internal") ? "" : ((currentUser as any).email || ""),
      }));
    }
  }, [currentUser?.id]);

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
  const emptyPm = { name: "", details: "", isActive: true, currency: "both" };
  const [pmDialogOpen, setPmDialogOpen] = useState(false);
  const [pmEditTarget, setPmEditTarget] = useState<{ id: number } | null>(null);
  const [pmForm, setPmForm] = useState(emptyPm);

  // Coupons
  const emptyCoupon = { code: "", discountType: "percentage", discountValue: 10, minOrderAmount: "" as string | number, maxUses: "" as string | number, isActive: true, expiresAt: "" };
  const [couponDialogOpen, setCouponDialogOpen] = useState(false);
  const [couponEditId, setCouponEditId] = useState<number | null>(null);
  const [couponForm, setCouponForm] = useState<typeof emptyCoupon>(emptyCoupon);
  const [coupons, setCoupons] = useState<any[]>([]);
  const [couponsLoading, setCouponsLoading] = useState(false);

  // Sub-admins
  const emptySubAdmin = { fullName: "", phone: "", email: "", username: "", password: "", permissions: [] as string[] };
  const [subadmins, setSubadmins] = useState<any[]>([]);
  const [subadminsLoading, setSubadminsLoading] = useState(false);
  const [subadminDialogOpen, setSubadminDialogOpen] = useState(false);
  const [subadminEditId, setSubadminEditId] = useState<number | null>(null);
  const [subadminForm, setSubadminForm] = useState<typeof emptySubAdmin>(emptySubAdmin);
  const [subadminFormLoading, setSubadminFormLoading] = useState(false);

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

  const handleAmountSave = (orderId: number, amount: number | null, depositPct: number): Promise<void> => {
    return new Promise((resolve) => {
      updateOrder.mutate({ id: orderId, data: { totalAmount: amount, depositPercentage: depositPct } }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetAdminStatsQueryKey() });
          toast({ title: "تم حفظ المبلغ" });
          resolve();
        },
        onError: () => {
          toast({ variant: "destructive", title: "خطأ", description: "تعذر حفظ المبلغ" });
          resolve();
        },
      });
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
  const openEditPm = (pm: any) => { setPmEditTarget({ id: pm.id }); setPmForm({ name: pm.name, details: pm.details, isActive: pm.isActive, currency: pm.currency || "both" }); setPmDialogOpen(true); };

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

  const fetchCoupons = async () => {
    setCouponsLoading(true);
    try {
      const res = await fetch("/api/coupons", { credentials: "include" });
      if (res.ok) setCoupons(await res.json());
    } finally { setCouponsLoading(false); }
  };

  const handleOpenCouponDialog = (coupon?: any) => {
    if (coupon) {
      setCouponEditId(coupon.id);
      setCouponForm({ code: coupon.code, discountType: coupon.discountType, discountValue: coupon.discountValue, minOrderAmount: coupon.minOrderAmount ?? "", maxUses: coupon.maxUses ?? "", isActive: coupon.isActive, expiresAt: coupon.expiresAt ? coupon.expiresAt.split("T")[0] : "" });
    } else {
      setCouponEditId(null);
      setCouponForm(emptyCoupon);
    }
    setCouponDialogOpen(true);
  };

  const handleSaveCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const body = { ...couponForm, minOrderAmount: couponForm.minOrderAmount === "" ? null : Number(couponForm.minOrderAmount), maxUses: couponForm.maxUses === "" ? null : Number(couponForm.maxUses), expiresAt: couponForm.expiresAt || null };
      if (couponEditId) {
        await apiFetch(`/api/coupons/${couponEditId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        toast({ title: "تم تحديث الكوبون" });
      } else {
        await apiFetch("/api/coupons", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        toast({ title: "تم إنشاء الكوبون" });
      }
      setCouponDialogOpen(false);
      fetchCoupons();
    } catch (err: any) {
      toast({ variant: "destructive", title: "خطأ", description: err.message });
    }
  };

  const handleDeleteCoupon = async (id: number) => {
    if (!confirm("حذف هذا الكوبون؟")) return;
    try {
      await apiFetch(`/api/coupons/${id}`, { method: "DELETE" });
      toast({ title: "تم الحذف" });
      fetchCoupons();
    } catch {
      toast({ variant: "destructive", title: "خطأ في الحذف" });
    }
  };

  const handleToggleCoupon = async (id: number, current: boolean) => {
    try {
      await apiFetch(`/api/coupons/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isActive: !current }) });
      fetchCoupons();
    } catch {
      toast({ variant: "destructive", title: "خطأ" });
    }
  };

  const fetchSubadmins = async () => {
    setSubadminsLoading(true);
    try {
      const res = await fetch("/api/subadmins", { credentials: "include" });
      if (res.ok) setSubadmins(await res.json());
    } finally { setSubadminsLoading(false); }
  };

  const handleOpenSubadminDialog = (sub?: any) => {
    if (sub) {
      setSubadminEditId(sub.id);
      setSubadminForm({ fullName: sub.fullName, phone: sub.phone?.startsWith("sub_") ? "" : (sub.phone || ""), email: sub.email?.includes("@subadmin.internal") ? "" : (sub.email || ""), username: sub.username, password: "", permissions: sub.permissions || [] });
    } else {
      setSubadminEditId(null);
      setSubadminForm(emptySubAdmin);
    }
    setSubadminDialogOpen(true);
  };

  const handleSaveSubadmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubadminFormLoading(true);
    try {
      if (subadminEditId) {
        const body: any = { permissions: subadminForm.permissions, fullName: subadminForm.fullName, phone: subadminForm.phone, email: subadminForm.email };
        if (subadminForm.password) body.password = subadminForm.password;
        await apiFetch(`/api/subadmins/${subadminEditId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        toast({ title: "تم التحديث", description: "تم تحديث بيانات المشرف الفرعي" });
      } else {
        await apiFetch("/api/subadmins", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(subadminForm) });
        toast({ title: "تم الإنشاء", description: "تم إنشاء حساب المشرف الفرعي بنجاح" });
      }
      setSubadminDialogOpen(false);
      fetchSubadmins();
    } catch (err: any) {
      toast({ variant: "destructive", title: "خطأ", description: err.message });
    } finally { setSubadminFormLoading(false); }
  };

  const handleToggleSubadmin = async (id: number) => {
    try {
      await apiFetch(`/api/subadmins/${id}/toggle`, { method: "PATCH" });
      fetchSubadmins();
    } catch {
      toast({ variant: "destructive", title: "خطأ في تغيير الحالة" });
    }
  };

  const handleDeleteSubadmin = async (id: number) => {
    if (!confirm("هل أنت متأكد من حذف هذا المشرف؟")) return;
    try {
      await apiFetch(`/api/subadmins/${id}`, { method: "DELETE" });
      toast({ title: "تم الحذف" });
      fetchSubadmins();
    } catch {
      toast({ variant: "destructive", title: "خطأ في الحذف" });
    }
  };

  const toggleSubadminPermission = (perm: string) => {
    setSubadminForm(f => ({
      ...f,
      permissions: f.permissions.includes(perm)
        ? f.permissions.filter(p => p !== perm)
        : [...f.permissions, perm],
    }));
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (profileForm.password && profileForm.password !== profileForm.confirm) {
      toast({ variant: "destructive", title: "كلمتا المرور غير متطابقتين", duration: 2000 }); return;
    }
    setProfileSaving(true);
    try {
      const body: any = {};
      if (profileForm.phone.trim()) body.phone = profileForm.phone.trim();
      if (profileForm.email.trim()) body.email = profileForm.email.trim();
      if (profileForm.password) body.password = profileForm.password;
      if (Object.keys(body).length === 0) { toast({ title: "لا يوجد تغيير", duration: 2000 }); setProfileSaving(false); return; }
      await apiFetch("/api/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      toast({ title: "تم تحديث بيانات حسابك", duration: 2000 });
      setProfileForm(f => ({ ...f, password: "", confirm: "" }));
      setProfileOpen(false);
    } catch (err: any) {
      toast({ variant: "destructive", title: "خطأ", description: err.message, duration: 2000 });
    } finally { setProfileSaving(false); }
  };

  const handleSaveOtp = async (e: React.FormEvent) => {
    e.preventDefault(); setOtpSaving(true);
    updateSettings.mutate({ emailUser: otpForm.emailUser, emailPass: otpForm.emailPass } as any, {
      onSuccess: () => { queryClient.invalidateQueries({ queryKey: SETTINGS_KEY }); setSavedOtpForm({ ...otpForm }); toast({ title: "تم حفظ إعدادات OTP", duration: 2000 }); setOtpSaving(false); },
      onError: () => { toast({ variant: "destructive", title: "خطأ في الحفظ", duration: 2000 }); setOtpSaving(false); },
    });
  };

  const handleTestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpTestEmail) { toast({ variant: "destructive", title: "أدخل بريداً للاختبار", duration: 2000 }); return; }
    setOtpTestLoading(true);
    try {
      const res = await fetch("/api/auth/send-otp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: otpTestEmail }), credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل الإرسال");
      toast({ title: "✅ تم الإرسال", description: `تحقق من صندوق الوارد لـ ${otpTestEmail}`, duration: 4000 });
    } catch (err: any) {
      toast({ variant: "destructive", title: "فشل الإرسال", description: err.message, duration: 4000 });
    } finally { setOtpTestLoading(false); }
  };

  const handleSaveTerms = async (e: React.FormEvent) => {
    e.preventDefault(); setTermsSaving(true);
    updateSettings.mutate({ termsAndConditions: termsText } as any, {
      onSuccess: () => { queryClient.invalidateQueries({ queryKey: SETTINGS_KEY }); setSavedTermsText(termsText); toast({ title: "تم حفظ الشروط والأحكام", duration: 2000 }); setTermsSaving(false); },
      onError: () => { toast({ variant: "destructive", title: "خطأ في الحفظ", duration: 2000 }); setTermsSaving(false); },
    });
  };

  const handleSavePrivacy = async (e: React.FormEvent) => {
    e.preventDefault(); setPrivacySaving(true);
    updateSettings.mutate({ privacyPolicy: privacyText } as any, {
      onSuccess: () => { queryClient.invalidateQueries({ queryKey: SETTINGS_KEY }); setSavedPrivacyText(privacyText); toast({ title: "تم حفظ سياسة الخصوصية", duration: 2000 }); setPrivacySaving(false); },
      onError: () => { toast({ variant: "destructive", title: "خطأ في الحفظ", duration: 2000 }); setPrivacySaving(false); },
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
  const effectiveAmt = (o: any) => Math.max(0, (o.totalAmount || 0) - (o.discountAmount || 0));
  const totalRevenue = allOrders.reduce((s, o) => s + effectiveAmt(o), 0);
  const totalDiscounts = allOrders.reduce((s, o) => s + (o.discountAmount || 0), 0);
  const depositCollected = allOrders.filter(o => o.depositPaid).reduce((s, o) => { const p = o.depositPercentage ?? 50; return s + (effectiveAmt(o) * p / 100); }, 0);
  const finalCollected = allOrders.filter(o => o.finalPaid).reduce((s, o) => { const p = o.depositPercentage ?? 50; return s + (effectiveAmt(o) * (100 - p) / 100); }, 0);
  const pendingReceipts = allOrders.filter(o => o.receiptUrl && !o.depositPaid).length;

  // Build visible nav based on role/permissions
  const NAV = isMainAdmin
    ? ALL_NAV
    : ALL_NAV.filter(n => !n.adminOnly && userPermissions.includes(n.id));

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col" dir="rtl">
      {/* Top header */}
      <header className="bg-white border-b px-4 md:px-6 py-3 flex items-center justify-between sticky top-0 z-20 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <ShieldCheck className="w-4 h-4 text-white" />
          </div>
          <div>
            <span className="font-bold text-base">أركان</span>
            <span className="text-xs text-muted-foreground ms-2 hidden sm:inline">لوحة التحكم</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {pendingReceipts > 0 && (
            <div className="flex items-center gap-1.5 bg-orange-50 border border-orange-200 text-orange-700 text-xs px-2.5 py-1.5 rounded-full cursor-pointer hover:bg-orange-100 transition-colors" onClick={() => setActiveTab("orders")}>
              <FileImage className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">{pendingReceipts} إيصال بانتظار التأكيد</span>
              <span className="sm:hidden">{pendingReceipts} إيصال</span>
            </div>
          )}
          {!isMainAdmin && (
            <button
              onClick={() => setProfileOpen(true)}
              className="flex items-center gap-2 bg-muted hover:bg-muted/80 border rounded-xl px-3 py-1.5 text-sm transition-colors"
              title="إعدادات حسابي"
            >
              <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
                {currentUser?.fullName?.[0] || "م"}
              </div>
              <span className="hidden sm:inline text-foreground font-medium">{currentUser?.fullName}</span>
              <Settings className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          )}
        </div>
      </header>

      <div className="flex flex-1">
        {/* Sidebar — desktop only */}
        <aside className="hidden md:flex w-52 bg-white border-l sticky top-14 self-start h-[calc(100vh-3.5rem)] flex-col py-4 shadow-sm shrink-0">
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
        <main className="flex-1 p-3 md:p-6 min-w-0 pb-20 md:pb-6">

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
                      globalDepositPct={siteSettings?.depositPercentageValue}
                      onAmountSave={handleAmountSave}
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
                <StatCard icon={DollarSign}  label="صافي الإيرادات (بعد الخصم)" value={totalRevenue.toLocaleString()}     color="bg-primary/10 text-primary" />
                <StatCard icon={Banknote}    label="مقدمات محصلة"               value={depositCollected.toFixed(0)}        color="bg-amber-100 text-amber-600" />
                <StatCard icon={CheckCircle} label="مبالغ نهائية محصلة"         value={finalCollected.toFixed(0)}          color="bg-green-100 text-green-600" />
                <StatCard icon={Tag}         label="إجمالي الخصومات الممنوحة"   value={totalDiscounts.toLocaleString()}    color="bg-purple-100 text-purple-600" />
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
                    const p = order.depositPercentage ?? siteSettings?.depositPercentageValue ?? 50;
                    const disc = order.discountAmount ? Number(order.discountAmount) : 0;
                    const eff = Math.max(0, (order.totalAmount || 0) - disc);
                    const dep = Math.round(eff * p / 100);
                    const rem = eff - dep;
                    return (
                      <div key={order.id} className="px-6 py-4 flex flex-wrap items-center gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold">{order.siteName}</p>
                            {order.couponCode && (
                              <span className="inline-flex items-center gap-1 text-xs bg-purple-50 text-purple-700 border border-purple-200 rounded-full px-2 py-0.5 font-mono">
                                🎟 {order.couponCode}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">{order.user?.fullName}</p>
                        </div>
                        <StatusBadge status={order.status} />
                        <div className="text-sm text-end space-y-0.5">
                          {disc > 0 ? (
                            <>
                              <div className="text-muted-foreground line-through text-xs">{order.totalAmount!.toLocaleString()} {order.currency}</div>
                              <div className="text-xs text-purple-600">خصم − {disc.toLocaleString()}</div>
                              <div className="font-bold text-green-700">{eff.toLocaleString()} {order.currency}</div>
                            </>
                          ) : (
                            <div><span className="text-muted-foreground text-xs">الإجمالي: </span><strong>{order.totalAmount!.toLocaleString()} {order.currency}</strong></div>
                          )}
                        </div>
                        <div className="flex gap-3 text-sm">
                          <span className={`flex items-center gap-1 ${order.depositPaid ? "text-green-600" : "text-muted-foreground"}`}>
                            {order.depositPaid ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                            مقدم {dep.toLocaleString()}
                          </span>
                          <span className={`flex items-center gap-1 ${order.finalPaid ? "text-green-600" : "text-muted-foreground"}`}>
                            {order.finalPaid ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                            متبقي {rem.toLocaleString()}
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
                          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                            <Badge variant={pm.isActive ? "default" : "outline"} className="text-xs">
                              {pm.isActive ? "مفعّلة" : "غير مفعّلة"}
                            </Badge>
                            <Badge variant="outline" className="text-xs">
                              {(pm as any).currency === "EGP" ? "🇪🇬 مصري" : (pm as any).currency === "SAR" ? "🇸🇦 سعودي" : "🌍 الاثنين"}
                            </Badge>
                          </div>
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

          {/* ─── Coupons ─── */}
          {activeTab === "coupons" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-2xl font-bold">كوبونات الخصم</h1>
                  <p className="text-muted-foreground text-sm mt-1">{coupons.length} كوبون</p>
                </div>
                <Button size="sm" onClick={() => handleOpenCouponDialog()} className="gap-1.5">
                  <Plus className="w-4 h-4" /> كوبون جديد
                </Button>
              </div>

              {couponsLoading ? (
                <div className="text-center py-12 text-muted-foreground text-sm">جاري التحميل...</div>
              ) : coupons.length === 0 ? (
                <div className="bg-white rounded-2xl border p-16 text-center">
                  <Tag className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-muted-foreground text-sm">لا توجد كوبونات حتى الآن</p>
                  <Button size="sm" variant="outline" className="mt-4 gap-1" onClick={() => handleOpenCouponDialog()}>
                    <Plus className="w-4 h-4" /> أضف أول كوبون
                  </Button>
                </div>
              ) : (
                <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
                  <div className="divide-y">
                    {coupons.map((coupon: any) => (
                      <div key={coupon.id} className={`px-5 py-4 flex items-center gap-4 ${!coupon.isActive ? "opacity-60" : ""}`}>
                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                          <Tag className="w-5 h-5 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold font-mono text-lg tracking-widest">{coupon.code}</span>
                            <Badge className={coupon.isActive ? "bg-green-50 text-green-700 border-green-200" : "bg-gray-100 text-gray-500 border-gray-200"}>
                              {coupon.isActive ? "نشط" : "موقوف"}
                            </Badge>
                            <Badge variant="outline" className="text-xs">
                              {coupon.discountType === "percentage"
                                ? `خصم ${coupon.discountValue}%`
                                : `خصم ${coupon.discountValue} ثابت`}
                            </Badge>
                          </div>
                          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground mt-1">
                            {coupon.minOrderAmount && <span>حد أدنى: {coupon.minOrderAmount}</span>}
                            {coupon.maxUses && <span>الاستخدام: {coupon.usedCount}/{coupon.maxUses}</span>}
                            {!coupon.maxUses && <span>مستخدم: {coupon.usedCount} مرة</span>}
                            {coupon.expiresAt && <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />ينتهي: {format(new Date(coupon.expiresAt), "dd/MM/yyyy")}</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Button variant="outline" size="icon" className="h-8 w-8" title={coupon.isActive ? "إيقاف" : "تفعيل"} onClick={() => handleToggleCoupon(coupon.id, coupon.isActive)}>
                            {coupon.isActive ? <EyeOff className="h-3.5 w-3.5 text-orange-500" /> : <Eye className="h-3.5 w-3.5 text-green-600" />}
                          </Button>
                          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => handleOpenCouponDialog(coupon)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => handleDeleteCoupon(coupon.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
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
                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <Label>نسبة المقدم</Label>
                        <div className="flex items-center gap-3">
                          <Input type="number" min={1} max={99} value={depositPct} onChange={e => setDepositPct(Math.min(99, Math.max(1, Number(e.target.value) || 50)))} className="w-28" />
                          <span className="text-muted-foreground font-bold">%</span>
                          <span className="text-sm text-muted-foreground">من إجمالي قيمة الطلب</span>
                        </div>
                      </div>
                      {/* Live visual split */}
                      <div className="rounded-xl border bg-muted/20 p-4 space-y-3">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">معاينة التقسيم</p>
                        <div className="w-full h-4 rounded-full overflow-hidden flex">
                          <div className="h-full bg-amber-400 transition-all duration-200 flex items-center justify-center" style={{ width: `${depositPct}%` }}>
                            {depositPct >= 15 && <span className="text-white text-[9px] font-bold">{depositPct}%</span>}
                          </div>
                          <div className="h-full bg-blue-400 flex-1 flex items-center justify-center">
                            {(100 - depositPct) >= 15 && <span className="text-white text-[9px] font-bold">{100 - depositPct}%</span>}
                          </div>
                        </div>
                        <div className="flex justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <span className="w-3 h-3 rounded-full bg-amber-400 inline-block" />
                            <span className="text-muted-foreground">المقدم</span>
                            <span className="font-bold text-amber-600">{depositPct}%</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground">المتبقي</span>
                            <span className="font-bold text-blue-600">{100 - depositPct}%</span>
                            <span className="w-3 h-3 rounded-full bg-blue-400 inline-block" />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  <Button type="submit" disabled={depositSaving} className="gap-1.5">
                    {depositSaving ? "جاري الحفظ..." : "حفظ إعدادات المقدّم"}
                  </Button>
                </form>
              </div>

              {/* Terms & Conditions */}
              <div className="bg-white rounded-2xl border shadow-sm p-6">
                <h2 className="font-bold mb-1 flex items-center gap-2"><BadgeCheck className="w-4 h-4 text-primary" />الشروط والأحكام</h2>
                <p className="text-sm text-muted-foreground mb-4">تظهر لعملائك عند التسجيل وفي صفحة مستقلة</p>
                <form onSubmit={handleSaveTerms} className="space-y-3">
                  <textarea
                    value={termsText}
                    onChange={e => setTermsText(e.target.value)}
                    rows={10}
                    className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y"
                  />
                  {termsText !== savedTermsText && (
                    <Button type="submit" disabled={termsSaving} className="gap-1.5">
                      {termsSaving ? "جاري الحفظ..." : "حفظ التعديلات"}
                    </Button>
                  )}
                </form>
              </div>

              {/* Privacy Policy */}
              <div className="bg-white rounded-2xl border shadow-sm p-6">
                <h2 className="font-bold mb-1 flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-primary" />سياسة الخصوصية</h2>
                <p className="text-sm text-muted-foreground mb-4">تظهر لعملائك عند التسجيل وفي صفحة مستقلة</p>
                <form onSubmit={handleSavePrivacy} className="space-y-3">
                  <textarea
                    value={privacyText}
                    onChange={e => setPrivacyText(e.target.value)}
                    rows={10}
                    className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y"
                  />
                  {privacyText !== savedPrivacyText && (
                    <Button type="submit" disabled={privacySaving} className="gap-1.5">
                      {privacySaving ? "جاري الحفظ..." : "حفظ التعديلات"}
                    </Button>
                  )}
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
          {/* ─── OTP Settings ─── */}
          {activeTab === "otp-settings" && isMainAdmin && (
            <div className="space-y-6 max-w-xl">
              <div>
                <h1 className="text-2xl font-bold flex items-center gap-2"><Mail className="w-6 h-6 text-primary" />إعدادات OTP</h1>
                <p className="text-muted-foreground text-sm mt-1">إعداد البريد الإلكتروني لإرسال رموز التحقق عند نسيان كلمة المرور</p>
              </div>

              {/* Config card */}
              <div className="bg-white rounded-2xl border shadow-sm p-6">
                <h2 className="font-bold mb-1 flex items-center gap-2"><Settings className="w-4 h-4 text-primary" />بيانات Gmail</h2>
                <p className="text-sm text-muted-foreground mb-5">
                  يُستخدم حساب Gmail مع <strong>App Password</strong> (وليس كلمة المرور العادية).
                  {" "}<a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer" className="text-primary underline text-xs">إنشاء App Password ←</a>
                </p>
                <form onSubmit={handleSaveOtp} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label>بريد Gmail <span className="text-red-500">*</span></Label>
                    <Input
                      type="email"
                      value={otpForm.emailUser}
                      onChange={e => setOtpForm(f => ({ ...f, emailUser: e.target.value }))}
                      placeholder="example@gmail.com"
                      dir="ltr"
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>App Password <span className="text-red-500">*</span></Label>
                    <Input
                      type="password"
                      value={otpForm.emailPass}
                      onChange={e => setOtpForm(f => ({ ...f, emailPass: e.target.value }))}
                      placeholder="xxxx xxxx xxxx xxxx"
                      dir="ltr"
                      required
                    />
                    <p className="text-xs text-muted-foreground">كلمة المرور المُولَّدة من Google — غير كلمة المرور العادية</p>
                  </div>
                  {(otpForm.emailUser !== savedOtpForm.emailUser || otpForm.emailPass !== savedOtpForm.emailPass) && (
                    <Button type="submit" disabled={otpSaving} className="gap-1.5">
                      {otpSaving ? "جاري الحفظ..." : "حفظ الإعدادات"}
                    </Button>
                  )}
                </form>
              </div>

              {/* Status card */}
              <div className="bg-white rounded-2xl border shadow-sm p-6">
                <h2 className="font-bold mb-1">حالة الإعداد</h2>
                <p className="text-sm text-muted-foreground mb-4">المصدر الفعلي الذي يُستخدم عند الإرسال (DB يأخذ الأولوية على .env)</p>
                <div className="space-y-2">
                  <div className={`flex items-center gap-3 rounded-xl px-4 py-3 ${savedOtpForm.emailUser ? "bg-green-50 border border-green-200" : "bg-amber-50 border border-amber-200"}`}>
                    <div className={`w-2.5 h-2.5 rounded-full ${savedOtpForm.emailUser ? "bg-green-500" : "bg-amber-400"}`} />
                    <div>
                      <p className="text-sm font-medium">{savedOtpForm.emailUser ? "إعداد DB" : "لم يُضبط في DB"}</p>
                      <p className="text-xs text-muted-foreground">{savedOtpForm.emailUser ? savedOtpForm.emailUser : "سيُستخدم EMAIL_USER من متغيرات البيئة كـ fallback"}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Test card */}
              <div className="bg-white rounded-2xl border shadow-sm p-6">
                <h2 className="font-bold mb-1">اختبار الإرسال</h2>
                <p className="text-sm text-muted-foreground mb-4">أرسل OTP تجريبياً للتحقق من صحة الإعداد</p>
                <form onSubmit={handleTestOtp} className="flex gap-2">
                  <Input
                    type="email"
                    value={otpTestEmail}
                    onChange={e => setOtpTestEmail(e.target.value)}
                    placeholder="test@example.com"
                    dir="ltr"
                    className="flex-1"
                  />
                  <Button type="submit" variant="outline" disabled={otpTestLoading} className="gap-1.5 shrink-0">
                    {otpTestLoading ? "جاري الإرسال..." : "إرسال اختبار"}
                  </Button>
                </form>
              </div>
            </div>
          )}

          {/* ─── Sub-admins ─── */}
          {activeTab === "subadmins" && isMainAdmin && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-2xl font-bold flex items-center gap-2"><Shield className="w-6 h-6 text-primary" />مشرفون فرعيون</h1>
                  <p className="text-muted-foreground text-sm mt-1">إدارة حسابات المشرفين وتحديد صلاحياتهم</p>
                </div>
                <Button onClick={() => handleOpenSubadminDialog()} className="gap-2">
                  <Plus className="w-4 h-4" /> إضافة مشرف
                </Button>
              </div>

              {subadminsLoading ? (
                <div className="text-center py-12 text-muted-foreground">جاري التحميل...</div>
              ) : subadmins.length === 0 ? (
                <div className="bg-white rounded-2xl border p-16 text-center">
                  <Shield className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-muted-foreground font-medium">لا يوجد مشرفون فرعيون</p>
                  <p className="text-sm text-muted-foreground mt-1">أضف مشرفاً فرعياً وحدد له الصلاحيات</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {subadmins.map(sub => (
                    <div key={sub.id} className={`bg-white rounded-2xl border shadow-sm p-5 transition-opacity ${!sub.isActive ? "opacity-60" : ""}`}>
                      {/* Header */}
                      <div className="flex items-center justify-between gap-4 mb-5">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${sub.isActive ? "bg-primary/10" : "bg-gray-100"}`}>
                            <Shield className={`w-5 h-5 ${sub.isActive ? "text-primary" : "text-gray-400"}`} />
                          </div>
                          <div>
                            <p className="font-semibold">{sub.fullName}</p>
                            <p className="text-xs text-muted-foreground">@{sub.username}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          {/* Active toggle */}
                          <div className="flex items-center gap-2">
                            <span className={`text-xs font-medium ${sub.isActive ? "text-green-600" : "text-red-500"}`}>
                              {sub.isActive ? "مفعّل" : "موقوف"}
                            </span>
                            <Switch checked={sub.isActive} onCheckedChange={() => handleToggleSubadmin(sub.id)} />
                          </div>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive hover:text-destructive" onClick={() => handleDeleteSubadmin(sub.id)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>

                      {/* Permissions — inline toggles */}
                      <div className="border-t pt-4">
                        <p className="text-xs font-semibold text-muted-foreground mb-3">الصلاحيات</p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                          {PERMISSIONS_LIST.map(perm => {
                            const enabled = sub.permissions.includes(perm.id);
                            return (
                              <div
                                key={perm.id}
                                className={`flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border transition-all ${enabled ? "bg-primary/5 border-primary/30" : "bg-gray-50 border-gray-200"}`}
                              >
                                <span className={`text-sm font-medium ${enabled ? "text-primary" : "text-muted-foreground"}`}>{perm.label}</span>
                                <Switch
                                  checked={enabled}
                                  onCheckedChange={async () => {
                                    const newPerms = enabled
                                      ? sub.permissions.filter((p: string) => p !== perm.id)
                                      : [...sub.permissions, perm.id];
                                    try {
                                      await apiFetch(`/api/subadmins/${sub.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ permissions: newPerms }) });
                                      fetchSubadmins();
                                    } catch {
                                      toast({ variant: "destructive", title: "خطأ في تحديث الصلاحية" });
                                    }
                                  }}
                                />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
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
            <div className="space-y-1.5">
              <Label>العملة المدعومة</Label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { val: "EGP", label: "🇪🇬 مصري فقط" },
                  { val: "SAR", label: "🇸🇦 سعودي فقط" },
                  { val: "both", label: "🌍 الاثنين" },
                ].map(opt => (
                  <button
                    key={opt.val}
                    type="button"
                    onClick={() => setPmForm(f => ({ ...f, currency: opt.val }))}
                    className={`border rounded-xl py-2.5 text-sm font-medium transition-all ${pmForm.currency === opt.val ? "bg-primary text-white border-primary shadow-sm" : "bg-muted/30 text-muted-foreground hover:border-primary/50"}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-3"><Switch id="pm-active" checked={pmForm.isActive} onCheckedChange={v => setPmForm(f => ({ ...f, isActive: v }))} /><Label htmlFor="pm-active">{pmForm.isActive ? "مفعّلة" : "غير مفعّلة"}</Label></div>
            <Button type="submit" className="w-full" disabled={createPaymentMethod.isPending || updatePaymentMethod.isPending}>{createPaymentMethod.isPending || updatePaymentMethod.isPending ? "جاري الحفظ..." : pmEditTarget ? "حفظ التعديلات" : "إضافة طريقة الدفع"}</Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Sub-admin create dialog */}
      <Dialog open={subadminDialogOpen} onOpenChange={setSubadminDialogOpen}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle>إضافة مشرف فرعي جديد</DialogTitle>
            <DialogDescription>أدخل بيانات الحساب — يمكنك تحديد الصلاحيات بعد الإنشاء مباشرةً</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveSubadmin} className="space-y-3 mt-2">
            <div className="space-y-1.5">
              <Label>الاسم الكامل <span className="text-red-500">*</span></Label>
              <Input value={subadminForm.fullName} onChange={e => setSubadminForm(f => ({ ...f, fullName: e.target.value }))} required placeholder="أدخل الاسم" />
            </div>
            <div className="space-y-1.5">
              <Label>رقم الهاتف <span className="text-muted-foreground text-xs">(اختياري)</span></Label>
              <Input value={subadminForm.phone} onChange={e => setSubadminForm(f => ({ ...f, phone: e.target.value }))} placeholder="+20 100 000 0000" dir="ltr" />
            </div>
            <div className="space-y-1.5">
              <Label>البريد الإلكتروني <span className="text-muted-foreground text-xs">(اختياري)</span></Label>
              <Input type="email" value={subadminForm.email} onChange={e => setSubadminForm(f => ({ ...f, email: e.target.value }))} placeholder="example@email.com" dir="ltr" />
            </div>
            <div className="space-y-1.5">
              <Label>اسم المستخدم <span className="text-red-500">*</span></Label>
              <Input value={subadminForm.username} onChange={e => setSubadminForm(f => ({ ...f, username: e.target.value }))} required placeholder="username" dir="ltr" disabled={!!subadminEditId} />
            </div>
            <div className="space-y-1.5">
              <Label>{subadminEditId ? "كلمة مرور جديدة (اتركها فارغة لعدم التغيير)" : <>كلمة المرور <span className="text-red-500">*</span></>}</Label>
              <Input type="password" value={subadminForm.password} onChange={e => setSubadminForm(f => ({ ...f, password: e.target.value }))} required={!subadminEditId} placeholder="6 أحرف على الأقل" dir="ltr" />
            </div>
            <Button type="submit" className="w-full mt-1" disabled={subadminFormLoading}>
              {subadminFormLoading ? "جاري الحفظ..." : subadminEditId ? "حفظ التعديلات" : "إنشاء الحساب"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Profile dialog for sub-admins */}
      <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle>إعدادات حسابي</DialogTitle>
            <DialogDescription>تعديل بيانات حسابك الشخصي</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveProfile} className="space-y-3 mt-2">
            <div className="bg-muted/50 rounded-xl px-4 py-3 text-sm">
              <p className="text-muted-foreground text-xs mb-1">الاسم</p>
              <p className="font-semibold">{currentUser?.fullName}</p>
              <p className="text-muted-foreground text-xs mt-1.5 mb-1">اسم المستخدم</p>
              <p className="font-mono">{currentUser?.username}</p>
            </div>
            <div className="space-y-1.5">
              <Label>رقم الهاتف</Label>
              <Input value={profileForm.phone} onChange={e => setProfileForm(f => ({ ...f, phone: e.target.value }))} placeholder="+20 100 000 0000" dir="ltr" />
            </div>
            <div className="space-y-1.5">
              <Label>البريد الإلكتروني</Label>
              <Input type="email" value={profileForm.email} onChange={e => setProfileForm(f => ({ ...f, email: e.target.value }))} placeholder="example@email.com" dir="ltr" />
            </div>
            <div className="space-y-1.5">
              <Label>كلمة مرور جديدة <span className="text-muted-foreground text-xs">(اتركها فارغة لعدم التغيير)</span></Label>
              <Input type="password" value={profileForm.password} onChange={e => setProfileForm(f => ({ ...f, password: e.target.value }))} placeholder="6 أحرف على الأقل" dir="ltr" />
            </div>
            {profileForm.password && (
              <div className="space-y-1.5">
                <Label>تأكيد كلمة المرور</Label>
                <Input type="password" value={profileForm.confirm} onChange={e => setProfileForm(f => ({ ...f, confirm: e.target.value }))} placeholder="أعد كتابة كلمة المرور" dir="ltr" />
              </div>
            )}
            <Button type="submit" className="w-full" disabled={profileSaving}>
              {profileSaving ? "جاري الحفظ..." : "حفظ التعديلات"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Coupon dialog */}
      <Dialog open={couponDialogOpen} onOpenChange={setCouponDialogOpen}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>{couponEditId ? "تعديل كوبون" : "إنشاء كوبون خصم جديد"}</DialogTitle>
            <DialogDescription>{couponEditId ? "عدّل بيانات الكوبون ثم احفظ." : "أدخل تفاصيل الكوبون الجديد."}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveCoupon} className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label>كود الخصم</Label>
              <Input
                value={couponForm.code}
                onChange={e => setCouponForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
                required
                placeholder="SAVE20"
                dir="ltr"
                className="font-mono tracking-widest uppercase"
                disabled={!!couponEditId}
              />
              {!couponEditId && <p className="text-xs text-muted-foreground">الكود بالأحرف الكبيرة — سيُطبَّق تلقائياً</p>}
            </div>

            <div className="space-y-1.5">
              <Label>نوع الخصم</Label>
              <div className="grid grid-cols-2 gap-2">
                {[{ val: "percentage", label: "نسبة مئوية (%)" }, { val: "fixed", label: "مبلغ ثابت" }].map(opt => (
                  <button
                    key={opt.val}
                    type="button"
                    onClick={() => setCouponForm(f => ({ ...f, discountType: opt.val }))}
                    className={`border rounded-xl py-2.5 text-sm font-medium transition-all ${couponForm.discountType === opt.val ? "bg-primary text-white border-primary shadow-sm" : "bg-muted/30 text-muted-foreground hover:border-primary/50"}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{couponForm.discountType === "percentage" ? "قيمة الخصم (%)" : "قيمة الخصم"}</Label>
                <Input type="number" min={0} max={couponForm.discountType === "percentage" ? 100 : undefined} value={couponForm.discountValue} onChange={e => setCouponForm(f => ({ ...f, discountValue: Number(e.target.value) }))} required />
              </div>
              <div className="space-y-1.5">
                <Label>الحد الأدنى للطلب</Label>
                <Input type="number" min={0} value={couponForm.minOrderAmount} onChange={e => setCouponForm(f => ({ ...f, minOrderAmount: e.target.value }))} placeholder="اختياري" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>الحد الأقصى للاستخدام</Label>
                <Input type="number" min={1} value={couponForm.maxUses} onChange={e => setCouponForm(f => ({ ...f, maxUses: e.target.value }))} placeholder="غير محدود" />
              </div>
              <div className="space-y-1.5">
                <Label>تاريخ انتهاء الصلاحية</Label>
                <Input type="date" value={couponForm.expiresAt} onChange={e => setCouponForm(f => ({ ...f, expiresAt: e.target.value }))} dir="ltr" />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Switch id="coupon-active" checked={couponForm.isActive} onCheckedChange={v => setCouponForm(f => ({ ...f, isActive: v }))} />
              <Label htmlFor="coupon-active">{couponForm.isActive ? "نشط (يمكن استخدامه)" : "موقوف"}</Label>
            </div>

            <Button type="submit" className="w-full">{couponEditId ? "حفظ التعديلات" : "إنشاء الكوبون"}</Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Mobile bottom navigation */}
      <nav className="md:hidden fixed bottom-0 right-0 left-0 z-30 bg-white border-t shadow-lg" dir="rtl">
        <div className="flex overflow-x-auto scrollbar-hide">
          {NAV.map(item => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            const hasBadge = item.id === "orders" && pendingReceipts > 0;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`flex flex-col items-center justify-center gap-0.5 min-w-[4rem] flex-1 py-2.5 px-1 relative transition-colors ${isActive ? "text-primary" : "text-muted-foreground"}`}
              >
                <div className="relative">
                  <Icon className="w-5 h-5" />
                  {hasBadge && (
                    <span className="absolute -top-1 -left-1 w-4 h-4 bg-orange-500 rounded-full text-white text-[10px] flex items-center justify-center font-bold">
                      {pendingReceipts}
                    </span>
                  )}
                </div>
                <span className="text-[10px] font-medium leading-tight">{item.label}</span>
                {isActive && <span className="absolute bottom-0 right-2 left-2 h-0.5 bg-primary rounded-full" />}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
