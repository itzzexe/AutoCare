#!/usr/bin/env bash
# Encrypted PostgreSQL + uploads backup. Run as a daily systemd timer on the host.
#   AGE_RECIPIENT=age1... BACKUP_DIR=/var/backups/autocare ./backup.sh
# Encryption uses `age` (public-key). The PRIVATE key is NOT stored on this host;
# it is kept offline/in the secret manager and is needed only for restore.
set -euo pipefail
: "${AGE_RECIPIENT:?set AGE_RECIPIENT (age public key)}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/autocare}"
COMPOSE="docker compose -f $(dirname "$0")/../../deploy/compose.prod.yml"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
umask 077
mkdir -p "$BACKUP_DIR"

# 1) Logical DB dump (custom format), streamed straight into age — no plaintext on disk.
$COMPOSE exec -T postgres pg_dump -U autocare_owner -d autocare -Fc --no-owner \
  | age -r "$AGE_RECIPIENT" -o "$BACKUP_DIR/db-$STAMP.dump.age"

# 2) Private uploads (already scanned/re-encoded files), tar → age.
$COMPOSE run --rm --no-deps -T --entrypoint sh web -c 'tar -C /data -cf - uploads' \
  | age -r "$AGE_RECIPIENT" -o "$BACKUP_DIR/uploads-$STAMP.tar.age"

sha256sum "$BACKUP_DIR"/db-"$STAMP".dump.age "$BACKUP_DIR"/uploads-"$STAMP".tar.age > "$BACKUP_DIR/SHA256SUMS-$STAMP"

# 3) Retention: keep 35 daily backups (documented in docs/BACKUP_RESTORE.md).
find "$BACKUP_DIR" -name 'db-*.dump.age' -mtime +35 -delete
find "$BACKUP_DIR" -name 'uploads-*.tar.age' -mtime +35 -delete
find "$BACKUP_DIR" -name 'SHA256SUMS-*' -mtime +35 -delete
echo "backup ok: $STAMP"
