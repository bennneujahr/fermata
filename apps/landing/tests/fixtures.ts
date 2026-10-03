// Gemeinsame Test-Hilfen: Jede Seite meldet Anfragen an fremde Server, CSP-Verstöße und Skriptfehler.
import { test as base, expect, type Page } from "@playwright/test";
import { confirmLinkFrom, latestMail } from "./db";

export interface Guard {
  external: string[];
  problems: string[];
}

export const test = base.extend<{ guard: Guard }>({
  guard: [
    async ({ page }, use) => {
      const guard: Guard = { external: [], problems: [] };
      page.on("request", (req) => {
        const url = new URL(req.url());
        if (!["localhost", "127.0.0.1"].includes(url.hostname) && url.protocol !== "data:") guard.external.push(req.url());
      });
      page.on("console", (msg) => {
        const text = msg.text();
        if (/Content Security Policy|Refused to/i.test(text)) guard.problems.push(`CSP: ${text}`);
      });
      page.on("pageerror", (err) => guard.problems.push(`Skriptfehler: ${err.message}`));
      await use(guard);
      expect(guard.external, "Keine Anfrage verlässt localhost").toEqual([]);
      expect(guard.problems, "Keine CSP-Verstöße oder Skriptfehler").toEqual([]);
    },
    { auto: true },
  ],
});
export { expect };

export function uniqueEmail(name: string): string {
  return `${name}.${Date.now()}.${Math.floor(Math.random() * 1e6)}@example.org`;
}

/** Füllt das Wartelisten-Formular aus und sendet es ab (wartet die Mindestzeit ab). */
export async function signUpViaForm(
  page: Page,
  data: { firstName: string; email: string; region?: string; postalCode?: string },
): Promise<void> {
  const form = page.locator("#waitlist-form");
  await expect(form.getByRole("button", { name: "Auf die Warteliste setzen" })).toBeEnabled();
  await form.getByLabel("Vorname").fill(data.firstName);
  await form.getByLabel("E-Mail-Adresse").fill(data.email);
  await form.getByLabel("Region", { exact: true }).selectOption(data.region ?? "schwerin");
  await form.getByLabel("Postleitzahl").fill(data.postalCode ?? "19053");
  await form.getByRole("checkbox").check();
  await page.waitForTimeout(1200); // Mindestzeit (in den Tests 1 s)
  await form.getByRole("button", { name: "Auf die Warteliste setzen" }).click();
  await expect(page).toHaveURL(/\/bestaetigen$/);
}

/** Öffnet den Bestätigungslink aus der Mail und landet auf /willkommen#t=… */
export async function confirmFromMail(page: Page, email: string): Promise<string> {
  const mail = await latestMail(email, "waitlist.confirm");
  await page.goto(confirmLinkFrom(mail.text));
  await expect(page).toHaveURL(/\/willkommen#t=[A-Za-z0-9_-]{43}$/);
  await expect(page.locator('[data-part="ready"]')).toBeVisible();
  return page.url();
}
