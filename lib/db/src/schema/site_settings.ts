import { pgTable, serial, text } from "drizzle-orm/pg-core";

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
});

export type SiteSettings = typeof siteSettingsTable.$inferSelect;
