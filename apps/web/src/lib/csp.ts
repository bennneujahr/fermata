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

export function buildCsp(o: CspOptions): string {
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
  if (!o.dev) parts.push("upgrade-insecure-requests");
  return parts.join("; ");
}

export function newNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
