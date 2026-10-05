import { resetWaitlist, setSetting, sql } from "./db";

export default async function globalTeardown(): Promise<void> {
  await resetWaitlist();
  await setSetting("waitlist.min_fill_seconds", 3);
  await setSetting("waitlist.rate_limit_per_hour", 5);
  await sql.end();
}
