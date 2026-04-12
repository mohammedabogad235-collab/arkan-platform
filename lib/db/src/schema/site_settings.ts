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
});

export type SiteSettings = typeof siteSettingsTable.$inferSelect;
