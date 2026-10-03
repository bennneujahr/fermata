"use client";
// Feste Hinweise im Gespräch: KI-Hinweis (Art. 50 AI Act) und Hilfe in Krisen (dauerhaft sichtbar, sobald gesendet).
import { Icon } from "@/components/ui/Icon";
import type { AddressForm } from "@/copy/form";
import { gespraech } from "@/copy/gespraech";
import { telHref } from "@/lib/format";
import type { CrisisLines } from "@/lib/viola/types";

export function AiNotice({ text, form }: { text: string; form: AddressForm }) {
  const c = gespraech(form);
  return (
    <section className="ai-notice" aria-labelledby="ki-hinweis-titel" id="ki-hinweis">
      <span className="ai-notice__icon" aria-hidden="true">
        <Icon name="sparkle" size={22} />
      </span>
      <div className="stack stack-sm">
        <h2 className="ai-notice__title" id="ki-hinweis-titel">
          {c.aiNoticeTitle}
        </h2>
        <p>{text}</p>
      </div>
    </section>
  );
}

export function CrisisPanel({ lines, form }: { lines: CrisisLines; form: AddressForm }) {
  const c = gespraech(form);
  const seelsorge = Array.isArray(lines.telefonseelsorge) ? lines.telefonseelsorge.filter((n): n is string => typeof n === "string") : [];
  const notruf = typeof lines.notruf === "string" ? lines.notruf : "112";
  return (
    <section className="crisis-panel" aria-labelledby="krise-titel" role="region" id="hilfe-krise">
      <h2 id="krise-titel" className="crisis-panel__title">
        <Icon name="phone" size={22} /> {c.crisisTitle}
      </h2>
      <p>{c.crisisText}</p>
      <ul className="list-plain crisis-panel__list">
        {seelsorge.map((n) => (
          <li key={n}>
            <a className="call" href={telHref(n)}>
              <span className="call__icon" aria-hidden="true">
                <Icon name="phone" />
              </span>
              <span className="call__text">
                <span>{c.crisisCall(n)}</span>
                <span className="call__sub">{c.crisisLineName}</span>
              </span>
            </a>
          </li>
        ))}
        <li>
          <a className="call call--emergency" href={telHref(notruf)}>
            <span className="call__icon" aria-hidden="true">
              <Icon name="phone" />
            </span>
            <span className="call__text">
              <span>{c.crisisEmergency(notruf)}</span>
            </span>
          </a>
        </li>
      </ul>
    </section>
  );
}
