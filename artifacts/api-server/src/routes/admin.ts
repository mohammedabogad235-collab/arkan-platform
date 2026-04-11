import { Router, type IRouter } from "express";
import { eq, count, sum } from "drizzle-orm";
import { db, usersTable, ordersTable, packagesTable, paymentMethodsTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/admin/stats", async (_req, res): Promise<void> => {
  const [totalUsersResult] = await db.select({ count: count() }).from(usersTable);
  const [totalOrdersResult] = await db.select({ count: count() }).from(ordersTable);
  const [pendingResult] = await db.select({ count: count() }).from(ordersTable).where(eq(ordersTable.status, "pending"));
  const [completedResult] = await db.select({ count: count() }).from(ordersTable).where(eq(ordersTable.status, "completed"));
  const [inProgressResult] = await db.select({ count: count() }).from(ordersTable).where(eq(ordersTable.status, "in_progress"));
  const [revenueResult] = await db.select({ total: sum(ordersTable.totalAmount) }).from(ordersTable).where(eq(ordersTable.status, "completed"));

  const recentOrdersRaw = await db.select().from(ordersTable).orderBy(ordersTable.createdAt).limit(10);

  const recentOrders = await Promise.all(recentOrdersRaw.map(async (order) => {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, order.userId));
    let pkg = null;
    let paymentMethod = null;

    if (order.packageId) {
      const [p] = await db.select().from(packagesTable).where(eq(packagesTable.id, order.packageId));
      if (p) pkg = { id: p.id, name: p.name, priceEgp: p.priceEgp, priceSar: p.priceSar };
    }

    if (order.paymentMethodId) {
      const [pm] = await db.select().from(paymentMethodsTable).where(eq(paymentMethodsTable.id, order.paymentMethodId));
      if (pm) paymentMethod = { id: pm.id, name: pm.name, details: pm.details };
    }

    return {
      ...order,
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
      user: user ? {
        id: user.id,
        fullName: user.fullName,
        phone: user.phone,
        email: user.email,
        username: user.username,
        role: user.role,
        createdAt: user.createdAt.toISOString(),
      } : null,
      package: pkg,
      paymentMethod,
    };
  }));

  res.json({
    totalUsers: totalUsersResult?.count ?? 0,
    totalOrders: totalOrdersResult?.count ?? 0,
    pendingOrders: pendingResult?.count ?? 0,
    completedOrders: completedResult?.count ?? 0,
    inProgressOrders: inProgressResult?.count ?? 0,
    totalRevenue: parseFloat(revenueResult?.total ?? "0") || 0,
    recentOrders,
  });
});

export default router;
