import { describe, expect, it } from "vitest";
import {
  NON_OFFICIAL_CHANNEL_TYPES,
  CUSTOMER_SIGNAL_LOOKBACK_MS,
  META_HUMAN_AGENT_WINDOW_MS,
  SERVICE_WINDOW_MS,
  isMetaMessagingChannel,
  isNonOfficialConnection,
  isWithinServiceWindow,
  resolveServiceWindow,
} from "@/lib/service-window";

/**
 * SE-REV-006 — a janela de atendimento é decidida pelo TIPO DE CONEXÃO.
 *
 * Não oficial (WHATSAPP / Z_API no provider, ou Solo API): SEMPRE aberta, mesmo
 * que o cliente nunca tenha escrito. Oficial (CLOUD_API): a regra de 24 h
 * contada da última mensagem do cliente.
 */

const NOW = new Date("2026-09-26T12:00:00.000Z").getTime();
const HOUR = 60 * 60 * 1000;

/** Atalho: `h` horas atrás do NOW fixo. */
const ago = (h: number) => new Date(NOW - h * HOUR);

describe("isNonOfficialConnection", () => {
  it("reconhece os tipos de canal não oficiais do provider", () => {
    for (const type of NON_OFFICIAL_CHANNEL_TYPES) {
      expect(isNonOfficialConnection({ providerChannelType: type })).toBe(true);
    }
  });

  it("normaliza o tipo (caixa e espaço) antes de comparar", () => {
    expect(isNonOfficialConnection({ providerChannelType: " z_api " })).toBe(true);
    expect(isNonOfficialConnection({ providerChannelType: "whatsapp" })).toBe(true);
  });

  it("reconhece a conexão via Solo API pelos dois sinais", () => {
    expect(isNonOfficialConnection({ conversationSoloInstanceId: "inst-1" })).toBe(true);
    expect(isNonOfficialConnection({ hasConnectedSoloInstance: true })).toBe(true);
  });

  it("CLOUD_API continua oficial", () => {
    expect(isNonOfficialConnection({ providerChannelType: "CLOUD_API" })).toBe(false);
  });

  it("canais de outro tipo (Instagram, Telegram, Web) não são WhatsApp não oficial", () => {
    expect(isNonOfficialConnection({ providerChannelType: "INSTAGRAM" })).toBe(false);
    expect(isNonOfficialConnection({ providerChannelType: "TELEGRAM" })).toBe(false);
    expect(isNonOfficialConnection({ providerChannelType: "WIDGET" })).toBe(false);
    expect(isNonOfficialConnection({})).toBe(false);
    expect(isNonOfficialConnection({ providerChannelType: null })).toBe(false);
    expect(isNonOfficialConnection({ providerChannelType: "" })).toBe(false);
  });
});

describe("isWithinServiceWindow", () => {
  it("abre enquanto a última mensagem do cliente está dentro das 24 h", () => {
    expect(isWithinServiceWindow(ago(0), NOW)).toBe(true);
    expect(isWithinServiceWindow(ago(23), NOW)).toBe(true);
    expect(isWithinServiceWindow(new Date(NOW - SERVICE_WINDOW_MS), NOW)).toBe(true);
  });

  it("fecha depois das 24 h", () => {
    expect(isWithinServiceWindow(new Date(NOW - SERVICE_WINDOW_MS - 1), NOW)).toBe(false);
    expect(isWithinServiceWindow(ago(48), NOW)).toBe(false);
  });

  it("sem mensagem do cliente, a janela está fechada", () => {
    expect(isWithinServiceWindow(null, NOW)).toBe(false);
    expect(isWithinServiceWindow(undefined, NOW)).toBe(false);
    expect(isWithinServiceWindow("", NOW)).toBe(false);
  });

  it("data inválida não abre a janela", () => {
    expect(isWithinServiceWindow("not-a-date", NOW)).toBe(false);
  });

  it("aceita Date e string ISO com o mesmo resultado", () => {
    expect(isWithinServiceWindow(ago(1), NOW)).toBe(true);
    expect(isWithinServiceWindow(ago(1).toISOString(), NOW)).toBe(true);
  });
});

describe("resolveServiceWindow", () => {
  it("CONEXÃO NÃO OFICIAL está sempre aberta, mesmo sem mensagem do cliente", () => {
    for (const providerChannelType of NON_OFFICIAL_CHANNEL_TYPES) {
      expect(resolveServiceWindow({ providerChannelType, now: NOW })).toMatchObject({
        alwaysOpen: true,
        open: true,
      });
      // Cliente falou há uma semana: continua aberta.
      expect(
        resolveServiceWindow({ providerChannelType, lastCustomerMessageAt: ago(168), now: NOW }),
      ).toMatchObject({ alwaysOpen: true, open: true });
    }
  });

  it("Solo API está sempre aberta (instância do tenant e conversa da instância)", () => {
    expect(resolveServiceWindow({ hasConnectedSoloInstance: true, now: NOW }).open).toBe(true);
    expect(resolveServiceWindow({ conversationSoloInstanceId: "inst-9", now: NOW }).open).toBe(true);
    expect(
      resolveServiceWindow({
        conversationSoloInstanceId: "inst-9",
        lastCustomerMessageAt: ago(500),
        now: NOW,
      }).open,
    ).toBe(true);
  });

  it("CLOUD_API dentro das 24 h: aberta, mas não por ser sempre aberta", () => {
    expect(
      resolveServiceWindow({
        providerChannelType: "CLOUD_API",
        lastCustomerMessageAt: ago(2),
        now: NOW,
      }),
    ).toMatchObject({ alwaysOpen: false, open: true });
  });

  it("CLOUD_API fora das 24 h: JANELA FECHADA (a regra antiga é mantida)", () => {
    expect(
      resolveServiceWindow({
        providerChannelType: "CLOUD_API",
        lastCustomerMessageAt: ago(25),
        now: NOW,
      }),
    ).toMatchObject({ alwaysOpen: false, open: false });
  });

  it("CLOUD_API sem mensagem do cliente: fechada", () => {
    expect(resolveServiceWindow({ providerChannelType: "CLOUD_API", now: NOW })).toMatchObject({
      alwaysOpen: false,
      open: false,
    });
  });

  it("tipo desconhecido cai na regra de 24 h (nunca abre por falta de dado)", () => {
    expect(
      resolveServiceWindow({ providerChannelType: "SOMETHING_NEW", now: NOW }),
    ).toMatchObject({ alwaysOpen: false, open: false });
    expect(
      resolveServiceWindow({
        providerChannelType: "SOMETHING_NEW",
        lastCustomerMessageAt: ago(1),
        now: NOW,
      }),
    ).toMatchObject({ alwaysOpen: false, open: true });
  });
});

describe("SE-SUP1-2 — Instagram/Messenger (Meta-messaging) não herdam a Solo API", () => {
  it("reconhece os canais Meta pelo nome normalizado", () => {
    expect(isMetaMessagingChannel("instagram")).toBe(true);
    expect(isMetaMessagingChannel(" Messenger ")).toBe(true);
    expect(isMetaMessagingChannel("whatsapp")).toBe(false);
    expect(isMetaMessagingChannel(null)).toBe(false);
  });

  it("IG + tenant com Solo conectada + último inbound há 30 h: FECHADA", () => {
    const w = resolveServiceWindow({
      channel: "instagram",
      hasConnectedSoloInstance: true,
      lastCustomerMessageAt: ago(30),
      now: NOW,
    });
    expect(w).toMatchObject({
      open: false,
      alwaysOpen: false,
      channelKind: "meta",
      reason: "window_expired",
    });
    expect(w.expiresAt?.getTime()).toBe(NOW - 30 * HOUR + SERVICE_WINDOW_MS);
  });

  it("IG dentro das 24 h: aberta, com a hora em que fecha", () => {
    const w = resolveServiceWindow({
      channel: "instagram",
      hasConnectedSoloInstance: true,
      lastCustomerMessageAt: ago(3),
      now: NOW,
    });
    expect(w).toMatchObject({ open: true, alwaysOpen: false, reason: "within_window" });
    expect(w.expiresAt?.getTime()).toBe(NOW - 3 * HOUR + SERVICE_WINDOW_MS);
  });

  it("IG sem mensagem do cliente: fechada (no_customer_message)", () => {
    expect(
      resolveServiceWindow({ channel: "instagram", hasConnectedSoloInstance: true, now: NOW }),
    ).toMatchObject({ open: false, reason: "no_customer_message", expiresAt: null });
  });

  it("Messenger segue a mesma regra do Instagram", () => {
    expect(
      resolveServiceWindow({ channel: "messenger", hasConnectedSoloInstance: true, lastCustomerMessageAt: ago(30), now: NOW }).open,
    ).toBe(false);
  });

  it("solo_instance_id da conversa não abre canal Meta", () => {
    expect(
      resolveServiceWindow({ channel: "instagram", conversationSoloInstanceId: "i", lastCustomerMessageAt: ago(30), now: NOW }).open,
    ).toBe(false);
  });

  it("extensão de 7 dias do atendente humano: DESLIGADA por padrão", () => {
    expect(META_HUMAN_AGENT_WINDOW_MS).toBe(0);
    expect(
      resolveServiceWindow({ channel: "instagram", lastCustomerMessageAt: ago(48), now: NOW }).open,
    ).toBe(false);
  });

  it("com a extensão ligada: 24 h < t <= 7 d abre como human_agent_extension; passou de 7 d fecha", () => {
    const humanAgentWindowMs = 7 * 24 * HOUR;
    expect(
      resolveServiceWindow({ channel: "instagram", lastCustomerMessageAt: ago(48), humanAgentWindowMs, now: NOW }),
    ).toMatchObject({ open: true, reason: "human_agent_extension" });
    expect(
      resolveServiceWindow({ channel: "instagram", lastCustomerMessageAt: ago(24 * 8), humanAgentWindowMs, now: NOW }),
    ).toMatchObject({ open: false, reason: "window_expired" });
  });

  it("WhatsApp não oficial segue como antes (canal whatsapp ou ausente)", () => {
    expect(
      resolveServiceWindow({ channel: "whatsapp", hasConnectedSoloInstance: true, lastCustomerMessageAt: ago(500), now: NOW }),
    ).toMatchObject({ alwaysOpen: true, open: true, channelKind: "whatsapp", reason: "always_open" });
    expect(resolveServiceWindow({ hasConnectedSoloInstance: true, now: NOW }).open).toBe(true);
  });

  it("canal fora de WhatsApp/Meta (web, telegram) mantém o comportamento legado", () => {
    expect(resolveServiceWindow({ channel: "web", hasConnectedSoloInstance: true, now: NOW }).open).toBe(true);
  });
});

describe("CUSTOMER_SIGNAL_LOOKBACK_MS", () => {
  it("nunca é menor que a janela de 24 h nem que a extensão humana", () => {
    expect(CUSTOMER_SIGNAL_LOOKBACK_MS).toBeGreaterThanOrEqual(SERVICE_WINDOW_MS);
    expect(CUSTOMER_SIGNAL_LOOKBACK_MS).toBeGreaterThanOrEqual(META_HUMAN_AGENT_WINDOW_MS);
  });
});
