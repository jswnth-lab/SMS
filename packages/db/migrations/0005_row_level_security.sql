-- Row-level security for multi-tenant isolation.
--
-- The API connects as `app_rw`, a non-owner, non-superuser role, so it is
-- actually subject to these policies (the migration/seed role is a
-- superuser and always bypasses RLS regardless of FORCE, which is why
-- migrations and db:seed keep working unchanged).
--
-- Tenant scope is read from a per-transaction session variable set by the
-- application before running any query:
--   SET LOCAL app.school_id = '<uuid>';
--   SET LOCAL app.user_id   = '<uuid>';
-- current_setting(..., true) returns NULL when unset, which makes every
-- policy below fail closed (no context => no rows) instead of open.

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_rw') THEN
    CREATE ROLE app_rw LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
END
$$;
--> statement-breakpoint
GRANT CONNECT ON DATABASE skldb TO app_rw;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO app_rw;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_rw;
--> statement-breakpoint
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_rw;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_rw;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO app_rw;
--> statement-breakpoint
-- Every table that already carries school_id directly gets the same
-- uniform tenant_isolation policy.
DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'school_memberships', 'academic_years', 'terms', 'grade_levels', 'sections',
    'subjects', 'students', 'guardians', 'student_guardians', 'teaching_assignments',
    'timetable_slots', 'attendance_records', 'assessments', 'marks', 'report_cards',
    'announcements', 'announcement_reads', 'homework', 'notifications', 'audit_logs'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tbl);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (school_id = current_setting(''app.school_id'', true)::uuid) WITH CHECK (school_id = current_setting(''app.school_id'', true)::uuid)',
      tbl
    );
  END LOOP;
END
$$;
--> statement-breakpoint
-- schools has no school_id column (it IS the tenant). Visible if it's the
-- active tenant, or if the caller holds any membership in it (covers a
-- "pick your school" list before a tenant is selected).
ALTER TABLE schools ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE schools FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON schools
  USING (
    id = current_setting('app.school_id', true)::uuid
    OR EXISTS (
      SELECT 1 FROM school_memberships sm
      WHERE sm.school_id = schools.id
        AND sm.user_id = current_setting('app.user_id', true)::uuid
    )
  );
--> statement-breakpoint
-- users has no school_id (one user can hold memberships at multiple
-- schools), so scope by self or by a shared membership in the active
-- tenant instead. WITH CHECK only allows self-writes: creating other
-- users (registration/invites) is a privileged operation that must go
-- through the migrator/service connection, not app_rw, until a real
-- service-role/auth layer exists.
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE users FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON users
  USING (
    id = current_setting('app.user_id', true)::uuid
    OR EXISTS (
      SELECT 1 FROM school_memberships sm
      WHERE sm.user_id = users.id
        AND sm.school_id = current_setting('app.school_id', true)::uuid
    )
  )
  WITH CHECK (id = current_setting('app.user_id', true)::uuid);