import { Router, type IRouter } from "express";
import { and, eq, or, desc } from "drizzle-orm";
import {
  db,
  usersTable,
  messagesTable,
  notificationsTable,
} from "@workspace/db";
import { sendChatReplyEmail } from "../lib/mailer";
import { asyncHandler } from "../lib/http";

const router: IRouter = Router();

export function getSession(req: any): { userId?: number; role?: string } {
  const sessionRole = req.session?.role || req.user?.role;
  const sessionUserId = req.session?.userId || req.user?.id || req.user?.userId;
  
  return {
    userId: sessionUserId as number | undefined,
    role: sessionRole as string | undefined,
  };
}

function parseStoredPermissions(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed)
        ? parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
        : [];
    } catch {
      return [];
    }
  }
  return [];
}

async function checkPermission(req: any, permission: "canViewMessages" | "canReplyMessages"): Promise<boolean> {
  const { userId, role } = getSession(req);
  if (!userId) return false;
  if (role === "admin") return true; 
  if (role === "subadmin") {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    const storedPermissions = parseStoredPermissions((user as any)?.permissions);
    const permissionAliases = permission === "canViewMessages"
      ? ["view_messages", "messages"]
      : ["reply_messages"];

    return Boolean((user as any)?.[permission]) || permissionAliases.some((alias) => storedPermissions.includes(alias));
  }
  return false;
}

// جلب قائمة العملاء للإدارة
router.get("/admin/chat-users", asyncHandler(async (req, res): Promise<void> => {
  const hasAccess = await checkPermission(req, "canViewMessages");
  if (!hasAccess) { res.status(403).json({ error: "غير مصرح لك برؤية الرسائل" }); return; }

  const clients = await db.select().from(usersTable).where(
    or(eq(usersTable.role, "user"), eq(usersTable.role, "client"))
  );
  
  const unreadMessages = await db.select().from(messagesTable).where(eq(messagesTable.isRead, false));

  const formattedClients = (Array.isArray(clients) ? clients : []).map(c => {
    const count = (Array.isArray(unreadMessages) ? unreadMessages : []).filter(m => m.senderId === c.id).length;
    return {
      id: c.id,
      fullName: c.fullName,
      email: c.email,
      unreadCount: count 
    };
  });

  formattedClients.sort((a, b) => b.unreadCount - a.unreadCount || b.id - a.id);
  res.json(formattedClients);
}));

router.get("/messages/unread-count", asyncHandler(async (req, res): Promise<void> => {
  const { userId } = getSession(req);
  if (!userId) { res.json({ unreadCount: 0 }); return; }

  const count = await db.select({ id: messagesTable.id })
    .from(messagesTable)
    .where(and(eq(messagesTable.receiverId, userId), eq(messagesTable.isRead, false)));

  res.json({ unreadCount: count.length });
}));

router.get(["/messages", "/messages/:userId"], asyncHandler(async (req, res): Promise<void> => {
  const { userId: sessionUserId, role } = getSession(req);
  if (!sessionUserId) { res.status(401).json({ error: "غير مصرح" }); return; }

  let targetUserId = sessionUserId; 

  if (role === "admin" || role === "subadmin") {
    const hasAccess = await checkPermission(req, "canViewMessages");
    if (!hasAccess) { res.status(403).json({ error: "غير مصرح لك برؤية الرسائل" }); return; }
    if (req.params.userId) {
      targetUserId = parseInt(req.params.userId as string, 10);
    }
  }

  const allUserMsgsRaw = await db.select({
    id: messagesTable.id,
    senderId: messagesTable.senderId,
    receiverId: messagesTable.receiverId,
    content: messagesTable.content,
    isRead: messagesTable.isRead,
    isEdited: messagesTable.isEdited,
    isDeleted: messagesTable.isDeleted,
    createdAt: messagesTable.createdAt,
    senderRole: usersTable.role,
  })
  .from(messagesTable)
  .leftJoin(usersTable, eq(messagesTable.senderId, usersTable.id))
  .where(
    or(
      eq(messagesTable.senderId, targetUserId),
      eq(messagesTable.receiverId, targetUserId)
    )
  )
  .orderBy(messagesTable.createdAt);

  if (role === "admin" || role === "subadmin") {
    await db.update(messagesTable)
      .set({ isRead: true })
      .where(and(eq(messagesTable.senderId, targetUserId), eq(messagesTable.isRead, false)));
  } else {
    await db.update(messagesTable)
      .set({ isRead: true })
      .where(and(eq(messagesTable.receiverId, sessionUserId), eq(messagesTable.isRead, false)));
  }

  res.json(allUserMsgsRaw);
}));

router.post("/messages", asyncHandler(async (req, res): Promise<void> => {
  const { userId: senderId, role } = getSession(req);
  if (!senderId) { res.status(401).json({ error: "غير مصرح" }); return; }

  const { receiverId, content } = req.body;
  if (!content) { res.status(400).json({ error: "محتوى الرسالة مطلوب" }); return; }

  const isAdminUser = role === "admin" || role === "subadmin";
  
  if (isAdminUser) {
    const hasAccess = await checkPermission(req, "canReplyMessages");
    if (!hasAccess) { res.status(403).json({ error: "ليس لديك صلاحية للرد على الرسائل" }); return; }
  }

  let actualReceiverId = receiverId ? Number(receiverId) : null;

  if (!isAdminUser || !actualReceiverId) {
    const adminUser = await db.select().from(usersTable).where(or(eq(usersTable.role, "admin"), eq(usersTable.role, "subadmin"))).limit(1);
    if (adminUser && adminUser.length > 0) {
      actualReceiverId = adminUser[0].id;
    } else {
      actualReceiverId = 1;
    }
  }

  const [newMessage] = await db.insert(messagesTable).values({
    senderId,
    receiverId: actualReceiverId,
    content,
    isRead: false,
  } as any).returning();

  if (isAdminUser) {
    await db.insert(notificationsTable).values({
      userId: actualReceiverId,
      message: "تم الرد على استفسارك من الإدارة",
      isRead: false,
    } as any);

    const [client] = await db.select().from(usersTable).where(eq(usersTable.id, actualReceiverId));
    if (client) {
      sendChatReplyEmail(client.email, client.fullName, content).catch(err => console.error("Email error", err));
    }
  } else {
    await db.insert(notificationsTable).values({
      userId: actualReceiverId, 
      message: "توجد رسالة جديدة من أحد العملاء",
      isRead: false,
    } as any);
  }

  res.status(201).json(newMessage);
}));

// تعديل رسالة (يسمح لصاحب الرسالة أو الأدمن/المشرف بالتعديل)
router.patch("/messages/:id", asyncHandler(async (req, res): Promise<void> => {
  const { userId, role } = getSession(req);
  if (!userId) { res.status(401).json({ error: "غير مصرح" }); return; }
  
  const msgId = parseInt(req.params.id as string, 10);
  const { content } = req.body;
  if (!content) { res.status(400).json({ error: "المحتوى مطلوب" }); return; }

  const [msg] = await db.select().from(messagesTable).where(eq(messagesTable.id, msgId));
  if (!msg) { res.status(404).json({ error: "الرسالة غير موجودة" }); return; }
  
  const isAdmin = role === "admin" || role === "subadmin";
  if (msg.senderId !== userId && !isAdmin) { 
    res.status(403).json({ error: "ليس لديك صلاحية لتعديل هذه الرسالة" }); 
    return; 
  }
  if ((msg as any).isDeleted) { res.status(400).json({ error: "لا يمكن تعديل رسالة محذوفة" }); return; }

  await db.update(messagesTable).set({ content, isEdited: true } as any).where(eq(messagesTable.id, msgId));
  res.json({ success: true });
}));

// حذف رسالة (يسمح لصاحب الرسالة أو الأدمن/المشرف بالحذف)
router.delete("/messages/:id", asyncHandler(async (req, res): Promise<void> => {
  const { userId, role } = getSession(req);
  if (!userId) { res.status(401).json({ error: "غير مصرح" }); return; }
  
  const msgId = parseInt(req.params.id as string, 10);

  const [msg] = await db.select().from(messagesTable).where(eq(messagesTable.id, msgId));
  if (!msg) { res.status(404).json({ error: "الرسالة غير موجودة" }); return; }
  
  const isAdmin = role === "admin" || role === "subadmin";
  if (msg.senderId !== userId && !isAdmin) { 
    res.status(403).json({ error: "ليس لديك صلاحية لحذف هذه الرسالة" }); 
    return; 
  }

  await db.update(messagesTable).set({ isDeleted: true, content: "" } as any).where(eq(messagesTable.id, msgId));
  res.json({ success: true });
}));

export default router;
