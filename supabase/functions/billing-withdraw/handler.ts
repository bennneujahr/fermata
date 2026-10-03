// Widerrufsbutton (§ 356a BGB, seit 19.06.2026). ENTWURF der Abläufe für den Anwalt.
// Schritt 1: Name, Vertrag und Kontaktweg angeben. Schritt 2: „Widerruf bestätigen“.
// Danach sofort Eingangsbestätigung per Mail mit Datum und Uhrzeit (dauerhafter Datenträger).
//
// Angemeldet (Authorization: Bearer <JWT>):
//   POST {action:"preview"}                                  → Frist, Vertrag, vorausgefüllte Angaben, Wertersatz und Erstattung
//   POST {action:"confirm", name, contractNumber, contactEmail?} → Widerruf speichern, Abo sofort beenden, erstatten, Mail
// Ohne Anmeldung (wie beim Kündigungsknopf):
//   POST {action:"request", email, contractNumber, name}       → immer gleiche Antwort; bei Treffer Mail mit Link
//   GET  ?t=<Schlüssel>                                        → Seite mit Knopf „Widerruf bestätigen“
//   POST {action:"confirm_link", t}                             → Ausführung
import { db } from "../_shared/db.ts";
import { handler, HttpError, json, readJson } from "../_shared/http.ts";
import { formatEur, formatReceipt } from "../_shared/mail/templates/billing-format.ts";
import {
  consumeContractLink,
  executeWithdrawal,
  GENERIC_REQUEST_ANSWER,
  parseWithdrawInput,
  requestContractLink,
} from "../_shared/stripe/contract.ts";
import { requireMember } from "../_shared/stripe/member-auth.ts";
import { escapeHtml, htmlHeaders, LABELS, page, PAGE_STYLE, rpc } from "../_shared/stripe/support.ts";
import { dispatchSafetyMails } from "../safety-dispatch/dispatch.ts";

type Obj = Record<string, any>;

async function readBody(req: Request): Promise<Obj> {
  if ((req.headers.get("content-type") ?? "").includes("application/x-www-form-urlencoded")) {
    return Object.fromEntries(new URLSearchParams(await req.text()));
  }
  return await readJson<Obj>(req);
}

async function html(body: string, status = 200): Promise<Response> {
  return new Response(body, { status, headers: await htmlHeaders(PAGE_STYLE) });
}

export default handler(["GET", "POST"], async (req) => {
  const sql = db();
  // Abgesagte Abende: das Gegenüber sofort neutral benachrichtigen.
  const notifyCounterparts = async () => {
    await dispatchSafetyMails(sql, 20);
  };

  if (req.method === "GET") {
    const token = new URL(req.url).searchParams.get("t") ?? "";
    const [row] = await sql`select billing.peek_contract_request(${token}) as p`;
    const p = row?.p as Obj | null;
    if (!p || !p.valid || p.kind !== "withdraw") {
      return await html(page("Link nicht gültig", "<h1>Dieser Link ist nicht mehr gültig</h1><p>Bitte füllen Sie das Widerrufsformular erneut aus.</p>"), 404);
    }
    return await html(page(
      "Widerruf bestätigen",
      `<h1>Widerruf bestätigen</h1><div class="box"><p>Vertrag: <strong>${escapeHtml(p.contract_number)}</strong></p>` +
        `<p>Eingang Ihrer Erklärung: ${escapeHtml(formatReceipt(p.requested_at))}</p></div>` +
        `<form method="post"><input type="hidden" name="action" value="confirm_link"><input type="hidden" name="t" value="${escapeHtml(token)}">` +
        `<button type="submit">${LABELS.withdrawConfirm}</button></form>` +
        `<p><small>Wenn Sie nicht widerrufen möchten, schließen Sie diese Seite einfach.</small></p>`,
    ));
  }

  const isForm = (req.headers.get("content-type") ?? "").includes("application/x-www-form-urlencoded");
  const body = await readBody(req);
  const action = String(body.action ?? "");

  if (action === "request") {
    await requestContractLink(req, sql, "withdraw", body);
    return json(req, { ok: true, message: GENERIC_REQUEST_ANSWER }, 202);
  }

  if (action === "confirm_link") {
    const token = String(body.t ?? body.token ?? "");
    try {
      const link = await consumeContractLink(sql, token, "withdraw");
      const result = await executeWithdrawal(sql, link.userId, { ...(link.details as any), channel: "ohne_anmeldung" }, notifyCounterparts);
      await sql`select billing.link_contract_request(${link.requestId}::uuid, ${result.contractActionId}::uuid)`;
      if (isForm) {
        return await html(page(
          "Widerruf eingegangen",
          `<h1>Ihr Widerruf ist eingegangen</h1><div class="box"><p>Vertrag: <strong>${escapeHtml(result.contractNumber)}</strong></p>` +
            `<p>Eingang: ${escapeHtml(formatReceipt(result.receivedAt))}</p>` +
            `<p>Erstattung: ${escapeHtml(formatEur(result.refundCents))}</p></div>` +
            `<p>Die Bestätigung haben wir Ihnen per Mail geschickt.</p>`,
        ));
      }
      return json(req, result);
    } catch (err) {
      if (isForm && err instanceof HttpError) {
        return await html(page("Nicht möglich", `<h1>Das hat nicht geklappt</h1><p>${escapeHtml(err.message)}</p>`), err.status);
      }
      throw err;
    }
  }

  if (action !== "preview" && action !== "confirm") throw new HttpError(400, "invalid_action", "Unbekannte Aktion.");
  const member = await requireMember(req);

  if (action === "preview") {
    const [row] = await rpc(sql`select billing.withdrawal_quote(${member.id}::uuid) as q`);
    const q = row!.q as Obj;
    return json(req, {
      possible: q.possible, reason: q.reason ?? null, until: q.until, contractNumber: q.contract_number,
      tierName: q.tier_name, name: q.name, email: q.email,
      paidCents: q.paid_cents, eveningsUsed: q.evenings_used, valuePerEveningCents: q.value_per_evening_cents,
      wertersatzCents: q.wertersatz_cents, refundCents: q.refund_cents,
      entryLabel: LABELS.withdrawEntry, buttonLabel: LABELS.withdrawConfirm, legalStatus: "ENTWURF",
    });
  }

  // action === "confirm" (Schritt 2: „Widerruf bestätigen“)
  const details = parseWithdrawInput(body, "angemeldet");
  const result = await executeWithdrawal(sql, member.id, details, notifyCounterparts);
  return json(req, result);
});
