ALTER TABLE IF EXISTS "certificate_issues"
  ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone;

DO $$
BEGIN
  IF to_regclass('public.certificate_issues') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS "certificate_issues_status_deleted_at_idx"
      ON "certificate_issues" ("status", "deleted_at");
  END IF;
END $$;
