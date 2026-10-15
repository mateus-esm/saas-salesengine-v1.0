// SE-SUP1-5 (#15) — os RECORTES de um relatório agendado (canal, vendedor).
//
// O cliente escolhe recortes; não escolhe quais seções existem (o template é
// fixo no servidor). Ficam em report_schedules.filters:
//   { channels: string[], responsible_ids: string[] }
// Lista vazia = sem recorte, então a chave SAI do objeto em vez de ficar `[]`
// (o RPC trata array vazio como "sem filtro", mas um objeto limpo é mais fácil
// de ler no banco). Outras chaves (pipeline_ids legado) passam intactas.

export type ReportFilterKey = "channels" | "responsible_ids";

export function readFilterList(filters: Record<string, unknown> | null | undefined, key: ReportFilterKey): string[] {
  const v = filters?.[key];
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

export function toggleFilterValue(
  filters: Record<string, unknown> | null | undefined,
  key: ReportFilterKey,
  value: string,
): Record<string, unknown> {
  const current = readFilterList(filters, key);
  const next = current.includes(value) ? current.filter((x) => x !== value) : [...current, value];
  const out = { ...(filters ?? {}) };
  if (next.length) out[key] = next;
  else delete out[key];
  return out;
}
