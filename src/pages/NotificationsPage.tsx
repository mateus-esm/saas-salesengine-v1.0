import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Bell, CheckCheck, AlertTriangle, Info, CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNotifications, relativeTime, type Severity, type AppNotification } from "@/hooks/useNotifications";

const ICONS: Record<Severity, { icon: React.ElementType; className: string }> = {
  info:     { icon: Info,          className: "text-blue-600" },
  success:  { icon: CheckCircle2,  className: "text-green-600" },
  warn:     { icon: AlertTriangle, className: "text-amber-600" },
  critical: { icon: XCircle,       className: "text-red-600" },
};

/** Sprint 8 T14 — full history, grouped by day. */
export default function NotificationsPage() {
  const { notifications, isLoading, unreadCount, markRead, markAllRead } = useNotifications(100);
  const navigate = useNavigate();

  const groups = notifications.reduce<Record<string, AppNotification[]>>((acc, n) => {
    const day = new Date(n.created_at).toLocaleDateString("pt-BR");
    (acc[day] ??= []).push(n);
    return acc;
  }, {});

  const open = async (n: AppNotification) => {
    if (!n.read_at) await markRead(n.id);
    if (n.action_url) navigate(n.action_url);
  };

  return (
    <div className="p-6 space-y-4 max-w-3xl">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Notificações</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {unreadCount > 0 ? `${unreadCount} não ${unreadCount === 1 ? "lida" : "lidas"}` : "Tudo lido."}
          </p>
        </div>
        {unreadCount > 0 && (
          <Button variant="outline" size="sm" onClick={markAllRead}>
            <CheckCheck className="w-4 h-4 mr-1.5" /> Marcar todas como lidas
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : !notifications.length ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Bell className="w-8 h-8 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">Nenhuma notificação.</p>
          </CardContent>
        </Card>
      ) : (
        Object.entries(groups).map(([day, items]) => (
          <div key={day} className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{day}</p>
            <Card>
              <CardContent className="p-0 divide-y divide-border">
                {items.map((n) => {
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
                        <p className={cn("text-sm", !n.read_at && "font-semibold")}>{n.title}</p>
                        {n.body && <p className="text-xs text-muted-foreground mt-0.5">{n.body}</p>}
                        <p className="text-[11px] text-muted-foreground/70 mt-1">{relativeTime(n.created_at)}</p>
                      </div>
                      {!n.read_at && <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-1.5" />}
                    </button>
                  );
                })}
              </CardContent>
            </Card>
          </div>
        ))
      )}
    </div>
  );
}
