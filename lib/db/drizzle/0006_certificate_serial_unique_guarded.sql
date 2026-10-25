DO $$
BEGIN
  IF to_regclass('public.certificate_issues') IS NULL THEN
    RAISE EXCEPTION 'certificate_issues table is missing; no certificate data was changed';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'certificate_issues'
      AND column_name = 'serial_number'
  ) THEN
    RAISE EXCEPTION 'certificate_issues.serial_number is missing; no certificate data was changed';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.certificate_issues
    WHERE serial_number IS NULL
  ) THEN
    RAISE EXCEPTION 'Null certificate serial numbers prevent the schema constraint; no certificate data was changed';
  END IF;

  ALTER TABLE public.certificate_issues
    ALTER COLUMN serial_number SET NOT NULL;

  IF EXISTS (
    SELECT 1
    FROM public.certificate_issues
    GROUP BY serial_number
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate certificate serial numbers prevent the unique index; no certificate data was changed';
  END IF;

  CREATE UNIQUE INDEX IF NOT EXISTS "certificate_issues_serial_number_unique"
    ON public.certificate_issues ("serial_number");
END $$;
