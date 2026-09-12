// Sprint 11 · Onda 3 · T35 — the natures of a line (pipeline).
//
// A line is configured by its natures (motores_revops.md §4.2): Oferta (what it
// sells) and Processo (how it sells) from Onda 3; Duração (continuous, or a
// campaign with a start and an end) from Onda 5 · T55. Entradas — the doors that
// feed the line — is not stored here: it is each entry's line (crm_entries).
// Stored in pipelines.natures (jsonb).

export type OfferMode = "free" | "catalog";
export type ProcessMode = "milestones" | "direct";
export type DurationMode = "continuous" | "campaign";

/** The canonical milestones a stage can declare (funnel_event), in funnel order. */
export type Milestone =
  | "qualified"
  | "meeting_scheduled"
  | "meeting_done"
  | "proposal_sent"
  | "contract_sent"
  | "contract_signed";

export interface PipelineNatures {
  offer: {
    /** free = the deal value is typed (today's behaviour); catalog = the deal lists items. */
    mode: OfferMode;
    /** In catalog mode, which catalog items this line offers; empty = all of them. */
    catalog_item_ids: string[];
  };
  process: {
    /** milestones = a consultative sale; direct = one-touch purchase (came in → bought). */
    mode: ProcessMode;
    milestones: Milestone[];
  };
  duration: {
    /** campaign = after ends_on the line takes no new deal (they go to the team default). */
    mode: DurationMode;
    /** YYYY-MM-DD, both set in campaign mode. */
    starts_on: string | null;
    ends_on: string | null;
  };
}
