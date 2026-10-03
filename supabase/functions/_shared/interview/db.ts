// Datenbankaufrufe der Interview-Functions mit der richtigen Rolle:
// - als Mitglied: request.jwt.claims setzen und in die Rolle authenticated wechseln (wie PostgREST),
//   damit auth.uid() und alle Rechte genau wie für die Person gelten;
// - als Agent: Rolle fermata_agent (nur die api.agent_*-Funktionen).
// Fehler der SQL-Funktionen (errcode + Code im Text) werden zu HTTP-Antworten.
import type { Sql } from "../db.ts";
import { HttpError } from "../http.ts";
import type { MemberClaims } from "./auth.ts";

// deno-lint-ignore no-explicit-any
type Tx = any;

export async function asMember<T>(sql: Sql, claims: MemberClaims, fn: (tx: Tx) => Promise<T>): Promise<T> {
  try {
    return (await sql.begin(async (tx: Tx) => {
      await tx`select set_config('request.jwt.claims', ${JSON.stringify(claims)}, true),
                      set_config('request.jwt.claim.sub', ${claims.sub}, true),
                      set_config('request.jwt.claim.role', 'authenticated', true)`;
      await tx.unsafe("set local role authenticated");
      return await fn(tx);
    })) as T;
  } catch (err) {
    throw mapDbError(err);
  }
}

export async function asAgent<T>(sql: Sql, fn: (tx: Tx) => Promise<T>): Promise<T> {
  try {
    return (await sql.begin(async (tx: Tx) => {
      await tx.unsafe("set local role fermata_agent");
      return await fn(tx);
    })) as T;
  } catch (err) {
    throw mapDbError(err);
  }
}

const STATUS_BY_SQLSTATE: Record<string, number> = {
  "28000": 401, // nicht angemeldet
  "42501": 403, // keine Berechtigung (Einwilligung, Ausweis, Sperre, Stufe)
  "22023": 422, // ungültige Eingabe, Art.-9-Inhalt
  "54000": 429, // Tageslimit, Transkript zu lang
  "55000": 409, // falscher Zustand der Sitzung
  "P0002": 404, // Sitzung nicht gefunden
};

/** Wandelt Fehler aus den SQL-Funktionen in HttpError um. Unbekannte Fehler bleiben 500. */
export function mapDbError(err: unknown): unknown {
  if (err instanceof HttpError) return err;
  const e = err as { code?: string; message?: string; detail?: string };
  const status = e?.code ? STATUS_BY_SQLSTATE[e.code] : undefined;
  if (!status) return err;
  const code = /^[a-z_0-9]+$/.test(e.message ?? "") ? e.message! : status === 403 ? "forbidden" : "invalid_request";
  const httpErr = new HttpError(status, code, code === "art9_content" ? (e.detail ?? "") : code);
  return httpErr;
}
