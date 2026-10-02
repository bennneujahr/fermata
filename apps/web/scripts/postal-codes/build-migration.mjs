// Erzeugt supabase/migrations/20261003000220_web_postal_codes.sql aus offenen PLZ-Daten.
//
// Quelle: GeoNames (https://www.geonames.org/), Lizenz CC BY 4.0, aufbereitet von
// zauberware/postal-codes-json-xml-csv (data/DE.zip → zipcodes.de.csv, Stand 2026-07-31,
// Commit b4be5a6e3c30c65dc7846e09ec9b70d65d0db7f5). Details: docs/bereiche/web.md („Entscheidungen“).
//
// Aufbereitung:
// - nur Zustell-PLZ (Bundesland als Kürzel); Großkunden-PLZ (Firmen, Behörden) entfallen,
// - je PLZ der Mittelwert aller Orte als Näherung für den Mittelpunkt, auf 4 Nachkommastellen,
// - Ortsname = erster Ort der Quelle (meist der Hauptort).
//
// Aufruf: node apps/web/scripts/postal-codes/build-migration.mjs <pfad/zu/zipcodes.de.csv>
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const STATES = {
  BW: "Baden-Württemberg", BY: "Bayern", BE: "Berlin", BB: "Brandenburg", HB: "Bremen", HH: "Hamburg",
  HE: "Hessen", MV: "Mecklenburg-Vorpommern", NI: "Niedersachsen", NW: "Nordrhein-Westfalen",
  RP: "Rheinland-Pfalz", SL: "Saarland", SN: "Sachsen", ST: "Sachsen-Anhalt", SH: "Schleswig-Holstein", TH: "Thüringen",
};

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}

export function aggregate(rows) {
  const [header, ...data] = rows;
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));
  const byPlz = new Map();
  for (const r of data) {
    const plz = r[idx.zipcode];
    const state = r[idx.state_code];
    if (!/^[0-9]{5}$/.test(plz) || !STATES[state]) continue;
    const lat = Number(r[idx.latitude]);
    const lon = Number(r[idx.longitude]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const e = byPlz.get(plz) ?? { plz, place: r[idx.place], state: STATES[state], lats: [], lons: [] };
    e.lats.push(lat);
    e.lons.push(lon);
    byPlz.set(plz, e);
  }
  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  return [...byPlz.values()]
    .map((e) => ({ plz: e.plz, place: e.place.trim(), state: e.state, lat: +mean(e.lats).toFixed(4), lon: +mean(e.lons).toFixed(4) }))
    .filter((e) => e.lat >= 47 && e.lat <= 56 && e.lon >= 5 && e.lon <= 16)
    .sort((a, b) => a.plz.localeCompare(b.plz));
}

const q = (s) => "'" + s.replace(/'/g, "''") + "'";

export function toSql(entries) {
  const lines = entries.map((e) => `(${q(e.plz)}, ${q(e.place)}, ${e.lat}, ${e.lon}, ${q(e.state)})`);
  const chunks = [];
  for (let i = 0; i < lines.length; i += 1000) chunks.push(lines.slice(i, i + 1000));
  return `-- Fermata · PLZ-Mittelpunkte für app.postal_codes (PLAN 3.4). Automatisch erzeugt – nicht von Hand ändern.
-- Erzeugt mit apps/web/scripts/postal-codes/build-migration.mjs.
-- Quelle: GeoNames (www.geonames.org), Lizenz Creative Commons Namensnennung 4.0 (CC BY 4.0),
-- aufbereitet von zauberware/postal-codes-json-xml-csv (Stand 2026-07-31). Änderungen: nur Zustell-PLZ,
-- Mittelwert der Ortskoordinaten je PLZ, gerundet. ${entries.length} Postleitzahlen.

comment on table app.postal_codes is 'PLZ-Mittelpunkte (Näherung) aus GeoNames, CC BY 4.0. Quelle und Aufbereitung: docs/bereiche/web.md.';

${chunks
  .map(
    (c) => `insert into app.postal_codes (postal_code, place_name, lat, lon, state) values
${c.join(",\n")}
on conflict (postal_code) do update set place_name = excluded.place_name, lat = excluded.lat, lon = excluded.lon, state = excluded.state;`,
  )
  .join("\n\n")}
`;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const src = process.argv[2];
  if (!src) {
    console.error("Aufruf: node build-migration.mjs <zipcodes.de.csv>");
    process.exit(2);
  }
  const entries = aggregate(parseCsv(readFileSync(src, "utf8")));
  const out = new URL("../../../../supabase/migrations/20261003000220_web_postal_codes.sql", import.meta.url);
  writeFileSync(out, toSql(entries));
  console.log(`${entries.length} PLZ geschrieben nach ${fileURLToPath(out)}`);
}
