// Echter Didit-Client (API v2, https://verification.didit.me). Schlüssel nur aus der Umgebung.
// PLATZHALTER: Pfade und Header nach Didit-Doku; vor Start mit der Sandbox prüfen (docs/bereiche/web.md).
import { parseDecision } from "./decision.ts";
import type { DiditClient, DiditDecision, DiditSession } from "./types.ts";

export class DiditHttpError extends Error {
  constructor(public status: number, public operation: string) {
    super(`Didit antwortet ${status} bei ${operation}`);
  }
}

export class LiveDiditClient implements DiditClient {
  readonly mode = "live" as const;
  constructor(
    private apiKey: string,
    private workflowId: string,
    private baseUrl = "https://verification.didit.me",
    private fetchFn: typeof fetch = (...a) => fetch(...a),
  ) {}

  private headers(): Record<string, string> {
    return { "x-api-key": this.apiKey, "content-type": "application/json", accept: "application/json" };
  }

  async createSession(input: { vendorData: string; callbackUrl: string }): Promise<DiditSession> {
    const res = await this.fetchFn(`${this.baseUrl}/v2/session/`, {
      method: "POST",
      headers: this.headers(),
      // vendor_data ist die ID der Prüfung bei Fermata (keine Personen-ID, keine E-Mail).
      body: JSON.stringify({ workflow_id: this.workflowId, vendor_data: input.vendorData, callback: input.callbackUrl }),
    });
    if (!res.ok) throw new DiditHttpError(res.status, "session_create");
    const body = (await res.json()) as { session_id?: string; url?: string; verification_url?: string };
    const url = body.url ?? body.verification_url;
    if (!body.session_id || !url) throw new DiditHttpError(502, "session_create");
    return { sessionId: body.session_id, url };
  }

  async getDecision(sessionId: string): Promise<DiditDecision> {
    const res = await this.fetchFn(`${this.baseUrl}/v2/session/${encodeURIComponent(sessionId)}/decision/`, {
      headers: this.headers(),
    });
    if (!res.ok) throw new DiditHttpError(res.status, "decision");
    return parseDecision(await res.json(), sessionId);
  }

  async deleteSession(sessionId: string): Promise<void> {
    const res = await this.fetchFn(`${this.baseUrl}/v2/session/${encodeURIComponent(sessionId)}/delete/`, {
      method: "DELETE",
      headers: this.headers(),
    });
    // 404: schon gelöscht – gilt als erledigt.
    if (!res.ok && res.status !== 404) throw new DiditHttpError(res.status, "session_delete");
  }
}
