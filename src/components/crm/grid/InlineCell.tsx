import { useCallback, useEffect, useRef, useState } from "react";
import type { ColumnDef, GridRow } from "./types";
import { getHandler } from "./columnTypes";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface InlineCellProps {
  row: GridRow;
  column: ColumnDef;
  value: unknown;
  onCommit: (value: unknown) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert a date-like value to YYYY-MM-DD for the HTML date input. */
function toDateInputValue(value: unknown): string {
  if (value == null) return "";
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().split("T")[0];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function InlineCell({ row, column, value, onCommit }: InlineCellProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const committedRef = useRef(false);

  const handler = getHandler(column.kind);
  const displayText = handler.format(value, column);
  const canEdit = column.editable !== false;

  // -- Enter edit mode on double-click ------------------------------------
  const handleDoubleClick = useCallback(() => {
    if (!canEdit) return;
    committedRef.current = false;
    setEditValue(
      value == null
        ? ""
        : column.kind === "date"
          ? toDateInputValue(value)
          : String(value),
    );
    setIsEditing(true);
  }, [canEdit, value, column.kind]);

  // Auto-focus the input when entering edit mode
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isEditing]);

  // -- Commit parsed value (Enter / blur) --------------------------------
  const commit = useCallback(() => {
    const parsed = handler.parse(editValue, column);
    if (parsed !== value) {
      onCommit(parsed);
    }
    setIsEditing(false);
  }, [handler, editValue, column, value, onCommit]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setIsEditing(false); // revert — no commit
      } else if (e.key === "Enter") {
        e.preventDefault();
        commit();
      }
    },
    [commit],
  );

  // -- Display-only (non-editable) ---------------------------------------
  if (!canEdit) {
    return (
      <div className="flex h-8 w-full items-center truncate px-3 text-sm">
        {displayText}
      </div>
    );
  }

  // -- Edit mode ---------------------------------------------------------
  if (isEditing) {
    // Select kind → shadcn Select dropdown
    if (column.kind === "select") {
      return (
        <Select
          value={editValue}
          onValueChange={(newValue) => {
            committedRef.current = true;
            const parsed = handler.parse(newValue, column);
            if (parsed !== value) {
              onCommit(parsed);
            }
            setIsEditing(false);
          }}
          onOpenChange={(open) => {
            if (!open && !committedRef.current) {
              // user dismissed dropdown without selecting → revert
              setIsEditing(false);
            }
          }}
        >
          <SelectTrigger className="h-8 w-full text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {column.options?.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }

    // Relation kind → placeholder button
    if (column.kind === "relation") {
      return (
        <div className="flex h-8 w-full items-center px-3 text-sm">
          <button
            type="button"
            onClick={() => {
              // TODO(W2): relation picker
            }}
            className="text-muted-foreground underline hover:text-foreground"
          >
            Vincular...
          </button>
        </div>
      );
    }

    // Text / Number / Date → native <input>
    const inputType =
      column.kind === "number"
        ? "number"
        : column.kind === "date"
          ? "date"
          : "text";

    return (
      <input
        ref={inputRef}
        type={inputType}
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={commit}
        onKeyDown={handleKeyDown}
        className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
      />
    );
  }

  // -- Display mode ------------------------------------------------------
  return (
    <div
      className="flex h-8 w-full cursor-pointer items-center truncate px-3 text-sm"
      onDoubleClick={handleDoubleClick}
      title={displayText}
    >
      {displayText}
    </div>
  );
}
