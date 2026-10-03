// Versand fälliger Nachrichten aus ops.notification_queue (Edge Function notify-dispatch).
// Regeln (Ruhezeit, Ersatzweg E-Mail, Frist → immer E-Mail, Wiederholung) entscheidet die Datenbank in
// ops.notify_claim / ops.notify_complete; hier wird nur gerendert, verschickt und das Ergebnis gemeldet.
import type { MailMessage } from "../mail/types.ts";
import { renderNotification } from "../mail/templates/notify.ts";
import type { PushSender } from "../push/send.ts";
import type { ChannelResult, ClaimedNotification } from "./types.ts";
import { signVenueToken } from "./venue-token.ts";

export interface NotifyStore {
  claim(limit: number): Promise<ClaimedNotification[]>;
  complete(id: number, email: ChannelResult | null, push: ChannelResult | null, error: string | null): Promise<string>;
  /** 2xx: Erfolg; 404/410: Abo löschen; sonst Fehler zählen */
  pushResult(endpoint: string, status: number): Promise<void>;
  logPush(userId: string | null, template: string, status: "sent" | "failed", host: string): Promise<void>;
  pushTtlSeconds(): Promise<number>;
}

export interface DispatchDeps {
  store: NotifyStore;
  sendMail: (msg: MailMessage, userId?: string) => Promise<{ id: string }>;
  push: PushSender | null;
  appUrl: string;
  /** Basis für Links auf Edge Functions, z. B. https://<projekt>.supabase.co/functions/v1 */
  functionsUrl?: string | null;
  venueLinkSecret?: string | null;
}

export interface DispatchStats {
  claimed: number;
  email_sent: number;
  email_failed: number;
  push_sent: number;
  push_failed: number;
  push_removed: number;
  skipped: number;
}

function emptyStats(): DispatchStats {
  return { claimed: 0, email_sent: 0, email_failed: 0, push_sent: 0, push_failed: 0, push_removed: 0, skipped: 0 };
}

async function venueConfirmUrl(deps: DispatchDeps, n: ClaimedNotification): Promise<string | null> {
  const r = n.context.reservation;
  if (n.template !== "venue.reservation" || !r || n.context.recipient.kind !== "venue") return null;
  if (!deps.venueLinkSecret || !deps.functionsUrl) return null;
  const token = await signVenueToken(deps.venueLinkSecret, r.id, new Date(r.token_expires_at));
  return `${deps.functionsUrl.replace(/\/$/, "")}/venue-confirm?t=${encodeURIComponent(token)}`;
}

/** Eine Nachricht verschicken und das Ergebnis melden. Fehler bleiben in der Zeile (last_error), ohne Adressen. */
export async function dispatchOne(deps: DispatchDeps, n: ClaimedNotification, stats: DispatchStats, ttl: number): Promise<void> {
  const rendered = renderNotification(n.context, { appUrl: deps.appUrl, venueConfirmUrl: await venueConfirmUrl(deps, n) });
  const errors: string[] = [];
  let email: ChannelResult | null = null;
  let push: ChannelResult | null = null;

  if (n.do_email) {
    if (!rendered.mail) {
      email = "skipped";
      stats.skipped++;
    } else {
      try {
        await deps.sendMail({ ...rendered.mail, to: n.context.recipient.email }, n.user_id ?? undefined);
        email = "sent";
        stats.email_sent++;
      } catch (err) {
        email = "failed";
        stats.email_failed++;
        errors.push(`E-Mail: ${(err as Error).message}`);
      }
    }
  }

  if (n.do_push) {
    if (!deps.push || !rendered.push || n.push_targets.length === 0) {
      push = "skipped";
      stats.skipped++;
    } else {
      let sent = 0;
      let failed = 0;
      for (const target of n.push_targets) {
        const r = await deps.push.send(target, rendered.push, {
          ttl,
          urgency: n.is_safety ? "high" : "normal",
          topic: rendered.push.tag?.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32),
        });
        await deps.store.pushResult(target.endpoint, r.status);
        const host = (() => {
          try {
            return new URL(target.endpoint).host;
          } catch {
            return "unbekannt";
          }
        })();
        if (r.outcome === "sent") {
          sent++;
          stats.push_sent++;
          await deps.store.logPush(n.user_id, n.template, "sent", host);
        } else if (r.outcome === "gone") {
          stats.push_removed++;
        } else {
          failed++;
          stats.push_failed++;
          errors.push(`Push ${host}: ${r.error ?? r.status}`);
          await deps.store.logPush(n.user_id, n.template, "failed", host);
        }
      }
      push = sent > 0 ? "sent" : failed > 0 ? "failed" : "gone";
    }
  }

  await deps.store.complete(n.id, email, push, errors.length ? errors.join("; ").slice(0, 500) : null);
}

/** Holt in Runden fällige Nachrichten ab, bis keine mehr da sind oder die Zeit um ist. */
export async function dispatchDue(deps: DispatchDeps, opts: { batchSize?: number; maxBatches?: number; budgetMs?: number } = {}):
  Promise<DispatchStats> {
  const stats = emptyStats();
  const batchSize = opts.batchSize ?? 25;
  const maxBatches = opts.maxBatches ?? 20;
  const until = Date.now() + (opts.budgetMs ?? 50_000);
  const ttl = await deps.store.pushTtlSeconds();
  for (let i = 0; i < maxBatches && Date.now() < until; i++) {
    const batch = await deps.store.claim(batchSize);
    stats.claimed += batch.length;
    for (const n of batch) {
      try {
        await dispatchOne(deps, n, stats, ttl);
      } catch (err) {
        // Unerwarteter Fehler (z. B. Vorlage): als Fehlversuch melden, damit die Zeile nicht hängen bleibt.
        console.error(JSON.stringify({ level: "error", msg: "notify-dispatch", id: n.id, err: String(err) }));
        await deps.store.complete(n.id, n.do_email ? "failed" : null, n.do_push ? "failed" : null, String(err).slice(0, 500));
      }
    }
    if (batch.length < batchSize) break;
  }
  return stats;
}
