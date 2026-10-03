// Führt pgTAP-Tests aus supabase/tests/*.test.sql aus und wertet die TAP-Ausgabe aus.
// Jede Datei läuft in einer eigenen Transaktion (Tests beginnen mit begin; und enden mit rollback;).
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";

const port = process.env.DB_PORT ?? "54322";
const host = process.env.DB_HOST ?? "localhost";
const dir = "supabase/tests";
const args = process.argv.slice(2);
const files = (args.length ? args : readdirSync(dir).filter((f) => f.endsWith(".test.sql")).sort().map((f) => join(dir, f)));

let failedFiles = 0;
let total = 0;
for (const file of files) {
  const res = spawnSync("psql", ["-X", "-q", "-At", "-v", "ON_ERROR_STOP=1", "-h", host, "-p", port, "-U", "postgres", "-d", "postgres", "-f", file], {
    encoding: "utf8",
    env: { ...process.env, PGPASSWORD: process.env.DB_PASSWORD ?? "postgres" },
  });
  const out = (res.stdout ?? "") + (res.stderr ?? "");
  const lines = out.split("\n");
  const plan = lines.map((l) => /^1\.\.(\d+)/.exec(l)).find(Boolean);
  const oks = lines.filter((l) => /^ok \d+/.test(l)).length;
  const notOks = lines.filter((l) => /^not ok \d+/.test(l));
  const planned = plan ? Number(plan[1]) : NaN;
  const ok = res.status === 0 && notOks.length === 0 && oks === planned;
  total += oks;
  console.log(`${ok ? "ok  " : "FEHLER"} ${file} (${oks}/${Number.isNaN(planned) ? "?" : planned})`);
  if (!ok) {
    failedFiles++;
    console.log(lines.filter((l) => l.startsWith("not ok") || l.startsWith("#") || /ERROR|FEHLER|psql:/.test(l)).join("\n"));
  }
}
console.log(`\n${files.length} Testdatei(en), ${total} bestandene Prüfungen, ${failedFiles} fehlgeschlagen.`);
process.exit(failedFiles ? 1 : 0);
