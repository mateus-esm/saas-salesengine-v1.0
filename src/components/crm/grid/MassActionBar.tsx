import { ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import { X, Check } from "lucide-react";

export interface MassAction {
  id: string;
  label: string;
  icon: ReactNode;
  run: (ids: string[]) => Promise<void>;
  destructive?: boolean;
}

interface MassActionBarProps {
  count: number;
  selectedIds: Set<string>;
  actions: MassAction[];
  onClear: () => void;
}

export function MassActionBar({
  count,
  selectedIds,
  actions,
  onClear,
}: MassActionBarProps): JSX.Element | null {
  const [running, setRunning] = useState(false);

  if (count === 0) return null;

  const handleAction = async (action: MassAction) => {
    setRunning(true);
    try {
      await action.run([...selectedIds]);
    } finally {
      setRunning(false);
      onClear();
    }
  };

  return (
    <div
      data-state={count > 0 ? "open" : "closed"}
      className="fixed bottom-0 inset-x-0 z-50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom border-t border-white/10"
    >
      <div className="bg-[hsl(0_0%_6%)] text-white px-4 py-3 flex items-center gap-4">
        {/* Left: selection count */}
        <span className="text-sm font-medium flex items-center gap-1.5 shrink-0">
          <Check className="h-4 w-4" />
          {count} selecionado{count !== 1 ? "s" : ""}
        </span>

        <div className="h-5 w-px bg-white/10" />

        {/* Middle: action buttons */}
        <div className="flex items-center gap-2 flex-1">
          {actions.map((action) => (
            <Button
              key={action.id}
              variant="ghost"
              size="sm"
              disabled={running}
              onClick={() => handleAction(action)}
              className={
                action.destructive
                  ? "text-red-400 hover:text-red-300 hover:bg-red-950/50"
                  : "text-white/80 hover:text-white hover:bg-white/10"
              }
            >
              {action.icon}
              {action.label}
            </Button>
          ))}
        </div>

        {/* Right: clear button */}
        <Button
          variant="ghost"
          size="sm"
          disabled={running}
          onClick={onClear}
          className="text-white/60 hover:text-white hover:bg-white/10 shrink-0"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
