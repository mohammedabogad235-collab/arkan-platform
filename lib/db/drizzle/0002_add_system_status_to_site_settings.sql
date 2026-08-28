ALTER TABLE "site_settings" ADD COLUMN IF NOT EXISTS "web_maintenance_mode" boolean NOT NULL DEFAULT false;
ALTER TABLE "site_settings" ADD COLUMN IF NOT EXISTS "web_maintenance_message" text NOT NULL DEFAULT '';
ALTER TABLE "site_settings" ADD COLUMN IF NOT EXISTS "web_maintenance_end_time" text;
ALTER TABLE "site_settings" ADD COLUMN IF NOT EXISTS "web_show_app_alternative" boolean NOT NULL DEFAULT false;

ALTER TABLE "site_settings" ADD COLUMN IF NOT EXISTS "app_maintenance_mode" boolean NOT NULL DEFAULT false;
ALTER TABLE "site_settings" ADD COLUMN IF NOT EXISTS "app_update_required" boolean NOT NULL DEFAULT false;
ALTER TABLE "site_settings" ADD COLUMN IF NOT EXISTS "app_status_message" text NOT NULL DEFAULT '';
ALTER TABLE "site_settings" ADD COLUMN IF NOT EXISTS "app_maintenance_end_time" text;
ALTER TABLE "site_settings" ADD COLUMN IF NOT EXISTS "app_show_web_alternative" boolean NOT NULL DEFAULT false;
ALTER TABLE "site_settings" ADD COLUMN IF NOT EXISTS "app_update_link" text NOT NULL DEFAULT 'https://drive.google.com/drive/folders/1OrsQuXQyYC6ZFPxcvhPQ0p-Rh-TemxjO?usp=drive_link';

