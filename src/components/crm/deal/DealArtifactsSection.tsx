import { useMemo, useState } from "react";
import { format } from "date-fns";
import { FileText, Loader2, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { CustomTableRecord } from "@/hooks/useCustomTableRecords";
import { useCustomTableRelations } from "@/hooks/useCustomTableRecords";
import { useSetArtifactStatus } from "@/hooks/useArtifactStatus";
import { useDealArtifacts, type DealArtifactGroup } from "@/hooks/useDealArtifacts";
import { useMemberDirectory } from "@/hooks/useMemberDirectory";
import { recordTitle, type ArtifactStatus } from "@/lib/artifacts";
import { activeColumns, recordValues } from "@/lib/customTables";
import { formIsOn } from "@/lib/publicForm";

import { ArtifactStatusSelect } from "../customtables/ArtifactStatusSelect";
import { CustomRecordDrawer } from "../customtables/CustomRecordDrawer";

const day = (iso: string) => {
  try {
    return format(new Date(iso), "dd/MM/yyyy");
  } catch {
    return iso;
  }
};

interface DealArtifactsSectionProps {
  opportunityId: string;
  open: boolean;
  /**
   * Sprint 11 · T43 — a status that proves a milestone can move the deal: the
   * modal takes the new stage (its "Salvar" would otherwise put the old one back).
   */
  onDealMoved?: (stageId: string) => void;
}

/**
 * Sprint 11 · Onda 4 · T40 — what the deal has on paper: one block per artifact
 * table of the team ("Propostas (3)"), each record with its status; "Nova" creates
 * one already held by this deal, a click opens it. Nothing shows when the team
 * has no artifact table. T43: the status changes here (and in the drawer).
 */
export function DealArtifactsSection({ opportunityId, open, onDealMoved }: DealArtifactsSectionProps) {
  const { groups, isLoading, createArtifact, updateArtifact, deleteArtifact } = useDealArtifacts(opportunityId, open);
  const setStatus = useSetArtifactStatus();
  const { nameOf } = useMemberDirectory();
  const [opened, setOpened] = useState<{ group: DealArtifactGroup; record: CustomTableRecord } | null>(null);
  const [creatingIn, setCreatingIn] = useState<string | null>(null);

  if (isLoading || groups.length === 0) return null;

  const changeStatus = async (recordId: string, status: ArtifactStatus) => {
    const result = await setStatus.mutateAsync({ recordId, status });
    if (result.moved && result.stage_id) onDealMoved?.(result.stage_id);
    return result;
  };

  const handleCreate = async (group: DealArtifactGroup) => {
    setCreatingIn(group.table.id);
    try {
      const record = await createArtifact.mutateAsync({ tableId: group.table.id });
      setOpened({ group, record });
    } catch {
      // the hook shows the error
    } finally {
      setCreatingIn(null);
    }
  };

  return (
    <section className="space-y-3">
      {groups.map((group) => {
        const columns = activeColumns(group.table.table_schema);
        return (
          <div key={group.table.id} className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <h4 className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                <FileText className="h-3.5 w-3.5" />
                {group.table.name} ({group.records.length})
              </h4>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => void handleCreate(group)}
                disabled={creatingIn !== null}
              >
                {creatingIn === group.table.id ? (
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                ) : (
                  <Plus className="mr-1 h-3 w-3" />
                )}
                Nova
              </Button>
            </div>
            {group.records.length > 0 && (
              <ul className="divide-y divide-border rounded-md border border-border">
                {group.records.map((record) => (
                  <li key={record.id} className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted/50">
                    <button
                      type="button"
                      onClick={() => setOpened({ group, record })}
                      className="min-w-0 flex-1 truncate text-left font-medium"
                    >
                      {recordTitle(recordValues(record), columns, { nameOf })}
                    </button>
                    {group.table.artifact_kind && (
                      <ArtifactStatusSelect
                        kind={group.table.artifact_kind}
                        value={record.artifact_status}
                        onChange={(s) => void changeStatus(record.id, s).catch(() => {})}
                        disabled={setStatus.isPending}
                      />
                    )}
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{day(record.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}

      {opened && (
        <ArtifactDrawer
          group={opened.group}
          record={opened.record}
          onClose={() => setOpened(null)}
          onSave={(id, data) => updateArtifact.mutateAsync({ id, tableId: opened.group.table.id, data })}
          onDelete={(id) => deleteArtifact.mutate({ id, tableId: opened.group.table.id })}
          onStatusChange={(id, s) => changeStatus(id, s)}
        />
      )}
    </section>
  );
}

interface ArtifactDrawerProps {
  group: DealArtifactGroup;
  record: CustomTableRecord;
  onClose: () => void;
  onSave: (id: string, data: Record<string, unknown>) => Promise<unknown>;
  onDelete: (id: string) => void;
  onStatusChange: (id: string, status: ArtifactStatus) => Promise<unknown>;
}

/** The record's drawer, the same as in the table (relations resolved per column). */
function ArtifactDrawer({ group, record, onClose, onSave, onDelete, onStatusChange }: ArtifactDrawerProps) {
  const columns = useMemo(() => activeColumns(group.table.table_schema), [group.table.table_schema]);
  const relations = useCustomTableRelations(group.table, columns);
  return (
    <CustomRecordDrawer
      record={record}
      columns={columns}
      relations={relations}
      onClose={onClose}
      onSave={onSave}
      onDelete={onDelete}
      artifactKind={group.table.artifact_kind}
      onStatusChange={onStatusChange}
      actions={group.table.actions}
      formEnabled={formIsOn(group.table.form_config)}
    />
  );
}
