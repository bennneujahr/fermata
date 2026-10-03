// Formular: Fehler werden angesagt (role="alert" = aria-live), sind am Feld verknüpft, Tastatur, ohne JavaScript.
import { expect, test } from "../fixtures";

test("Leeres Absenden: Fehlerliste wird angesagt, Felder sind markiert", async ({ page }) => {
  await page.goto("/#warteliste");
  const form = page.locator("#waitlist-form");
  await expect(form.getByRole("button", { name: "Auf die Warteliste setzen" })).toBeEnabled();
  await form.getByRole("button", { name: "Auf die Warteliste setzen" }).click();

  const alert = form.getByRole("alert");
  await expect(alert).toBeVisible();
  await expect(alert).toContainText("Bitte prüfen Sie 5 Angaben:");
  await expect(alert.getByRole("link")).toHaveCount(5);

  const firstName = form.getByLabel("Vorname");
  await expect(firstName).toBeFocused();
  await expect(firstName).toHaveAttribute("aria-invalid", "true");
  await expect(firstName).toHaveAccessibleDescription(/Bitte geben Sie Ihren Vornamen an\./);
  await expect(form.getByLabel("Postleitzahl")).toHaveAccessibleDescription(/Bitte geben Sie Ihre Postleitzahl an\./);
  await expect(form.getByRole("checkbox")).toHaveAccessibleDescription(/Bitte stimmen Sie den E-Mails zur Warteliste zu/);
});

test("Ungültige Angaben und Korrektur", async ({ page }) => {
  await page.goto("/#warteliste");
  const form = page.locator("#waitlist-form");
  await expect(form.getByRole("button", { name: "Auf die Warteliste setzen" })).toBeEnabled();
  await form.getByLabel("Vorname").fill("Anna");
  await form.getByLabel("E-Mail-Adresse").fill("anna@");
  await form.getByLabel("Region", { exact: true }).selectOption("rostock");
  await form.getByLabel("Postleitzahl").fill("1805");
  await form.getByRole("checkbox").check();
  await form.getByRole("button", { name: "Auf die Warteliste setzen" }).click();
  await expect(form.getByRole("alert")).toContainText("Bitte prüfen Sie 2 Angaben:");
  await expect(form.getByLabel("E-Mail-Adresse")).toBeFocused();
  await expect(form.getByLabel("E-Mail-Adresse")).toHaveAccessibleDescription(/sieht unvollständig aus/);
  await expect(form.getByLabel("Postleitzahl")).toHaveAccessibleDescription(/fünf Ziffern/);

  await form.getByLabel("E-Mail-Adresse").fill("anna@example.org");
  await expect(form.getByLabel("E-Mail-Adresse")).not.toHaveAttribute("aria-invalid");
  await expect(form.getByRole("alert")).toContainText("Bitte prüfen Sie eine Angabe:");
});

test("Zu schnelles Absenden wird erklärt (Mindestzeit)", async ({ page }) => {
  await page.goto("/#warteliste");
  const form = page.locator("#waitlist-form");
  await expect(form.getByRole("button", { name: "Auf die Warteliste setzen" })).toBeEnabled();
  // Ohne Wartezeit absenden: Die Edge Function lehnt ab, die Seite erklärt es.
  await page.evaluate(() => {
    const f = document.getElementById("waitlist-form") as HTMLFormElement;
    (f.elements.namedItem("first_name") as HTMLInputElement).value = "Anna";
    (f.elements.namedItem("email") as HTMLInputElement).value = "schnell@example.org";
    (f.elements.namedItem("region") as HTMLSelectElement).value = "schwerin";
    (f.elements.namedItem("postal_code") as HTMLInputElement).value = "19053";
    (f.elements.namedItem("consent") as HTMLInputElement).checked = true;
    f.requestSubmit();
  });
  await expect(form.getByRole("alert")).toContainText("Das ging sehr schnell.");
});

test("Tastatur: alles erreichbar, Fokus immer sichtbar", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("[data-submit]")).toBeEnabled();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Zum Inhalt springen" })).toBeFocused();
  await expect(page.getByRole("link", { name: "Zum Inhalt springen" })).toBeInViewport();

  const seen = new Set<string>();
  for (let i = 0; i < 120; i++) {
    const info = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const cs = getComputedStyle(el);
      return {
        id: el.hasAttribute("data-submit") ? "submit" : el.id || `${el.tagName}:${(el.textContent ?? "").trim().slice(0, 30)}`,
        tag: el.tagName,
        outline: cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) >= 2,
      };
    });
    if (info) {
      expect(info.outline, `Fokus sichtbar bei ${info.tag} ${info.id}`).toBe(true);
      seen.add(info.id);
    }
    if (seen.has("submit")) break;
    await page.keyboard.press("Tab");
  }
  for (const id of ["first_name", "email", "region", "postal_code", "consent", "submit"]) {
    expect(seen.has(id), `per Tab erreichbar: ${id}`).toBe(true);
  }
  expect(seen.has("website"), "Honigtopf ist nicht erreichbar").toBe(false);
});

test("Häufige Fragen lassen sich per Tastatur öffnen", async ({ page }) => {
  await page.goto("/#fragen");
  const first = page.locator("summary").first();
  await first.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("details").first()).toHaveAttribute("open", "");
});

test("Ohne JavaScript: klarer Hinweis, Knopf gesperrt", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("/");
  const note = page.locator("#waitlist-form .noscript-note");
  await expect(note).toBeVisible();
  await expect(note).toContainText("Für das Formular braucht diese Seite JavaScript.");
  await expect(page.locator("[data-submit]")).toBeDisabled();
  await context.close();
});

test("Weniger Bewegung: Atem nur sanftes Blenden, kein weiches Scrollen", async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto("/");
  const ring = page.locator("fermata-atem .atem-ring").first();
  await expect(ring).toHaveCSS("animation-name", "atem-fade");
  await expect(page.locator("html")).toHaveCSS("scroll-behavior", "auto");
  await context.close();
});
