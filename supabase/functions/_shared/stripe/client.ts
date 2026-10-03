// Schlanker Stripe-Client über die REST-API (ohne SDK, damit nichts im Browser oder in Drittanbieter-Code landet).
// Umgebungsvariablen: STRIPE_SECRET_KEY (Pflicht), STRIPE_API_BASE (Standard https://api.stripe.com,
// für Tests stripe-mock), STRIPE_API_VERSION (optional; ohne Angabe gilt die Version des Stripe-Kontos).
import { env, optionalEnv } from "../env.ts";

export type StripeParams = { [key: string]: unknown };

export class StripeError extends Error {
  constructor(
    public status: number,
    public type: string,
    public code: string | undefined,
    message: string,
  ) {
    super(message);
    this.name = "StripeError";
  }
}

/** Formular-Kodierung wie bei Stripe: a[b]=c, items[0][price]=… */
export function formEncode(params: StripeParams, prefix = "", out = new URLSearchParams()): URLSearchParams {
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    const name = prefix ? `${prefix}[${key}]` : key;
    if (value === null) {
      out.append(name, "");
    } else if (Array.isArray(value)) {
      value.forEach((item, i) => {
        if (item !== null && typeof item === "object") formEncode(item as StripeParams, `${name}[${i}]`, out);
        else out.append(`${name}[${i}]`, String(item));
      });
    } else if (value instanceof Date) {
      out.append(name, String(Math.floor(value.getTime() / 1000)));
    } else if (typeof value === "object") {
      formEncode(value as StripeParams, name, out);
    } else {
      out.append(name, String(value));
    }
  }
  return out;
}

export interface StripeConfig {
  secretKey: string;
  apiBase?: string;
  apiVersion?: string;
  fetchFn?: typeof fetch;
  maxRetries?: number;
}

export class StripeClient {
  private apiBase: string;
  private fetchFn: typeof fetch;
  private maxRetries: number;

  constructor(private cfg: StripeConfig) {
    this.apiBase = (cfg.apiBase ?? "https://api.stripe.com").replace(/\/$/, "");
    this.fetchFn = cfg.fetchFn ?? fetch;
    this.maxRetries = cfg.maxRetries ?? 2;
  }

  /** Neuere API-Versionen (ab 2025-03-31) liefern das Client-Geheimnis über invoice.confirmation_secret. */
  usesConfirmationSecret(): boolean {
    return !this.cfg.apiVersion || this.cfg.apiVersion >= "2025-03-31";
  }

  async request<T = any>(
    method: "GET" | "POST" | "DELETE",
    path: string,
    params: StripeParams = {},
    opts: { idempotencyKey?: string } = {},
  ): Promise<T> {
    const body = formEncode(params);
    const url = method === "GET" && body.size > 0 ? `${this.apiBase}${path}?${body}` : `${this.apiBase}${path}`;
    const headers: Record<string, string> = {
      authorization: `Bearer ${this.cfg.secretKey}`,
      accept: "application/json",
    };
    if (this.cfg.apiVersion) headers["stripe-version"] = this.cfg.apiVersion;
    if (method !== "GET") headers["content-type"] = "application/x-www-form-urlencoded";
    if (opts.idempotencyKey && method === "POST") headers["idempotency-key"] = opts.idempotencyKey;
    // Wiederholen nur, wenn es sicher ist (GET oder POST mit Idempotenz-Schlüssel).
    const retryable = method === "GET" || method === "DELETE" || Boolean(opts.idempotencyKey);
    let attempt = 0;
    for (;;) {
      let res: Response;
      try {
        res = await this.fetchFn(url, { method, headers, body: method === "GET" ? undefined : body.toString() });
      } catch (err) {
        if (retryable && attempt < this.maxRetries) {
          await sleep(250 * 2 ** attempt++);
          continue;
        }
        throw new StripeError(0, "api_connection_error", undefined, `Stripe nicht erreichbar: ${String(err)}`);
      }
      const text = await res.text();
      let data: any = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = {};
      }
      if (res.ok) return data as T;
      if (retryable && (res.status === 429 || res.status >= 500) && attempt < this.maxRetries) {
        await sleep(250 * 2 ** attempt++);
        continue;
      }
      const e = data?.error ?? {};
      throw new StripeError(res.status, e.type ?? "api_error", e.code, e.message ?? `Stripe antwortet ${res.status}`);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

let cached: StripeClient | undefined;

export function stripe(): StripeClient {
  if (!cached) {
    cached = new StripeClient({
      secretKey: env("STRIPE_SECRET_KEY"),
      apiBase: optionalEnv("STRIPE_API_BASE"),
      apiVersion: optionalEnv("STRIPE_API_VERSION"),
    });
  }
  return cached;
}

/** Nur für Tests. */
export function setStripe(client: StripeClient | undefined): void {
  cached = client;
}

export function unix(date: Date | string): number {
  return Math.floor(new Date(date).getTime() / 1000);
}
