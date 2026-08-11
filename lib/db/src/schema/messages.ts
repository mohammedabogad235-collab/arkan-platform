import { pgTable, serial, integer, text, boolean, timestamp } from "drizzle-orm/pg-core";
// تأكد إنك عامل استيراد لـ boolean من drizzle-orm/pg-core في أول الملف
// import { boolean } from "drizzle-orm/pg-core";

export const messagesTable = pgTable("messages", {
  id: serial("id").primaryKey(),
  senderId: integer("sender_id").notNull(),
  receiverId: integer("receiver_id").notNull(),
  content: text("content").notNull(),
  isRead: boolean("is_read").default(false).notNull(),
  
  // 👇 ضيف السطرين دول هنا بالظبط 👇
  isEdited: boolean("is_edited").default(false).notNull(),
  isDeleted: boolean("is_deleted").default(false).notNull(),
  // 👆 ======================= 👆

  createdAt: timestamp("created_at").defaultNow().notNull(),
});