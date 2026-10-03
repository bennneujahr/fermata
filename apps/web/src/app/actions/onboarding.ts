"use server";
// Onboarding-Schritte. Jede Action ruft eine RPC-Funktion (Regeln in der Datenbank) und leitet weiter.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { callFunction } from "@/lib/functions";
import { onboardingPath } from "@/lib/routes";
import { validateFacts } from "@/lib/validation";
import type { Onboarding } from "@/lib/types";
import type { ActionState } from "./state";

async function api() {
  return (await createClient()).schema("api");
}

async function nextStepPath(): Promise<string> {
  const { data } = await (await api()).rpc("my_onboarding");
  const o = data as Onboarding | null;
  return o?.next_step && o.next_step !== "fertig" ? onboardingPath(o.next_step) : "/start";
}

function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v : "";
}

export async function giveConsentAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const kind = str(fd, "kind");
  const version = str(fd, "version");
  const returnTo = str(fd, "return_to");
  if (fd.get("agree") !== "on") return { error: "required", fields: { agree: "required" } };
  const { error } = await (await api()).rpc("give_consent", { p_kind: kind, p_version: version });
  if (error) return { error: error.hint || "generic" };
  revalidatePath("/", "layout");
  if (returnTo.startsWith("/") && !returnTo.startsWith("//")) redirect(returnTo);
  redirect(await nextStepPath());
}

export async function saveFactsAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const values: Record<string, string> = {};
  for (const k of ["first_name", "last_name", "birth_date", "postal_code", "city", "phone", "street"]) values[k] = str(fd, k);
  const returnTo = str(fd, "return_to");
  const { data, errors } = validateFacts({ ...values, street: values.street || undefined });
  if (!data) return { error: "validation", fields: errors, values };
  const { error } = await (await api()).rpc("save_facts", {
    p_first_name: data.first_name,
    p_last_name: data.last_name,
    p_birth_date: data.birth_date,
    p_postal_code: data.postal_code,
    p_city: data.city || null,
    p_phone: data.phone || null,
    p_street: data.street || null,
  });
  if (error) {
    const hint = error.hint || "generic";
    const field = { invalid_name: "first_name", invalid_birth_date: "birth_date", too_young: "birth_date", invalid_postal_code: "postal_code", unknown_postal_code: "postal_code", invalid_city: "city", invalid_phone: "phone", invalid_street: "street", street_not_collected: "street" }[hint];
    return { error: hint, fields: field ? { [field]: hint } : undefined, values };
  }
  revalidatePath("/", "layout");
  if (returnTo === "/konto") redirect("/konto?gespeichert=angaben");
  redirect(await nextStepPath());
}

export async function lookupPostalCodeAction(plz: string): Promise<{ place: string; state: string } | null> {
  if (!/^[0-9]{5}$/.test(plz)) return null;
  const { data } = await (await api()).rpc("postal_code_lookup", { p_postal_code: plz });
  const row = (data as { place_name: string; state: string }[] | null)?.[0];
  return row ? { place: row.place_name, state: row.state } : null;
}

export async function saveIdentityAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const gender = str(fd, "gender");
  const seeking = fd.getAll("seeking").filter((v): v is string => typeof v === "string");
  const orientation = str(fd, "orientation");
  const addressForm = str(fd, "address_form") || "sie";
  const religion = str(fd, "religion").trim();
  const importance = str(fd, "religion_importance");
  const mustMatch = fd.get("religion_must_match") === "on";
  const religionConsent = fd.get("religion_consent") === "on";
  const religionVersion = str(fd, "religion_version");
  const returnTo = str(fd, "return_to");
  const values = { gender, orientation, address_form: addressForm, religion, religion_importance: importance, seeking: seeking.join(",") };

  const fields: Record<string, string> = {};
  if (!gender) fields.gender = "gender";
  if (seeking.length === 0) fields.seeking = "seeking";
  const wantsReligion = religion !== "" || importance !== "" || mustMatch;
  if (wantsReligion && !religionConsent) fields.religion = "religion_consent";
  if (Object.keys(fields).length) return { error: "validation", fields, values };

  const client = await api();
  const identity = await client.rpc("save_identity", { p_gender: gender, p_seeking: seeking, p_orientation: orientation || null });
  if (identity.error) return { error: identity.error.hint || "generic", values };
  const af = await client.rpc("save_address_form", { p_form: addressForm });
  if (af.error) return { error: af.error.hint || "generic", values };
  if (wantsReligion) {
    const c = await client.rpc("give_consent", { p_kind: "art9_religion", p_version: religionVersion });
    if (c.error) return { error: c.error.hint || "generic", values };
    const r = await client.rpc("save_religion", { p_religion: religion || null, p_importance: importance || null, p_must_match: mustMatch });
    if (r.error) return { error: r.error.hint || "generic", values };
  }
  revalidatePath("/", "layout");
  if (returnTo === "/konto") redirect("/konto?gespeichert=identitaet");
  redirect(await nextStepPath());
}

export async function giveBiometricConsentAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  if (fd.get("agree") !== "on") return { error: "required", fields: { agree: "required" } };
  const { error } = await (await api()).rpc("give_consent", { p_kind: "biometrie", p_version: str(fd, "version") });
  if (error) return { error: error.hint || "generic" };
  revalidatePath("/onboarding/ausweis");
  return { ok: true };
}

/** Startet die Prüfung über die Edge Function und liefert die Adresse für die Weiterleitung. */
export async function startVerificationAction(_prev: ActionState): Promise<ActionState & { url?: string }> {
  const res = await callFunction<{ url: string }>("verification-start");
  if (!res.ok || !res.data?.url) return { error: res.error ?? "generic" };
  return { ok: true, url: res.data.url };
}
