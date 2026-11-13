import { Button } from "@/components/ui/button";

/**
 * A page that fails to load after the first one must not take the rows already
 * on screen away: this is the small notice that sits above the grid instead.
 */
export function GridLoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="mb-2 flex items-center justify-between gap-2 rounded-md border border-destructive/40 px-3 py-2 text-sm text-destructive"
    >
      <span>Não foi possível carregar mais registros.</span>
      <Button variant="outline" size="sm" onClick={onRetry}>
        Tentar de novo
      </Button>
    </div>
  );
}
