// Gemeinsame Helfer für die Functions billing-*, stripe-webhook, safety-dispatch und trust-view:
// Datenbankfehler in HTTP-Fehler übersetzen, interne Aufrufe absichern, feste Knopf-Texte.
import { timingSafeEqual } from "../crypto.ts";
import { optionalEnv } from "../env.ts";
import { HttpError } from "../http.ts";

/** Feste Beschriftungen für die Oberfläche (rechtlich vorgegeben bzw. ENTWURF für den Anwalt). */
export const LABELS = {
  /** § 312j Abs. 3 BGB: genau dieser Wortlaut auf dem Bestellknopf. */
  orderButton: "Mitgliedschaft zahlungspflichtig abschließen",
  /** § 312k BGB: Einstieg zur Kündigung. */
  cancelEntry: "Verträge hier kündigen",
  /** § 312k BGB: Bestätigungsknopf der Kündigung. */
  cancelConfirm: "Jetzt kündigen",
  /** § 356a BGB: Einstieg zum Widerruf (ENTWURF). */
  withdrawEntry: "Vertrag widerrufen",
  /** § 356a BGB: zweiter Schritt. */
  withdrawConfirm: "Widerruf bestätigen",
} as const;

interface PgLikeError {
  name?: string;
  code?: string;
  hint?: string;
  message?: string;
  severity?: string;
}

/** Übersetzt einen Fehler aus einer SQL-Funktion (errcode + hint) in einen HTTP-Fehler. */
export function httpFromPg(err: unknown): HttpError | undefined {
  const e = err as PgLikeError;
  if (!e || typeof e !== "object" || typeof e.code !== "string" || !(e.name === "PostgresError" || e.severity)) return undefined;
  const status = ({ "28000": 401, "42501": 403, P0002: 404, "22023": 400, P0001: 409 } as Record<string, number>)[e.code];
  if (!status) return undefined;
  return new HttpError(status, e.hint ?? "rule_violation", e.message ?? "Fehler");
}

/** Führt eine Datenbank-Abfrage aus und übersetzt Regel-Fehler. */
export async function rpc<T>(p: Promise<T>): Promise<T> {
  try {
    return await p;
  } catch (err) {
    throw httpFromPg(err) ?? err;
  }
}

/** Interne Aufrufe (pg_cron/pg_net, Betrieb): Header x-fermata-internal-secret oder Bearer = FERMATA_INTERNAL_SECRET. */
export function requireInternal(req: Request): void {
  const secret = optionalEnv("FERMATA_INTERNAL_SECRET");
  if (!secret) throw new HttpError(503, "internal_secret_missing", "FERMATA_INTERNAL_SECRET ist nicht gesetzt.");
  const given = req.headers.get("x-fermata-internal-secret") ??
    (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!given || !timingSafeEqual(given, secret)) throw new HttpError(401, "unauthorized", "Nicht berechtigt.");
}

export function isEmail(s: unknown): s is string {
  return typeof s === "string" && s.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

export function str(v: unknown, max = 500): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t ? t.slice(0, max) : undefined;
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Strenge Sicherheits-Header für kleine HTML-Seiten ohne Skripte. style-src über den Hash des Stils. */
export async function htmlHeaders(style: string): Promise<Record<string, string>> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(style));
  const hash = btoa(String.fromCharCode(...new Uint8Array(digest)));
  return {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "x-robots-tag": "noindex, nofollow",
    "referrer-policy": "no-referrer",
    "x-frame-options": "DENY",
    "content-security-policy":
      `default-src 'none'; style-src 'sha256-${hash}'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`,
  };
}

export const PAGE_STYLE =
  "body{margin:0;background:#F6F1E7;color:#1E1A2B;font-family:Georgia,'Times New Roman',serif;line-height:1.6}" +
  "main{max-width:560px;margin:0 auto;padding:32px 20px}h1{font-size:24px;font-weight:normal;margin:0 0 16px}" +
  ".brand{letter-spacing:2px;font-size:18px;margin:0 0 28px}.box{background:#FBF8F2;border:1px solid #D8CDB9;border-radius:12px;padding:16px 20px;margin:16px 0}" +
  "a{color:#7A2638}.tel{font-size:22px}button{background:#7A2638;color:#FBF8F2;border:0;border-radius:999px;padding:14px 22px;font-size:16px;cursor:pointer}" +
  "small{color:#625B70}";

export function page(title: string, bodyHtml: string): string {
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">` +
    `<meta name="robots" content="noindex"><title>${escapeHtml(title)} · Fermata</title><style>${PAGE_STYLE}</style></head>` +
    `<body><main><p class="brand">Fermata</p>${bodyHtml}</main></body></html>`;
}
