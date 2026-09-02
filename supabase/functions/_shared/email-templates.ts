// ============================================================================
// Sprint 8 · T8 — modelos de e-mail transacional (pt-BR).
// Sprint 8.2 — realinhado à marca Solo.
//
// Tabela com estilo inline porque cliente de e-mail não é navegador: o Outlook
// ignora flexbox, grid e blocos <style>.
//
// O QUE MUDOU NO 8.2 E POR QUÊ:
//
//   A cor de acento vinha da SEVERIDADE — azul para info, vermelho para
//   crítico. Isso pintava a identidade inteira de acordo com o assunto, e o
//   mesmo remetente chegava a cada semana com uma cara diferente. Um cliente
//   não reconhece de quem é o e-mail se a marca muda de cor a cada aviso.
//
//   Agora a faixa e o nome são SEMPRE a marca. A severidade vira um selo
//   discreto ao lado do título — continua legível de relance, sem sequestrar a
//   identidade. É a mesma decisão que faz o assunto não levar "[URGENTE]": um
//   e-mail que grita toda vez para de ser lido.
//
// REGRA DE TEXTO (spec): fato → impacto → ação, e sempre dizer o que ainda
// FUNCIONA. Um cliente que acha que perdeu os dados liga com raiva; um que sabe
// que só a IA pausou paga a fatura.
// ============================================================================

import { BRAND } from "./brand.ts";

export interface EmailInput {
  title: string;
  body: string;
  actionUrl?: string;
  severity: string;
  /** Nome exibido. Vira o do nicho quando a equipe é white-label. */
  brandName: string;
  brandColor: string;
  /** Quem fatura. Assina o rodapé e não muda com o white-label. */
  companyName?: string;
}

/** O selo. Diz a urgência sem repintar a marca. */
const BADGE: Record<string, { label: string; bg: string; fg: string }> = {
  info:     { label: "Informação", bg: "#EFF6FF", fg: "#1D4ED8" },
  success:  { label: "Concluído",  bg: "#ECFDF5", fg: "#047857" },
  warn:     { label: "Atenção",    bg: "#FFFBEB", fg: "#B45309" },
  critical: { label: "Urgente",    bg: "#FEF2F2", fg: "#B91C1C" },
};

const CTA_LABEL: Record<string, string> = {
  info: "Ver detalhes",
  success: "Ver detalhes",
  warn: "Resolver agora",
  critical: "Resolver agora",
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/**
 * Transforma URLs soltas do corpo em links clicáveis.
 *
 * A mensagem de boas-vindas existe para uma coisa só: o cliente abrir o
 * Calendly. O corpo vem de um template editável no painel, em texto puro, então
 * o link chegava como texto — e um link que não é clicável no celular é um link
 * que não é aberto.
 *
 * Roda DEPOIS do escape, sobre o texto já seguro, e só reconhece http/https.
 */
function linkify(escaped: string): string {
  return escaped.replace(
    /(https?:\/\/[^\s<]+[^\s<.,;:!?)\]}"'])/g,
    (url) => `<a href="${url}" style="color:${BRAND.color};text-decoration:underline;">${url}</a>`,
  );
}

export function renderEmail(input: EmailInput): { subject: string; html: string } {
  const brandColor = input.brandColor || BRAND.color;
  const company = input.companyName ?? BRAND.company;
  const badge = BADGE[input.severity] ?? BADGE.info;
  const cta = CTA_LABEL[input.severity] ?? "Ver detalhes";

  // Sem prefixo "[URGENTE]": um assunto que grita toda vez para de ser lido.
  const subject = input.title;

  const button = input.actionUrl
    ? `<tr><td style="padding:4px 32px 32px 32px;">
         <a href="${escapeHtml(input.actionUrl)}"
            style="display:inline-block;background:${brandColor};color:#ffffff;text-decoration:none;
                   padding:13px 26px;border-radius:8px;font-weight:600;font-size:15px;">
           ${cta}
         </a>
       </td></tr>`
    : "";

  // O rodapé só nomeia a empresa quando o cabeçalho não é ela. Numa equipe
  // white-label o cliente lê o nicho no topo e "produto da Solo Ventures"
  // embaixo; sem white-label, repetir "Solo Rev · Solo Rev" seria ruído.
  const attribution = input.brandName === company
    ? escapeHtml(company)
    : `${escapeHtml(input.brandName)} é um produto da ${escapeHtml(company)}`;

  const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
             style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;
                    box-shadow:0 1px 3px rgba(0,0,0,0.08);">

        <!-- Faixa da marca. Sempre a mesma cor, independente do assunto. -->
        <tr><td style="background:${brandColor};padding:18px 32px;">
          <span style="font-size:15px;font-weight:700;color:#ffffff;
                       letter-spacing:.14em;text-transform:uppercase;">
            ${escapeHtml(input.brandName)}
          </span>
        </td></tr>

        <tr><td style="padding:28px 32px 0 32px;">
          <span style="display:inline-block;background:${badge.bg};color:${badge.fg};
                       font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;
                       padding:4px 10px;border-radius:999px;">
            ${badge.label}
          </span>
          <h1 style="margin:12px 0 0 0;font-size:22px;line-height:1.3;color:#18181b;font-weight:700;">
            ${escapeHtml(input.title)}
          </h1>
        </td></tr>

        <tr><td style="padding:12px 32px 20px 32px;">
          <p style="margin:0;font-size:15px;line-height:1.65;color:#3f3f46;">
            ${linkify(escapeHtml(input.body)).replace(/\n/g, "<br>")}
          </p>
        </td></tr>
        ${button}

        <tr><td style="padding:0 32px 28px 32px;border-top:1px solid #e4e4e7;">
          <p style="margin:16px 0 0 0;font-size:12px;line-height:1.6;color:#a1a1aa;">
            ${attribution}<br>
            Você recebeu este e-mail porque é responsável pela conta.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  return { subject, html };
}
