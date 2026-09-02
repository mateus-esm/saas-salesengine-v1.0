#!/usr/bin/env python
"""
Roda um arquivo SQL contra o banco pela Management API.

Serve para uma coisa só: provar que uma migration funciona ANTES de aplicá-la.
Por padrão envolve o arquivo em `begin ... rollback`, então as asserções rodam
contra o schema real — com as tabelas, os CHECKs e as funções que existem de
verdade — e o banco volta exatamente ao que era.

    python supabase/scripts/run_sql.py <arquivo.sql>            # ensaio (rollback)
    python supabase/scripts/run_sql.py <arquivo.sql> --commit   # aplica de vez

O ensaio é o modo padrão de propósito. Aplicar tem que ser uma escolha digitada.
"""
import json
import os
import re
import sys
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def env(name: str) -> str:
    """Lê o .env sem shell: a senha do banco tem parênteses e o bash engasga."""
    with open(os.path.join(ROOT, ".env"), encoding="utf-8") as fh:
        for line in fh:
            if line.startswith(name + "="):
                return line.split("=", 1)[1].strip()
    raise SystemExit(f"{name} não está no .env")


def run(sql: str) -> object:
    ref = env("SUPABASE_PROJECT_ID")
    req = urllib.request.Request(
        f"https://api.supabase.com/v1/projects/{ref}/database/query",
        data=json.dumps({"query": sql}).encode(),
        headers={
            "Authorization": f"Bearer {env('SUPABASE_ACCESS_TOKEN')}",
            "Content-Type": "application/json",
            # Sem isto a borda da Supabase devolve 403 (Cloudflare 1010) para o
            # User-Agent padrão do urllib.
            "User-Agent": "curl/8.0.0",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=180) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        raise SystemExit(f"HTTP {e.code}: {e.read().decode()}")


def main() -> None:
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)

    path = sys.argv[1]
    commit = "--commit" in sys.argv
    with open(path, encoding="utf-8") as fh:
        body = fh.read()

    # `raise notice` não volta pela API. Vira uma linha de resultado para que o
    # "asserções passaram" da migration seja visível em vez de silencioso.
    body = re.sub(
        r"raise notice '([^']*)';",
        lambda m: f"perform set_config('sprint82.ok', '{m.group(1)}', true);",
        body,
    )

    sql = body if commit else f"begin;\n{body}\n;rollback;"
    out = run(sql)

    if isinstance(out, dict) and "message" in out:
        print("FALHOU\n" + out["message"])
        sys.exit(1)

    print("APLICADO" if commit else "OK (ensaio, revertido)")


if __name__ == "__main__":
    main()
