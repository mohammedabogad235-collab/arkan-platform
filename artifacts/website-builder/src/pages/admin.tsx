import { useState } from "react";
import { 
  useGetAdminStats, 
  useListOrders, 
  useUpdateOrder,
  useListPackages,
  useListTestimonials,
  useListPaymentMethods,
  useListUsers,
  useDeleteUser,
  useCreatePackage,
  useUpdatePackage,
  useDeletePackage,
  useCreatePaymentMethod,
  useUpdatePaymentMethod,
  useDeletePaymentMethod,
  useCreateTestimonial,
  useUpdateTestimonial,
  useDeleteTestimonial
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users, ShoppingCart, DollarSign, CheckCircle, Trash2, Plus, Pencil, Check, X } from "lucide-react";
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
import { Label } from "@/components/ui/label";

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
  const { data: packages, isLoading: packagesLoading } = useListPackages();
  const { data: paymentMethods, isLoading: paymentMethodsLoading } = useListPaymentMethods();
  const { data: testimonials, isLoading: testimonialsLoading } = useListTestimonials();
  
  const updateOrder = useUpdateOrder();
  const deleteUser = useDeleteUser();
  const deletePackage = useDeletePackage();
  const deletePaymentMethod = useDeletePaymentMethod();
  const deleteTestimonial = useDeleteTestimonial();
  
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [editingAmount, setEditingAmount] = useState<{ orderId: number; value: string } | null>(null);

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
        <Card className="border-none shadow-md bg-gradient-to-br from-primary/5 to-transparent">
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
        <Card className="border-none shadow-md bg-gradient-to-br from-blue-500/5 to-transparent">
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
        <Card className="border-none shadow-md bg-gradient-to-br from-green-500/5 to-transparent">
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
        <Card className="border-none shadow-md bg-gradient-to-br from-orange-500/5 to-transparent">
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

      <Tabs defaultValue="orders" className="w-full">
        <TabsList className="grid w-full grid-cols-2 lg:grid-cols-5 mb-8 h-auto p-1 gap-2 bg-muted/50">
          <TabsTrigger value="orders" className="text-base h-10">الطلبات</TabsTrigger>
          <TabsTrigger value="users" className="text-base h-10">المستخدمين</TabsTrigger>
          <TabsTrigger value="packages" className="text-base h-10">الباقات</TabsTrigger>
          <TabsTrigger value="payment-methods" className="text-base h-10">طرق الدفع</TabsTrigger>
          <TabsTrigger value="testimonials" className="text-base h-10">الآراء</TabsTrigger>
        </TabsList>
        
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
                      <TableHead>المقدم (50%)</TableHead>
                      <TableHead>الحالة</TableHead>
                      <TableHead>الدفع (مقدم / متبقي)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orders?.map(order => {
                      const isEditingThis = editingAmount?.orderId === order.id;
                      const deposit = order.totalAmount ? order.totalAmount / 2 : null;
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
                            {deposit !== null ? (
                              <span className="font-semibold text-primary">{deposit} {order.currency}</span>
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
                        </TableRow>
                      );
                    })}
                    {(!orders || orders.length === 0) && (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
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
            <CardHeader>
              <CardTitle>المستخدمين</CardTitle>
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
                          <Button variant="destructive" size="icon" onClick={() => handleDeleteUser(user.id)} disabled={user.role === 'admin'}>
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

        <TabsContent value="packages">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>الباقات</CardTitle>
                <CardDescription>إدارة باقات تصميم المواقع</CardDescription>
              </div>
              <Button disabled><Plus className="h-4 w-4 mr-2"/> إضافة باقة (قريباً)</Button>
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
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>طرق الدفع</CardTitle>
                <CardDescription>إدارة طرق الدفع المتاحة للعملاء</CardDescription>
              </div>
              <Button disabled><Plus className="h-4 w-4 mr-2"/> إضافة طريقة دفع (قريباً)</Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>الاسم</TableHead>
                    <TableHead>التفاصيل</TableHead>
                    <TableHead>الحالة</TableHead>
                    <TableHead>إجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paymentMethods?.map(pm => (
                    <TableRow key={pm.id}>
                      <TableCell className="font-medium">{pm.name}</TableCell>
                      <TableCell className="max-w-md truncate">{pm.details}</TableCell>
                      <TableCell>
                        <Badge variant={pm.isActive ? "default" : "outline"}>
                          {pm.isActive ? 'مفعلة' : 'غير مفعلة'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button variant="destructive" size="icon" onClick={() => handleDeletePaymentMethod(pm.id)}>
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

        <TabsContent value="testimonials">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>آراء العملاء</CardTitle>
                <CardDescription>إدارة التقييمات والآراء</CardDescription>
              </div>
              <Button disabled><Plus className="h-4 w-4 mr-2"/> إضافة تقييم (قريباً)</Button>
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
                    <TableRow key={t.id}>
                      <TableCell className="font-medium">{t.clientName}</TableCell>
                      <TableCell>{t.rating} / 5</TableCell>
                      <TableCell className="max-w-xs truncate">{t.comment}</TableCell>
                      <TableCell>
                        <Badge variant={t.isActive ? "default" : "outline"}>
                          {t.isActive ? 'مفعل' : 'غير مفعل'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button variant="destructive" size="icon" onClick={() => handleDeleteTestimonial(t.id)}>
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
      </Tabs>
    </div>
  );
}
