import type { Request } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";

export async function hasAdminPermission(
  req: Request,
  requiredPermissions: string[] = [],
): Promise<boolean> {
  const userId = req.session?.userId;
  if (typeof userId !== "number" || !Number.isInteger(userId) || userId < 1) return false;

  const [user] = await db.select({
    role: usersTable.role,
    permissions: usersTable.permissions,
    isActive: usersTable.isActive,
  }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);

  if (!user?.isActive) return false;
  if (user.role === "admin") return true;
  if (user.role !== "subadmin" || requiredPermissions.length === 0 || !user.permissions) return false;

  try {
    const permissions: unknown = JSON.parse(user.permissions);
    return Array.isArray(permissions) && requiredPermissions.some((permission) => permissions.includes(permission));
  } catch {
    return false;
  }
}
