// Sprint 11 · Onda 2 — a person as initials in a colored circle.
//
// Pure (no data fetching): the Kanban card, the table and the picker already
// have the name. The color comes from the id, so one person always has the same
// color across screens.

import { cn } from "@/lib/utils";

const PALETTE = [
  "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  "bg-teal-500/15 text-teal-700 dark:text-teal-300",
  "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300",
  "bg-orange-500/15 text-orange-700 dark:text-orange-300",
];

export function initialsOf(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? "" : "";
  return (first + last).toUpperCase();
}

function colorFor(id: string | null | undefined): string {
  if (!id) return "bg-muted text-muted-foreground";
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

const SIZES = {
  xs: "h-5 w-5 text-[9px]",
  sm: "h-6 w-6 text-[10px]",
  md: "h-8 w-8 text-xs",
} as const;

interface UserAvatarProps {
  userId: string | null | undefined;
  name: string | null | undefined;
  size?: keyof typeof SIZES;
  className?: string;
}

export function UserAvatar({ userId, name, size = "sm", className }: UserAvatarProps) {
  const label = name?.trim() || (userId ? "Usuário removido" : "Sem responsável");
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold leading-none select-none",
        SIZES[size],
        userId ? colorFor(userId) : "border border-dashed border-muted-foreground/40 text-muted-foreground",
        className,
      )}
      title={label}
      aria-label={label}
    >
      {userId ? initialsOf(name) : "–"}
    </span>
  );
}
