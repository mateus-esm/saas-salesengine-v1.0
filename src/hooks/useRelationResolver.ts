import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface ResolvedLink {
  toId: string;
  label: string;
}

/**
 * Resolve custom_table_links edges into human-readable display labels for a
 * relation column cell.
 *
 * Queries the link table for edges matching (fromTable, fromId, relation_key),
 * then batch-fetches display labels from each target table. Supports a
 * `linkTable` override (used by core-entity columns).
 */
export function useRelationResolver(
  column: {
    key: string;
    relation?: {
      table: string;
      displayField: string;
      linkTable?: string;
    };
  },
  rowId: string,
  context: { fromTable: string; equipeId: string },
): { links: ResolvedLink[]; loading: boolean } {
  const linkTable = column.relation?.linkTable ?? "custom_table_links";
  const isOppLinks = linkTable === "opportunity_links";

  const { data, isLoading } = useQuery({
    queryKey: [
      "relation",
      isOppLinks ? "opp_links" : context.fromTable,
      rowId,
      column.key,
    ],
    queryFn: async (): Promise<ResolvedLink[]> => {
      const displayField = column.relation?.displayField ?? "name";
      const targetTable = column.relation?.table;

      // ---- opportunity_links schema (opportunity_id, linked_type, linked_id) ----
      if (isOppLinks) {
        const { data: edges } = await supabase
          .from("opportunity_links" as any)
          .select("linked_id")
          .eq("opportunity_id", rowId)
          .eq("linked_type", "company")
          .eq("equipe_id", context.equipeId)
          .is("deleted_at", null);

        if (!edges || edges.length === 0 || !targetTable) return [];

        const linkedIds = (edges as { linked_id: string }[]).map((e) => e.linked_id);

        const { data: records } = await supabase
          .from(targetTable as any)
          .select(`id, ${displayField}`)
          .in("id", linkedIds)
          .is("deleted_at", null);

        if (records) {
          return (records as { id: string; [k: string]: unknown }[]).map((r) => ({
            toId: r.id,
            label: String(r[displayField] ?? `[${targetTable}]`),
          }));
        }
        return [];
      }

      // ---- custom_table_links schema (from_table, from_id, to_id, to_table, relation_key) ----
      const { data: edges } = await supabase
        .from(linkTable as any)
        .select("to_id, to_table")
        .eq("from_table", context.fromTable)
        .eq("from_id", rowId)
        .eq("relation_key", column.key)
        .eq("equipe_id", context.equipeId)
        .is("deleted_at", null);

      if (!edges || edges.length === 0) return [];

      // Group to_ids by target table for batched queries.
      const tableGroups: Record<string, string[]> = {};
      for (const edge of edges) {
        if (!tableGroups[edge.to_table]) tableGroups[edge.to_table] = [];
        tableGroups[edge.to_table].push(edge.to_id);
      }

      const resolved: ResolvedLink[] = [];

      // Fetch display labels per target table.
      for (const [toTable, ids] of Object.entries(tableGroups)) {
        const { data: records } = await supabase
          .from(toTable as any)
          .select(`id, ${displayField}`)
          .in("id", ids)
          .is("deleted_at", null);

        if (records) {
          for (const r of records) {
            resolved.push({
              toId: r.id,
              label: String(r[displayField] ?? `[${toTable}]`),
            });
          }
        }
      }

      return resolved;
    },
    enabled: !!rowId && !!context.equipeId,
  });

  return { links: data ?? [], loading: isLoading };
}
