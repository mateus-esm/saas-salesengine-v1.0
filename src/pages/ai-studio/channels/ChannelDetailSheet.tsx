import { useState, useEffect } from "react";
import { Loader2, Check, Pencil, X } from "lucide-react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { capabilityFor } from "@/lib/channel-capabilities";
import { ChannelConfigPanel } from "./ChannelConfigPanel";
import { ChannelConnectionPanel } from "./ChannelConnectionPanel";
import { WidgetInstallPanel } from "./WidgetInstallPanel";

export interface ChannelSummary {
  id: string;
  name: string;
  type: string;
  connected: boolean;
  username: string | null;
  departmentName: string | null;
}

interface Props {
  channel: ChannelSummary | null;
  onOpenChange: (open: boolean) => void;
  /** Refresh the parent list after a rename or a successful pairing. */
  onChanged: () => void;
}

type TabId = "conexao" | "config" | "instalacao";

export function ChannelDetailSheet({ channel, onOpenChange, onChanged }: Props) {
  const { toast } = useToast();
  const [tab, setTab] = useState<TabId>("conexao");
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [savingName, setSavingName] = useState(false);

  const cap = channel ? capabilityFor(channel.type) : null;

  // Tabs are driven by capability, not by a fixed list: a widget has no
  // conversational config, and only a widget has an install snippet.
  const tabs: { id: TabId; label: string }[] = !cap ? [] : [
    { id: "conexao", label: channel?.connected ? "Status" : "Conexão" },
    ...(cap.configFields.length ? [{ id: "config" as const, label: "Configurações" }] : []),
    ...(cap.connection === "instant" ? [{ id: "instalacao" as const, label: "Instalação" }] : []),
  ];

  // Reset per-channel state whenever a different channel is opened.
  useEffect(() => {
    if (!channel) return;
    setNameDraft(channel.name);
    setRenaming(false);
    setTab(capabilityFor(channel.type).connection === "instant" && channel.connected
      ? "instalacao"
      : "conexao");
  }, [channel]);

  const handleRename = async () => {
    if (!channel || !nameDraft.trim() || nameDraft.trim() === channel.name) {
      setRenaming(false); return;
    }
    setSavingName(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-agent-channels", {
        body: { action: "rename", channel_id: channel.id, name: nameDraft.trim() },
      });
      if (error) throw error;
      if (data?.message) throw new Error(data.message);
      toast({ title: "Renomeado", description: "Nome do canal atualizado." });
      setRenaming(false);
      onChanged();
    } catch (err) {
      toast({
        title: "Não foi possível renomear",
        description: String((err as any)?.message ?? err),
        variant: "destructive",
      });
    } finally { setSavingName(false); }
  };

  return (
    <Sheet open={channel !== null} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        {channel && cap && (
          <>
            <SheetHeader className="space-y-2 text-left">
              <SheetTitle asChild>
                <div className="flex items-center gap-2 pr-6">
                  {renaming ? (
                    <>
                      <Input
                        className="h-8 text-sm"
                        value={nameDraft}
                        autoFocus
                        onChange={(e) => setNameDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleRename();
                          if (e.key === "Escape") { setNameDraft(channel.name); setRenaming(false); }
                        }}
                      />
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0 shrink-0"
                              onClick={handleRename} disabled={savingName}>
                        {savingName ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0 shrink-0"
                              onClick={() => { setNameDraft(channel.name); setRenaming(false); }}
                              disabled={savingName}>
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <span className="text-lg font-bold truncate">{channel.name}</span>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 shrink-0 text-muted-foreground"
                              onClick={() => setRenaming(true)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              </SheetTitle>
              <SheetDescription asChild>
                <div className="flex items-center gap-2 flex-wrap text-xs">
                  <Badge variant="outline" className="text-[10px] font-mono">{cap.label}</Badge>
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[10px] font-mono",
                      channel.connected
                        ? "text-emerald-700 border-emerald-200/60 bg-emerald-500/8"
                        : "text-muted-foreground"
                    )}
                  >
                    {channel.connected ? "Conectado" : "Desconectado"}
                  </Badge>
                  {channel.username && (
                    <span className="font-mono text-muted-foreground">{channel.username}</span>
                  )}
                  {channel.departmentName && (
                    <span className="font-mono text-muted-foreground">· {channel.departmentName}</span>
                  )}
                </div>
              </SheetDescription>
            </SheetHeader>

            <div className="flex items-center gap-1 border-b border-border mt-5 mb-5">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={cn(
                    "px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors",
                    t.id === tab
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Keyed by channel id so switching channels remounts the panel and
                re-reads upstream, instead of showing the previous one's data. */}
            {tab === "conexao" && (
              <ChannelConnectionPanel
                key={`conn-${channel.id}`}
                channelId={channel.id}
                channelType={channel.type}
                connected={channel.connected}
                onConnected={onChanged}
              />
            )}
            {tab === "config" && (
              <ChannelConfigPanel
                key={`cfg-${channel.id}`}
                channelId={channel.id}
                channelType={channel.type}
              />
            )}
            {tab === "instalacao" && (
              <WidgetInstallPanel key={`wid-${channel.id}`} channelId={channel.id} />
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
