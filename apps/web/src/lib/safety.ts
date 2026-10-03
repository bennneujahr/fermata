// Daten der Sicherheit für Server Components (RPC im Schema api).
import "server-only";
import { cache } from "react";
import { apiRpc, RpcFailure } from "@/lib/billing";
import { getPublicSettings } from "@/lib/data";
import type { HelpContacts, MyAppeal, MyEvening, MyReport, MySanction, TrustShare } from "@/lib/safety-types";
import { fallbackHelpContacts } from "@/lib/safety-rules";

/** Hilfe-Nummern aus api.help_contacts(); fällt die Abfrage aus, die Nummern aus public_settings bzw. 110/112. */
export const getHelpContacts = cache(async (): Promise<HelpContacts> => {
  try {
    const c = await apiRpc<HelpContacts | null>("help_contacts");
    if (c?.police?.number) return c;
  } catch {
    // weiter mit dem Ersatz
  }
  const s = await getPublicSettings();
  return fallbackHelpContacts(s["safety.emergency_number"], s["safety.heimwegtelefon_number"], s["safety.heimwegtelefon_hours"]);
});

async function list<T>(fn: string, args?: Record<string, unknown>): Promise<T[] | null> {
  try {
    return (await apiRpc<T[]>(fn, args)) ?? [];
  } catch {
    return null;
  }
}

export const getMyReports = cache(() => list<MyReport>("my_reports"));
export const getMySanctions = cache(() => list<MySanction>("my_sanctions"));
export const getMyAppeals = cache(() => list<MyAppeal>("my_appeals"));
export const getMyTrustShares = cache(() => list<TrustShare>("my_trust_shares"));
export const getMyEvenings = cache(() => list<MyEvening>("my_evenings"));

/** Ein eigener Abend (api.evening_detail) oder null, wenn er nicht existiert oder nicht zur Person gehört. */
export const getEvening = cache(async (id: string): Promise<(MyEvening & { reservation?: unknown }) | null> => {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  try {
    return await apiRpc<MyEvening>("evening_detail", { p_evening_id: id });
  } catch (e) {
    if (e instanceof RpcFailure) return null;
    throw e;
  }
});
