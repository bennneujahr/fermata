// Wartelisten-Formular: Prüfung im Browser (die verbindliche Prüfung machen Edge Function und Datenbank),
// Fehler mit aria-live (role="alert") und am Feld (aria-invalid, aria-describedby), neutraler Erfolg → /bestaetigen.
import { callFunction, pageUrl } from "./api";

type FieldName = "first_name" | "email" | "region" | "postal_code" | "consent";
type FieldError = "required" | "invalid";
interface Messages {
  errors: Record<FieldName, Record<FieldError, string>>;
  general: Record<string, string>;
  summaryOne: string;
  summaryMany: string;
  submit: string;
  submitting: string;
  labels: Record<FieldName, string>;
}

const ORDER: FieldName[] = ["first_name", "email", "region", "postal_code", "consent"];
const NAME_RE = /^\p{L}[\p{L} .'’-]{0,59}$/u;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const POSTAL_RE = /^[0-9]{5}$/;

const form = document.getElementById("waitlist-form") as HTMLFormElement | null;
if (form) init(form);

function init(form: HTMLFormElement): void {
  const startedAt = performance.now();
  const messages = JSON.parse(form.dataset.messages ?? "{}") as Messages;
  const submit = form.querySelector<HTMLButtonElement>("[data-submit]")!;
  const summary = form.querySelector<HTMLElement>("[data-summary]")!;
  const field = (name: string) => form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement;
  let errors: Partial<Record<FieldName, FieldError>> = {};
  let general: string | null = null;
  let attempted = false;

  // Plakat-Kürzel (?q=) und Einladungscode (?e=) aus der Adresse übernehmen.
  const params = new URLSearchParams(location.search);
  const q = params.get("q");
  if (q && /^[A-Za-z0-9-]{1,40}$/.test(q)) field("source").value = q.toLowerCase();
  const e = params.get("e");
  if (e && /^[A-Za-z0-9-]{4,16}$/.test(e)) {
    field("invite").value = e.toUpperCase();
    form.querySelector<HTMLElement>("[data-invite-note]")!.hidden = false;
  }
  submit.disabled = false;

  function values() {
    return {
      first_name: field("first_name").value.trim().replace(/\s+/g, " "),
      email: field("email").value.trim(),
      region: field("region").value,
      postal_code: field("postal_code").value.trim(),
      consent: (field("consent") as HTMLInputElement).checked,
    };
  }

  function check(v: ReturnType<typeof values>): Partial<Record<FieldName, FieldError>> {
    const out: Partial<Record<FieldName, FieldError>> = {};
    if (!v.first_name) out.first_name = "required";
    else if (!NAME_RE.test(v.first_name)) out.first_name = "invalid";
    if (!v.email) out.email = "required";
    else if (v.email.length > 254 || !EMAIL_RE.test(v.email)) out.email = "invalid";
    if (!v.region) out.region = "required";
    if (!v.postal_code) out.postal_code = "required";
    else if (!POSTAL_RE.test(v.postal_code)) out.postal_code = "invalid";
    if (!v.consent) out.consent = "required";
    return out;
  }

  function render(focusFirst: boolean): void {
    for (const name of ORDER) {
      const input = field(name);
      const errorEl = document.getElementById(`${name}-error`)!;
      const describedBy = (input.getAttribute("aria-describedby") ?? "").split(" ").filter((id) => id && id !== errorEl.id);
      const err = errors[name];
      if (err) {
        input.setAttribute("aria-invalid", "true");
        errorEl.textContent = messages.errors[name][err];
        errorEl.hidden = false;
        describedBy.push(errorEl.id);
      } else {
        input.removeAttribute("aria-invalid");
        errorEl.textContent = "";
        errorEl.hidden = true;
      }
      if (describedBy.length) input.setAttribute("aria-describedby", describedBy.join(" "));
      else input.removeAttribute("aria-describedby");
    }

    const names = ORDER.filter((n) => errors[n]);
    summary.replaceChildren();
    if (general) {
      const p = document.createElement("p");
      p.textContent = general;
      summary.append(p);
    } else if (names.length) {
      const p = document.createElement("p");
      p.textContent = names.length === 1 ? messages.summaryOne : messages.summaryMany.replace("{n}", String(names.length));
      const ul = document.createElement("ul");
      for (const n of names) {
        const li = document.createElement("li");
        const a = document.createElement("a");
        a.href = `#${n}`;
        a.textContent = `${messages.labels[n]}: ${messages.errors[n][errors[n]!]}`;
        li.append(a);
        ul.append(li);
      }
      summary.append(p, ul);
    }
    summary.hidden = !general && names.length === 0;
    if (focusFirst && names.length) field(names[0]!).focus();
  }

  function setBusy(busy: boolean): void {
    submit.disabled = busy;
    submit.setAttribute("aria-busy", String(busy));
    submit.textContent = busy ? messages.submitting : messages.submit;
  }

  // Nach dem ersten Absenden: Fehler verschwinden, sobald ein Feld stimmt.
  form.addEventListener("input", (ev) => {
    if (!attempted) return;
    const name = (ev.target as HTMLInputElement).name as FieldName;
    if (!ORDER.includes(name)) return;
    const now = check(values());
    if (!now[name] && errors[name]) {
      delete errors[name];
      general = null;
      render(false);
    }
  });

  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    attempted = true;
    general = null;
    const v = values();
    errors = check(v);
    if (Object.keys(errors).length) {
      render(true);
      return;
    }
    render(false);
    setBusy(true);
    try {
      const res = await callFunction("waitlist-signup", {
        ...v,
        consent_version: field("consent_version").value,
        source: field("source").value || null,
        invite: field("invite").value || null,
        website: field("website").value,
        fill_ms: Math.round(performance.now() - startedAt),
      });
      if (res.status === 202) {
        location.assign(pageUrl("/bestaetigen"));
        return;
      }
      const body = (await res.json().catch(() => ({}))) as { error?: string; fields?: Partial<Record<FieldName, FieldError>> };
      if (res.status === 422 && body.fields && Object.keys(body.fields).length) {
        errors = body.fields;
        render(true);
      } else {
        general = messages.general[body.error ?? ""] ?? messages.general.unknown!;
        render(false);
      }
    } catch {
      general = messages.general.network!;
      render(false);
    }
    setBusy(false);
  });
}
