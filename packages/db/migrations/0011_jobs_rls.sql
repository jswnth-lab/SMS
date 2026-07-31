-- Add jobs table to RLS policy
ALTER TABLE "jobs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "jobs" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation"
  ON "jobs"
  FOR ALL
  USING (
    "school_id" = ("current_setting"('app.school_id', true)::"uuid")
  )
  WITH CHECK (
    "school_id" = ("current_setting"('app.school_id', true)::"uuid")
  );
