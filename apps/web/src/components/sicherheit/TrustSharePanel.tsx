"use client";
// „Abend teilen“ für einen Abend: Link erstellen (api.create_trust_share), kopieren oder teilen, aktive Links
// zurückziehen (api.revoke_trust_share). Der Schlüssel kommt nur einmal zurück und steht im Fragment (#t=…).
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { createTrustShare, revokeTrustShare } from "@/app/actions/safety";
import { Button, Notice } from "@/components/ui";
import { errors } from "@/copy/common";
import type { AddressForm } from "@/copy/form";
import { trustShare as shareCopy } from "@/copy/sicherheit";
import { formatDateTime } from "@/lib/format";
import { trustShareLink } from "@/lib/safety-rules";
import type { TrustShare } from "@/lib/safety-types";
import "./sicherheit.css";

export function TrustSharePanel({
  form,
  eveningId,
  shares,
  headingLevel = 3,
}: {
  form: AddressForm;
  eveningId: string;
  /** Aktive Links dieses Abends (api.my_trust_shares). */
  shares: TrustShare[];
  headingLevel?: 3 | 4;
}) {
  const c = shareCopy(form);
  const uid = useId();
  const H = `h${headingLevel}` as "h3" | "h4";
  const [created, setCreated] = useState<{ id: string; link: string; expiresAt: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [canShare, setCanShare] = useState(false);
  const [pending, start] = useTransition();
  const [revoking, setRevoking] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Nur im Browser bekannt; Anzeige des Teilen-Knopfs erst nach dem Laden (sonst unterschiedliches HTML).
    // eslint-disable-next-line react-hooks/set-state-in-effect -- erst im Browser bekannt
    setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function");
  }, []);

  function create() {
    setError(null);
    setStatus(null);
    start(async () => {
      const res = await createTrustShare(eveningId);
      if (!res.ok) {
        setError(c.errors[res.error] ?? errors.generic(form));
        return;
      }
      const link = trustShareLink(window.location.origin, res.data.token, res.data.url);
      setCreated({ id: res.data.share_id, link, expiresAt: res.data.expires_at });
      requestAnimationFrame(() => inputRef.current?.focus());
    });
  }

  async function copy() {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.link);
      setStatus(c.copied);
    } catch {
      inputRef.current?.select();
      setStatus(c.copyFailed);
    }
  }

  async function share() {
    if (!created) return;
    try {
      await navigator.share({ title: c.title, text: c.shareText, url: created.link });
    } catch {
      // abgebrochen – nichts zu tun
    }
  }

  function revoke(id: string) {
    setError(null);
    setRevoking(id);
    start(async () => {
      const res = await revokeTrustShare(id);
      setRevoking(null);
      if (!res.ok) {
        setError(errors.generic(form));
        return;
      }
      if (created?.id === id) setCreated(null);
      setStatus(c.revoked);
    });
  }

  return (
    <div className="stack stack-sm">
      {created ? (
        <div className="link-box">
          <label className="field__label" htmlFor={`${uid}-link`}>
            {c.linkLabel}
          </label>
          <input id={`${uid}-link`} ref={inputRef} className="input" readOnly value={created.link} onFocus={(e) => e.currentTarget.select()} />
          <div className="cluster">
            <Button size="sm" icon="share" onClick={copy}>
              {c.copy}
            </Button>
            {canShare ? (
              <Button size="sm" variant="secondary" onClick={share}>
                {c.shareNative}
              </Button>
            ) : null}
          </div>
          <p className="text-sm soft">{c.onlyNow}</p>
        </div>
      ) : (
        <div>
          <Button onClick={create} loading={pending && !revoking} icon="plus" variant="secondary">
            {pending && !revoking ? c.creating : c.create}
          </Button>
        </div>
      )}

      <p className={["text-sm", status === c.copied ? "text-success" : "soft"].join(" ")} role="status">
        {status}
      </p>
      {error ? (
        <Notice tone="danger" live="assertive">
          {error}
        </Notice>
      ) : null}

      <H className="text-sm eyebrow">{c.activeTitle}</H>
      {shares.length ? (
        <ul className="list-plain list-divided">
          {shares.map((s) => (
            <li key={s.id} className="item-head">
              <span className="item-meta">{c.activeItem(formatDateTime(s.created_at), formatDateTime(s.expires_at))}</span>
              <Button size="sm" variant="quiet" icon="trash" onClick={() => revoke(s.id)} loading={revoking === s.id}>
                {revoking === s.id ? c.revoking : c.revoke}
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted text-sm">{c.noActive}</p>
      )}
    </div>
  );
}
