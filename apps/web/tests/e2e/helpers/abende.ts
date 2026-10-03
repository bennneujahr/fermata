// Testdaten für Abende und freie Abende direkt in der Datenbank (wie Auswahl-Job und Admin-Freigabe).
// Zeiten in Ortszeit Berlin, bezogen auf die echte Uhr. Die Testuhr (ops.sim_clock) stellt jeder Test selbst
// und setzt sie am Ende zurück (resetClock).
import { sql } from "./backend";
import { onboardedMember } from "./member";

export interface Person {
  id: string;
  email: string;
  first: string;
}

/** Laufender Zeitraum (heute bis heute + 13), für alle Tests derselbe. */
export async function currentPeriod(): Promise<string> {
  const [row] = await sql`
    insert into app.availability_periods (starts_on, ends_on, ask_at, answer_until)
    values ((now() at time zone 'Europe/Berlin')::date, (now() at time zone 'Europe/Berlin')::date + 13, now() - interval '1 hour', now() + interval '3 days')
    on conflict (starts_on, ends_on) do update set answer_until = greatest(app.availability_periods.answer_until, excluded.answer_until)
    returning id`;
  return row!.id as string;
}

/** Ortszeit Berlin an „heute + Tag“ als ISO (UTC). */
export async function berlinAt(day: number, time: string): Promise<string> {
  const [row] = await sql`select to_char(app.berlin_at((now() at time zone 'Europe/Berlin')::date + ${day}::int, ${time}::time) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as t`;
  return row!.t as string;
}

export async function member(first: string, opts: { tier?: "auftakt" | "andante" | "loge" } = {}): Promise<Person> {
  const m = await onboardedMember({ first });
  await sql`update app.accounts set status = 'active', tier_view = ${opts.tier ?? "auftakt"} where user_id = ${m.id}::uuid`;
  await sql`insert into app.profile_core (user_id, display_name, ready_for_matching) values (${m.id}::uuid, ${first}, true)
            on conflict (user_id) do update set display_name = excluded.display_name`;
  return { ...m, first };
}

let venueCounter = 0;

/** Lokal mit freien Tischen an Tag 3 bis 5 (19:00, 19:30, 20:00 Uhr). */
export async function venue(name = "Café am Pfaffenteich"): Promise<string> {
  venueCounter += 1;
  const [v] = await sql`
    insert into app.venues (name, street, postal_code, city, lat, lon, contact_name, contact_email, reservation_mode, description, public_transport, accessibility)
    values (${`${name}${venueCounter > 1 ? ` ${venueCounter}` : ""}`}, 'Am Pfaffenteich 5', '19055', 'Schwerin', 53.6304, 11.4148, 'Frau Wirt', 'tisch@cafe.example', 'email',
            'Ruhiges Café mit Blick aufs Wasser.', 'Tram 1 und 2, Haltestelle Marienplatz (3 Minuten zu Fuß)', 'Stufenloser Eingang, barrierefreies WC')
    returning id`;
  for (const day of [3, 4, 5]) {
    for (const t of ["19:00", "19:30", "20:00"]) {
      await sql`insert into app.venue_slots (venue_id, starts_at, tables)
                values (${v!.id}::uuid, app.berlin_at((now() at time zone 'Europe/Berlin')::date + ${day}::int, ${t}::time), 2)`;
    }
  }
  return v!.id as string;
}

/** Freie Fenster beider Personen an Tag 3 bis 5, 18 bis 23 Uhr. */
async function windows(periodId: string, ...people: Person[]) {
  for (const p of people) {
    await sql`delete from app.availability_windows where user_id = ${p.id}::uuid and period_id = ${periodId}::uuid`;
    for (const day of [3, 4, 5]) {
      await sql`insert into app.availability_windows (user_id, period_id, starts_at, ends_at)
                values (${p.id}::uuid, ${periodId}::uuid,
                        app.berlin_at((now() at time zone 'Europe/Berlin')::date + ${day}::int, '18:00'::time),
                        app.berlin_at((now() at time zone 'Europe/Berlin')::date + ${day}::int, '23:00'::time))`;
    }
  }
}

export interface EveningSeed {
  eveningId: string;
  a: Person;
  b: Person;
  venueId: string;
  proposed: string[];
}

/** Vorschlag wie nach der Freigabe durch Benn: Paar + Abend im Zustand proposed (Fristen startet der Trigger). */
export async function proposedEvening(opts: { a?: Person; b?: Person; tierA?: "auftakt" | "andante" | "loge"; reasons?: string } = {}): Promise<EveningSeed> {
  const a = opts.a ?? (await member("Mira", { tier: opts.tierA }));
  const b = opts.b ?? (await member("Jonas"));
  const periodId = await currentPeriod();
  const venueId = await venue();
  await windows(periodId, a, b);
  const [run] = await sql`insert into app.match_runs (period_id, scheduled_for, status) values (${periodId}::uuid, now(), 'approved') returning id`;
  const [x, y] = a.id < b.id ? [a.id, b.id] : [b.id, a.id];
  const reasons = opts.reasons ?? "Sie gehen beide gern am Wasser spazieren und mögen ruhige Abende mit gutem Gespräch.";
  const [pairing] = await sql`
    insert into app.pairings (run_id, user_a, user_b, total_score, venue_id, reasons_text, status)
    values (${run!.id}::uuid, ${x}::uuid, ${y}::uuid, 0.81, ${venueId}::uuid, ${reasons}, 'proposed') returning id`;
  const proposed = [await berlinAt(3, "19:00"), await berlinAt(4, "19:30")];
  const [evening] = await sql`
    insert into app.evenings (pairing_id, user_a, user_b, venue_id, proposed_times)
    values (${pairing!.id}::uuid, ${x}::uuid, ${y}::uuid, ${venueId}::uuid, ${sql.json(proposed)}) returning id`;
  return { eveningId: evening!.id as string, a, b, venueId, proposed };
}

/** Testuhr: app.now() = echte Zeit + Versatz (nur außerhalb der Produktion). */
export async function clockTo(iso: string): Promise<void> {
  await sql`update ops.sim_clock set offset_interval = ${iso}::timestamptz - now() where id`;
}

export async function resetClock(): Promise<void> {
  await sql`select ops.sim_clock_reset()`;
}

export async function eveningRow(id: string) {
  const [row] = await sql`select state, starts_at, requested_by, countered_by from app.evenings where id = ${id}::uuid`;
  return row as { state: string; starts_at: Date | null; requested_by: string | null; countered_by: string | null };
}
