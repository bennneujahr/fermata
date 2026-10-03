// Tests für Web-Push: RFC-8291-Beispiel, Hin- und Rückweg, Gegenprobe mit npm:web-push,
// VAPID-JWT, Versand an einen nachgebauten Push-Dienst (201, 410, 500, nicht erreichbar).
import { assert, assertEquals, assertMatch, assertRejects } from "@std/assert";
import {
  b64uDecode,
  b64uEncode,
  decryptPushPayload,
  encryptPushPayload,
  generateVapidKeys,
  importEcdhKeyPair,
  importVapid,
  vapidAuthorization,
  vapidJwt,
  WebPushSender,
} from "./mod.ts";

const td = new TextDecoder();
// Referenz-Bibliothek nur für die Gegenprobe in Tests (nicht im Versand verwendet).
const WEB_PUSH = "npm:web-push@3.6.7";
const te = new TextEncoder();

// RFC 8291, Anhang A (https://www.rfc-editor.org/rfc/rfc8291#appendix-A)
const RFC = {
  plaintext: "V2hlbiBJIGdyb3cgdXAsIEkgd2FudCB0byBiZSBhIHdhdGVybWVsb24",
  asPublic: "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8",
  asPrivate: "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw",
  uaPublic: "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
  uaPrivate: "q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94",
  salt: "DGv6ra1nlYgDCS1FRnbzlw",
  authSecret: "BTBZMqHH6r4Tts7J_aSIgg",
  body:
    "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN",
};

/** Schlüssel wie im Browser: ECDH P-256, öffentlicher Teil roh (65 Byte), auth 16 Byte. */
async function browserSubscription() {
  const pair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
    "deriveBits",
  ]) as CryptoKeyPair;
  const publicKey = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  const auth = crypto.getRandomValues(new Uint8Array(16));
  return { publicKey, privateKey: pair.privateKey, auth, p256dh: b64uEncode(publicKey), authB64: b64uEncode(auth) };
}

Deno.test("RFC 8291 Anhang A: Verschlüsselung ergibt genau das Beispiel", async () => {
  const sender = await importEcdhKeyPair(b64uDecode(RFC.asPrivate), b64uDecode(RFC.asPublic));
  const body = await encryptPushPayload(
    b64uDecode(RFC.uaPublic),
    b64uDecode(RFC.authSecret),
    b64uDecode(RFC.plaintext),
    {
      salt: b64uDecode(RFC.salt),
      senderKeys: sender,
    },
  );
  assertEquals(b64uEncode(body), RFC.body);
});

Deno.test("RFC 8291 Anhang A: Entschlüsselung ergibt den Klartext", async () => {
  const ua = await importEcdhKeyPair(b64uDecode(RFC.uaPrivate), b64uDecode(RFC.uaPublic));
  const plain = await decryptPushPayload(b64uDecode(RFC.body), {
    publicKey: b64uDecode(RFC.uaPublic),
    privateKey: ua.privateKey,
  }, b64uDecode(RFC.authSecret));
  assertEquals(td.decode(plain), "When I grow up, I want to be a watermelon");
});

Deno.test("Hin- und Rückweg mit zufälligen Schlüsseln, auch mit Füllbytes", async () => {
  const sub = await browserSubscription();
  const message = JSON.stringify({ title: "Fermata", body: "Ihr Abend steht.", url: "/abende/1" });
  for (const padding of [0, 37]) {
    const body = await encryptPushPayload(sub.publicKey, sub.auth, te.encode(message), { padding });
    assertEquals(body.length, 16 + 4 + 1 + 65 + te.encode(message).length + 1 + padding + 16);
    const plain = await decryptPushPayload(body, sub, sub.auth);
    assertEquals(td.decode(plain), message);
  }
});

Deno.test("Falscher auth-Schlüssel: Entschlüsselung schlägt fehl", async () => {
  const sub = await browserSubscription();
  const body = await encryptPushPayload(sub.publicKey, sub.auth, te.encode("x"));
  await assertRejects(() => decryptPushPayload(body, sub, crypto.getRandomValues(new Uint8Array(16))));
});

Deno.test("Ungültige Abo-Schlüssel werden abgelehnt", async () => {
  await assertRejects(() => encryptPushPayload(new Uint8Array(33), new Uint8Array(16), te.encode("x")));
  const sub = await browserSubscription();
  await assertRejects(() => encryptPushPayload(sub.publicKey, new Uint8Array(8), te.encode("x")));
  await assertRejects(() => encryptPushPayload(sub.publicKey, sub.auth, new Uint8Array(5000)));
});

Deno.test("Gegenprobe: npm:web-push verschlüsselt, wir entschlüsseln", async () => {
  const helper = (await import(`${WEB_PUSH}/src/encryption-helper.js`)).default;
  const sub = await browserSubscription();
  const message = "Gegenprobe mit der Referenz-Bibliothek";
  const res = helper.encrypt(sub.p256dh, sub.authB64, message, "aes128gcm");
  const plain = await decryptPushPayload(new Uint8Array(res.cipherText), sub, sub.auth);
  assertEquals(td.decode(plain), message);
});

Deno.test("VAPID: JWT-Aufbau, Laufzeit und gültige ES256-Signatur", async () => {
  const keys = await generateVapidKeys();
  assertEquals(b64uDecode(keys.publicKey).length, 65);
  assertEquals(b64uDecode(keys.privateKey).length, 32);
  const vapid = await importVapid(keys.publicKey, keys.privateKey, "mailto:hallo@fermata.example");
  const now = 1_800_000_000;
  const auth = await vapidAuthorization(vapid, "https://fcm.googleapis.com/fcm/send/abc", now);
  const m = /^vapid t=([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+), k=([A-Za-z0-9_-]+)$/.exec(auth);
  assert(m, `Format: ${auth}`);
  const [, h, c, s, k] = m;
  assertEquals(JSON.parse(td.decode(b64uDecode(h!))), { typ: "JWT", alg: "ES256" });
  const claims = JSON.parse(td.decode(b64uDecode(c!)));
  assertEquals(claims.aud, "https://fcm.googleapis.com");
  assertEquals(claims.sub, "mailto:hallo@fermata.example");
  assertEquals(claims.exp, now + 12 * 3600);
  assert(claims.exp - now <= 24 * 3600, "höchstens 24 Stunden (RFC 8292)");
  assertEquals(k, keys.publicKey);
  const sig = b64uDecode(s!);
  assertEquals(sig.length, 64, "r||s mit je 32 Byte");
  const pub = await crypto.subtle.importKey(
    "raw",
    b64uDecode(k!) as BufferSource,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"],
  );
  assert(
    await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pub, sig as BufferSource, te.encode(`${h}.${c}`)),
  );
});

Deno.test("VAPID: Schlüssel aus npm:web-push sind kompatibel", async () => {
  const webpush = (await import(`${WEB_PUSH}`)).default;
  const keys = webpush.generateVAPIDKeys();
  const vapid = await importVapid(keys.publicKey, keys.privateKey, "https://fermata.example");
  const jwt = await vapidJwt(vapid, "https://updates.push.services.mozilla.com", 1_800_000_000);
  assertEquals(jwt.split(".").length, 3);
});

Deno.test("VAPID: falsche Schlüssel und Absender werden abgelehnt", async () => {
  const keys = await generateVapidKeys();
  await assertRejects(() => importVapid(keys.publicKey, keys.privateKey, "hallo@fermata.example"));
  await assertRejects(() => importVapid(keys.privateKey, keys.privateKey, "mailto:a@b.example"));
});

// ---------------------------------------------------------------------------
// Nachgebauter Push-Dienst
// ---------------------------------------------------------------------------
interface Received {
  path: string;
  headers: Headers;
  message: unknown;
}

export function fakePushService(sub: { publicKey: Uint8Array; privateKey: CryptoKey; auth: Uint8Array }) {
  const received: Received[] = [];
  const server = Deno.serve({ port: 0, hostname: "127.0.0.1", onListen: () => {} }, async (req) => {
    const url = new URL(req.url);
    const body = new Uint8Array(await req.arrayBuffer());
    if (url.pathname.startsWith("/gone")) return new Response(null, { status: 410 });
    if (url.pathname.startsWith("/broken")) return new Response("kaputt", { status: 500 });
    const plain = await decryptPushPayload(body, sub, sub.auth);
    received.push({ path: url.pathname, headers: req.headers, message: JSON.parse(td.decode(plain)) });
    return new Response(null, { status: 201 });
  });
  const base = `http://127.0.0.1:${server.addr.port}`;
  return { received, base, close: () => server.shutdown() };
}

Deno.test("Versand an den Push-Dienst: 201, 410, 500, nicht erreichbar", async () => {
  const sub = await browserSubscription();
  const svc = await fakePushService(sub);
  try {
    const keys = await generateVapidKeys();
    const sender = new WebPushSender(
      await importVapid(keys.publicKey, keys.privateKey, "mailto:hallo@fermata.example"),
    );
    const msg = { title: "Fermata", body: "Ihr Abend steht.", url: "/abende/1", tag: "abend-1" };
    const target = { endpoint: `${svc.base}/push/abc`, p256dh: sub.p256dh, auth: sub.authB64 };

    const ok = await sender.send(target, msg, { ttl: 3600, urgency: "high", topic: "abend1" });
    assertEquals(ok, { status: 201, outcome: "sent" });
    assertEquals(svc.received.length, 1);
    assertEquals(svc.received[0]!.message, msg);
    const h = svc.received[0]!.headers;
    assertEquals(h.get("content-encoding"), "aes128gcm");
    assertEquals(h.get("ttl"), "3600");
    assertEquals(h.get("urgency"), "high");
    assertEquals(h.get("topic"), "abend1");
    assertMatch(h.get("authorization") ?? "", /^vapid t=[^,]+, k=[A-Za-z0-9_-]{87}$/);

    const gone = await sender.send({ ...target, endpoint: `${svc.base}/gone/1` }, msg, { ttl: 60 });
    assertEquals(gone.outcome, "gone");
    assertEquals(gone.status, 410);

    const broken = await sender.send({ ...target, endpoint: `${svc.base}/broken/1` }, msg, { ttl: 60 });
    assertEquals(broken.outcome, "failed");
    assertEquals(broken.status, 500);

    const unreachable = await sender.send({ ...target, endpoint: "http://127.0.0.1:9/push" }, msg, { ttl: 60 });
    assertEquals(unreachable.outcome, "failed");
    assertEquals(unreachable.status, 0);

    const badKeys = await sender.send({ ...target, p256dh: "kaputt" }, msg, { ttl: 60 });
    assertEquals(badKeys.outcome, "gone");
  } finally {
    await svc.close();
  }
});
