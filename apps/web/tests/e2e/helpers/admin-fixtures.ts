// Testdaten für die Admin-Tests (direkt in der Datenbank des lokalen Stapels).
import { sql } from "./backend";
import { onboardedMember } from "./member";

type Tx = typeof sql;

export async function asMember<T>(id: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return (await sql.begin(async (tx) => {
    await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: id, role: "authenticated", aal: "aal1" })}, true)`;
    await tx`set local role authenticated`;
    return fn(tx as unknown as Tx);
  })) as T;
}

/** Zwei geprüfte Mitglieder mit Anzeigenamen. */
export async function memberPair(first = "Clara", second = "Dirk"): Promise<{ a: { id: string; email: string }; b: { id: string; email: string } }> {
  const a = await onboardedMember({ first });
  const b = await onboardedMember({ first: second });
  await sql`insert into app.profile_core (user_id, display_name, birth_year) values (${a.id}::uuid, ${first}, 1988), (${b.id}::uuid, ${second}, 1985)
            on conflict (user_id) do update set display_name = excluded.display_name`;
  return { a, b };
}

/** Lokal für Fixtures (Name eindeutig, nicht „Sim · …“, damit die Simulation es nicht löscht). */
export async function fixtureVenue(name = `Weinstube E2E ${Date.now().toString(36)}`): Promise<string> {
  const [v] = await sql`insert into app.venues (name, street, postal_code, city, lat, lon, contact_email, reservation_mode)
                        values (${name}, 'Seestraße 5', '19053', 'Schwerin', 53.62, 11.42, 'lokal@e2e.fermata.test', 'email') returning id`;
  return v!.id as string;
}

/** Bestätigter Abend zwischen zwei Personen (Beginn relativ zu jetzt, z. B. '-30 hours' oder '3 days'). */
export async function confirmedEvening(aId: string, bId: string, venueId: string, starts: string): Promise<string> {
  const [run] = await sql`insert into app.match_runs (scheduled_for, status) values (now(), 'approved') returning id`;
  const [ua, ub] = aId < bId ? [aId, bId] : [bId, aId];
  const [p] = await sql`insert into app.pairings (run_id, user_a, user_b, total_score, status, venue_id)
                        values (${run!.id}::uuid, ${ua}::uuid, ${ub}::uuid, 0.8, 'proposed', ${venueId}::uuid) returning id`;
  await sql`insert into app.venue_slots (venue_id, starts_at, tables) values (${venueId}::uuid, date_trunc('minute', app.now()) + ${starts}::interval, 2)
            on conflict (venue_id, starts_at) do update set tables = app.venue_slots.tables + 1`;
  const [e] = await sql`insert into app.evenings (pairing_id, user_a, user_b, venue_id, starts_at)
                        values (${p!.id}::uuid, ${ua}::uuid, ${ub}::uuid, ${venueId}::uuid, date_trunc('minute', app.now()) + ${starts}::interval) returning id`;
  await sql`select app.evening_transition(${e!.id}::uuid, 'request_time', ${ua}::uuid)`;
  await sql`select app.evening_transition(${e!.id}::uuid, 'confirm', ${ub}::uuid)`;
  return e!.id as string;
}

/** Meldung einer Person über eine andere (über api.report, wie in der App). */
export async function fileReport(reporter: string, reported: string, eveningId: string | null, category = "belaestigung", context = "abend", text = "Beim Abend wurde ich mehrfach bedrängt und herabgesetzt."): Promise<string> {
  const r = await asMember(reporter, (tx) => tx`select api.report(${context}, ${category}, ${reported}::uuid, ${eveningId}::uuid, ${text}, true) as r`);
  return (r[0]!.r as { report_id: string }).report_id;
}

export async function fileAppeal(user: string, sanctionId: string, text = "Ich halte die Sperre für ungerecht, bitte prüfen Sie den Abend noch einmal."): Promise<string> {
  const r = await asMember(user, (tx) => tx`select api.appeal(${sanctionId}::uuid, ${text}) as r`);
  return (r[0]!.r as { appeal_id: string }).appeal_id;
}

/** Bestätigte Einträge auf der Warteliste (Westmecklenburg), Platz in der Reihenfolge der Liste. */
export async function waitlistEntries(names: string[], source: string | null = "pfaffenteich"): Promise<{ id: string; email: string; first: string }[]> {
  const [{ base }] = (await sql`select coalesce(max(base_number), 0) + 1 as base from public.waitlist where region_group = 'westmecklenburg'`) as unknown as [{ base: number }];
  const out: { id: string; email: string; first: string }[] = [];
  for (const [i, first] of names.entries()) {
    const email = `${first.toLowerCase()}-${Date.now().toString(36)}${i}@e2e.fermata.test`;
    const [row] = await sql`insert into public.waitlist (first_name, email, region, postal_code, consent_text_version, consent_at, confirmed_at, base_number, source)
                            values (${first}, ${email}, 'schwerin', '19053', 'warteliste-2026-10-03-entwurf', now(), now() - ${`${names.length - i} minutes`}::interval, ${Number(base) + i}, ${source})
                            returning id`;
    out.push({ id: row!.id as string, email, first });
  }
  await sql`update public.waitlist_counters set last_number = greatest(last_number, ${Number(base) + names.length}) where region_group = 'westmecklenburg'`;
  return out;
}

/** Hinweis des Sicherheits-Agenten mit Gespräch und Transkript (für den Zugriff im Sicherheitsfall). */
export async function agentFlagWithTranscript(user: string): Promise<{ sessionId: string; flagId: string }> {
  const [s] = await sql`insert into app.interview_sessions (user_id, kind, status, started_at, ended_at, end_reason, safety_flagged)
                        values (${user}::uuid, 'erstgespraech', 'completed', now() - interval '2 hours', now() - interval '1 hour', 'krise', true) returning id`;
  await sql`insert into app.interview_transcripts (session_id, user_id, turns, delete_at)
            values (${s!.id}::uuid, ${user}::uuid, ${sql.json([
              { role: "viola", text: "Schön, dass Sie da sind. Wie geht es Ihnen heute?", at: new Date().toISOString() },
              { role: "person", text: "Ehrlich gesagt nicht gut, mir wächst gerade alles über den Kopf.", at: new Date().toISOString() },
            ])}, now() + interval '30 days')
            on conflict (session_id) do update set turns = excluded.turns`;
  const [f] = await sql`insert into safety.safety_flags (user_id, source, kind, severity, details)
                        values (${user}::uuid, 'agent', 'krise', 'hoch', ${sql.json({ session_id: s!.id, detectors: ["regel"], conversation_kind: "erstgespraech" })}) returning id`;
  return { sessionId: s!.id as string, flagId: f!.id as string };
}

/** Erklärungen zur Mitgliedschaft (Bestellung und Kündigung) für die Admin-Liste. */
export async function contractActions(user: string): Promise<void> {
  await sql`insert into billing.contract_actions (user_id, kind, at, details, confirmation_sent_at, effective_at)
            values (${user}::uuid, 'order', now() - interval '3 days', ${sql.json({ contract_number: "FM-E2E-0001", tier: "andante", name: "Clara Mertens" })}, now() - interval '3 days', now() - interval '3 days'),
                   (${user}::uuid, 'cancel', now() - interval '1 day', ${sql.json({ contract_number: "FM-E2E-0001", name: "Clara Mertens", kind: "ordentlich" })}, null, now() + interval '25 days')`;
}

/** Als Admin mit aal2 in der Datenbank handeln (z. B. Vorschläge vorab entscheiden). */
export async function asAdmin<T>(adminId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return (await sql.begin(async (tx) => {
    await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: adminId, role: "authenticated", aal: "aal2" })}, true)`;
    await tx`set local role authenticated`;
    return fn(tx as unknown as Tx);
  })) as T;
}
