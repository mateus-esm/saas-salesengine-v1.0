// Sprint 11 · Onda 6 · T64 — "Entenda como está sua máquina de receita".
//
// POST /api/v1/chat on the Copilot service with the user's session token; the
// answer streams back as SSE (lib/copilotChat.parseSse): the queries being made
// show as chips while they run, then the text appears as it is written.

import { useCallback, useRef, useState } from "react";

import { getCopilotToken, requireCopilotUrl } from "@/services/copilot";
import { parseSse, type ChatEvent } from "@/lib/copilotChat";

export interface ChatTurn {
  id: string;
  role: "user" | "assistant";
  content: string;
  tools?: { name: string; label: string }[];
  links?: string[];
  pending?: boolean;
  error?: boolean;
}

let seq = 0;
const localId = () => `local-${Date.now()}-${++seq}`;

export function useCopilotChat() {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [sending, setSending] = useState(false);
  const threadRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const patchLast = useCallback(
    (patch: (turn: ChatTurn) => ChatTurn) =>
      setTurns((all) => {
        if (!all.length) return all;
        const next = [...all];
        next[next.length - 1] = patch(next[next.length - 1]);
        return next;
      }),
    [],
  );

  const apply = useCallback((event: ChatEvent) => {
    switch (event.type) {
      case "thread":
        threadRef.current = event.thread_id;
        break;
      case "tools":
        patchLast((t) => ({ ...t, tools: event.tools }));
        break;
      case "delta":
        patchLast((t) => ({ ...t, content: t.content + event.text }));
        break;
      case "done":
        threadRef.current = event.thread_id;
        patchLast((t) => ({ ...t, id: event.message_id, links: event.links, pending: false }));
        break;
      case "error":
        patchLast((t) => ({ ...t, content: t.content || event.message, pending: false, error: true }));
        break;
    }
  }, [patchLast]);

  const send = useCallback(async (question: string) => {
    const text = question.trim();
    if (!text || sending) return;
    setSending(true);
    setTurns((all) => [
      ...all,
      { id: localId(), role: "user", content: text },
      { id: localId(), role: "assistant", content: "", pending: true },
    ]);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const token = await getCopilotToken();
      const response = await fetch(`${requireCopilotUrl()}/api/v1/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ message: text, thread_id: threadRef.current }),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parsed = parseSse(buffer);
        buffer = parsed.rest;
        parsed.events.forEach(apply);
      }
      parseSse(buffer + "\n\n").events.forEach(apply);
      patchLast((t) => (t.pending ? { ...t, pending: false } : t));
    } catch (e) {
      if (!controller.signal.aborted) {
        patchLast((t) => ({
          ...t,
          pending: false,
          error: true,
          content: t.content || "Não consegui falar com o Copilot agora. Tente de novo em instantes.",
        }));
      }
    } finally {
      abortRef.current = null;
      setSending(false);
    }
  }, [sending, apply, patchLast]);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    threadRef.current = null;
    setTurns([]);
    setSending(false);
  }, []);

  return { turns, sending, send, reset };
}
