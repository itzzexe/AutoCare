-- Least-privilege database roles.
--   autocare_owner : owns the schema, runs migrations (DATABASE_MIGRATION_URL)
--   autocare_app   : used by the running application (DATABASE_URL) — DML only,
--                    audit log is append-only (INSERT/SELECT, no UPDATE/DELETE)
-- Development passwords below are placeholders for the local compose stack ONLY.
-- In production create the roles with passwords from the secret manager.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'autocare_app') THEN
    CREATE ROLE autocare_app LOGIN PASSWORD 'autocare_app_dev' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
  END IF;
END $$;

GRANT CONNECT ON DATABASE autocare TO autocare_app;
GRANT USAGE ON SCHEMA public TO autocare_app;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

-- Tables created later by migrations (as autocare_owner) get these defaults:
ALTER DEFAULT PRIVILEGES FOR ROLE autocare_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO autocare_app;
ALTER DEFAULT PRIVILEGES FOR ROLE autocare_owner IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO autocare_app;
