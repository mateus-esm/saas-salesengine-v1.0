import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { TICKET_PAGE_SIZE, TICKET_STATUS, useSupportTickets, type TicketStatus } from "@/hooks/useSupportTickets";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const selectClass = "h-10 rounded-md border border-input bg-background px-3 text-sm";
const dateLabel = (value: string) => new Date(value).toLocaleString("pt-BR");

export function SupportTickets({ admin = false }: { admin?: boolean }) {
  const { equipe } = useAuth();
  const [params, setParams] = useSearchParams();
  const ticketId = params.get("ticket");
  const [status, setStatus] = useState("todos");
  const [team, setTeam] = useState("todos");
  const [page, setPage] = useState(0);
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [reply, setReply] = useState("");
  const { tickets, teams, ticket, messages, refresh, enabled } = useSupportTickets(admin, status, team, page, ticketId);
  const selectTicket = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set("ticket", id);
    else next.delete("ticket");
    setReply("");
    setParams(next, { replace: true });
  };
  const create = useMutation({
    mutationFn: async () => {
      if (!equipe) throw new Error("Equipe não encontrada");
      const { data, error } = await supabase.from("support_tickets").insert({
        equipe_id: equipe.id, subject: subject.trim(), description: description.trim(),
      }).select("id").single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      setSubject(""); setDescription(""); setPage(0); setStatus("todos");
      selectTicket(data.id);
      void refresh();
      toast.success("Ticket aberto. Acompanhe o atendimento por aqui.");
    },
    onError: () => toast.error("Não foi possível abrir o ticket. Seu texto foi mantido; tente novamente."),
  });
  const sendReply = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: string }) => {
      const { error } = await supabase.from("support_ticket_messages").insert({ ticket_id: id, body });
      if (error) throw error;
    },
    onSuccess: () => { setReply(""); void refresh(); toast.success("Resposta enviada."); },
    onError: () => toast.error("Não foi possível enviar. Sua resposta foi mantida; tente novamente."),
  });
  const changeStatus = useMutation({
    mutationFn: async ({ id, value }: { id: string; value: TicketStatus }) => {
      const { error } = await supabase.from("support_tickets").update({ status: value }).eq("id", id).select("id").single();
      if (error) throw error;
    },
    onSuccess: () => { void refresh(); toast.success("Status atualizado."); },
    onError: () => toast.error("Não foi possível atualizar o status. Tente novamente."),
  });
  const teamName = (id: string) => teams.data?.find((item) => item.id === id)?.nome ?? id;
  const conversation = [...(messages.data?.pages.flat() ?? [])].reverse();

  if (!enabled) return <p className="text-sm text-muted-foreground">Associe sua conta a uma equipe para abrir e acompanhar tickets.</p>;

  return (
    <div className="space-y-6">
      {!admin && (
        <Card>
          <CardHeader>
            <CardTitle>Abrir ticket</CardTitle>
            <CardDescription>Descreva sua dúvida ou problema. Sua equipe poderá acompanhar as respostas aqui.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); create.mutate(); }}>
              <div className="space-y-2">
                <Label htmlFor="ticket-subject">Assunto</Label>
                <Input id="ticket-subject" required maxLength={200} value={subject} disabled={create.isPending}
                  onChange={(event) => setSubject(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ticket-description">Descrição</Label>
                <Textarea id="ticket-description" required rows={4} maxLength={10000} value={description}
                  disabled={create.isPending} onChange={(event) => setDescription(event.target.value)} />
              </div>
              <Button type="submit" disabled={create.isPending || !subject.trim() || !description.trim()}>
                {create.isPending ? "Abrindo…" : "Abrir ticket"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{admin ? "Tickets de suporte" : "Tickets da minha equipe"}</CardTitle>
          <CardDescription>{admin ? "Acompanhe as solicitações de todas as equipes." : "Veja o andamento e converse com o suporte."}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="grid gap-2">
              <Label htmlFor="ticket-filter-status">Status</Label>
              <select id="ticket-filter-status" className={selectClass} value={status}
                onChange={(event) => { setStatus(event.target.value); setPage(0); }}>
                <option value="todos">Todos os status</option>
                {Object.entries(TICKET_STATUS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>
            {admin && (
              <div className="grid gap-2">
                <Label htmlFor="ticket-filter-team">Equipe</Label>
                <select id="ticket-filter-team" className={`${selectClass} max-w-xs`} value={team}
                  onChange={(event) => { setTeam(event.target.value); setPage(0); }}>
                  <option value="todos">Todas as equipes</option>
                  {(teams.data ?? []).map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}
                </select>
              </div>
            )}
            <Button variant="outline" disabled={tickets.isFetching} onClick={() => void refresh()}>Atualizar</Button>
          </div>
          {admin && teams.isError && <p role="alert">Não foi possível carregar o filtro de equipes. Tente atualizar.</p>}
          {tickets.isLoading ? <p role="status">Carregando tickets…</p> : tickets.isError ? (
            <p role="alert">Não foi possível carregar os tickets. Tente atualizar.</p>
          ) : (
            <>
              {tickets.data?.rows.length === 0 && <p className="text-sm text-muted-foreground">Nenhum ticket encontrado.</p>}
              <div className="divide-y rounded-md border">
                {tickets.data?.rows.map((item) => (
                  <button key={item.id} className="w-full p-4 text-left hover:bg-muted/50" onClick={() => selectTicket(item.id)}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium break-words min-w-0">{item.subject}</span>
                      <Badge variant="outline">{TICKET_STATUS[item.status]}</Badge>
                    </div>
                    {admin && <p className="text-sm mt-1">Equipe: {teamName(item.equipe_id)}</p>}
                    <p className="text-xs text-muted-foreground mt-1">Aberto em {dateLabel(item.created_at)} · Atualizado em {dateLabel(item.updated_at)}</p>
                  </button>
                ))}
              </div>
              <div className="flex items-center justify-between gap-2">
                <Button variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>Anterior</Button>
                <span className="text-sm">Página {page + 1} · {tickets.data?.count ?? 0} tickets</span>
                <Button variant="outline" disabled={(page + 1) * TICKET_PAGE_SIZE >= (tickets.data?.count ?? 0)}
                  onClick={() => setPage(page + 1)}>Próxima</Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!ticketId} onOpenChange={(open) => { if (!open && !sendReply.isPending && !changeStatus.isPending) selectTicket(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="break-words">{ticket.data?.subject ?? "Conversa do ticket"}</DialogTitle>
            <DialogDescription>{admin && ticket.data ? `Equipe: ${teamName(ticket.data.equipe_id)}` : "Histórico de atendimento da equipe."}</DialogDescription>
          </DialogHeader>
          {ticket.isLoading ? <p role="status">Carregando conversa…</p> : ticket.isError ? (
            <div role="alert">Não foi possível carregar a conversa. <Button variant="outline" onClick={() => void refresh()}>Tentar novamente</Button></div>
          ) : !ticket.data ? <p>Ticket indisponível ou sem permissão de acesso.</p> : (
            <div className="space-y-4">
              {admin ? (
                <div className="grid gap-2">
                  <Label htmlFor="ticket-status">Status do ticket</Label>
                  <select id="ticket-status" className={selectClass} value={ticket.data.status} disabled={changeStatus.isPending}
                    onChange={(event) => changeStatus.mutate({ id: ticket.data!.id, value: event.target.value as TicketStatus })}>
                    {Object.entries(TICKET_STATUS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </div>
              ) : <Badge variant="outline">{TICKET_STATUS[ticket.data.status]}</Badge>}
              <article className="rounded-md border p-3">
                <p className="text-sm font-medium">Solicitação inicial · {dateLabel(ticket.data.created_at)}</p>
                <p className="whitespace-pre-wrap break-words mt-2">{ticket.data.description}</p>
              </article>
              {messages.isLoading && <p role="status">Carregando respostas…</p>}
              {messages.isError && <div role="alert">Não foi possível carregar as respostas. <Button variant="outline" onClick={() => void messages.refetch()}>Tentar novamente</Button></div>}
              {messages.hasNextPage && <Button variant="outline" disabled={messages.isFetchingNextPage}
                onClick={() => void messages.fetchNextPage()}>Carregar respostas anteriores</Button>}
              {conversation.map((message) => (
                <article key={message.id} className={`rounded-md border p-3 ${message.author_kind === "suporte" ? "bg-primary/5" : "bg-muted/30"}`}>
                  <p className="text-sm font-medium">{message.author_kind === "suporte" ? "Equipe de suporte" : "Cliente"} · {dateLabel(message.created_at)}</p>
                  <p className="whitespace-pre-wrap break-words mt-2">{message.body}</p>
                </article>
              ))}
              {!messages.isLoading && !messages.isError && conversation.length === 0 && <p className="text-sm text-muted-foreground">Ainda não há respostas.</p>}
              <form className="space-y-2" onSubmit={(event) => {
                event.preventDefault();
                sendReply.mutate({ id: ticket.data!.id, body: reply.trim() });
              }}>
                <Label htmlFor="ticket-reply">Sua resposta</Label>
                <Textarea id="ticket-reply" value={reply} required rows={4} maxLength={10000} disabled={sendReply.isPending}
                  onChange={(event) => setReply(event.target.value)} />
                <Button type="submit" disabled={sendReply.isPending || !reply.trim()}>{sendReply.isPending ? "Enviando…" : "Enviar resposta"}</Button>
              </form>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
