// Harness de evidencia do SE-REV-006 (artefato da task, nao codigo de produto).
//
// O sandbox bloqueia `npm test` / `vitest` (sem node_modules e npm negado), mas
// o node v22 carrega TypeScript com --experimental-strip-types. Como
// src/lib/service-window.ts nao importa nada, da para exercitar a FONTE DE
// VERDADE real, sem depender de bundler. Repete caso a caso o que
// src/lib/__tests__/service-window.test.ts afirma no vitest.
//
// Rodar:
//   node --experimental-strip-types \
//     docs/dev/projects/saas-salesengine-v1.0/SE-REV-006/verboo/service-window.check.mjs
import {
  NON_OFFICIAL_CHANNEL_TYPES,
  SERVICE_WINDOW_MS,
  isNonOfficialConnection,
  isWithinServiceWindow,
  resolveServiceWindow,
} from "../../../../../../src/lib/service-window.ts";

const NOW = new Date("2026-09-26T12:00:00.000Z").getTime();
const HOUR = 60 * 60 * 1000;
const ago = (h) => new Date(NOW - h * HOUR);

let pass = 0;
let fail = 0;
const eq = (label, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) pass++;
  else {
    fail++;
    console.log(`FAIL ${label}: got ${a} want ${e}`);
  }
};

// ── isNonOfficialConnection ─────────────────────────────────────────────────
for (const type of NON_OFFICIAL_CHANNEL_TYPES) {
  eq(`tipo nao oficial ${type}`, isNonOfficialConnection({ providerChannelType: type }), true);
}
eq("normaliza espaco/caixa", isNonOfficialConnection({ providerChannelType: " z_api " }), true);
eq("whatsapp minusculo", isNonOfficialConnection({ providerChannelType: "whatsapp" }), true);
eq("solo por conversa", isNonOfficialConnection({ conversationSoloInstanceId: "inst-1" }), true);
eq("solo por tenant", isNonOfficialConnection({ hasConnectedSoloInstance: true }), true);
eq("CLOUD_API e oficial", isNonOfficialConnection({ providerChannelType: "CLOUD_API" }), false);
eq("INSTAGRAM", isNonOfficialConnection({ providerChannelType: "INSTAGRAM" }), false);
eq("TELEGRAM", isNonOfficialConnection({ providerChannelType: "TELEGRAM" }), false);
eq("WIDGET", isNonOfficialConnection({ providerChannelType: "WIDGET" }), false);
eq("sem sinal nenhum", isNonOfficialConnection({}), false);
eq("tipo null", isNonOfficialConnection({ providerChannelType: null }), false);
eq("tipo string vazia", isNonOfficialConnection({ providerChannelType: "" }), false);

// ── isWithinServiceWindow ───────────────────────────────────────────────────
eq("agora", isWithinServiceWindow(ago(0), NOW), true);
eq("23h atras", isWithinServiceWindow(ago(23), NOW), true);
eq("exatamente 24h", isWithinServiceWindow(new Date(NOW - SERVICE_WINDOW_MS), NOW), true);
eq("24h + 1ms", isWithinServiceWindow(new Date(NOW - SERVICE_WINDOW_MS - 1), NOW), false);
eq("48h atras", isWithinServiceWindow(ago(48), NOW), false);
eq("null", isWithinServiceWindow(null, NOW), false);
eq("undefined", isWithinServiceWindow(undefined, NOW), false);
eq("string vazia", isWithinServiceWindow("", NOW), false);
eq("data invalida", isWithinServiceWindow("not-a-date", NOW), false);
eq("Date recente", isWithinServiceWindow(ago(1), NOW), true);
eq("ISO recente", isWithinServiceWindow(ago(1).toISOString(), NOW), true);

// ── resolveServiceWindow ────────────────────────────────────────────────────
for (const type of NON_OFFICIAL_CHANNEL_TYPES) {
  eq(`sempre aberta ${type} (sem mensagem)`, resolveServiceWindow({ providerChannelType: type, now: NOW }), {
    alwaysOpen: true,
    open: true,
  });
  eq(
    `sempre aberta ${type} (cliente ha 168h)`,
    resolveServiceWindow({ providerChannelType: type, lastCustomerMessageAt: ago(168), now: NOW }),
    { alwaysOpen: true, open: true },
  );
}
eq("solo no tenant: sempre aberta", resolveServiceWindow({ hasConnectedSoloInstance: true, now: NOW }).open, true);
eq(
  "solo na conversa: sempre aberta",
  resolveServiceWindow({ conversationSoloInstanceId: "inst-9", now: NOW }).open,
  true,
);
eq(
  "solo na conversa ha 500h: continua aberta",
  resolveServiceWindow({
    conversationSoloInstanceId: "inst-9",
    lastCustomerMessageAt: ago(500),
    now: NOW,
  }).open,
  true,
);
eq(
  "CLOUD_API dentro das 24h",
  resolveServiceWindow({ providerChannelType: "CLOUD_API", lastCustomerMessageAt: ago(2), now: NOW }),
  { alwaysOpen: false, open: true },
);
eq(
  "CLOUD_API fora das 24h (janela fechada)",
  resolveServiceWindow({ providerChannelType: "CLOUD_API", lastCustomerMessageAt: ago(25), now: NOW }),
  { alwaysOpen: false, open: false },
);
eq(
  "CLOUD_API sem mensagem do cliente",
  resolveServiceWindow({ providerChannelType: "CLOUD_API", now: NOW }),
  { alwaysOpen: false, open: false },
);
eq(
  "tipo desconhecido sem mensagem",
  resolveServiceWindow({ providerChannelType: "SOMETHING_NEW", now: NOW }),
  { alwaysOpen: false, open: false },
);
eq(
  "tipo desconhecido com mensagem recente",
  resolveServiceWindow({
    providerChannelType: "SOMETHING_NEW",
    lastCustomerMessageAt: ago(1),
    now: NOW,
  }),
  { alwaysOpen: false, open: true },
);

console.log(`pass=${pass} fail=${fail}`);
process.exit(fail === 0 ? 0 : 1);
