#!/usr/bin/env bash
# uso: sql.sh "<query>"  -> JSON (Management API)
set -euo pipefail
TOK=$(grep -E '^SUPABASE_ACCESS_TOKEN=' /data/.openclaw/.env | head -1 | cut -d= -f2- | tr -d '"'"'"' ')
python3 -c 'import json,sys; print(json.dumps({"query": sys.argv[1]}))' "$1" | curl -sS -X POST "https://api.supabase.com/v1/projects/egxzsivzqlqadoqpgfby/database/query" \
  -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" --data-binary @- | python3 -c 'import json,sys; d=json.load(sys.stdin); print(json.dumps(d, indent=1, ensure_ascii=False, default=str))'
