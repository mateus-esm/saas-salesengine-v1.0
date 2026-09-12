import { useState } from "react";
import { format } from "date-fns";
import { ChevronDown, ChevronUp, Compass } from "lucide-react";

import { useLeadAttribution, type AttributionTouch } from "@/hooks/useLeadAttribution";
import { touchSummary } from "@/lib/attribution";

const when = (iso: string) => {
  try {
    return format(new Date(iso), "dd/MM/yyyy HH:mm");
  } catch {
    return iso;
  }
};

function Details({ t }: { t: AttributionTouch }) {
  const rows: [string, string | undefined][] = [
    ["UTM", [t.utm_source, t.utm_medium, t.utm_campaign, t.utm_content, t.utm_term].filter(Boolean).join(" / ") || undefined],
    ["Anúncio", [t.campaign_name, t.adset_name, t.ad_name].filter(Boolean).join(" › ") || t.ad_id],
    ["Formulário", t.form_name],
    ["Página", t.landing_page],
    ["Veio de", t.referrer],
    ["Click ID", t.gclid ? `gclid ${t.gclid}` : t.ctwa_clid ? `ctwa ${t.ctwa_clid}` : t.fbclid ? `fbclid ${t.fbclid}` : undefined],
  ];
  const shown = rows.filter(([, v]) => !!v);
  if (shown.length === 0) return null;
  return (
    <dl className="mt-1 grid grid-cols-[auto,1fr] gap-x-3 gap-y-0.5 text-xs">
      {shown.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted-foreground">{k}</dt>
          <dd className="min-w-0 break-all">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

interface OriginBlockProps {
  leadId: string | null | undefined;
  open: boolean;
}

/**
 * Sprint 11 · Onda 5 · T53 — where the lead came from: the first arrival (which
 * door, category, platform, campaign, UTMs, ad, form, page, click ID) and, when
 * it came back, the last one and the whole history.
 */
export function OriginBlock({ leadId, open }: OriginBlockProps) {
  const { data } = useLeadAttribution(leadId, open);
  const [showAll, setShowAll] = useState(false);

  if (!data || data.total === 0) return null;
  const first = data.touches.find((t) => t.first) ?? data.touches[data.touches.length - 1];
  const last = data.touches[0];

  return (
    <section className="space-y-2">
      <h4 className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        <Compass className="h-3.5 w-3.5" />
        Origem
      </h4>
      <div className="rounded-md border border-border p-2.5 text-sm">
        <p className="font-medium">{touchSummary(first) || "Sem carimbo"}</p>
        <p className="text-xs text-muted-foreground">Primeira chegada · {when(first.occurred_at)}</p>
        <Details t={first} />
      </div>
      {data.total > 1 && last.id !== first.id && (
        <div className="rounded-md border border-dashed border-border p-2.5 text-sm">
          <p>{touchSummary(last) || "Sem carimbo"}</p>
          <p className="text-xs text-muted-foreground">Última chegada · {when(last.occurred_at)}</p>
        </div>
      )}
      {data.total > 1 && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="flex items-center gap-1 text-xs text-primary hover:underline"
        >
          {showAll ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          {showAll ? "Esconder as chegadas" : `Ver as ${data.total} chegadas`}
        </button>
      )}
      {showAll && (
        <ul className="space-y-1.5 border-l border-border pl-3">
          {data.touches.map((t) => (
            <li key={t.id} className="text-xs">
              <span className="tabular-nums text-muted-foreground">{when(t.occurred_at)}</span> · {touchSummary(t) || "Sem carimbo"}
              {t.first && <span className="ml-1 text-muted-foreground">(primeira)</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
