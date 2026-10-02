// Einheitliches, schlichtes Mail-Layout (HTML + Text). Keine Bilder von Fremdservern, keine Zählpixel.
export interface MailContent {
  preheader?: string;
  greeting?: string;
  paragraphs: string[];
  button?: { label: string; url: string };
  code?: string;
  after?: string[];
  footer?: string[];
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function renderMail(c: MailContent): { html: string; text: string } {
  const p = (t: string) => `<p style="font-size:16px;line-height:1.6;margin:0 0 16px;">${esc(t)}</p>`;
  const html = `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="color-scheme" content="light"></head>
<body style="margin:0;padding:0;background:#F6F1E7;color:#1E1A2B;font-family:Georgia,'Times New Roman',serif;">
${c.preheader ? `<div style="display:none;max-height:0;overflow:hidden;">${esc(c.preheader)}</div>` : ""}
<div style="max-width:560px;margin:0 auto;padding:32px 24px;">
<p style="font-size:20px;letter-spacing:2px;margin:0 0 28px;color:#1E1A2B;">Fermata</p>
${c.greeting ? p(c.greeting) : ""}
${c.paragraphs.map(p).join("\n")}
${c.code ? `<p style="font-size:30px;letter-spacing:6px;font-family:Menlo,Consolas,monospace;margin:8px 0 24px;">${esc(c.code)}</p>` : ""}
${c.button ? `<p style="margin:24px 0;"><a href="${esc(c.button.url)}" style="display:inline-block;background:#7A2638;color:#FBF8F2;text-decoration:none;padding:14px 22px;border-radius:999px;font-family:Arial,sans-serif;font-size:16px;">${esc(c.button.label)}</a></p>
<p style="font-size:13px;line-height:1.5;color:#625B70;margin:0 0 16px;">Falls der Knopf nicht funktioniert: ${esc(c.button.url)}</p>` : ""}
${(c.after ?? []).map(p).join("\n")}
<hr style="border:none;border-top:1px solid #D8CDB9;margin:32px 0 16px;">
${(c.footer ?? []).map((t) => `<p style="font-size:13px;line-height:1.5;color:#625B70;margin:0 0 8px;">${esc(t)}</p>`).join("\n")}
</div></body></html>`;
  const text = [
    "Fermata",
    "",
    ...(c.greeting ? [c.greeting, ""] : []),
    ...c.paragraphs.flatMap((t) => [t, ""]),
    ...(c.code ? [c.code, ""] : []),
    ...(c.button ? [`${c.button.label}: ${c.button.url}`, ""] : []),
    ...(c.after ?? []).flatMap((t) => [t, ""]),
    "—",
    ...(c.footer ?? []),
  ].join("\n");
  return { html, text };
}
