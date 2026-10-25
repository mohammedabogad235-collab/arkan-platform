import { Router, type IRouter } from "express";
import { eq, count, sum } from "drizzle-orm";
import { db, usersTable, ordersTable } from "@workspace/db";
import { hasAdminPermission } from "../lib/access-control";

const router: IRouter = Router();

router.get("/admin/stats", async (req, res): Promise<void> => {
  if (!(await hasAdminPermission(req, ["overview"]))) {
    res.status(403).json({ error: "غير مصرح" });
    return;
  }

  const [totalUsersResult] = await db.select({ count: count() }).from(usersTable);
  const [totalOrdersResult] = await db.select({ count: count() }).from(ordersTable);
  const [pendingResult] = await db.select({ count: count() }).from(ordersTable).where(eq(ordersTable.status, "pending"));
  const [completedResult] = await db.select({ count: count() }).from(ordersTable).where(eq(ordersTable.status, "completed"));
  const [inProgressResult] = await db.select({ count: count() }).from(ordersTable).where(eq(ordersTable.status, "in_progress"));
  const [revenueResult] = await db.select({ total: sum(ordersTable.totalAmount) }).from(ordersTable).where(eq(ordersTable.status, "completed"));

  res.json({
    totalUsers: totalUsersResult?.count ?? 0,
    totalOrders: totalOrdersResult?.count ?? 0,
    pendingOrders: pendingResult?.count ?? 0,
    completedOrders: completedResult?.count ?? 0,
    inProgressOrders: inProgressResult?.count ?? 0,
    totalRevenue: parseFloat(revenueResult?.total ?? "0") || 0,
  });
});

export default router;
