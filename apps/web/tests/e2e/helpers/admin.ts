// Admin für E2E-Tests: anlegen, per Anmeldelink anmelden, Zwei-Faktor (TOTP) einrichten und die Sitzung (aal2) speichern.
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, type Browser, type BrowserContext } from "@playwright/test";
import { createAdmin, magicLinkPath, sql, uniqueEmail } from "./backend";
import { stack } from "./env";
import { totp } from "./totp";

export type StorageState = Awaited<ReturnType<BrowserContext["storageState"]>>;

export interface AdminSession {
  id: string;
  email: string;
  secret: string;
  state: StorageState;
}

/** Neuer Admin mit eingerichtetem zweiten Faktor; state ist eine aal2-Sitzung. */
export async function adminSession(browser: Browser, name = "Benn (Test)"): Promise<AdminSession> {
  const email = uniqueEmail("benn");
  const id = await createAdmin(email, name);
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(await magicLinkPath(email));
  await page.getByRole("button", { name: "Jetzt anmelden" }).click();
  await page.waitForURL(/\/admin\/mfa\/einrichten/);
  await page.getByRole("img", { name: "QR-Code für die Authenticator-App" }).waitFor();
  const secret = (await page.getByTestId("totp-secret").textContent())!.trim();
  await page.getByLabel("Code aus der App").fill(totp(secret));
  await page.getByRole("button", { name: "Bestätigen" }).click();
  await page.waitForURL(/\/admin$/);
  await expect(page.getByRole("heading", { level: 1, name: "Heute" })).toBeVisible();
  const state = await ctx.storageState();
  await ctx.close();
  return { id, email, secret, state };
}

/** Auswahl-Lauf mit synthetischen Profilen (services/matcher, nur Test-Umgebungen). Liefert die ID des Laufs in Prüfung. */
export async function simulateRun(profiles = 120, seed = 42): Promise<string> {
  const cwd = fileURLToPath(new URL("../../../../../services/matcher", import.meta.url));
  const out = execFileSync("uv", ["run", "--quiet", "fermata-matcher", "simulate", "--profiles", String(profiles), "--seed", String(seed), "--json", "--db-url", stack.SUPABASE_DB_URL!], {
    cwd,
    encoding: "utf8",
    timeout: 240_000,
    maxBuffer: 64 * 1024 * 1024,
  });
  const data = JSON.parse(out) as { runs: { run_id: string; status: string }[] };
  const run = data.runs[0]!;
  expect(run.status).toBe("review");
  return run.run_id;
}

/** Läufe in Prüfung aus früheren Tests abschließen, damit „Heute“ eindeutig bleibt. */
export async function closeOpenRuns(except?: string): Promise<void> {
  await sql`update app.match_runs set status = 'cancelled' where status = 'review' and id <> ${except ?? "00000000-0000-0000-0000-000000000000"}::uuid`;
}
