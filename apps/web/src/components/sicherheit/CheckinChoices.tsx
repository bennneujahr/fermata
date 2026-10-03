"use client";
// Check-in nach Beginn des Abends: drei große Antworten (api.checkin_respond).
// „Ich brauche Hilfe“ zeigt die Notrufnummern sofort – noch bevor der Server antwortet und auch, wenn er nicht antwortet.
import { useRef, useState, useTransition } from "react";
import { respondCheckin } from "@/app/actions/safety";
import { Button, Notice } from "@/components/ui";
import { Icon, type IconName } from "@/components/ui/Icon";
import type { AddressForm } from "@/copy/form";
import { checkin as checkinCopy } from "@/copy/sicherheit";
import type { CheckinStatus, HelpContacts } from "@/lib/safety-types";
import { HelpNumbers, PoliceCall } from "./HelpNumbers";
import "./sicherheit.css";

const ORDER: { key: CheckinStatus; icon: IconName }[] = [
  { key: "gut", icon: "checkCircle" },
  { key: "unsicher", icon: "info" },
  { key: "hilfe", icon: "phone" },
];

type Sent = "sending" | "ok" | "failed";

export function CheckinChoices({ eveningId, form, contacts }: { eveningId: string; form: AddressForm; contacts: HelpContacts }) {
  const c = checkinCopy(form);
  const [choice, setChoice] = useState<CheckinStatus | null>(null);
  const [sent, setSent] = useState<Sent | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [help, setHelp] = useState<HelpContacts>(contacts);
  const [, start] = useTransition();
  const resultRef = useRef<HTMLHeadingElement>(null);

  function pick(status: CheckinStatus) {
    setChoice(status);
    setSent("sending");
    setErrorKey(null);
    requestAnimationFrame(() => resultRef.current?.focus());
    start(async () => {
      const res = await respondCheckin(eveningId, status).catch(() => ({ ok: false as const, error: "network" }));
      if (res.ok) {
        setSent("ok");
        if (res.data.help?.police?.number) setHelp(res.data.help);
      } else {
        setSent("failed");
        setErrorKey(res.error);
      }
    });
  }

  if (choice) {
    const informed =
      sent === "sending" ? c.informing : sent === "ok" ? c.informed : (c.errors[errorKey ?? ""] ?? c.notInformed);
    return (
      <div className="stack" aria-live="polite">
        {choice === "hilfe" ? (
          <section className="urgent-help" aria-labelledby="checkin-result">
            <h2 className="urgent-help__title" id="checkin-result" ref={resultRef} tabIndex={-1}>
              {c.hilfeTitle}
            </h2>
            <p className="urgent-help__number" aria-hidden="true">
              {help.police.number}
            </p>
            <PoliceCall contacts={help} form={form} />
            <p>{c.hilfeText}</p>
            <HelpNumbers contacts={help} form={form} variant="urgent" showPolice={false} />
            <p className={sent === "failed" ? "field__error" : "soft"}>{informed}</p>
          </section>
        ) : choice === "unsicher" ? (
          <section className="stack" aria-labelledby="checkin-result">
            <h2 id="checkin-result" ref={resultRef} tabIndex={-1}>
              {c.unsicherTitle}
            </h2>
            <p>{c.unsicherText}</p>
            <HelpNumbers contacts={help} form={form} variant="compact" />
            <p className={sent === "failed" ? "field__error" : "soft"}>{informed}</p>
          </section>
        ) : (
          <section className="stack" aria-labelledby="checkin-result">
            <h2 id="checkin-result" ref={resultRef} tabIndex={-1}>
              {c.gutTitle}
            </h2>
            {sent === "failed" ? (
              <Notice tone="warning">{c.errors[errorKey ?? ""] ?? c.notInformed}</Notice>
            ) : (
              <p className="soft">{c.gutText}</p>
            )}
          </section>
        )}
        <div>
          <Button variant="quiet" icon="arrowLeft" onClick={() => setChoice(null)}>
            {c.again}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <fieldset className="checkin-choices">
      <legend className="visually-hidden">{c.legend}</legend>
      {ORDER.map(({ key, icon }) => {
        const ch = c.choices[key];
        return (
          <button key={key} type="button" className={`checkin-choice checkin-choice--${key}`} onClick={() => pick(key)} aria-labelledby={`checkin-${key}-label`} aria-describedby={`checkin-${key}-desc`}>
            <span className="checkin-choice__icon" aria-hidden="true">
              <Icon name={icon} size={24} />
            </span>
            <span className="checkin-choice__text">
              <span className="checkin-choice__label" id={`checkin-${key}-label`}>
                {ch.label}
              </span>
              <span className="checkin-choice__description" id={`checkin-${key}-desc`}>
                {ch.description}
              </span>
            </span>
          </button>
        );
      })}
    </fieldset>
  );
}
