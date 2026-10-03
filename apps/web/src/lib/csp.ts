// Content-Security-Policy mit Nonce (PLAN: keine Anfragen an Dritte aus dem Browser außer Supabase).
// Stripe und LiveKit kommen später über FERMATA_CSP_EXTRA_CONNECT / FERMATA_CSP_EXTRA_FRAME dazu.

export interface CspOptions {
  nonce: string;
  supabaseUrl: string;
  dev?: boolean;
  extraConnect?: string[];
  extraFrame?: string[];
}

export function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/**
 * Origins eines Echtzeit-Dienstes für connect-src: die Adresse selbst und das Gegenstück
 * (wss ↔ https, ws ↔ http). LiveKit braucht beides (Signalisierung per WebSocket, Prüfung per HTTPS).
 */
export function serviceOrigins(url: string | undefined | null): string[] {
  if (!url) return [];
  const origin = originOf(url);
  if (!origin) return [];
  const pairs: Record<string, string> = { "wss:": "https:", "https:": "wss:", "ws:": "http:", "http:": "ws:" };
  const proto = new URL(origin).protocol;
  const other = pairs[proto];
  return other ? [origin, origin.replace(/^[a-z]+:/, other)] : [origin];
}

/**
 * Gespräch mit Viola: LiveKit (Stimme, wss und https) und der Viola-Textdienst – nur, wenn die Adressen
 * gesetzt sind (NEXT_PUBLIC_LIVEKIT_URL, NEXT_PUBLIC_VIOLA_TEXT_URL). src/proxy.ts baut die CSP je Anfrage damit.
 */
export function violaConnectSources(
  env: Record<string, string | undefined> = {
    NEXT_PUBLIC_LIVEKIT_URL: process.env.NEXT_PUBLIC_LIVEKIT_URL,
    NEXT_PUBLIC_VIOLA_TEXT_URL: process.env.NEXT_PUBLIC_VIOLA_TEXT_URL,
  },
): string[] {
  return [...serviceOrigins(env.NEXT_PUBLIC_LIVEKIT_URL), ...serviceOrigins(env.NEXT_PUBLIC_VIOLA_TEXT_URL).filter((x) => /^https?:/.test(x))];
}

export function buildCsp(o: CspOptions): string {
  o = { ...o, extraConnect: [...(o.extraConnect ?? []), ...violaConnectSources()] };
  const supabase = originOf(o.supabaseUrl);
  const wss = supabase ? supabase.replace(/^http/, "ws") : null;
  const connect = ["'self'", supabase, wss, ...(o.extraConnect ?? [])].filter(Boolean);
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", `'nonce-${o.nonce}'`, "'strict-dynamic'", ...(o.dev ? ["'unsafe-eval'"] : [])],
    "style-src": ["'self'", `'nonce-${o.nonce}'`, ...(o.dev ? ["'unsafe-inline'"] : [])],
    "img-src": ["'self'", "data:", "blob:"],
    "font-src": ["'self'"],
    "connect-src": connect as string[],
    "media-src": ["'self'", "blob:"],
    "worker-src": ["'self'"],
    "manifest-src": ["'self'"],
    "frame-src": o.extraFrame?.length ? o.extraFrame : ["'none'"],
    "frame-ancestors": ["'none'"],
    "object-src": ["'none'"],
    "base-uri": ["'none'"],
    "form-action": ["'self'"],
  };
  const parts = Object.entries(directives).map(([k, v]) => `${k} ${v.join(" ")}`);
  // Nur, wenn Supabase über HTTPS läuft (lokal mit http://localhost würde es Anfragen kaputt machen).
  if (!o.dev && supabase?.startsWith("https:")) parts.push("upgrade-insecure-requests");
  return parts.join("; ");
}

export function newNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
