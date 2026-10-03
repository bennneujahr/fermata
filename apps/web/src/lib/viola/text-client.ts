// Textmodus „Lieber schreiben“: direkt mit dem Viola-Textdienst (Adresse und Zugang aus interview-token).
// Antworten kommen als Server-Sent Events Satz für Satz (event: sentence | event | done).
import { parseViolaEvent, type TextState, type ViolaEvent } from "./types";

export interface SseMessage {
  event: string;
  data: string;
}

/**
 * Zerlegt einen SSE-Datenstrom in Nachrichten. Gibt fertige Nachrichten zurück und den Rest,
 * der erst mit dem nächsten Stück vollständig wird.
 */
export function parseSse(buffer: string): { messages: SseMessage[]; rest: string } {
  const messages: SseMessage[] = [];
  const normalized = buffer.replace(/\r\n?/g, "\n");
  const blocks = normalized.split("\n\n");
  const rest = blocks.pop() ?? "";
  for (const block of blocks) {
    let event = "message";
    const data: string[] = [];
    for (const line of block.split("\n")) {
      if (!line || line.startsWith(":")) continue;
      const idx = line.indexOf(":");
      const field = idx === -1 ? line : line.slice(0, idx);
      let value = idx === -1 ? "" : line.slice(idx + 1);
      if (value.startsWith(" ")) value = value.slice(1);
      if (field === "event") event = value;
      else if (field === "data") data.push(value);
    }
    if (data.length || event !== "message") messages.push({ event, data: data.join("\n") });
  }
  return { messages, rest };
}

export class TextApiError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}

export interface StartResult extends TextState {
  resumed: boolean;
  ai_notice: boolean;
  messages: { role: "viola"; text: string }[];
}

export interface ReplyHandlers {
  onSentence: (text: string) => void;
  onEvent: (ev: ViolaEvent) => void;
}

export class TextClient {
  constructor(
    private url: string,
    private token: string,
    private fetcher: typeof fetch = (...a) => fetch(...a),
  ) {}

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return { authorization: `Bearer ${this.token}`, ...extra };
  }

  private async json<T>(res: Response): Promise<T> {
    const body = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
    if (!res.ok) throw new TextApiError(res.status, body?.error ?? `http_${res.status}`);
    return body as T;
  }

  async start(): Promise<StartResult> {
    const res = await this.fetcher(`${this.url}/start`, { method: "POST", headers: this.headers(), cache: "no-store" });
    return this.json<StartResult>(res);
  }

  async state(): Promise<TextState> {
    const res = await this.fetcher(this.url, { headers: this.headers(), cache: "no-store" });
    return this.json<TextState>(res);
  }

  async end(): Promise<TextState & { events: unknown[] }> {
    const res = await this.fetcher(`${this.url}/end`, { method: "POST", headers: this.headers(), cache: "no-store" });
    return this.json<TextState & { events: unknown[] }>(res);
  }

  /** Nachricht senden; Antwort Satz für Satz. Liefert den Zustand am Ende. */
  async send(text: string, h: ReplyHandlers, signal?: AbortSignal): Promise<TextState> {
    const res = await this.fetcher(`${this.url}/messages`, {
      method: "POST",
      headers: this.headers({ "content-type": "application/json", accept: "text/event-stream" }),
      body: JSON.stringify({ text }),
      cache: "no-store",
      signal,
    });
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !type.includes("text/event-stream") || !res.body) {
      // Ohne Stream (z. B. Fehler oder Zwischenstation ohne SSE) als JSON lesen.
      const body = await this.json<TextState & { messages?: { text: string }[]; events?: unknown[] }>(res);
      for (const m of body.messages ?? []) h.onSentence(m.text);
      for (const e of body.events ?? []) {
        const ev = parseViolaEvent(e);
        if (ev) h.onEvent(ev);
      }
      return body;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let done: TextState | null = null;
    for (;;) {
      const { value, done: finished } = await reader.read();
      if (value) buffer += decoder.decode(value, { stream: true });
      const parsed = parseSse(finished ? `${buffer}\n\n` : buffer);
      buffer = parsed.rest;
      for (const m of parsed.messages) {
        let data: unknown;
        try {
          data = JSON.parse(m.data);
        } catch {
          continue;
        }
        if (m.event === "sentence" && data && typeof (data as { text?: unknown }).text === "string") {
          h.onSentence((data as { text: string }).text);
        } else if (m.event === "event") {
          const ev = parseViolaEvent(data);
          if (ev) h.onEvent(ev);
        } else if (m.event === "done") {
          done = data as TextState;
        }
      }
      if (finished) break;
    }
    if (!done) throw new TextApiError(502, "stream_incomplete");
    return done;
  }
}
