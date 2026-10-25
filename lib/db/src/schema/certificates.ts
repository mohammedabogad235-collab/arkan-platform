import { pgTable, serial, text, timestamp, boolean, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const certificateTemplatesTable = pgTable("certificate_templates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  orientation: text("orientation").notNull().default("landscape"),
  width: integer("width").notNull().default(1200),
  height: integer("height").notNull().default(800),
  backgroundUrl: text("background_url"),
  logoUrl: text("logo_url"),
  signatureUrl: text("signature_url"),
  partnerLogos: text("partner_logos"),
  layoutConfig: jsonb("layout_config").notNull().default({}),
  isActive: boolean("is_active").notNull().default(true),
  createdBy: integer("created_by").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const certificateIssuesTable = pgTable("certificate_issues", {
  id: serial("id").primaryKey(),
  templateId: integer("template_id").notNull().references(() => certificateTemplatesTable.id, { onDelete: "cascade" }),
  serialNumber: text("serial_number").notNull().unique(),
  validationUrl: text("validation_url").notNull(),
  recipientName: text("recipient_name").notNull(),
  recipientEmail: text("recipient_email"),
  recipientPhone: text("recipient_phone"),
  programTitle: text("program_title").notNull(),
  description: text("description"),
  issuerName: text("issuer_name").notNull().default("Arkan Web"),
  signatureName: text("signature_name"),
  signatureTitle: text("signature_title"),
  issueDate: timestamp("issue_date", { withTimezone: true }).notNull().defaultNow(),
  status: text("status").notNull().default("issued"),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  metadata: jsonb("metadata").notNull().default({}),
  qrCodeUrl: text("qr_code_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const certificatePartnersTable = pgTable("certificate_partners", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  logoUrl: text("logo_url"),
  signatureUrl: text("signature_url"),
  signatureName: text("signature_name"),
  signatureTitle: text("signature_title"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const certificateVerifySettingsTable = pgTable("certificate_verify_settings", {
  id: integer("id").primaryKey().default(1),
  settings: jsonb("settings").notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertCertificateTemplateSchema = createInsertSchema(certificateTemplatesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCertificateIssueSchema = createInsertSchema(certificateIssuesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  validationUrl: true,
  serialNumber: true,
  issueDate: true,
});

export type InsertCertificateTemplate = z.infer<typeof insertCertificateTemplateSchema>;
export type InsertCertificateIssue = z.infer<typeof insertCertificateIssueSchema>;
export type CertificateTemplate = typeof certificateTemplatesTable.$inferSelect;
export type CertificateIssue = typeof certificateIssuesTable.$inferSelect;
