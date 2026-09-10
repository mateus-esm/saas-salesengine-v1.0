#!/usr/bin/env bash
# Roda testes SQL contra o projeto Supabase linkado, pela Management API.
#
#   bash scripts/sqltest.sh supabase/tests/sprint11_w1_board.test.sql [outro.test.sql ...]
#
# POR QUE CONTRA A PRODUÇÃO
#
# Esta máquina não tem Docker, então não há banco local. A Sprint 10 já ensaiava
# contra a produção dentro de BEGIN … ROLLBACK; este runner transforma isso em
# regra: um arquivo sem `rollback;` é recusado antes de sair daqui. Como DDL é
# transacional no Postgres, o teste pode recriar as funções da migration dentro
# da própria transação — nada fica no banco.
#
# CONVENÇÃO DO ARQUIVO
#
#   begin;
#   -- DDL da migration sob teste
#   -- fixtures
#   do $$ begin assert <condição>, '<mensagem>'; end $$;
#   rollback;
#   select 'PASS' as result;
#
# A API devolve só o resultado do último comando. Um assert que falha volta como
# erro (exit 1); o marcador PASS no fim prova que o arquivo rodou até o final.

set -euo pipefail

if [ "$#" -lt 1 ]; then
  echo "uso: bash scripts/sqltest.sh <arquivo.test.sql> [...]" >&2
  exit 2
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT/.env"
if [ ! -f "$ENV_FILE" ]; then
  echo "sqltest: .env não encontrado em $ROOT" >&2
  exit 2
fi

env_value() {
  grep -E "^$1=" "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '\r"'
}

TOKEN="$(env_value SUPABASE_ACCESS_TOKEN)"
REF="$(env_value SUPABASE_PROJECT_ID)"
if [ -z "$TOKEN" ] || [ -z "$REF" ]; then
  echo "sqltest: SUPABASE_ACCESS_TOKEN e SUPABASE_PROJECT_ID precisam estar no .env" >&2
  exit 2
fi

# `python3` no Windows costuma ser o atalho da Microsoft Store, que não roda nada.
PY="$(command -v python || command -v python3 || true)"
if [ -z "$PY" ]; then
  echo "sqltest: python não encontrado" >&2
  exit 2
fi

failures=0
for file in "$@"; do
  if [ ! -f "$file" ]; then
    echo "FAIL $file — arquivo não existe"
    failures=$((failures + 1))
    continue
  fi

  if ! grep -qiE '^[[:space:]]*rollback;' "$file"; then
    echo "RECUSADO $file — sem 'rollback;' o teste gravaria em produção"
    failures=$((failures + 1))
    continue
  fi

  # Lê como bytes e decodifica UTF-8: o stdin do Python no Windows decodifica em
  # cp1252 e estragaria os acentos dos comentários e das mensagens de assert.
  # Meta-comandos do psql (\set, \echo…) não existem para a API: saem aqui.
  response="$(
    "$PY" -c "
import json, sys
text = sys.stdin.buffer.read().decode('utf-8')
lines = [l for l in text.splitlines() if not l.lstrip().startswith(chr(92))]
print(json.dumps({'query': '\n'.join(lines)}))
" < "$file" \
      | curl -sS -X POST "https://api.supabase.com/v1/projects/$REF/database/query" \
          -H "Authorization: Bearer $TOKEN" \
          -H "Content-Type: application/json" \
          --data-binary @-
  )"

  if printf '%s' "$response" | grep -q '"result":"PASS"'; then
    echo "PASS $file"
  else
    message="$(printf '%s' "$response" | "$PY" -c "
import json, sys
sys.stdout.reconfigure(encoding='utf-8')
raw = sys.stdin.buffer.read().decode('utf-8')
try:
    data = json.loads(raw)
except ValueError:
    print(raw); sys.exit()
if isinstance(data, dict) and 'message' in data:
    print(data['message'])
else:
    print('sem marcador PASS no fim — resposta: ' + raw[:400])
")"
    echo "FAIL $file"
    printf '%s\n' "$message" | sed 's/^/     /'
    failures=$((failures + 1))
  fi
done

exit "$([ "$failures" -eq 0 ] && echo 0 || echo 1)"
