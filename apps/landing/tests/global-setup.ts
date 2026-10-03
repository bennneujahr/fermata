import { isDeepStrictEqual } from "node:util";
import { defaults } from "../src/settings-defaults";
import { assertTestDb, resetWaitlist, setSetting, sql } from "./db";

export default async function globalSetup(): Promise<void> {
  try {
    await assertTestDb();
  } catch (err) {
    throw new Error(
      `Test-Datenbank nicht erreichbar oder falsch (${String(err)}). Bitte zuerst im Repo: DB_PORT=… DB_CONTAINER=… bash scripts/db.sh reset`,
    );
  }
  // Die Startwerte der Landingpage müssen zu den öffentlichen Einstellungen der Datenbank passen.
  const [row] = await sql`select api.public_settings() as s`;
  const db = row!.s as Record<string, unknown>;
  const mismatches = Object.entries(defaults)
    .filter(([k, v]) => !isDeepStrictEqual(db[k], v))
    .map(([k, v]) => `${k}: Seite ${JSON.stringify(v)} ≠ Datenbank ${JSON.stringify(db[k])}`);
  if (mismatches.length) throw new Error(`src/settings-defaults.ts passt nicht zur Datenbank:\n${mismatches.join("\n")}`);

  await resetWaitlist();
  // Für die Tests: kurze Mindestzeit, großzügige Drossel (alle Anfragen kommen von localhost).
  await setSetting("waitlist.min_fill_seconds", 1);
  await setSetting("waitlist.rate_limit_per_hour", 1000);
}
