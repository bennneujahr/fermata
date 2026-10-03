// Datenbank-Anbindung des Versands (ops.notify_claim, ops.notify_complete, ops.push_subscription_result).
import type { Sql } from "../db.ts";
import type { PushTarget } from "../push/send.ts";
import type { NotifyStore } from "./dispatch.ts";
import type { ChannelResult, ClaimedNotification, NotificationContext } from "./types.ts";

type Row = {
  id: string | number;
  template: string;
  do_email: boolean;
  do_push: boolean;
  is_safety: boolean;
  user_id: string | null;
  context: NotificationContext;
  push_targets: PushTarget[];
};

export class PgNotifyStore implements NotifyStore {
  constructor(private sql: Sql, private lockSeconds = 120) {}

  async claim(limit: number): Promise<ClaimedNotification[]> {
    const rows = await this.sql<Row[]>`select * from ops.notify_claim(${limit}, ${this.lockSeconds})`;
    return rows.map((r) => ({
      id: Number(r.id),
      template: r.template,
      do_email: r.do_email,
      do_push: r.do_push,
      is_safety: r.is_safety,
      user_id: r.user_id,
      context: r.context,
      push_targets: r.push_targets ?? [],
    }));
  }

  async complete(
    id: number,
    email: ChannelResult | null,
    push: ChannelResult | null,
    error: string | null,
  ): Promise<string> {
    const [row] = await this.sql`select ops.notify_complete(${id}, ${email}, ${push}, ${error}) as r`;
    return row!.r as string;
  }

  async pushResult(endpoint: string, status: number): Promise<void> {
    await this.sql`select ops.push_subscription_result(${endpoint}, ${status})`;
  }

  async logPush(userId: string | null, template: string, status: "sent" | "failed", host: string): Promise<void> {
    await this.sql`select ops.log_notification(${userId}, 'push', ${template}, null, 'webpush', ${host}, ${status})`;
  }

  async pushTtlSeconds(): Promise<number> {
    const [row] = await this.sql`select ops.setting_int('notify.push_ttl_seconds') as v`;
    return Number(row!.v);
  }
}
