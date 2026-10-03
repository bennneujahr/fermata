// Erzeugt für den lokalen Stapel die Schlüssel anon und service_role (HS256) zu einem JWT-Geheimnis.
// Nur lokal und in Tests. Aufruf: node keys.mjs <geheimnis>
import { createHmac } from "node:crypto";

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");

export function sign(payload, secret) {
  const head = b64({ alg: "HS256", typ: "JWT" });
  const body = b64(payload);
  const sig = createHmac("sha256", secret).update(`${head}.${body}`).digest("base64url");
  return `${head}.${body}.${sig}`;
}

const secret = process.argv[2];
if (secret) {
  const exp = Math.floor(Date.now() / 1000) + 10 * 365 * 24 * 3600;
  console.log(`ANON_KEY=${sign({ iss: "supabase-local", role: "anon", exp }, secret)}`);
  console.log(`SERVICE_ROLE_KEY=${sign({ iss: "supabase-local", role: "service_role", exp }, secret)}`);
}
