#!/usr/bin/env bash
# SE-REV-002 — roda um arquivo de teste SQL num PostgreSQL 15 LOCAL já iniciado
# (nunca produção). Cria um banco novo por execução, aplica stubs.sql, expande
# as linhas `-- @include <caminho>` (como o scripts/sqltest.sh faz) e roda.
#
#   PGHOST=/tmp/serev002pg PGPORT=55432 bash run.sh supabase/tests/<arquivo>.test.sql
#
# Subir o servidor (o initdb recusa root; rode como o usuário postgres):
#   su postgres -c "/usr/lib/postgresql/15/bin/initdb -D /tmp/serev002pg/data -U postgres --auth=trust"
#   su postgres -c "/usr/lib/postgresql/15/bin/pg_ctl -D /tmp/serev002pg/data \
#       -o \"-k /tmp/serev002pg -p 55432 -c listen_addresses=''\" -l /tmp/serev002pg/log start"
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(git -C "$HERE" rev-parse --show-toplevel)"
FILE="$1"
DB="t_$(date +%s%N)"

export PGUSER="${PGUSER:-postgres}"
psql -qAt -d postgres -c "create database $DB" >/dev/null

expanded="$(mktemp)"
while IFS= read -r line; do
  if [[ "$line" =~ ^--\ @include\ (.+)$ ]]; then
    cat "$ROOT/${BASH_REMATCH[1]}"
    echo
  else
    printf '%s\n' "$line"
  fi
done < "$ROOT/$FILE" > "$expanded"

status=0
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$HERE/stubs.sql" >/dev/null
psql -v ON_ERROR_STOP=1 -d "$DB" -f "$expanded" || status=$?
psql -qAt -d postgres -c "drop database $DB" >/dev/null
rm -f "$expanded"
exit $status
