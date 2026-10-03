// Kündigungsknopf (§ 312k BGB). ENTWURF der Abläufe für den Anwalt; Beschreibung in docs/bereiche/mitgliedschaft.md.
//
// Angemeldet (Authorization: Bearer <JWT>):
//   POST {action:"preview"}                                     → Schritt 1: Vertrag, Name, E-Mail, Wirksamkeit
//   POST {action:"confirm", kind, reason?, name?, contactEmail?} → Schritt 2 „Jetzt kündigen“: speichern, Stripe, Mail
// Ohne Anmeldung:
//   POST {action:"request", email, contractNumber, kind, reason?, name?} → immer gleiche Antwort; bei Treffer Mail mit Link
//   GET  ?t=<Schlüssel>                                          → Seite mit Knopf „Kündigung bestätigen“ (POST-Formular)
//   POST {action:"confirm_link", t} (JSON oder Formular)          → Ausführung, Bestätigung per Mail
import { db } from "../_shared/db.ts";
import { handler, HttpError, json, readJson } from "../_shared/http.ts";
import { formatDateTime, formatReceipt } from "../_shared/mail/templates/billing-format.ts";
import {
  consumeContractLink,
  executeCancellation,
  GENERIC_REQUEST_ANSWER,
  parseCancelInput,
  requestContractLink,
} from "../_shared/stripe/contract.ts";
import { optionalMember, requireMember } from "../_shared/stripe/member-auth.ts";
import { escapeHtml, htmlHeaders, LABELS, page, PAGE_STYLE, rpc } from "../_shared/stripe/support.ts";

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
  const url = new URL(req.url);

  if (req.method === "GET") {
    const token = url.searchParams.get("t") ?? "";
    const [row] = await sql`select billing.peek_contract_request(${token}) as p`;
    const p = row?.p as Obj | null;
    if (!p || !p.valid || p.kind !== "cancel") {
      return await html(page("Link nicht gültig", "<h1>Dieser Link ist nicht mehr gültig</h1><p>Bitte füllen Sie das Kündigungsformular erneut aus.</p>"), 404);
    }
    return await html(page(
      "Kündigung bestätigen",
      `<h1>Kündigung bestätigen</h1><div class="box"><p>Vertrag: <strong>${escapeHtml(p.contract_number)}</strong></p>` +
        `<p>Eingang Ihrer Erklärung: ${escapeHtml(formatReceipt(p.requested_at))}</p></div>` +
        `<form method="post"><input type="hidden" name="action" value="confirm_link"><input type="hidden" name="t" value="${escapeHtml(token)}">` +
        `<button type="submit">Kündigung bestätigen</button></form>` +
        `<p><small>Wenn Sie nicht kündigen möchten, schließen Sie diese Seite einfach.</small></p>`,
    ));
  }

  const isForm = (req.headers.get("content-type") ?? "").includes("application/x-www-form-urlencoded");
  const body = await readBody(req);
  const action = String(body.action ?? "");

  if (action === "request") {
    await requestContractLink(req, sql, "cancel", body);
    return json(req, { ok: true, message: GENERIC_REQUEST_ANSWER }, 202);
  }

  if (action === "confirm_link") {
    const token = String(body.t ?? body.token ?? "");
    try {
      const link = await consumeContractLink(sql, token, "cancel");
      const result = await executeCancellation(sql, link.userId, { ...(link.details as any), channel: "ohne_anmeldung" });
      await sql`select billing.link_contract_request(${link.requestId}::uuid, ${result.contractActionId}::uuid)`;
      if (isForm) {
        return await html(page(
          "Kündigung eingegangen",
          `<h1>Ihre Kündigung ist eingegangen</h1><div class="box"><p>Vertrag: <strong>${escapeHtml(result.contractNumber)}</strong></p>` +
            `<p>Eingang: ${escapeHtml(formatReceipt(result.receivedAt))}</p>` +
            `<p>Wirksam zum: ${escapeHtml(formatDateTime(result.effectiveAt))}</p></div>` +
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

  const member = action === "preview" || action === "confirm" ? await requireMember(req) : await optionalMember(req);
  if (!member) throw new HttpError(400, "invalid_action", "Unbekannte Aktion.");

  if (action === "preview") {
    const [row] = await rpc(sql`select billing.cancellation_preview(${member.id}::uuid) as p`);
    return json(req, { ...(row!.p as Obj), entryLabel: LABELS.cancelEntry, buttonLabel: LABELS.cancelConfirm });
  }

  // action === "confirm" (Schritt 2: „Jetzt kündigen“)
  const details = parseCancelInput(body, "angemeldet");
  const result = await executeCancellation(sql, member.id, details);
  return json(req, result);
});
