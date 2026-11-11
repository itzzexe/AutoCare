#!/usr/bin/env bash
# Restore drill: decrypt the latest backup into a THROWAWAY Postgres container,
# run sanity queries, then destroy it. Proves backups are restorable and that
# the decryption key is actually available. Run monthly; record the result.
#   AGE_IDENTITY=/secure/age.key BACKUP_DIR=/var/backups/autocare ./restore-test.sh
set -euo pipefail
: "${AGE_IDENTITY:?path to the age private key (kept offline)}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/autocare}"
LATEST="$(ls -1t "$BACKUP_DIR"/db-*.dump.age | head -n1)"
STAMP="$(basename "$LATEST" .dump.age | sed 's/^db-//')"
( cd "$BACKUP_DIR" && sha256sum -c "SHA256SUMS-$STAMP" )
NAME="autocare-restore-test-$$"
docker run -d --rm --name "$NAME" -e POSTGRES_PASSWORD=restore -e POSTGRES_DB=autocare pgvector/pgvector:pg17 >/dev/null
trap 'docker rm -f "$NAME" >/dev/null 2>&1 || true' EXIT
for i in $(seq 1 30); do docker exec "$NAME" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 2; done
# Grants and default privileges in the dump reference both roles; create them (no login) so ACLs restore cleanly.
docker exec "$NAME" psql -U postgres -d autocare -c "CREATE ROLE autocare_app NOLOGIN; CREATE ROLE autocare_owner NOLOGIN;" >/dev/null
age -d -i "$AGE_IDENTITY" "$LATEST" | docker exec -i "$NAME" pg_restore -U postgres -d autocare --no-owner --exit-on-error
docker exec "$NAME" psql -U postgres -d autocare -At -c "select 'users', count(*) from users union all select 'vehicles', count(*) from vehicles union all select 'orders', count(*) from orders union all select 'migrations', count(*) from drizzle.__drizzle_migrations;"
echo "restore drill OK for $STAMP"
