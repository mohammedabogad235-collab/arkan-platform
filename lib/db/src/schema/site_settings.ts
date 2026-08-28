import { pgTable, serial, text, boolean, real } from "drizzle-orm/pg-core";

export const siteSettingsTable = pgTable("site_settings", {
  id: serial("id").primaryKey(),
  phone1: text("phone1").notNull().default(""),
  phone2: text("phone2").notNull().default(""),
  email: text("email").notNull().default(""),
  whatsapp: text("whatsapp").notNull().default(""),
  address: text("address").notNull().default(""),
  facebookUrl: text("facebook_url").notNull().default(""),
  instagramUrl: text("instagram_url").notNull().default(""),
  twitterUrl: text("twitter_url").notNull().default(""),
  requireDeposit: boolean("require_deposit").notNull().default(true),
  depositPercentageValue: real("deposit_percentage_value").notNull().default(50),
  termsAndConditions: text("terms_and_conditions").notNull().default(""),
  privacyPolicy: text("privacy_policy").notNull().default(""),
  emailUser: text("email_user").notNull().default(""),
  emailPass: text("email_pass").notNull().default(""),

  // ==========================================
  // 🛡️ System Status / Root Kill Switch
  // ==========================================

  // Web
  webMaintenanceMode: boolean("web_maintenance_mode").notNull().default(false),
  webMaintenanceMessage: text("web_maintenance_message").notNull().default(""),
  // ISO datetime string (varchar/text)
  webMaintenanceEndTime: text("web_maintenance_end_time"),
  webShowAppAlternative: boolean("web_show_app_alternative").notNull().default(false),

  // App (Native)
  appMaintenanceMode: boolean("app_maintenance_mode").notNull().default(false),
  appUpdateRequired: boolean("app_update_required").notNull().default(false),
  appStatusMessage: text("app_status_message").notNull().default(""),
  // ISO datetime string (varchar/text)
  appMaintenanceEndTime: text("app_maintenance_end_time"),
  appShowWebAlternative: boolean("app_show_web_alternative").notNull().default(false),
  appUpdateLink: text("app_update_link")
    .notNull()
    .default("https://drive.google.com/drive/folders/1OrsQuXQyYC6ZFPxcvhPQ0p-Rh-TemxjO?usp=drive_link"),
});

export type SiteSettings = typeof siteSettingsTable.$inferSelect;
