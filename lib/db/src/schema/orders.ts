import { pgTable, text, serial, timestamp, integer, real, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const ordersTable = pgTable("orders", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  siteName: text("site_name").notNull(),
  siteType: text("site_type").notNull(),
  details: text("details").notNull(),
  packageId: integer("package_id"),
  customBudget: real("custom_budget"),
  currency: text("currency").notNull().default("EGP"),
  paymentMethodId: integer("payment_method_id"),
  status: text("status").notNull().default("pending"),
  depositPaid: boolean("deposit_paid").notNull().default(false),
  finalPaid: boolean("final_paid").notNull().default(false),
  totalAmount: real("total_amount"),
  depositPercentage: real("deposit_percentage").notNull().default(50),
  notes: text("notes"),
  receiptUrl: text("receipt_url"),
  finalReceiptUrl: text("final_receipt_url"),
  deliveredUrl: text("delivered_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertOrderSchema = createInsertSchema(ordersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof ordersTable.$inferSelect;
