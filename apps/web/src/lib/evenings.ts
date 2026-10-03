// Abende, freie Abende und Mitteilungen: Daten für Server Components (RPC im Schema api, docs/bereiche/abende.md).
import "server-only";
import { cache } from "react";
import { getSession } from "@/lib/data";
import type { ContactShare, DebriefOffer, EveningDetail, EveningListItem, FindInfo, PeriodRow, PushSubscriptionRow, WindowRow } from "@/lib/evening-types";

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { supabase } = await getSession();
  const { data, error } = await supabase.schema("api").rpc(fn, args);
  if (error) throw Object.assign(new Error(`${fn}: ${error.message}`), { code: error.code, hint: error.hint });
  return data as T;
}

/** Zeit der Datenbank (app.now(), mit Testuhr außerhalb der Produktion). Für „heute“, „morgen“ und Fristen. */
export const getDbNow = cache(async (): Promise<Date> => {
  try {
    const { supabase } = await getSession();
    const { data } = await supabase.schema("app").rpc("now");
    if (typeof data === "string") return new Date(data);
  } catch {
    /* ohne Datenbankzeit gilt die Uhr des Servers */
  }
  return new Date();
});

export const getMyEvenings = cache(async (): Promise<EveningListItem[]> => (await rpc<EveningListItem[]>("my_evenings")) ?? []);

export const getEveningDetail = cache(async (id: string): Promise<EveningDetail | null> => {
  try {
    return await rpc<EveningDetail>("evening_detail", { p_evening_id: id });
  } catch (err) {
    if ((err as { hint?: string }).hint === "not_participant" || (err as { code?: string }).code === "22P02") return null;
    throw err;
  }
});

export const getFindInfo = cache(async (id: string): Promise<FindInfo | null> => rpc<FindInfo | null>("evening_find_info", { p_evening_id: id }));

export const getContactShare = cache(async (id: string): Promise<ContactShare | null> => rpc<ContactShare | null>("my_contact_share", { p_evening_id: id }));

export const getDebriefOffer = cache(async (id: string): Promise<DebriefOffer | null> => rpc<DebriefOffer | null>("debrief_offer", { p_evening_id: id }));

export const getPeriods = cache(async (): Promise<PeriodRow[]> => (await rpc<PeriodRow[]>("my_availability_periods")) ?? []);

export const getWindows = cache(async (periodId: string): Promise<WindowRow[]> => (await rpc<WindowRow[]>("my_availability", { p_period_id: periodId })) ?? []);

export const getPushSubscriptions = cache(async (): Promise<PushSubscriptionRow[]> => (await rpc<PushSubscriptionRow[]>("my_push_subscriptions")) ?? []);

/** Ist die Telefonnummer hinterlegt? (für „Telefon teilen“) */
export const hasPhone = cache(async (): Promise<boolean> => {
  try {
    const rows = await rpc<{ phone: string | null }[]>("my_facts");
    return Boolean(rows?.[0]?.phone);
  } catch {
    return false;
  }
});
