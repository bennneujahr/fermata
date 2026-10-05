// Abmeldung mit Rückfrage: erst der Knopf löscht den Eintrag (Link-Vorschauen in Mailprogrammen lösen nichts aus).
import { callFunction, fragmentParam, pageUrl } from "./api";

const root = document.querySelector<HTMLElement>("[data-unsubscribe]");
if (root) init(root);

function init(root: HTMLElement): void {
  const token = fragmentParam("u") ?? fragmentParam("t");
  const button = root.querySelector<HTMLButtonElement>("[data-confirm]")!;
  const message = root.querySelector<HTMLElement>("[data-message]")!;
  const texts = JSON.parse(root.dataset.texts ?? "{}") as { missing: string; error: string; working: string; confirm: string };
  if (!token) {
    message.textContent = texts.missing;
    message.hidden = false;
    return;
  }
  button.disabled = false;
  button.addEventListener("click", async () => {
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    button.textContent = texts.working;
    try {
      const res = await callFunction("waitlist-unsubscribe", { t: token });
      if (res.ok) {
        location.replace(pageUrl("/abgemeldet"));
        return;
      }
    } catch {
      // unten
    }
    message.textContent = texts.error;
    message.hidden = false;
    button.disabled = false;
    button.removeAttribute("aria-busy");
    button.textContent = texts.confirm;
  });
}
