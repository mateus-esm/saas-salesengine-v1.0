// Sprint 11 · Onda 3 · T35 — the natures of a line (pipeline).
//
// A line is configured by its natures (motores_revops.md §4.2). This wave builds
// two of the four: Oferta (what it sells) and Processo (how it sells). Duração
// and Entradas come in Onda 5. Stored in pipelines.natures (jsonb).

export type OfferMode = "free" | "catalog";
export type ProcessMode = "milestones" | "direct";

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
}
