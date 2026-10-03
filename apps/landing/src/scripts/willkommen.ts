// Persönliche Seite: liest den Statuslink aus dem Fragment (#t=…) und fragt waitlist-status per POST.
// Daten werden nur mit textContent eingesetzt (kein HTML aus Antworten).
import { callFunction, fragmentParam } from "./api";

interface Status {
  first_name: string;
  region_group: string;
  place: number;
  is_founding_member: boolean;
  bonus_steps: number;
  invites: { code: string; used: boolean }[];
}
interface Texts {
  greeting: string;
  regions: Record<string, string>;
  bonusNote: string;
  bonusNoteOne: string;
  invite: { copied: string; copyFailed: string };
}

const root = document.querySelector<HTMLElement>("[data-welcome]");
if (root) void init(root);

function part(root: HTMLElement, name: string): HTMLElement {
  return root.querySelector<HTMLElement>(`[data-part="${name}"]`)!;
}

function show(root: HTMLElement, state: "loading" | "missing" | "error" | "ready"): void {
  for (const s of ["loading", "missing", "error", "ready"]) part(root, s).hidden = s !== state;
}

async function init(root: HTMLElement): Promise<void> {
  const texts = JSON.parse(root.dataset.texts ?? "{}") as Texts;
  const token = fragmentParam("t");
  if (!token) return show(root, "missing");
  let res: Response;
  try {
    res = await callFunction("waitlist-status", { t: token });
  } catch {
    return show(root, "error");
  }
  if (res.status === 404) return show(root, "missing");
  if (!res.ok) return show(root, "error");
  const s = (await res.json()) as Status;

  part(root, "greeting").textContent = texts.greeting.replace("{name}", s.first_name);
  part(root, "place").textContent = String(s.place);
  part(root, "region").textContent = texts.regions[s.region_group] ?? texts.regions.anderswo ?? "";
  part(root, "founding").hidden = !s.is_founding_member;
  const bonus = part(root, "bonus");
  if (s.bonus_steps > 0) {
    bonus.textContent = s.bonus_steps === 1 ? texts.bonusNoteOne : texts.bonusNote.replace("{n}", String(s.bonus_steps));
    bonus.hidden = false;
  }

  const open = s.invites.find((i) => !i.used);
  const used = s.invites.some((i) => i.used);
  part(root, "invite-used").hidden = !used || !!open;
  part(root, "invite-none").hidden = !!open || used;
  part(root, "invite-open").hidden = !open;
  if (open) {
    const link = `${location.origin}/?e=${open.code}`;
    const input = part(root, "invite-link") as HTMLInputElement;
    input.value = link;
    const status = part(root, "copy-status");
    part(root, "copy").addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(link);
        status.textContent = texts.invite.copied;
      } catch {
        input.focus();
        input.select();
        status.textContent = texts.invite.copyFailed;
      }
    });
  }
  (part(root, "unsubscribe") as HTMLAnchorElement).href = `/abmelden#t=${token}`;
  show(root, "ready");
}
