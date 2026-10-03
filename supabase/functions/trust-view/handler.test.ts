// Datenbank-Test (SUPABASE_DB_URL): öffentliche Seite „Abend teilen“.
import { strict as assert } from "node:assert";
import { cleanupEvenings, createEvening, createMember, hasDb, setupEnv, testSql } from "../_shared/stripe/testing.ts";
import handler from "./handler.ts";

setupEnv();
const opts = { ignore: !hasDb, sanitizeOps: false, sanitizeResources: false };

async function share(sql: ReturnType<typeof testSql>, userId: string, eveningId: string): Promise<string> {
  // Wie api.create_trust_share, aber direkt als angemeldete Person in einer Transaktion.
  return await sql.begin(async (tx) => {
    await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userId, role: "authenticated" })}, true)`;
    await tx`set local role authenticated`;
    const [row] = await tx`select api.create_trust_share(${eveningId}::uuid) as r`;
    return (row!.r as { token: string }).token;
  }) as string;
}

Deno.test({ name: "trust-view: zeigt Lokal, Zeit, eigenen Vornamen und Heimwegtelefon – nichts vom Gegenüber", ...opts, fn: async () => {
  const sql = testSql();
  const a = await createMember(sql, { firstName: "Frieda", lastName: "Teilt" });
  const b = await createMember(sql, { firstName: "Gustav", lastName: "Gegenueber" });
  try {
    const evening = await createEvening(sql, a.id, b.id, { startsInHours: 30, venueName: "Bistro Lindenhof" });
    const token = await share(sql, a.id, evening);

    const res = await handler(new Request(`https://fn.fermata.test/functions/v1/trust-view?t=${token}`));
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.ok(html.includes("Frieda hat einen Abend mit Ihnen geteilt"));
    assert.ok(html.includes("Bistro Lindenhof") && html.includes("Teststraße 1") && html.includes("19053 Schwerin"));
    assert.ok(html.includes("030 12074182") && html.includes('href="tel:03012074182"'));
    assert.ok(!html.includes("Gustav") && !html.includes("Gegenueber") && !html.includes("Teilt") && !html.includes(b.id));
    assert.equal(res.headers.get("x-robots-tag"), "noindex, nofollow");
    assert.equal(res.headers.get("referrer-policy"), "no-referrer");
    assert.match(res.headers.get("content-security-policy") ?? "", /default-src 'none'; style-src 'sha256-/);

    const j = await handler(new Request(`https://fn.fermata.test/functions/v1/trust-view?t=${token}`, { headers: { accept: "application/json" } }));
    const body = await j.json();
    assert.equal(body.first_name, "Frieda");
    assert.equal(body.venue.name, "Bistro Lindenhof");
    assert.deepEqual(Object.keys(body).sort(), ["emergency_number", "expires_at", "first_name", "heimwegtelefon", "starts_at", "venue"]);
    assert.match(j.headers.get("content-type") ?? "", /application\/json/);

    // Vertrag 3: Schlüssel im JSON-Body (die Seite /teilen liest ihn aus dem URL-Fragment)
    const p = await handler(new Request("https://fn.fermata.test/functions/v1/trust-view", {
      method: "POST", headers: { accept: "application/json", "content-type": "application/json" }, body: JSON.stringify({ t: token }),
    }));
    assert.equal(p.status, 200);
    assert.equal((await p.json()).first_name, "Frieda");
    // Link aus api.create_trust_share zeigt auf die Web-App, Schlüssel im Fragment
    const [link] = await sql.begin(async (tx) => {
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: a.id, role: "authenticated" })}, true)`;
      await tx`set local role authenticated`;
      return await tx`select api.create_trust_share(${evening}::uuid) ->> 'url' as url`;
    });
    assert.match(String(link!.url), /^https:\/\/app\.fermata\.example\/teilen#t=[A-Za-z0-9_-]{32}$/);

    // Zurückgezogen → nicht mehr gültig
    await sql`update app.trust_shares set revoked_at = now() where evening_id = ${evening}::uuid`;
    const gone = await handler(new Request(`https://fn.fermata.test/functions/v1/trust-view?t=${token}`));
    assert.equal(gone.status, 404);
    assert.ok((await gone.text()).includes("nicht mehr gültig"));
    const goneJson = await handler(new Request("https://fn.fermata.test/functions/v1/trust-view", {
      method: "POST", headers: { accept: "application/json", "content-type": "application/json" }, body: JSON.stringify({ t: token }),
    }));
    assert.equal(goneJson.status, 404);
    assert.deepEqual(await goneJson.json(), { error: "not_found" });
  } finally {
    await cleanupEvenings(sql, [a.id, b.id]);
    await sql.end();
  }
} });

Deno.test({ name: "trust-view: falscher oder fehlender Schlüssel → 404, nur GET und POST", ...opts, fn: async () => {
  const sql = testSql();
  try {
    assert.equal((await handler(new Request("https://fn.fermata.test/functions/v1/trust-view"))).status, 404);
    assert.equal((await handler(new Request("https://fn.fermata.test/functions/v1/trust-view?t=abcdefghijklmnopqrstuvwxyz012345"))).status, 404);
    assert.equal((await handler(new Request("https://fn.fermata.test/functions/v1/trust-view?t=<script>"))).status, 404);
    assert.equal((await handler(new Request("https://fn.fermata.test/functions/v1/trust-view", { method: "POST" }))).status, 404);
    const bad = await handler(new Request("https://fn.fermata.test/functions/v1/trust-view", {
      method: "POST", headers: { accept: "application/json" }, body: "kein json",
    }));
    assert.equal(bad.status, 404);
    assert.deepEqual(await bad.json(), { error: "not_found" });
    assert.equal((await handler(new Request("https://fn.fermata.test/functions/v1/trust-view", { method: "PUT" }))).status, 405);
    // Die Seite /teilen der Web-App fragt von ihrer Herkunft aus an (CORS nur für erlaubte Herkünfte)
    const before = Deno.env.get("FERMATA_ALLOWED_ORIGINS");
    Deno.env.set("FERMATA_ALLOWED_ORIGINS", "https://app.fermata.test");
    try {
      const pre = await handler(new Request("https://fn.fermata.test/functions/v1/trust-view", {
        method: "OPTIONS", headers: { origin: "https://app.fermata.test" },
      }));
      assert.equal(pre.status, 204);
      assert.equal(pre.headers.get("access-control-allow-origin"), "https://app.fermata.test");
      const other = await handler(new Request("https://fn.fermata.test/functions/v1/trust-view", {
        method: "OPTIONS", headers: { origin: "https://boese.example" },
      }));
      assert.equal(other.headers.get("access-control-allow-origin"), null);
    } finally {
      if (before === undefined) Deno.env.delete("FERMATA_ALLOWED_ORIGINS");
      else Deno.env.set("FERMATA_ALLOWED_ORIGINS", before);
    }
  } finally {
    await sql.end();
  }
} });
