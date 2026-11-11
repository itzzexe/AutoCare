-- Run after every migration (pnpm db:migrate does this automatically when
-- DATABASE_MIGRATION_URL is set). Re-asserts least privilege on sensitive tables.

-- Audit trail: append-only for the application role.
REVOKE UPDATE, DELETE, TRUNCATE ON audit_events FROM autocare_app;
GRANT SELECT, INSERT ON audit_events TO autocare_app;

-- Migration bookkeeping is not the application's business.
REVOKE ALL ON ALL TABLES IN SCHEMA drizzle FROM autocare_app;

-- The application never needs TRUNCATE or schema changes.
REVOKE TRUNCATE ON ALL TABLES IN SCHEMA public FROM autocare_app;
