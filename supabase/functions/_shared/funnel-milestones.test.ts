import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  bucketHasHistory,
  compactCounts,
  hasAnyMilestone,
  MILESTONES,
  normalizeMilestones,
  seriesNote,
} from "./funnel-milestones.ts";

Deno.test("resposta nula vira zeros explícitos e since nulo", () => {
  const m = normalizeMilestones(null);
  assertEquals(m.granularity, "day");
  assertEquals(m.totals, { qualified: 0, proposal_sent: 0, meeting_scheduled: 0, meeting_done: 0, no_show: 0, won: 0 });
  assertEquals(m.series, []);
  assertEquals(m.by_seller, []);
  assertEquals(m.since.no_show, null);
});

Deno.test("normaliza linhas, nomes e balde", () => {
  const m = normalizeMilestones({
    granularity: "week",
    totals: { meeting_done: "3" },
    series: [{ bucket: "2026-10-12T00:00:00", bucket_end: "2026-10-19T03:00:00+00:00", meeting_done: 3 }],
    by_seller: [{ seller_id: null, seller_name: null, no_show: 1 }, { seller_id: "a", seller_name: " Ana ", won: 2 }],
    by_pipeline: [{ pipeline_id: "p", pipeline_name: "Solar", qualified: 4 }],
    since: { no_show: "2026-10-16T13:00:00Z", won: 7 },
  });
  assertEquals(m.granularity, "week");
  assertEquals(m.totals.meeting_done, 3);
  assertEquals(m.series[0].bucket, "2026-10-12");
  assertEquals(m.series[0].bucket_end, "2026-10-19T03:00:00+00:00");
  assertEquals(m.by_seller[0].name, "Não atribuído");
  assertEquals(m.by_seller[1].name, "Ana");
  assertEquals(m.by_pipeline[0].qualified, 4);
  assertEquals(m.since.no_show, "2026-10-16T13:00:00Z");
  assertEquals(m.since.won, null, "since não-string é descartado");
});

Deno.test("seriesNote: sem registro, começa depois, já existia", () => {
  const from = "2026-10-01T03:00:00Z";
  assertEquals(seriesNote(null, from), "série ainda sem registros");
  assertEquals(seriesNote("2026-10-16T13:00:00Z", from), "série começa em 16/10/2026");
  assertEquals(seriesNote("2026-09-02T13:00:00Z", from), null);
});

Deno.test("bucketHasHistory: balde antes do primeiro evento não tem dado", () => {
  assertEquals(bucketHasHistory(null, "2026-10-02T03:00:00Z"), false);
  assertEquals(bucketHasHistory("2026-10-16T13:00:00Z", "2026-10-16T03:00:00Z"), false);
  assertEquals(bucketHasHistory("2026-10-16T13:00:00Z", "2026-10-17T03:00:00Z"), true);
  assertEquals(bucketHasHistory("2026-10-16T13:00:00Z", null), true, "sem fim conhecido, não esconde");
});

Deno.test("compactCounts segue a ordem dos marcos", () => {
  const c = { qualified: 1, proposal_sent: 0, meeting_scheduled: 2, meeting_done: 1, no_show: 0, won: 0 };
  assertEquals(compactCounts(c), "Qualif. 1 · Prop. 0 · Agend. 2 · Realiz. 1 · No-show 0 · Fech. 0");
  assertEquals(hasAnyMilestone(c), true);
  assertEquals(hasAnyMilestone({ ...c, qualified: 0, meeting_scheduled: 0, meeting_done: 0 }), false);
  assertEquals(MILESTONES.map((m) => m.key), ["qualified", "proposal_sent", "meeting_scheduled", "meeting_done", "no_show", "won"]);
});
