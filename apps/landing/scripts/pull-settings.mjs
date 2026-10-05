// Lädt beim Build die öffentlichen Einstellungen (api.public_settings) aus Supabase nach src/generated/settings.json.
// Ohne SUPABASE_URL und SUPABASE_ANON_KEY passiert nichts; dann gelten die Startwerte aus src/settings.ts.
// Läuft nur auf dem Build-Server, nie im Browser.
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const out = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "generated", "settings.json");
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_ANON_KEY;
if (!url || !key) {
  rmSync(out, { force: true });
  console.log("Einstellungen: Startwerte aus src/settings.ts (SUPABASE_URL/SUPABASE_ANON_KEY nicht gesetzt).");
  process.exit(0);
}
const res = await fetch(`${url.replace(/\/$/, "")}/rest/v1/rpc/public_settings`, {
  method: "POST",
  headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json", "content-profile": "api" },
  body: "{}",
});
if (!res.ok) {
  console.error(`Einstellungen konnten nicht geladen werden (HTTP ${res.status}).`);
  process.exit(1);
}
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(await res.json(), null, 2));
console.log("Einstellungen aus Supabase geladen.");
