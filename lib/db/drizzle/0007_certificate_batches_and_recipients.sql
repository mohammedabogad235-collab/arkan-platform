CREATE TABLE IF NOT EXISTS "certificate_batches" (
  "id" serial PRIMARY KEY,
  "name" text NOT NULL,
  "course_name" text NOT NULL,
  "certificate_title" text NOT NULL,
  "category" text,
  "description" text,
  "course_hours" integer,
  "start_date" timestamptz,
  "completion_date" timestamptz,
  "issue_date" timestamptz NOT NULL DEFAULT NOW(),
  "instructor_name" text,
  "organization" text NOT NULL DEFAULT 'Arkan Web',
  "partner_organization" text,
  "template_id" integer REFERENCES "certificate_templates"("id"),
  "status" text NOT NULL DEFAULT 'draft',
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_by" integer REFERENCES "users"("id"),
  "created_at" timestamptz NOT NULL DEFAULT NOW(),
  "updated_at" timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "certificate_recipients" (
  "id" serial PRIMARY KEY,
  "batch_id" integer NOT NULL REFERENCES "certificate_batches"("id") ON DELETE CASCADE,
  "full_name" text NOT NULL,
  "email" text,
  "certificate_code" text,
  "certificate_issue_id" integer REFERENCES "certificate_issues"("id"),
  "reservation_status" text NOT NULL DEFAULT 'available',
  "certificate_status" text NOT NULL DEFAULT 'pending',
  "verification_status" text NOT NULL DEFAULT 'pending',
  "email_status" text NOT NULL DEFAULT 'pending',
  "issue_date" timestamptz,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT NOW(),
  "updated_at" timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE ("batch_id", "full_name", "email")
);

CREATE UNIQUE INDEX IF NOT EXISTS "certificate_recipients_certificate_code_unique"
  ON "certificate_recipients" ("certificate_code")
  WHERE "certificate_code" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "certificate_activity_logs" (
  "id" serial PRIMARY KEY,
  "batch_id" integer REFERENCES "certificate_batches"("id") ON DELETE SET NULL,
  "recipient_id" integer REFERENCES "certificate_recipients"("id") ON DELETE SET NULL,
  "certificate_issue_id" integer REFERENCES "certificate_issues"("id") ON DELETE SET NULL,
  "action" text NOT NULL,
  "result" text NOT NULL,
  "details" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "actor_id" integer REFERENCES "users"("id"),
  "created_at" timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "certificate_email_logs" (
  "id" serial PRIMARY KEY,
  "batch_id" integer REFERENCES "certificate_batches"("id") ON DELETE SET NULL,
  "recipient_id" integer REFERENCES "certificate_recipients"("id") ON DELETE SET NULL,
  "certificate_issue_id" integer REFERENCES "certificate_issues"("id") ON DELETE SET NULL,
  "recipient_email" text NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "attempt_number" integer NOT NULL DEFAULT 1,
  "provider_response" text,
  "message_id" text,
  "failure_reason" text,
  "sent_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT NOW()
);
