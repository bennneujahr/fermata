// Gemeinsame Prüfungen: Barrierefreiheit (axe, WCAG 2.1 AA) und strenge CSP (keine Verstöße in der Konsole).
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

export async function expectAccessible(page: Page, label: string): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const summary = results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(" | ")})`);
  expect(summary, `axe auf ${label}`).toEqual([]);
}

/** Sammelt CSP-Verstöße und Seitenfehler; am Ende expectClean() aufrufen. */
export function watchConsole(page: Page) {
  const problems: string[] = [];
  page.on("console", (msg) => {
    const t = msg.text();
    if (/Content Security Policy|Refused to (load|execute|apply)/i.test(t)) problems.push(t);
  });
  page.on("pageerror", (err) => problems.push(`pageerror: ${err.message}`));
  return {
    problems,
    expectClean: () => expect(problems, "CSP-Verstöße oder Skriptfehler").toEqual([]),
  };
}
