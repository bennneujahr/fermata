// Gemeinsames für die Wartelisten-Functions (waitlist-*, link-hit).
// Regeln liegen in der Datenbank (api.waitlist_*); hier nur Tokens, Einstellungen und Prüfhilfen.
import { db } from "./db.ts";
import { randomToken, sha256Hex } from "./crypto.ts";

/** Zufalls-Token (32 Byte, base64url ohne Auffüllung = 43 Zeichen). */
export const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

/** Neues Token: der Klartext geht nur per Mail oder Weiterleitung an die Person, gespeichert wird der Hash. */
export async function issueToken(): Promise<{ token: string; hash: string }> {
  const token = randomToken(32);
  return { token, hash: await sha256Hex(token) };
}

export function hashToken(token: string): Promise<string> {
  return sha256Hex(token);
}

/** Einstellung aus ops.app_settings (JSON-Wert). */
export async function setting<T = unknown>(key: string): Promise<T> {
  const [row] = await db()`select ops.setting(${key}) as v`;
  return row!.v as T;
}

/** Regionsauswahl im Formular (muss zu app.waitlist_region_group passen). */
export const REGIONS = [
  "schwerin",
  "nordwestmecklenburg",
  "ludwigslust-parchim",
  "hamburg",
  "luebeck",
  "rostock",
  "anderswo",
] as const;
