"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/app/actions/state";
import { adminFrom, rpc } from "@/app/admin/_lib/rpc";
import { adminVenues as c } from "@/copy/admin-lokale";
import { fail, isUuid, opt, str } from "./util";

function coord(v: string | null): number | null {
  if (v === null) return null;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : Number.NaN;
}

/** Lokal anlegen oder ändern (api.admin_create_venue / api.admin_update_venue). Ohne Ort: Ort aus der PLZ; ohne Koordinaten: PLZ-Mittelpunkt. */
export async function saveVenueAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const venueId = opt(fd, "venue_id");
  const postal = str(fd, "postal_code");
  let city = opt(fd, "city");
  if (!city && /^\d{5}$/.test(postal)) {
    const r = await rpc<{ place_name: string }[]>("postal_code_lookup", { p_postal_code: postal });
    city = r.data?.[0]?.place_name ?? null;
  }
  const lat = coord(opt(fd, "lat"));
  const lon = coord(opt(fd, "lon"));
  if (Number.isNaN(lat) || Number.isNaN(lon)) return { error: "invalid_coordinates" };

  let agreement: Record<string, unknown> = {};
  if (venueId && isUuid(venueId)) {
    const { data } = await (await adminFrom("app", "venues")).select("agreement").eq("id", venueId).maybeSingle();
    agreement = ((data as { agreement?: Record<string, unknown> } | null)?.agreement ?? {}) as Record<string, unknown>;
  }
  agreement = {
    ...agreement,
    reservation_note: opt(fd, "reservation_note"),
    absprachen: opt(fd, "agreement_notes"),
    personal_eingewiesen: fd.get("briefed") === "on",
  };
  for (const k of Object.keys(agreement)) if (agreement[k] === null) delete agreement[k];

  const data = {
    name: str(fd, "name"),
    street: str(fd, "street"),
    postal_code: postal,
    city,
    lat,
    lon,
    contact_name: opt(fd, "contact_name"),
    contact_email: opt(fd, "contact_email"),
    contact_phone: opt(fd, "contact_phone"),
    reservation_mode: str(fd, "reservation_mode") || "email",
    description: opt(fd, "description"),
    accessibility: opt(fd, "accessibility"),
    public_transport: opt(fd, "public_transport"),
    agreement,
  };
  if (venueId) {
    if (!isUuid(venueId)) return { error: "venue_not_found" };
    const r = await rpc("admin_update_venue", { p_venue_id: venueId, p_data: data });
    if (r.error) return fail(r.error);
    revalidatePath("/admin/lokale", "layout");
    return { ok: true, message: c.form.saved };
  }
  const r = await rpc<{ id: string }>("admin_create_venue", { p_data: data });
  if (r.error) return fail(r.error);
  revalidatePath("/admin/lokale", "layout");
  redirect(`/admin/lokale/${r.data!.id}?angelegt=1`);
}

export async function setVenueActiveAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const id = str(fd, "venue_id");
  if (!isUuid(id)) return { error: "venue_not_found" };
  const r = await rpc<{ upcoming_reservations: number }>("admin_set_venue_active", { p_venue_id: id, p_active: str(fd, "active") === "true" });
  if (r.error) return fail(r.error);
  revalidatePath("/admin/lokale", "layout");
  return { ok: true, message: c.active.done(r.data?.upcoming_reservations ?? 0) };
}

export async function createSlotsAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const id = str(fd, "venue_id");
  if (!isUuid(id)) return { error: "venue_not_found" };
  const weekdays = fd.getAll("weekdays").map((v) => Number(v)).filter((n) => n >= 1 && n <= 7);
  const times = str(fd, "times")
    .split(/[\s,;]+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => (/^\d:\d{2}$/.test(t) ? `0${t}` : t));
  const firstDay = str(fd, "first_day");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(firstDay)) return { error: "invalid_range" };
  if (weekdays.length === 0) return { error: "invalid_weekdays" };
  if (times.length === 0) return { error: "invalid_times" };
  const r = await rpc<{ created: number; updated: number; skipped: number }>("admin_create_slots", {
    p_venue_id: id,
    p_first_day: firstDay,
    p_weeks: Number(str(fd, "weeks")),
    p_weekdays: weekdays,
    p_times: times,
    p_tables: Number(str(fd, "tables")),
    p_update_existing: fd.get("update_existing") === "on",
  });
  if (r.error) return fail(r.error);
  revalidatePath(`/admin/lokale/${id}`);
  revalidatePath("/admin/lokale");
  return { ok: true, message: c.slots.done(r.data?.created ?? 0, r.data?.updated ?? 0, r.data?.skipped ?? 0) };
}

export async function updateSlotAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const slot = str(fd, "slot_id");
  const venue = str(fd, "venue_id");
  if (!isUuid(slot)) return { error: "slot_not_found" };
  const r = await rpc("admin_update_slot", { p_slot_id: slot, p_tables: Number(str(fd, "tables")) });
  if (r.error) return fail(r.error);
  if (isUuid(venue)) revalidatePath(`/admin/lokale/${venue}`);
  return { ok: true, message: c.slots.updated };
}

export async function deleteSlotAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const slot = str(fd, "slot_id");
  const venue = str(fd, "venue_id");
  if (!isUuid(slot)) return { error: "slot_not_found" };
  const r = await rpc<boolean>("admin_delete_slot", { p_slot_id: slot });
  if (r.error) return fail(r.error);
  if (isUuid(venue)) revalidatePath(`/admin/lokale/${venue}`);
  return { ok: true, message: c.slots.deleted };
}

export async function createPeriodAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const startsOn = opt(fd, "starts_on");
  if (startsOn && !/^\d{4}-\d{2}-\d{2}$/.test(startsOn)) return { error: "invalid_range" };
  const r = await rpc<string>("admin_create_availability_period", { p_starts_on: startsOn, p_notify: fd.get("notify") === "on" });
  if (r.error) return fail(r.error);
  revalidatePath("/admin/lokale/zeitraeume");
  revalidatePath("/admin");
  return { ok: true, message: c.periods.done };
}

export async function resolveEveningAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const evening = str(fd, "evening_id");
  const outcome = str(fd, "outcome");
  const a = str(fd, "a_user");
  const b = str(fd, "b_user");
  const note = opt(fd, "note");
  if (!isUuid(evening)) return { error: "evening_not_found" };
  const choice: Record<string, [string, string | null]> = {
    happened: ["happened", null],
    no_show_a: ["no_show", isUuid(a) ? a : null],
    no_show_b: ["no_show", isUuid(b) ? b : null],
    no_show_both: ["no_show", null],
  };
  if (!(outcome in choice) || ((outcome === "no_show_a" || outcome === "no_show_b") && !choice[outcome]![1])) return { error: "invalid_outcome" };
  const [p_outcome, p_no_show_user] = choice[outcome]!;
  const r = await rpc("admin_resolve_evening", { p_evening_id: evening, p_outcome, p_no_show_user, p_note: note });
  if (r.error) return fail(r.error);
  // Zugehörige Hinweise „Nichterscheinen bestritten“ als erledigt vermerken.
  for (const flag of fd.getAll("flag_id").map(String).filter(isUuid)) {
    await rpc("admin_review_flag", { p_flag_id: flag, p_outcome: c.evenings.flagOutcome(p_outcome) });
  }
  revalidatePath("/admin/lokale/abende");
  revalidatePath("/admin");
  return { ok: true, message: c.evenings.done };
}
