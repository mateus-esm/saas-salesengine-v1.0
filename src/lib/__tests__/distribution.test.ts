import { describe, expect, it } from "vitest";
import {
  DEFAULT_DISTRIBUTION,
  describeRule,
  distributionErrorMessage,
  normalizeDistribution,
  ruleFieldOptions,
  toSavePayload,
  validateDistribution,
  type DistributionConfig,
} from "@/lib/distribution";

const A = "11111111-1111-1111-1111-111111111111";
const B = "22222222-2222-2222-2222-222222222222";
const schema = [
  { field_id: "f1", label: "Tipo de imóvel", is_deleted: false },
  { field_id: "f2", label: "Antigo", is_deleted: true },
];

describe("normalizeDistribution", () => {
  it("sem linha = roleta desligada, rodízio, pular ausentes", () => {
    expect(normalizeDistribution(null)).toEqual(DEFAULT_DISTRIBUTION);
    expect(DEFAULT_DISTRIBUTION).toMatchObject({ active: false, mode: "round_robin", skip_away: true, max_open_per_seller: null });
  });

  it("lê a linha do banco com tolerância", () => {
    const d = normalizeDistribution({
      mode: "weighted",
      active: true,
      members: [{ user_id: A, weight: "3", away: true }, { user_id: B }],
      rules: [{ field: "origem", value: "Indicação", user_ids: [B] }],
      max_open_per_seller: 20,
      skip_away: false,
    });
    expect(d.members).toEqual([{ user_id: A, weight: 3, away: true }, { user_id: B, weight: 1, away: false }]);
    expect(d.rules[0]).toEqual({ field: "origem", value: "Indicação", user_ids: [B] });
    expect(d.max_open_per_seller).toBe(20);
    expect(d.skip_away).toBe(false);
  });
});

describe("validateDistribution", () => {
  const base: DistributionConfig = { ...DEFAULT_DISTRIBUTION, active: true, members: [{ user_id: A, weight: 1, away: false }] };

  it("ativa sem membros é recusada", () => {
    expect(validateDistribution({ ...base, members: [] })).toContain("Adicione pelo menos um vendedor à roleta.");
    expect(validateDistribution({ ...base, members: [], active: false })).toEqual([]);
  });

  it("por regra exige regras completas e grupo dentro da roleta", () => {
    const errs = validateDistribution({
      ...base,
      mode: "by_rule",
      rules: [
        { field: "origem", value: "", user_ids: [A] },
        { field: "source", value: "Site", user_ids: [B] },
        { field: "channel", value: "whatsapp", user_ids: [] },
      ],
    });
    expect(errs).toEqual([
      "Regra 1: informe o valor.",
      "Regra 2: o grupo tem quem não está na roleta.",
      "Regra 3: escolha quem recebe.",
    ]);
    expect(validateDistribution({ ...base, mode: "by_rule", rules: [] })).toContain("Crie pelo menos uma regra.");
  });

  it("limite precisa ser inteiro positivo", () => {
    expect(validateDistribution({ ...base, max_open_per_seller: 0 })).toContain("O limite de negócios abertos deve ser um número inteiro maior que zero.");
    expect(validateDistribution({ ...base, max_open_per_seller: 2.5 })).toHaveLength(1);
    expect(validateDistribution({ ...base, max_open_per_seller: 10 })).toEqual([]);
  });
});

describe("regras", () => {
  it("campos: lista fechada + campos personalizados vivos do pipeline", () => {
    const opts = ruleFieldOptions(schema);
    expect(opts.map((o) => o.value)).toEqual([
      "origem", "source", "origin_category", "origin_detail", "origin_platform", "channel", "custom:f1",
    ]);
    expect(opts.at(-1)?.label).toBe("Tipo de imóvel");
  });

  it("describeRule usa o MESMO formato do motivo gravado pelo banco", () => {
    expect(describeRule({ field: "origem", value: " Indicação ", user_ids: [] }, 1, schema)).toBe("regra 2: origem=Indicação");
    expect(describeRule({ field: "custom:f1", value: "Casa", user_ids: [] }, 0, schema)).toBe("regra 1: Tipo de imóvel=Casa");
    expect(describeRule({ field: "source", value: "Site", user_ids: [] }, 2, schema)).toBe("regra 3: fonte=Site");
  });
});

describe("toSavePayload / erros", () => {
  it("payload só com as chaves que o RPC lê", () => {
    const p = toSavePayload({ ...DEFAULT_DISTRIBUTION, members: [{ user_id: A, weight: 2, away: false }] });
    expect(Object.keys(p).sort()).toEqual(["active", "max_open_per_seller", "members", "mode", "rules", "skip_away"]);
  });

  it("erros do RPC viram texto", () => {
    expect(distributionErrorMessage({ message: "member_not_in_team" })).toMatch(/não é da equipe/);
    expect(distributionErrorMessage({ message: "invalid_rule_group:2" })).toBe("Regra 2: o grupo tem quem não está na roleta.");
    expect(distributionErrorMessage(new Error("x"))).toBe("Não foi possível salvar a distribuição.");
  });
});
