// Sprint 11 · Onda 2 · T15 — one grid cell, right for its field type.
//
// Display is pure: no query, no subscription — a 50-row page with 15 columns is
// 750 of these, and the old cell ran a relation query in every one of them. The
// editor is mounted only while editing and is chosen by the registry
// (spec.inlineEdit): a Select shows the field's options, a multi-select writes a
// list, a date is stored as local midnight, a person is picked from the team.
// Success is silent (the cell shows the new value); a failed save shows on the
// cell itself, and the value goes back.

import { useCallback, useRef, useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useRelationResolver } from "@/hooks/useRelationResolver";
import { toDateInputValue } from "@/lib/fields/dateOnly";
import { getFieldType, isFieldType, type InlineEditor } from "@/lib/fields/registry";
import { cn } from "@/lib/utils";

import { MultiSelectPicker } from "../fields/MultiSelectPicker";
import { UserAvatar } from "../fields/UserAvatar";
import { UserPicker } from "../fields/UserPicker";
import { getHandler } from "./columnTypes";
import { RelationChip } from "./RelationChip";
import { RelationPicker } from "./RelationPicker";
import type { ColumnDef, GridRow } from "./types";

export interface InlineCellProps {
  row: GridRow;
  column: ColumnDef;
  value: unknown;
  /** May return a promise: a rejection is shown on the cell. */
  onCommit: (value: unknown) => Promise<void> | void;
  equipeId?: string;
  fromTable?: string;
  /** For the primary column: open the record. */
  onOpen?: () => void;
}

const sameValue = (a: unknown, b: unknown) =>
  a === b || JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

const CELL = "flex h-8 w-full items-center px-3 text-sm";
const INPUT =
  "h-8 w-full rounded-none border-0 bg-background px-3 text-sm outline-none ring-2 ring-inset ring-primary";

export function InlineCell(props: InlineCellProps) {
  if (props.column.kind === "relation") return <RelationCell {...props} />;
  return <FieldCell {...props} />;
}

// ---------------------------------------------------------------------------
// Field cells
// ---------------------------------------------------------------------------

function FieldCell({ column, value, onCommit, onOpen }: InlineCellProps) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handler = getHandler(column.kind);
  const spec = isFieldType(column.kind) ? getFieldType(column.kind) : null;
  const editor: InlineEditor | null =
    column.editable === false || column.primary ? null : spec?.inlineEdit ?? null;
  const display = handler.format(value, column);

  const commit = useCallback(
    async (next: unknown) => {
      setEditing(false);
      if (sameValue(next, value)) return;
      setSaving(true);
      setError(null);
      try {
        await onCommit(next);
      } catch (e) {
        setError(e instanceof Error && e.message ? e.message : "Não foi possível salvar.");
      } finally {
        setSaving(false);
      }
    },
    [onCommit, value],
  );

  if (column.primary) {
    return (
      <div className={CELL}>
        <button
          type="button"
          onClick={onOpen}
          className="truncate text-left font-medium underline-offset-2 hover:text-primary hover:underline"
          title={display}
        >
          {display || "—"}
        </button>
      </div>
    );
  }

  if (editing && editor) {
    return (
      <CellEditor
        editor={editor}
        column={column}
        value={value}
        display={display}
        onDone={(next) => (next === undefined ? setEditing(false) : void commit(next))}
      />
    );
  }

  const startEditing = () => {
    if (!editor) return;
    setError(null);
    setEditing(true);
  };

  return (
    <div
      className={cn(
        CELL,
        "gap-1.5",
        editor && "cursor-pointer",
        error && "ring-1 ring-inset ring-destructive",
      )}
      onDoubleClick={startEditing}
      onKeyDown={(e) => {
        if (editor && (e.key === "Enter" || e.key === "F2")) {
          e.preventDefault();
          startEditing();
        }
      }}
      tabIndex={editor ? 0 : undefined}
      title={error ?? display}
      data-testid={`cell-${column.key}`}
    >
      <CellDisplay column={column} value={value} display={display} />
      {saving && <Loader2 className="h-3 w-3 shrink-0 animate-spin text-muted-foreground" />}
      {error && (
        <AlertCircle className="h-3.5 w-3.5 shrink-0 text-destructive" role="img" aria-label={error} />
      )}
    </div>
  );
}

function CellDisplay({ column, value, display }: { column: ColumnDef; value: unknown; display: string }) {
  if (column.kind === "user" && typeof value === "string" && value) {
    return (
      <span className="flex min-w-0 items-center gap-1.5">
        <UserAvatar userId={value} name={display} size="xs" />
        <span className="truncate">{display}</span>
      </span>
    );
  }
  if (column.kind === "url" && typeof value === "string" && value.trim()) {
    const href = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
        className="truncate text-primary hover:underline"
      >
        {display}
      </a>
    );
  }
  if (column.kind === "multi_select" && Array.isArray(value) && value.length > 0) {
    return (
      <span className="flex min-w-0 items-center gap-1 overflow-hidden">
        {value.slice(0, 3).map((item) => (
          <span key={String(item)} className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[11px]">
            {String(item)}
          </span>
        ))}
        {value.length > 3 && <span className="text-[11px] text-muted-foreground">+{value.length - 3}</span>}
      </span>
    );
  }
  return <span className="truncate">{display}</span>;
}

// ---------------------------------------------------------------------------
// Editors
// ---------------------------------------------------------------------------

interface EditorProps {
  editor: InlineEditor;
  column: ColumnDef;
  value: unknown;
  display: string;
  /** The new value, or undefined for "cancelled". Called once. */
  onDone: (next: unknown | undefined) => void;
}

/** Calls onDone at most once — blur after Enter, close after pick, and so on. */
function useOnce(onDone: (next: unknown | undefined) => void) {
  const done = useRef(false);
  return (next: unknown | undefined) => {
    if (done.current) return;
    done.current = true;
    onDone(next);
  };
}

function CellEditor(props: EditorProps) {
  switch (props.editor) {
    case "select":
      return <SelectEditor {...props} />;
    case "boolean":
      return <BooleanEditor {...props} />;
    case "multi_select":
      return <MultiSelectEditor {...props} />;
    case "user":
      return <UserEditor {...props} />;
    case "date":
      return <DateEditor {...props} />;
    default:
      return <TextEditor {...props} />;
  }
}

function TextEditor({ editor, column, value, onDone }: EditorProps) {
  const finish = useOnce(onDone);
  const numeric = editor === "number" || editor === "currency";
  const initial =
    value === null || value === undefined
      ? ""
      : numeric && typeof value === "number"
        ? String(value).replace(".", ",")
        : String(value);
  const [text, setText] = useState(initial);
  const handler = getHandler(column.kind);

  return (
    <input
      autoFocus
      aria-label={column.label}
      type={editor === "url" ? "url" : "text"}
      inputMode={numeric ? "decimal" : editor === "phone" ? "tel" : undefined}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => finish(handler.parse(text, column))}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          finish(handler.parse(text, column));
        } else if (e.key === "Escape") {
          e.preventDefault();
          finish(undefined);
        }
      }}
      className={INPUT}
    />
  );
}

function DateEditor({ column, value, onDone }: EditorProps) {
  const finish = useOnce(onDone);
  const [text, setText] = useState(toDateInputValue(value));
  const handler = getHandler(column.kind);

  return (
    <input
      autoFocus
      aria-label={column.label}
      type="date"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => finish(handler.parse(text, column))}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          finish(handler.parse(text, column));
        } else if (e.key === "Escape") {
          e.preventDefault();
          finish(undefined);
        }
      }}
      className={INPUT}
    />
  );
}

// A native select: it opens the system picker, works with the keyboard, and has
// no portal to fight inside a scrolling table.
function SelectEditor({ column, value, onDone }: EditorProps) {
  const finish = useOnce(onDone);
  const handler = getHandler(column.kind);
  const current = value === null || value === undefined ? "" : String(value);
  const options = column.options ?? [];
  const known = options.some((o) => o.value === current);

  return (
    <select
      autoFocus
      aria-label={column.label}
      defaultValue={current}
      onChange={(e) => finish(e.target.value === "" ? null : handler.parse(e.target.value, column))}
      onBlur={() => finish(undefined)}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          finish(undefined);
        }
      }}
      className={INPUT}
    >
      <option value="">— vazio —</option>
      {current && !known && <option value={current}>{current}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function BooleanEditor({ column, value, onDone }: EditorProps) {
  const finish = useOnce(onDone);
  const spec = getFieldType("boolean");
  const shown = spec.format(value);
  const current = shown === "Sim" ? "true" : shown === "Não" ? "false" : "";

  return (
    <select
      autoFocus
      aria-label={column.label}
      defaultValue={current}
      onChange={(e) => finish(e.target.value === "" ? null : e.target.value === "true")}
      onBlur={() => finish(undefined)}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          finish(undefined);
        }
      }}
      className={INPUT}
    >
      <option value="">— vazio —</option>
      <option value="true">Sim</option>
      <option value="false">Não</option>
    </select>
  );
}

function MultiSelectEditor({ column, value, onDone }: EditorProps) {
  const finish = useOnce(onDone);
  const [draft, setDraft] = useState<string[]>(
    Array.isArray(value) ? value.map(String) : typeof value === "string" && value ? [value] : [],
  );
  const [open, setOpen] = useState(true);
  const close = () => {
    setOpen(false);
    finish(draft.length ? draft : null);
  };

  return (
    <Popover open={open} onOpenChange={(o) => !o && close()}>
      <PopoverTrigger asChild>
        <div className={cn(CELL, "ring-2 ring-inset ring-primary")} aria-label={column.label}>
          <span className="truncate">{draft.join(", ") || "—"}</span>
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-60 p-0" align="start">
        <MultiSelectPicker options={(column.options ?? []).map((o) => o.value)} value={draft} onChange={setDraft} />
        <div className="flex justify-end border-t p-1">
          <Button type="button" size="sm" variant="ghost" onClick={close}>
            Pronto
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function UserEditor({ value, display, onDone }: EditorProps) {
  const finish = useOnce(onDone);
  const current = typeof value === "string" && value ? value : null;

  return (
    <UserPicker
      value={current}
      open
      onOpenChange={(o) => !o && finish(undefined)}
      onChange={(id) => finish(id)}
      noneLabel="Ninguém"
      trigger={
        <div className={cn(CELL, "gap-1.5 ring-2 ring-inset ring-primary")}>
          <UserAvatar userId={current} name={display} size="xs" />
          <span className="truncate">{display || "—"}</span>
        </div>
      }
    />
  );
}

// ---------------------------------------------------------------------------
// Relation cells
// ---------------------------------------------------------------------------

type Chip = { toId: string; label: string };

function chipsFromRow(value: unknown): Chip[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const id = record.id ?? record.toId;
      const name = record.name ?? record.label;
      return typeof id === "string" ? { toId: id, label: typeof name === "string" ? name : "[registro]" } : null;
    })
    .filter((c): c is Chip => c !== null);
}

function RelationCell({ row, column, value, onCommit, equipeId, fromTable }: InlineCellProps) {
  const [editing, setEditing] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const fromRow = !!column.relation?.resolvedFromRow;

  // Only relation columns that do not bring their chips in the row still query.
  const context =
    !fromRow && equipeId && fromTable ? { fromTable, equipeId } : { fromTable: "", equipeId: "" };
  const { links: resolved, loading } = useRelationResolver(column, row.id, context);
  const links = fromRow ? chipsFromRow(value) : resolved;
  const canEdit = column.editable !== false;

  const pick = (toId: string, label: string) => {
    void onCommit({ toId, label });
    setEditing(false);
  };

  return (
    <div
      className="flex h-8 w-full items-center gap-1 overflow-hidden px-1 text-sm"
      onDoubleClick={() => canEdit && setEditing(true)}
    >
      {!fromRow && loading ? (
        <span className="text-xs text-muted-foreground">Carregando...</span>
      ) : links.length > 0 ? (
        links.map((chip) => (
          <RelationChip
            key={chip.toId}
            label={chip.label}
            onRemove={editing ? () => void onCommit({ toId: chip.toId, action: "remove" }) : undefined}
          />
        ))
      ) : (
        !editing && <span className="text-xs text-muted-foreground">—</span>
      )}
      {editing && (
        <>
          <RelationPicker
            column={column}
            open={pickerOpen}
            onOpenChange={setPickerOpen}
            onPick={pick}
            equipeId={equipeId ?? ""}
          />
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="shrink-0 text-xs text-muted-foreground underline hover:text-foreground"
          >
            Vincular...
          </button>
        </>
      )}
    </div>
  );
}
