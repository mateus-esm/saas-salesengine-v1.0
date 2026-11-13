import { describe, expect, it } from "vitest";
import {
  followupErrorDetail,
  followupMessageQueued,
  followupMessageResultLabel,
  validateFollowupForm,
  type FollowupFormValue,
} from "./followups";
import { outreachLineExists } from "@/hooks/useFollowups";

const base: FollowupFormValue = {
  date: "2026-11-20", time: "09:00", ownerId: null, reason: "", notifyOwner: true,
  sendMessage: true, channel: "whatsapp", messageText: "Oi {{lead.first_name}}", returnStageId: null,
};

describe("validateFollowupForm", () => {
  it("aceita variável conhecida", () => {
    expect(validateFollowupForm(base, "manual", true)).toBeNull();
  });
  it("recusa variável desconhecida quando envia mensagem", () => {
    expect(validateFollowupForm({ ...base, messageText: "Oi {{nome}}" }, "manual", true)).toContain("{{nome}} não existe");
  });
  it("ignora o texto quando não envia mensagem", () => {
    expect(validateFollowupForm({ ...base, sendMessage: false, messageText: "{{x}}" }, "manual", true)).toBeNull();
  });
});

describe("followupMessageResultLabel", () => {
  const mk = (message: string, message_error?: string) => ({ send_message: true, result: { message, message_error } as never });
  it("traduz os códigos", () => {
    expect(followupMessageResultLabel(mk("skipped", "opted_out"))).toBe("Mensagem não enviada (contato pediu para não receber)");
    expect(followupMessageResultLabel(mk("skipped", "missing_phone"))).toBe("Mensagem não enviada (contato sem telefone)");
    expect(followupMessageResultLabel(mk("cancelled", "opportunity_deleted"))).toBe("Mensagem cancelada (negócio apagado)");
    expect(followupMessageResultLabel(mk("cancelled", "lead_deleted"))).toBe("Mensagem cancelada (contato apagado)");
    expect(followupMessageResultLabel(mk("cancelled"))).toBe("Mensagem cancelada");
  });
  it("não vaza texto cru", () => {
    expect(followupMessageResultLabel(mk("skipped", 'relation "x" does not exist'))).toBe("Mensagem não enviada (não enviado)");
  });
});

describe("followupErrorDetail", () => {
  it("código conhecido em pt-BR, cru no title", () => {
    expect(followupErrorDetail("lead_deleted")).toEqual({ text: "Contato apagado" });
    expect(followupErrorDetail("boom: SQL")).toEqual({ text: "Algo deu errado ao executar.", title: "boom: SQL" });
    expect(followupErrorDetail(null)).toBeNull();
  });
});

describe("followupMessageQueued", () => {
  it("feito, com envio e job, sem desfecho", () => {
    expect(followupMessageQueued({ status: "done", send_message: true, outreach_job_id: "j", result: {} })).toBe(true);
    expect(followupMessageQueued({ status: "done", send_message: true, outreach_job_id: "j", result: { message: "sent" } })).toBe(false);
    expect(followupMessageQueued({ status: "done", send_message: true, outreach_job_id: null, result: {} })).toBe(false);
  });
});

describe("outreachLineExists", () => {
  it("Solo exige a instância", () => {
    expect(outreachLineExists({ provider: "solo", solo_instance_id: "i", channel_id: "" })).toBe(true);
    expect(outreachLineExists({ provider: "solo", solo_instance_id: null, channel_id: "c" })).toBe(false);
  });
  it("outros provedores exigem o canal", () => {
    expect(outreachLineExists({ provider: "ycloud", solo_instance_id: "i", channel_id: " " })).toBe(false);
    expect(outreachLineExists({ provider: "ycloud", channel_id: " c " })).toBe(true);
    expect(outreachLineExists(null)).toBe(false);
  });
});
