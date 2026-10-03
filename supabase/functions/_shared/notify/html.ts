// Schlichte HTML-Seite im Fermata-Stil (für venue-confirm). Texte kommen aus den Vorlagen.
export const escapeHtml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function htmlPage(title: string, body: string): string {
  return `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;background:#F6F1E7;color:#1E1A2B;font-family:Georgia,'Times New Roman',serif;">
<main style="max-width:560px;margin:0 auto;padding:32px 24px;">
<p style="font-size:20px;letter-spacing:2px;margin:0 0 28px;">Fermata</p>
<h1 style="font-size:24px;font-weight:normal;margin:0 0 20px;">${escapeHtml(title)}</h1>
${body}
</main></body></html>`;
}
