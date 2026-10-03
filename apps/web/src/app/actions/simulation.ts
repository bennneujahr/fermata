"use server";
// Nur lokal und in Tests (DIDIT_MODE=fake): schickt einen signierten Webhook wie Didit an verification-webhook.
import { createHmac } from "node:crypto";
import { redirect } from "next/navigation";
import { notFound } from "next/navigation";
import { diditFakeEnabled, diditFakeWebhookSecret, functionsUrl } from "@/lib/env";
import { getFacts } from "@/lib/data";

export async function simulateVerificationAction(fd: FormData): Promise<void> {
  if (!diditFakeEnabled()) notFound();
  const session = String(fd.get("session") ?? "");
  const scenario = String(fd.get("scenario") ?? "");
  if (!/^fake_[0-9a-f-]{36}$/.test(session)) notFound();
  const facts = await getFacts();
  const first = facts?.first_name ?? "Test";
  const last = facts?.last_name ?? "Person";
  const birth = facts?.birth_date ?? "1990-01-01";
  const minorBirth = (() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 17);
    return d.toISOString().slice(0, 10);
  })();
  const status = scenario === "decline" ? "Declined" : scenario === "review" ? "In Review" : "Approved";
  const idv = {
    first_name: scenario === "name" ? "Andere" : first,
    last_name: scenario === "name" ? "Person" : last,
    date_of_birth: scenario === "minor" ? minorBirth : birth,
    document_number: `FAKE${session.slice(5, 13).toUpperCase()}`,
  };
  const body = JSON.stringify({
    session_id: session,
    status,
    webhook_type: "status.updated",
    timestamp: Math.floor(Date.now() / 1000),
    decision: { session_id: session, status, id_verification: idv },
  });
  const ts = String(Math.floor(Date.now() / 1000));
  const signature = createHmac("sha256", diditFakeWebhookSecret()).update(body).digest("hex");
  await fetch(`${functionsUrl()}/verification-webhook`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-signature": signature, "x-timestamp": ts },
    body,
    cache: "no-store",
  });
  redirect("/onboarding/ausweis/zurueck");
}
