import { Link, useNavigate } from "react-router-dom";
import { Bell, CheckCheck, AlertTriangle, Info, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useNotifications, relativeTime, type Severity, type AppNotification } from "@/hooks/useNotifications";

const ICONS: Record<Severity, { icon: React.ElementType; className: string }> = {
  info:     { icon: Info,          className: "text-blue-600" },
  success:  { icon: CheckCircle2,  className: "text-green-600" },
  warn:     { icon: AlertTriangle, className: "text-amber-600" },
  critical: { icon: XCircle,       className: "text-red-600" },
};

/** Sprint 8 T14 — persistent notifications, unlike the toasts they replace. */
export function NotificationBell() {
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications(20);
  const navigate = useNavigate();

  const open = async (n: AppNotification) => {
    if (!n.read_at) await markRead(n.id);
    if (n.action_url) navigate(n.action_url);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notificações">
          <Bell className="w-[18px] h-[18px]" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[17px] h-[17px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-[360px] p-0">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <p className="text-sm font-semibold">Notificações</p>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={markAllRead}>
              <CheckCheck className="w-3.5 h-3.5 mr-1" /> Marcar todas
            </Button>
          )}
        </div>

        <ScrollArea className="max-h-[360px]">
          {!notifications.length ? (
            <div className="py-12 text-center">
              <Bell className="w-7 h-7 mx-auto text-muted-foreground/30 mb-2" />
              <p className="text-sm text-muted-foreground">Nenhuma notificação.</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {notifications.map((n) => {
                const { icon: Icon, className } = ICONS[n.severity] ?? ICONS.info;
                return (
                  <button
                    key={n.id}
                    onClick={() => open(n)}
                    className={cn(
                      "w-full text-left px-4 py-3 flex gap-3 hover:bg-muted/60 transition-colors",
                      !n.read_at && "bg-primary/[0.04]",
                    )}
                  >
                    <Icon className={cn("w-4 h-4 shrink-0 mt-0.5", className)} />
                    <div className="min-w-0 flex-1">
                      <p className={cn("text-sm leading-snug", !n.read_at && "font-semibold")}>{n.title}</p>
                      {n.body && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.body}</p>
                      )}
                      <p className="text-[11px] text-muted-foreground/70 mt-1">{relativeTime(n.created_at)}</p>
                    </div>
                    {!n.read_at && <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-1.5" />}
                  </button>
                );
              })}
            </div>
          )}
        </ScrollArea>

        <div className="border-t border-border px-4 py-2">
          <Button asChild variant="ghost" size="sm" className="w-full h-8 text-xs">
            <Link to="/notificacoes">Ver todas</Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
