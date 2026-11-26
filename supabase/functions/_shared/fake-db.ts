// Banco falso mínimo para testes de edge: grava cada operação e responde com o
// que o teste configurou. Cobre o subconjunto do supabase-js que os módulos
// compartilhados usam (rpc, select/eq/is/order/limit/maybeSingle/single,
// insert/update/upsert).

export interface Op {
  kind: "rpc" | "select" | "insert" | "update" | "upsert";
  table: string;
  args?: unknown;
  filters: [string, string, unknown][];
}

type Responder = (op: Op) => { data?: unknown; error?: { message: string } | null } | undefined;

export function fakeDb(respond: Responder = () => undefined) {
  const ops: Op[] = [];
  const answer = (op: Op) => {
    ops.push(op);
    const r = respond(op) ?? {};
    return { data: r.data ?? null, error: r.error ?? null };
  };

  function builder(table: string) {
    const op: Op = { kind: "select", table, filters: [] };
    let sent = false;
    const send = () => {
      sent = true;
      return answer(op);
    };
    const b: Record<string, unknown> = {
      select: () => {
        if (op.kind === "select") op.args = op.args ?? null;
        return b;
      },
      insert: (v: unknown) => ((op.kind = "insert"), (op.args = v), b),
      update: (v: unknown) => ((op.kind = "update"), (op.args = v), b),
      upsert: (v: unknown) => ((op.kind = "upsert"), (op.args = v), b),
      eq: (c: string, v: unknown) => (op.filters.push(["eq", c, v]), b),
      neq: (c: string, v: unknown) => (op.filters.push(["neq", c, v]), b),
      is: (c: string, v: unknown) => (op.filters.push(["is", c, v]), b),
      in: (c: string, v: unknown) => (op.filters.push(["in", c, v]), b),
      order: () => b,
      limit: () => b,
      maybeSingle: () => Promise.resolve(send()),
      single: () => Promise.resolve(send()),
      then: (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => {
        if (sent) return Promise.resolve({ data: null, error: null }).then(ok, ko);
        return Promise.resolve(send()).then(ok, ko);
      },
    };
    return b;
  }

  const db = {
    from: (table: string) => builder(table),
    rpc: (name: string, args: unknown) => Promise.resolve(answer({ kind: "rpc", table: name, args, filters: [] })),
  };
  return { db, ops };
}
