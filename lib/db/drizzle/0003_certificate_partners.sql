CREATE TABLE IF NOT EXISTS "certificate_partners" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "logo_url" text,
  "signature_url" text,
  "signature_name" text,
  "signature_title" text,
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE SEQUENCE IF NOT EXISTS "certificate_issue_serial_seq" START WITH 1 INCREMENT BY 1;
