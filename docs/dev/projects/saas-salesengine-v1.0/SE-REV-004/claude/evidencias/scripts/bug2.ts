// Bug 2: mesma entrada real (canais da Casa Flow + channel_id do perfil) no código antigo e no novo.
// O start-conversation é interceptado: nada é enviado ao provider.
import { openManualGptConversation as oldOpen } from "/tmp/serev004/base/supabase/functions/_shared/manual-conversation.ts";
import { openManualGptConversation as newOpen } from "/srv/solo-dev/worktrees/saas-salesengine-v1.0/SE-REV-004/supabase/functions/_shared/manual-conversation.ts";
const real = JSON.parse(await Deno.readTextFile("/tmp/serev004/canais-reais.json"));
for (const [label, open] of [["ANTES (main)", oldOpen], ["DEPOIS (SE-REV-004)", newOpen]] as const) {
  const calls: string[] = [];
  const r = await open({
    token: "x", workspaceId: "x", agentId: "x",
    preferredChannelId: real.profile_channel_id, phone: "5585998153923", message: "Ola teste",
    listChannels: () => Promise.resolve({ channels: real.gpt_channels }),
    startConversation: ({ channelId }) => { calls.push(channelId); return Promise.resolve({ ok: true, status: 200, body: { success: true }, rawText: null }); },
  });
  console.log(label, JSON.stringify({ ok: r.ok, errorCode: r.errorCode ?? null, detail: r.detail ?? null, channelId: r.channelId ?? null, channelType: r.channelType ?? null, chamaria_start_conversation_em: calls }));
}
