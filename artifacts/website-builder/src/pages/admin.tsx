import { useState } from "react";
import { 
  useGetAdminStats, 
  useListOrders, 
  useUpdateOrder,
  useDeleteOrder,
  useListPackages,
  useListTestimonials,
  useUpdateTestimonial,
  useListPaymentMethods,
  useCreatePaymentMethod,
  useUpdatePaymentMethod,
  useListUsers,
  useDeleteUser,
  useDeletePackage,
  useDeletePaymentMethod,
  useDeleteTestimonial
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users, ShoppingCart, DollarSign, CheckCircle, Trash2, Plus, Pencil, Check, X, ShieldCheck, ShieldOff, UserPlus, Settings, Eye, EyeOff, ToggleLeft, ToggleRight, TrendingUp, Banknote, Clock } from "lucide-react";
import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { 
  getGetAdminStatsQueryKey, 
  getListOrdersQueryKey, 
  getListUsersQueryKey,
  getListPackagesQueryKey,
  getListPaymentMethodsQueryKey,
  getListTestimonialsQueryKey
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";

const statusMap: Record<string, string> = {
  pending: "قيد الانتظار",
  in_progress: "جاري التنفيذ",
  completed: "مكتمل",
  cancelled: "ملغي",
};

export default function Admin() {
  const { data: stats, isLoading: statsLoading } = useGetAdminStats();
  const { data: orders, isLoading: ordersLoading } = useListOrders();
  const { data: users, isLoading: usersLoading } = useListUsers();
  const { data: packages } = useListPackages();
  const { data: paymentMethods } = useListPaymentMethods();
  const { data: testimonials } = useListTestimonials();
  
  const updateOrder = useUpdateOrder();
  const deleteOrder = useDeleteOrder();
  const deleteUser = useDeleteUser();
  const deletePackage = useDeletePackage();
  const deletePaymentMethod = useDeletePaymentMethod();
  const createPaymentMethod = useCreatePaymentMethod();
  const updatePaymentMethod = useUpdatePaymentMethod();
  const deleteTestimonial = useDeleteTestimonial();
  const updateTestimonial = useUpdateTestimonial();
  
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState("orders");
  const [editingAmount, setEditingAmount] = useState<{ orderId: number; value: string } | null>(null);
  const [editingPercent, setEditingPercent] = useState<{ orderId: number; value: string } | null>(null);
  const [createAdminOpen, setCreateAdminOpen] = useState(false);
  const [adminForm, setAdminForm] = useState({ fullName: "", phone: "", email: "", username: "", password: "" });
  const [adminFormLoading, setAdminFormLoading] = useState(false);
  const [pwForm, setPwForm] = useState({ newPassword: "", confirm: "" });
  const [pwLoading, setPwLoading] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);

  const emptyPm = { name: "", details: "", isActive: true };
  const [pmDialogOpen, setPmDialogOpen] = useState(false);
  const [pmEditTarget, setPmEditTarget] = useState<{ id: number } | null>(null);
  const [pmForm, setPmForm] = useState(emptyPm);

  const handleUpdateOrderStatus = (orderId: number, status: string) => {
    updateOrder.mutate({ id: orderId, data: { status } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetAdminStatsQueryKey() });
        toast({ title: "تم التحديث", description: "تم تحديث حالة الطلب بنجاح" });
      },
      onError: () => {
        toast({ variant: "destructive", title: "خطأ", description: "تعذر تحديث حالة الطلب" });
      }
    });
  };

  const handleUpdateOrderPayment = (orderId: number, field: "depositPaid" | "finalPaid", value: boolean) => {
    updateOrder.mutate({ id: orderId, data: { [field]: value } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
        toast({ title: "تم التحديث", description: "تم تحديث حالة الدفع بنجاح" });
      },
      onError: () => {
        toast({ variant: "destructive", title: "خطأ", description: "تعذر تحديث حالة الدفع" });
      }
    });
  };

  const handleDeleteOrder = (orderId: number) => {
    if(confirm("هل أنت متأكد من حذف هذا الطلب؟ لا يمكن التراجع عن هذا الإجراء.")) {
      deleteOrder.mutate({ id: orderId }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetAdminStatsQueryKey() });
          toast({ title: "تم الحذف", description: "تم حذف الطلب بنجاح" });
        },
        onError: () => {
          toast({ variant: "destructive", title: "خطأ", description: "تعذر حذف الطلب" });
        }
      });
    }
  };

  const handleDeleteUser = (userId: number) => {
    if(confirm("هل أنت متأكد من حذف هذا المستخدم؟ لا يمكن التراجع عن هذا الإجراء.")) {
      deleteUser.mutate({ id: userId }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetAdminStatsQueryKey() });
          toast({ title: "تم الحذف", description: "تم حذف المستخدم بنجاح" });
        }
      });
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pwForm.newPassword !== pwForm.confirm) {
      toast({ variant: "destructive", title: "خطأ", description: "كلمتا المرور غير متطابقتين" });
      return;
    }
    if (pwForm.newPassword.length < 6) {
      toast({ variant: "destructive", title: "خطأ", description: "كلمة المرور يجب أن تكون 6 أحرف على الأقل" });
      return;
    }
    setPwLoading(true);
    try {
      await apiFetch("/api/admin/change-password", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword: pwForm.newPassword }),
      });
      toast({ title: "تم التحديث", description: "تم تغيير كلمة المرور بنجاح" });
      setPwForm({ newPassword: "", confirm: "" });
    } catch (err: any) {
      toast({ variant: "destructive", title: "خطأ", description: err?.message || "تعذر تغيير كلمة المرور" });
    } finally {
      setPwLoading(false);
    }
  };

  const apiFetch = async (url: string, options: RequestInit) => {
    const res = await fetch(url, { ...options, credentials: "include" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
    return data;
  };

  const handleToggleRole = async (userId: number, currentRole: string) => {
    const newRole = currentRole === "admin" ? "user" : "admin";
    const label = newRole === "admin" ? "مدير" : "مستخدم";
    try {
      await apiFetch(`/api/users/${userId}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
      toast({ title: "تم التحديث", description: `تم تغيير الصلاحية إلى ${label}` });
    } catch (err: any) {
      toast({ variant: "destructive", title: "خطأ", description: err?.message || "تعذر تغيير الصلاحية" });
    }
  };

  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminFormLoading(true);
    try {
      await apiFetch("/api/admin/create-admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(adminForm),
      });
      queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetAdminStatsQueryKey() });
      toast({ title: "تم الإنشاء", description: "تم إنشاء حساب الأدمن الجديد بنجاح" });
      setCreateAdminOpen(false);
      setAdminForm({ fullName: "", phone: "", email: "", username: "", password: "" });
    } catch (err: any) {
      toast({ variant: "destructive", title: "خطأ", description: err?.message || "تعذر إنشاء الحساب" });
    } finally {
      setAdminFormLoading(false);
    }
  };

  const handleDeletePackage = (id: number) => {
    if(confirm("هل أنت متأكد من حذف هذه الباقة؟")) {
      deletePackage.mutate({ id }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListPackagesQueryKey() });
          toast({ title: "تم الحذف", description: "تم حذف الباقة بنجاح" });
        }
      });
    }
  };

  const handleDeletePaymentMethod = (id: number) => {
    if(confirm("هل أنت متأكد من حذف طريقة الدفع؟")) {
      deletePaymentMethod.mutate({ id }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListPaymentMethodsQueryKey() });
          toast({ title: "تم الحذف", description: "تم الحذف بنجاح" });
        }
      });
    }
  };

  const openAddPm = () => {
    setPmEditTarget(null);
    setPmForm(emptyPm);
    setPmDialogOpen(true);
  };

  const openEditPm = (pm: { id: number; name: string; details: string; isActive: boolean }) => {
    setPmEditTarget({ id: pm.id });
    setPmForm({ name: pm.name, details: pm.details, isActive: pm.isActive });
    setPmDialogOpen(true);
  };

  const handleSavePm = (e: React.FormEvent) => {
    e.preventDefault();
    if (pmEditTarget) {
      updatePaymentMethod.mutate({ id: pmEditTarget.id, data: pmForm }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListPaymentMethodsQueryKey() });
          toast({ title: "تم التحديث", description: "تم تحديث طريقة الدفع بنجاح" });
          setPmDialogOpen(false);
        },
        onError: () => toast({ variant: "destructive", title: "خطأ", description: "تعذر التحديث" }),
      });
    } else {
      createPaymentMethod.mutate({ data: pmForm }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListPaymentMethodsQueryKey() });
          toast({ title: "تمت الإضافة", description: "تمت إضافة طريقة الدفع بنجاح" });
          setPmDialogOpen(false);
        },
        onError: () => toast({ variant: "destructive", title: "خطأ", description: "تعذر الإضافة" }),
      });
    }
  };

  const handleDeleteTestimonial = (id: number) => {
    if(confirm("هل أنت متأكد من حذف الرأي؟")) {
      deleteTestimonial.mutate({ id }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListTestimonialsQueryKey() });
          toast({ title: "تم الحذف", description: "تم الحذف بنجاح" });
        }
      });
    }
  };

  const handleToggleTestimonial = (id: number, current: boolean) => {
    updateTestimonial.mutate({ id, data: { isActive: !current } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListTestimonialsQueryKey() });
        toast({ title: "تم التحديث", description: current ? "تم إخفاء الرأي" : "تم نشر الرأي بنجاح" });
      },
      onError: () => {
        toast({ variant: "destructive", title: "خطأ", description: "تعذر تحديث الرأي" });
      }
    });
  };

  const handleSaveAmount = (orderId: number) => {
    if (!editingAmount) return;
    const amount = parseFloat(editingAmount.value);
    if (isNaN(amount) || amount < 0) {
      toast({ variant: "destructive", title: "خطأ", description: "أدخل مبلغاً صحيحاً" });
      return;
    }
    updateOrder.mutate({ id: orderId, data: { totalAmount: amount } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
        toast({ title: "تم التحديث", description: "تم تحديث المبلغ الإجمالي بنجاح" });
        setEditingAmount(null);
      },
      onError: () => {
        toast({ variant: "destructive", title: "خطأ", description: "تعذر تحديث المبلغ" });
      }
    });
  };

  const handleSavePercent = (orderId: number) => {
    if (!editingPercent) return;
    const pct = parseFloat(editingPercent.value);
    if (isNaN(pct) || pct < 0 || pct > 100) {
      toast({ variant: "destructive", title: "خطأ", description: "أدخل نسبة بين 0 و 100" });
      return;
    }
    updateOrder.mutate({ id: orderId, data: { depositPercentage: pct } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
        toast({ title: "تم التحديث", description: "تم تحديث نسبة المقدم بنجاح" });
        setEditingPercent(null);
      },
      onError: () => {
        toast({ variant: "destructive", title: "خطأ", description: "تعذر تحديث النسبة" });
      }
    });
  };

  if (statsLoading || ordersLoading) {
    return <div className="p-8 text-center">جاري التحميل...</div>;
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">لوحة التحكم</h1>
        <p className="text-muted-foreground mt-2">إدارة الموقع والطلبات والمستخدمين</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <Card
          className="border-none shadow-md bg-gradient-to-br from-primary/5 to-transparent cursor-pointer hover:shadow-lg transition-shadow"
          onClick={() => setActiveTab("finances")}
        >
          <CardContent className="p-6 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-1">إجمالي الإيرادات</p>
              <h3 className="text-3xl font-bold">{stats?.totalRevenue || 0}</h3>
            </div>
            <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center text-primary">
              <DollarSign className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>

        <Card
          className="border-none shadow-md bg-gradient-to-br from-blue-500/5 to-transparent cursor-pointer hover:shadow-lg transition-shadow"
          onClick={() => setActiveTab("orders")}
        >
          <CardContent className="p-6 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-1">إجمالي الطلبات</p>
              <h3 className="text-3xl font-bold">{stats?.totalOrders || 0}</h3>
            </div>
            <div className="w-12 h-12 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-600">
              <ShoppingCart className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>

        <Card
          className="border-none shadow-md bg-gradient-to-br from-green-500/5 to-transparent cursor-pointer hover:shadow-lg transition-shadow"
          onClick={() => setActiveTab("orders")}
        >
          <CardContent className="p-6 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-1">الطلبات المكتملة</p>
              <h3 className="text-3xl font-bold">{stats?.completedOrders || 0}</h3>
            </div>
            <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center text-green-600">
              <CheckCircle className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>

        <Card
          className="border-none shadow-md bg-gradient-to-br from-orange-500/5 to-transparent cursor-pointer hover:shadow-lg transition-shadow"
          onClick={() => setActiveTab("users")}
        >
          <CardContent className="p-6 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-1">إجمالي المستخدمين</p>
              <h3 className="text-3xl font-bold">{stats?.totalUsers || 0}</h3>
            </div>
            <div className="w-12 h-12 rounded-full bg-orange-500/20 flex items-center justify-center text-orange-600">
              <Users className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4 lg:grid-cols-7 mb-8 h-auto p-1 gap-2 bg-muted/50">
          <TabsTrigger value="finances" className="text-base h-10 flex items-center gap-1"><TrendingUp className="w-4 h-4" />المالية</TabsTrigger>
          <TabsTrigger value="orders" className="text-base h-10">الطلبات</TabsTrigger>
          <TabsTrigger value="users" className="text-base h-10">المستخدمين</TabsTrigger>
          <TabsTrigger value="packages" className="text-base h-10">الباقات</TabsTrigger>
          <TabsTrigger value="payment-methods" className="text-base h-10">طرق الدفع</TabsTrigger>
          <TabsTrigger value="testimonials" className="text-base h-10">الآراء</TabsTrigger>
          <TabsTrigger value="settings" className="text-base h-10 flex items-center gap-1"><Settings className="w-4 h-4" />الإعدادات</TabsTrigger>
        </TabsList>
        
        <TabsContent value="finances" className="space-y-6">
          {(() => {
            const allOrders = orders || [];
            const totalRevenue = allOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
            const depositCollected = allOrders.filter(o => o.depositPaid).reduce((sum, o) => {
              const pct = o.depositPercentage ?? 50;
              return sum + ((o.totalAmount || 0) * pct / 100);
            }, 0);
            const finalCollected = allOrders.filter(o => o.finalPaid).reduce((sum, o) => {
              const pct = o.depositPercentage ?? 50;
              return sum + ((o.totalAmount || 0) * (100 - pct) / 100);
            }, 0);
            const pendingDeposits = allOrders.filter(o => !o.depositPaid && o.totalAmount).reduce((sum, o) => {
              const pct = o.depositPercentage ?? 50;
              return sum + ((o.totalAmount || 0) * pct / 100);
            }, 0);

            return (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <Card className="border-none shadow-sm bg-gradient-to-br from-primary/5 to-transparent">
                    <CardContent className="p-5 flex items-center justify-between">
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">إجمالي قيمة الطلبات</p>
                        <h3 className="text-2xl font-bold">{totalRevenue.toLocaleString()}</h3>
                      </div>
                      <div className="w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center text-primary">
                        <TrendingUp className="w-5 h-5" />
                      </div>
                    </CardContent>
                  </Card>
                  <Card className="border-none shadow-sm bg-gradient-to-br from-green-500/5 to-transparent">
                    <CardContent className="p-5 flex items-center justify-between">
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">مقدّمات تم تحصيلها</p>
                        <h3 className="text-2xl font-bold text-green-600">{depositCollected.toLocaleString()}</h3>
                      </div>
                      <div className="w-10 h-10 rounded-full bg-green-500/15 flex items-center justify-center text-green-600">
                        <Banknote className="w-5 h-5" />
                      </div>
                    </CardContent>
                  </Card>
                  <Card className="border-none shadow-sm bg-gradient-to-br from-blue-500/5 to-transparent">
                    <CardContent className="p-5 flex items-center justify-between">
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">مبالغ نهائية تم تحصيلها</p>
                        <h3 className="text-2xl font-bold text-blue-600">{finalCollected.toLocaleString()}</h3>
                      </div>
                      <div className="w-10 h-10 rounded-full bg-blue-500/15 flex items-center justify-center text-blue-600">
                        <CheckCircle className="w-5 h-5" />
                      </div>
                    </CardContent>
                  </Card>
                  <Card className="border-none shadow-sm bg-gradient-to-br from-orange-500/5 to-transparent">
                    <CardContent className="p-5 flex items-center justify-between">
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">مقدّمات لم تُحصَّل بعد</p>
                        <h3 className="text-2xl font-bold text-orange-500">{pendingDeposits.toLocaleString()}</h3>
                      </div>
                      <div className="w-10 h-10 rounded-full bg-orange-500/15 flex items-center justify-center text-orange-500">
                        <Clock className="w-5 h-5" />
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle>تفاصيل مالية لكل طلب</CardTitle>
                    <CardDescription>عرض المبالغ والمقدّمات والمستحقات لكل طلب</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>رقم</TableHead>
                            <TableHead>العميل</TableHead>
                            <TableHead>الموقع</TableHead>
                            <TableHead>إجمالي</TableHead>
                            <TableHead>المقدّم</TableHead>
                            <TableHead>المتبقي</TableHead>
                            <TableHead>الحالة المالية</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {allOrders.filter(o => o.totalAmount).map(order => {
                            const pct = order.depositPercentage ?? 50;
                            const deposit = (order.totalAmount! * pct) / 100;
                            const remaining = order.totalAmount! - deposit;
                            const fullyPaid = order.depositPaid && order.finalPaid;
                            const partiallyPaid = order.depositPaid && !order.finalPaid;
                            return (
                              <TableRow key={order.id}>
                                <TableCell className="font-medium">#{order.id}</TableCell>
                                <TableCell>{order.user.fullName}</TableCell>
                                <TableCell>{order.siteName}</TableCell>
                                <TableCell className="font-bold">{order.totalAmount?.toLocaleString()} {order.currency}</TableCell>
                                <TableCell>
                                  <span className={order.depositPaid ? "text-green-600 font-semibold" : "text-muted-foreground"}>
                                    {deposit.toFixed(0)} {order.currency}
                                    {order.depositPaid ? " ✓" : ""}
                                  </span>
                                </TableCell>
                                <TableCell>
                                  <span className={order.finalPaid ? "text-green-600 font-semibold" : "text-muted-foreground"}>
                                    {remaining.toFixed(0)} {order.currency}
                                    {order.finalPaid ? " ✓" : ""}
                                  </span>
                                </TableCell>
                                <TableCell>
                                  {fullyPaid ? (
                                    <Badge className="bg-green-100 text-green-700 border-green-200">مدفوع بالكامل</Badge>
                                  ) : partiallyPaid ? (
                                    <Badge className="bg-blue-100 text-blue-700 border-blue-200">دُفع المقدّم</Badge>
                                  ) : (
                                    <Badge variant="outline">لم يُدفع</Badge>
                                  )}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                          {allOrders.filter(o => o.totalAmount).length === 0 && (
                            <TableRow>
                              <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">لا توجد طلبات بمبالغ محددة</TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              </>
            );
          })()}
        </TabsContent>

        <TabsContent value="orders" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>إدارة الطلبات</CardTitle>
              <CardDescription>عرض وتحديث حالة جميع طلبات المواقع</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16">رقم</TableHead>
                      <TableHead>العميل</TableHead>
                      <TableHead>الموقع</TableHead>
                      <TableHead>التاريخ</TableHead>
                      <TableHead>المبلغ الإجمالي</TableHead>
                      <TableHead>نسبة المقدم</TableHead>
                      <TableHead>المقدم</TableHead>
                      <TableHead>الحالة</TableHead>
                      <TableHead>الدفع (مقدم / متبقي)</TableHead>
                      <TableHead className="w-14">حذف</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orders?.map(order => {
                      const isEditingThis = editingAmount?.orderId === order.id;
                      const isEditingPct = editingPercent?.orderId === order.id;
                      const pct = order.depositPercentage ?? 50;
                      const deposit = order.totalAmount ? (order.totalAmount * pct) / 100 : null;
                      return (
                        <TableRow key={order.id}>
                          <TableCell className="font-medium">#{order.id}</TableCell>
                          <TableCell>{order.user.fullName}</TableCell>
                          <TableCell>
                            <div className="flex flex-col">
                              <span className="font-semibold">{order.siteName}</span>
                              <span className="text-xs text-muted-foreground">{order.siteType}</span>
                            </div>
                          </TableCell>
                          <TableCell>{format(new Date(order.createdAt), "dd/MM/yyyy")}</TableCell>
                          <TableCell>
                            {isEditingThis ? (
                              <div className="flex items-center gap-1">
                                <Input
                                  type="number"
                                  min="0"
                                  className="w-28 h-8 text-sm"
                                  value={editingAmount.value}
                                  onChange={e => setEditingAmount({ orderId: order.id, value: e.target.value })}
                                  onKeyDown={e => {
                                    if (e.key === "Enter") handleSaveAmount(order.id);
                                    if (e.key === "Escape") setEditingAmount(null);
                                  }}
                                  autoFocus
                                />
                                <Button size="icon" variant="ghost" className="h-8 w-8 text-green-600" onClick={() => handleSaveAmount(order.id)}>
                                  <Check className="h-4 w-4" />
                                </Button>
                                <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => setEditingAmount(null)}>
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <span className="font-semibold">
                                  {order.totalAmount ? `${order.totalAmount} ${order.currency}` : <span className="text-muted-foreground text-xs">غير محدد</span>}
                                </span>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7 text-muted-foreground hover:text-primary"
                                  onClick={() => setEditingAmount({ orderId: order.id, value: String(order.totalAmount ?? "") })}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            {isEditingPct ? (
                              <div className="flex items-center gap-1">
                                <Input
                                  type="number"
                                  min="0"
                                  max="100"
                                  className="w-20 h-8 text-sm"
                                  value={editingPercent.value}
                                  onChange={e => setEditingPercent({ orderId: order.id, value: e.target.value })}
                                  onKeyDown={e => {
                                    if (e.key === "Enter") handleSavePercent(order.id);
                                    if (e.key === "Escape") setEditingPercent(null);
                                  }}
                                  autoFocus
                                />
                                <span className="text-sm">%</span>
                                <Button size="icon" variant="ghost" className="h-8 w-8 text-green-600" onClick={() => handleSavePercent(order.id)}>
                                  <Check className="h-4 w-4" />
                                </Button>
                                <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => setEditingPercent(null)}>
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1">
                                <span className="font-semibold">{pct}%</span>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7 text-muted-foreground hover:text-primary"
                                  onClick={() => setEditingPercent({ orderId: order.id, value: String(pct) })}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            {deposit !== null ? (
                              <span className="font-semibold text-primary">{deposit.toFixed(0)} {order.currency}</span>
                            ) : (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Select 
                              defaultValue={order.status} 
                              onValueChange={(val) => handleUpdateOrderStatus(order.id, val)}
                            >
                              <SelectTrigger className="w-[140px] h-8">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="pending">قيد الانتظار</SelectItem>
                                <SelectItem value="in_progress">جاري التنفيذ</SelectItem>
                                <SelectItem value="completed">مكتمل</SelectItem>
                                <SelectItem value="cancelled">ملغي</SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-4">
                              <div className="flex items-center gap-1">
                                <Switch 
                                  checked={order.depositPaid} 
                                  onCheckedChange={(val) => handleUpdateOrderPayment(order.id, "depositPaid", val)} 
                                />
                                <Label className="text-xs text-muted-foreground">مقدم</Label>
                              </div>
                              <div className="flex items-center gap-1">
                                <Switch 
                                  checked={order.finalPaid} 
                                  onCheckedChange={(val) => handleUpdateOrderPayment(order.id, "finalPaid", val)} 
                                />
                                <Label className="text-xs text-muted-foreground">متبقي</Label>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Button variant="destructive" size="icon" onClick={() => handleDeleteOrder(order.id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {(!orders || orders.length === 0) && (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                          لا توجد طلبات
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="users">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>المستخدمين</CardTitle>
                <CardDescription>إدارة المستخدمين وصلاحياتهم</CardDescription>
              </div>
              <Dialog open={createAdminOpen} onOpenChange={setCreateAdminOpen}>
                <DialogTrigger asChild>
                  <Button size="sm"><UserPlus className="h-4 w-4 ms-2" /> إضافة أدمن جديد</Button>
                </DialogTrigger>
                <DialogContent className="max-w-md" dir="rtl">
                  <DialogHeader>
                    <DialogTitle>إنشاء حساب أدمن جديد</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleCreateAdmin} className="space-y-4 mt-2">
                    <div className="space-y-1">
                      <Label>الاسم الكامل</Label>
                      <Input value={adminForm.fullName} onChange={e => setAdminForm(f => ({...f, fullName: e.target.value}))} required placeholder="أدخل الاسم الكامل" />
                    </div>
                    <div className="space-y-1">
                      <Label>رقم الهاتف</Label>
                      <Input value={adminForm.phone} onChange={e => setAdminForm(f => ({...f, phone: e.target.value}))} required placeholder="أدخل رقم الهاتف" />
                    </div>
                    <div className="space-y-1">
                      <Label>البريد الإلكتروني</Label>
                      <Input type="email" value={adminForm.email} onChange={e => setAdminForm(f => ({...f, email: e.target.value}))} required placeholder="أدخل البريد الإلكتروني" />
                    </div>
                    <div className="space-y-1">
                      <Label>اسم المستخدم</Label>
                      <Input value={adminForm.username} onChange={e => setAdminForm(f => ({...f, username: e.target.value}))} required placeholder="أدخل اسم المستخدم" />
                    </div>
                    <div className="space-y-1">
                      <Label>كلمة المرور</Label>
                      <Input type="password" value={adminForm.password} onChange={e => setAdminForm(f => ({...f, password: e.target.value}))} required placeholder="كلمة مرور قوية (6 أحرف على الأقل)" />
                    </div>
                    <Button type="submit" className="w-full" disabled={adminFormLoading}>
                      {adminFormLoading ? "جاري الإنشاء..." : "إنشاء الحساب"}
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
               <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>الاسم</TableHead>
                      <TableHead>البريد</TableHead>
                      <TableHead>رقم الهاتف</TableHead>
                      <TableHead>الصلاحية</TableHead>
                      <TableHead>إجراءات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users?.map(user => (
                      <TableRow key={user.id}>
                        <TableCell className="font-medium">{user.fullName}</TableCell>
                        <TableCell>{user.email}</TableCell>
                        <TableCell>{user.phone}</TableCell>
                        <TableCell>
                          <Badge variant={user.role === 'admin' ? "default" : "secondary"}>
                            {user.role === 'admin' ? 'مدير' : 'مستخدم'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="icon"
                              title={user.role === 'admin' ? 'تحويل لمستخدم' : 'ترقية لمدير'}
                              onClick={() => handleToggleRole(user.id, user.role)}
                            >
                              {user.role === 'admin' ? <ShieldOff className="h-4 w-4 text-orange-500" /> : <ShieldCheck className="h-4 w-4 text-green-600" />}
                            </Button>
                            <Button variant="destructive" size="icon" onClick={() => handleDeleteUser(user.id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="packages">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>الباقات</CardTitle>
                <CardDescription>إدارة باقات تصميم المواقع</CardDescription>
              </div>
              <Button disabled><Plus className="h-4 w-4 ms-2"/> إضافة باقة (قريباً)</Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>اسم الباقة</TableHead>
                    <TableHead>السعر (مصر / سعودية)</TableHead>
                    <TableHead>الحالة</TableHead>
                    <TableHead>إجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {packages?.map(pkg => (
                    <TableRow key={pkg.id}>
                      <TableCell className="font-medium">{pkg.name}</TableCell>
                      <TableCell>{pkg.priceEgp} EGP / {pkg.priceSar} SAR</TableCell>
                      <TableCell>
                        <Badge variant={pkg.isActive ? "default" : "outline"}>
                          {pkg.isActive ? 'مفعلة' : 'غير مفعلة'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button variant="destructive" size="icon" onClick={() => handleDeletePackage(pkg.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payment-methods">
          <Dialog open={pmDialogOpen} onOpenChange={setPmDialogOpen}>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>طرق الدفع</CardTitle>
                  <CardDescription>إدارة طرق الدفع المتاحة للعملاء عند إتمام الطلب</CardDescription>
                </div>
                <Button size="sm" onClick={openAddPm}>
                  <Plus className="h-4 w-4 ms-2" /> إضافة طريقة دفع
                </Button>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>اسم الطريقة</TableHead>
                      <TableHead>التفاصيل</TableHead>
                      <TableHead>الحالة</TableHead>
                      <TableHead>إجراءات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paymentMethods?.map(pm => (
                      <TableRow key={pm.id}>
                        <TableCell className="font-bold">{pm.name}</TableCell>
                        <TableCell className="max-w-md text-sm text-muted-foreground">{pm.details}</TableCell>
                        <TableCell>
                          <Badge variant={pm.isActive ? "default" : "outline"}>
                            {pm.isActive ? 'مفعّلة' : 'غير مفعّلة'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Button variant="outline" size="icon" title="تعديل" onClick={() => openEditPm(pm)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="destructive" size="icon" onClick={() => handleDeletePaymentMethod(pm.id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {(!paymentMethods || paymentMethods.length === 0) && (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                          لا توجد طرق دفع — اضغط "إضافة طريقة دفع" للبدء
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <DialogContent className="max-w-md" dir="rtl">
              <DialogHeader>
                <DialogTitle>{pmEditTarget ? "تعديل طريقة الدفع" : "إضافة طريقة دفع جديدة"}</DialogTitle>
                <DialogDescription>
                  {pmEditTarget ? "عدّل تفاصيل طريقة الدفع ثم احفظ التغييرات." : "أدخل اسم طريقة الدفع وتفاصيلها ليراها العملاء عند إتمام الطلب."}
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSavePm} className="space-y-4 mt-2">
                <div className="space-y-1.5">
                  <Label>اسم الطريقة</Label>
                  <Input
                    value={pmForm.name}
                    onChange={e => setPmForm(f => ({ ...f, name: e.target.value }))}
                    required
                    placeholder="مثال: فودافون كاش، إنستاباي، تحويل بنكي..."
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>التفاصيل والمعلومات</Label>
                  <textarea
                    value={pmForm.details}
                    onChange={e => setPmForm(f => ({ ...f, details: e.target.value }))}
                    required
                    placeholder="أدخل تفاصيل الدفع (رقم المحفظة، رقم الحساب، اسم المستلم...)"
                    rows={4}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
                  />
                </div>
                <div className="flex items-center gap-3">
                  <Switch
                    id="pm-active"
                    checked={pmForm.isActive}
                    onCheckedChange={val => setPmForm(f => ({ ...f, isActive: val }))}
                  />
                  <Label htmlFor="pm-active" className="cursor-pointer">
                    {pmForm.isActive ? "مفعّلة (تظهر للعملاء)" : "غير مفعّلة (مخفية)"}
                  </Label>
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={createPaymentMethod.isPending || updatePaymentMethod.isPending}
                >
                  {createPaymentMethod.isPending || updatePaymentMethod.isPending
                    ? "جاري الحفظ..."
                    : pmEditTarget ? "حفظ التعديلات" : "إضافة طريقة الدفع"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </TabsContent>

        <TabsContent value="testimonials">
          <Card>
            <CardHeader>
              <CardTitle>آراء العملاء</CardTitle>
              <CardDescription>آراء تُرسل من الموقع — وافق عليها أو احذفها. الآراء غير المفعّلة لا تظهر للزوار.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>العميل</TableHead>
                    <TableHead>التقييم</TableHead>
                    <TableHead>الرأي</TableHead>
                    <TableHead>الحالة</TableHead>
                    <TableHead>إجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {testimonials?.map(t => (
                    <TableRow key={t.id} className={!t.isActive ? "bg-muted/30" : ""}>
                      <TableCell className="font-medium">{t.clientName}</TableCell>
                      <TableCell>
                        <div className="flex gap-0.5">
                          {Array.from({ length: 5 }).map((_, j) => (
                            <span key={j} className={`text-sm ${j < t.rating ? "text-yellow-400" : "text-muted-foreground"}`}>★</span>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-xs truncate">{t.comment}</TableCell>
                      <TableCell>
                        <Badge variant={t.isActive ? "default" : "outline"}>
                          {t.isActive ? 'منشور' : 'بانتظار الموافقة'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="icon"
                            title={t.isActive ? "إيقاف النشر" : "نشر الرأي"}
                            onClick={() => handleToggleTestimonial(t.id, t.isActive)}
                          >
                            {t.isActive
                              ? <ToggleRight className="h-4 w-4 text-green-600" />
                              : <ToggleLeft className="h-4 w-4 text-muted-foreground" />}
                          </Button>
                          <Button variant="destructive" size="icon" onClick={() => handleDeleteTestimonial(t.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {(!testimonials || testimonials.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">لا توجد آراء</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings">
          <div className="max-w-md">
            <Card>
              <CardHeader>
                <CardTitle>تغيير كلمة المرور</CardTitle>
                <CardDescription>يمكنك تغيير كلمة مرور حسابك من هنا</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleChangePassword} className="space-y-4">
                  <div className="space-y-1">
                    <Label>كلمة المرور الجديدة</Label>
                    <div className="relative">
                      <Input
                        type={showNewPw ? "text" : "password"}
                        value={pwForm.newPassword}
                        onChange={e => setPwForm(f => ({ ...f, newPassword: e.target.value }))}
                        required
                        placeholder="أدخل كلمة المرور الجديدة"
                        className="pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPw(v => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        tabIndex={-1}
                      >
                        {showNewPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label>تأكيد كلمة المرور</Label>
                    <div className="relative">
                      <Input
                        type={showConfirmPw ? "text" : "password"}
                        value={pwForm.confirm}
                        onChange={e => setPwForm(f => ({ ...f, confirm: e.target.value }))}
                        required
                        placeholder="أعد إدخال كلمة المرور الجديدة"
                        className="pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPw(v => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        tabIndex={-1}
                      >
                        {showConfirmPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <Button type="submit" disabled={pwLoading} className="w-full">
                    {pwLoading ? "جاري الحفظ..." : "حفظ كلمة المرور"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
