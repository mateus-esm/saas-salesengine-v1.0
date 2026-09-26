import { describe, expect, it } from "vitest";
import {
  NON_OFFICIAL_CHANNEL_TYPES,
  SERVICE_WINDOW_MS,
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
      expect(resolveServiceWindow({ providerChannelType, now: NOW })).toEqual({
        alwaysOpen: true,
        open: true,
      });
      // Cliente falou há uma semana: continua aberta.
      expect(
        resolveServiceWindow({ providerChannelType, lastCustomerMessageAt: ago(168), now: NOW }),
      ).toEqual({ alwaysOpen: true, open: true });
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
    ).toEqual({ alwaysOpen: false, open: true });
  });

  it("CLOUD_API fora das 24 h: JANELA FECHADA (a regra antiga é mantida)", () => {
    expect(
      resolveServiceWindow({
        providerChannelType: "CLOUD_API",
        lastCustomerMessageAt: ago(25),
        now: NOW,
      }),
    ).toEqual({ alwaysOpen: false, open: false });
  });

  it("CLOUD_API sem mensagem do cliente: fechada", () => {
    expect(resolveServiceWindow({ providerChannelType: "CLOUD_API", now: NOW })).toEqual({
      alwaysOpen: false,
      open: false,
    });
  });

  it("tipo desconhecido cai na regra de 24 h (nunca abre por falta de dado)", () => {
    expect(
      resolveServiceWindow({ providerChannelType: "SOMETHING_NEW", now: NOW }),
    ).toEqual({ alwaysOpen: false, open: false });
    expect(
      resolveServiceWindow({
        providerChannelType: "SOMETHING_NEW",
        lastCustomerMessageAt: ago(1),
        now: NOW,
      }),
    ).toEqual({ alwaysOpen: false, open: true });
  });
});
