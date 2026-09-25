import { gptMakerProvider } from "./gptmaker.ts";
import type { OutreachProvider, ProviderId } from "./providers.ts";
import { soloProvider } from "./solo.ts";

export function getOutreachProvider(provider: ProviderId): OutreachProvider {
  if (provider === "gptmaker") return gptMakerProvider;
  if (provider === "solo") return soloProvider;
  throw new Error(`Provider de outreach não suportado: ${provider}`);
}
