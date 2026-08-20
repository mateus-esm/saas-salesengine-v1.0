// ============================================================================
// Sprint 8 · T8 — transactional email templates (pt-BR).
//
// One layout, themed per niche. Table-based and inline-styled because email
// clients are not browsers: Outlook ignores flexbox, grid and <style> blocks.
//
// COPY RULE (sprint spec): fact -> impact -> action, and always say what still
// WORKS. A customer who thinks they lost their data calls angry; one who knows
// only the AI paused pays the invoice.
// ============================================================================

export interface EmailInput {
  title: string;
  body: string;
  actionUrl?: string;
  severity: string;
  brandName: string;
  brandColor: string;
}

const ACCENT: Record<string, string> = {
  info: "#2563eb",
  success: "#16a34a",
  warn: "#d97706",
  critical: "#dc2626",
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

export function renderEmail(input: EmailInput): { subject: string; html: string } {
  const accent = ACCENT[input.severity] ?? input.brandColor;
  const cta = CTA_LABEL[input.severity] ?? "Ver detalhes";

  // No "[URGENTE]" prefixes: a subject that shouts every time stops being read.
  const subject = input.title;

  const button = input.actionUrl
    ? `<tr><td style="padding:8px 32px 32px 32px;">
         <a href="${escapeHtml(input.actionUrl)}"
            style="display:inline-block;background:${accent};color:#ffffff;text-decoration:none;
                   padding:12px 24px;border-radius:8px;font-weight:600;font-size:15px;">
           ${cta}
         </a>
       </td></tr>`
    : "";

  const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
             style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;
                    box-shadow:0 1px 3px rgba(0,0,0,0.08);">
        <tr><td style="height:4px;background:${accent};font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr><td style="padding:32px 32px 8px 32px;">
          <p style="margin:0 0 4px 0;font-size:13px;font-weight:600;color:${escapeHtml(input.brandColor)};
                    text-transform:uppercase;letter-spacing:.04em;">
            ${escapeHtml(input.brandName)}
          </p>
          <h1 style="margin:0;font-size:22px;line-height:1.3;color:#18181b;font-weight:700;">
            ${escapeHtml(input.title)}
          </h1>
        </td></tr>
        <tr><td style="padding:12px 32px 8px 32px;">
          <p style="margin:0;font-size:15px;line-height:1.6;color:#3f3f46;">
            ${escapeHtml(input.body).replace(/\n/g, "<br>")}
          </p>
        </td></tr>
        ${button}
        <tr><td style="padding:0 32px 28px 32px;border-top:1px solid #e4e4e7;">
          <p style="margin:16px 0 0 0;font-size:12px;line-height:1.5;color:#a1a1aa;">
            Você recebeu este e-mail porque é responsável pela conta em ${escapeHtml(input.brandName)}.
            Este é um aviso automático sobre sua assinatura.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  return { subject, html };
}
