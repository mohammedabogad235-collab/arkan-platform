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

export const certificateBatchesTable = pgTable("certificate_batches", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  courseName: text("course_name").notNull(),
  certificateTitle: text("certificate_title").notNull(),
  category: text("category"),
  description: text("description"),
  courseHours: integer("course_hours"),
  startDate: timestamp("start_date", { withTimezone: true }),
  completionDate: timestamp("completion_date", { withTimezone: true }),
  issueDate: timestamp("issue_date", { withTimezone: true }).notNull().defaultNow(),
  instructorName: text("instructor_name"),
  organization: text("organization").notNull().default("Arkan Web"),
  partnerOrganization: text("partner_organization"),
  templateId: integer("template_id").references(() => certificateTemplatesTable.id),
  status: text("status").notNull().default("draft"),
  metadata: jsonb("metadata").notNull().default({}),
  createdBy: integer("created_by").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const certificateRecipientsTable = pgTable("certificate_recipients", {
  id: serial("id").primaryKey(),
  batchId: integer("batch_id").notNull().references(() => certificateBatchesTable.id, { onDelete: "cascade" }),
  fullName: text("full_name").notNull(),
  email: text("email"),
  certificateCode: text("certificate_code"),
  certificateIssueId: integer("certificate_issue_id").references(() => certificateIssuesTable.id),
  reservationStatus: text("reservation_status").notNull().default("available"),
  certificateStatus: text("certificate_status").notNull().default("pending"),
  verificationStatus: text("verification_status").notNull().default("pending"),
  emailStatus: text("email_status").notNull().default("pending"),
  issueDate: timestamp("issue_date", { withTimezone: true }),
  metadata: jsonb("metadata").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const certificateActivityLogsTable = pgTable("certificate_activity_logs", {
  id: serial("id").primaryKey(),
  batchId: integer("batch_id").references(() => certificateBatchesTable.id, { onDelete: "set null" }),
  recipientId: integer("recipient_id").references(() => certificateRecipientsTable.id, { onDelete: "set null" }),
  certificateIssueId: integer("certificate_issue_id").references(() => certificateIssuesTable.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  result: text("result").notNull(),
  details: jsonb("details").notNull().default({}),
  actorId: integer("actor_id").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const certificateEmailLogsTable = pgTable("certificate_email_logs", {
  id: serial("id").primaryKey(),
  batchId: integer("batch_id").references(() => certificateBatchesTable.id, { onDelete: "set null" }),
  recipientId: integer("recipient_id").references(() => certificateRecipientsTable.id, { onDelete: "set null" }),
  certificateIssueId: integer("certificate_issue_id").references(() => certificateIssuesTable.id, { onDelete: "set null" }),
  recipientEmail: text("recipient_email").notNull(),
  status: text("status").notNull().default("pending"),
  attemptNumber: integer("attempt_number").notNull().default(1),
  providerResponse: text("provider_response"),
  messageId: text("message_id"),
  failureReason: text("failure_reason"),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
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
