"use client";
// Textmodus: Gespräch mit Viola als Text. Erst der schriftliche KI-Hinweis, dann Violas Begrüßung,
// Antworten Satz für Satz (Server-Sent Events).
import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Button, Dialog, Notice } from "@/components/ui";
import type { AddressForm } from "@/copy/form";
import { gespraech } from "@/copy/gespraech";
import { TextApiError, TextClient } from "@/lib/viola/text-client";
import type { InterviewTokenResponse, ViolaEvent } from "@/lib/viola/types";

export interface ChatItem {
  id: string;
  role: "viola" | "person" | "summary" | "note";
  text: string;
  partial?: boolean;
}

const MAX = 2000;

export function TextChat({
  token,
  form,
  initialItems = [],
  onEvent,
  onEnded,
}: {
  token: InterviewTokenResponse;
  form: AddressForm;
  initialItems?: ChatItem[];
  onEvent: (ev: ViolaEvent) => void;
  onEnded: (reason: string, summaryPending: boolean) => void;
}) {
  const c = gespraech(form);
  const [items, setItems] = useState<ChatItem[]>(initialItems);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ended, setEnded] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const client = useRef<TextClient | null>(null);
  const counter = useRef(0);
  const logRef = useRef<HTMLOListElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const started = useRef(false);

  const nextId = () => `m${++counter.current}`;

  const handleEvent = useCallback(
    (ev: ViolaEvent) => {
      if (ev.type === "summary_proposed") {
        setItems((list) => [...list, { id: `m${++counter.current}`, role: "summary", text: ev.text, partial: ev.partial }]);
      }
      if (ev.type === "ended") {
        setEnded(true);
        onEnded(ev.reason, ev.summary_pending === true);
      }
      onEvent(ev);
    },
    [onEnded, onEvent],
  );

  // Start: Begrüßung mit KI-Hinweis (erneuter Aufruf liefert sie wieder)
  useEffect(() => {
    if (started.current || !token.text) return;
    started.current = true;
    client.current = new TextClient(token.text.url, token.text.token);
    void (async () => {
      try {
        const res = await client.current!.start();
        setRemaining(res.remaining_seconds);
        const greeting = res.messages[0]?.text;
        setItems((list) => {
          // Bei einer Fortsetzung steht die Begrüßung schon im bisherigen Verlauf.
          if (!greeting || list.some((i) => i.role === "viola" && i.text === greeting)) return list;
          return [...list, { id: `m${++counter.current}`, role: "viola", text: greeting }];
        });
        if (res.ended) {
          setEnded(true);
          onEnded(res.end_reason ?? "fertig", false);
        }
      } catch (err) {
        setError(err instanceof TextApiError ? err.code : "network");
      } finally {
        setBusy(false);
      }
    })();
  }, [token, onEnded]);

  useEffect(() => {
    const last = logRef.current?.lastElementChild;
    if (last && "scrollIntoView" in last) {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      last.scrollIntoView({ block: "end", behavior: reduce ? "auto" : "smooth" });
    }
  }, [items]);

  useEffect(() => {
    if (!busy && !ended) inputRef.current?.focus();
  }, [busy, ended]);

  const send = async (text: string, retried = false): Promise<void> => {
    if (!client.current) return;
    const vid = nextId();
    let started = false;
    try {
      const state = await client.current.send(text, {
        onSentence: (s) => {
          setItems((list) => {
            if (!started) {
              started = true;
              return [...list, { id: vid, role: "viola", text: s }];
            }
            return list.map((i) => (i.id === vid ? { ...i, text: `${i.text} ${s}` } : i));
          });
        },
        onEvent: handleEvent,
      });
      setRemaining(state.remaining_seconds);
      if (state.ended) setEnded(true);
    } catch (err) {
      const code = err instanceof TextApiError ? err.code : "network";
      if (code === "not_started" && !retried) {
        // Der Textdienst wurde neu gestartet: Sitzung mit dem gespeicherten Verlauf fortsetzen.
        await client.current.start().catch(() => undefined);
        return send(text, true);
      }
      setError(code);
    }
  };

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    const text = draft.trim();
    if (!text || busy || ended) return;
    if (text.length > MAX) {
      setError("too_long");
      return;
    }
    setError(null);
    setDraft("");
    setItems((list) => [...list, { id: nextId(), role: "person", text }]);
    setBusy(true);
    await send(text);
    setBusy(false);
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void submit();
    }
  };

  const endNow = async () => {
    setConfirmEnd(false);
    if (!client.current) return;
    setBusy(true);
    try {
      const res = await client.current.end();
      for (const raw of res.events ?? []) {
        const ev = raw as ViolaEvent;
        if (ev && typeof ev === "object" && "type" in ev) handleEvent(ev);
      }
      if (!res.events?.some((e) => (e as { type?: string }).type === "ended")) {
        setEnded(true);
        onEnded(res.end_reason ?? "person_beendet", true);
      }
    } catch (err) {
      setError(err instanceof TextApiError ? err.code : "network");
    } finally {
      setBusy(false);
    }
  };

  const errorText = error ? (error === "too_long" ? c.tooLong : (c.errors[error] ?? c.errors.generic)) : null;
  const minutes = remaining !== null ? Math.max(1, Math.round(remaining / 60)) : null;

  return (
    <section className="chat" aria-label={c.chatLabel}>
      <div className="chat__bar">
        {minutes !== null && !ended ? <span className="muted text-sm">{c.remaining(minutes)}</span> : <span />}
        {!ended ? (
          <Button variant="quiet" size="sm" onClick={() => setConfirmEnd(true)} disabled={busy && items.length === 0}>
            {c.end}
          </Button>
        ) : null}
      </div>
      <div className="chat__log" role="log" aria-live="polite" aria-relevant="additions text" aria-label={c.chatLabel} tabIndex={0}>
      <ol className="chat__list list-plain" ref={logRef}>
        {items.map((i) => (
          <li key={i.id} className={`chat__item chat__item--${i.role}`}>
            {i.role === "summary" ? (
              <div className="chat__summary">
                <p className="eyebrow">{c.summaryProposedTitle}</p>
                <p>{i.text}</p>
                <p className="muted text-sm">{i.partial ? c.summaryPartialHint : c.summaryProposedHint}</p>
              </div>
            ) : i.role === "note" ? (
              <p className="chat__note">{i.text}</p>
            ) : (
              <>
                <span className="visually-hidden">{i.role === "viola" ? c.speakerViola : c.speakerMe}: </span>
                <p className="chat__bubble">{i.text}</p>
              </>
            )}
          </li>
        ))}
        {busy && !ended ? (
          <li className="chat__item chat__item--viola chat__item--typing" aria-hidden="true">
            <p className="chat__bubble">
              <span className="typing-dots">
                <span />
                <span />
                <span />
              </span>
            </p>
          </li>
        ) : null}
      </ol>
      </div>
      {busy && !ended ? (
        <p className="visually-hidden" role="status">
          {c.sending}
        </p>
      ) : null}
      {errorText ? (
        <Notice tone="danger" live="assertive">
          {errorText}
        </Notice>
      ) : null}
      {!ended ? (
        <form className="chat__form" onSubmit={submit}>
          <label className="field__label" htmlFor="chat-eingabe">
            {c.inputLabel}
          </label>
          <div className="chat__compose">
            <textarea
              id="chat-eingabe"
              ref={inputRef}
              className="textarea chat__input"
              rows={2}
              maxLength={MAX}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKey}
              aria-describedby="chat-hinweis"
              disabled={ended}
            />
            <Button type="submit" icon="send" disabled={busy || !draft.trim()}>
              {c.send}
            </Button>
          </div>
          <p className="field__hint" id="chat-hinweis">
            {c.inputHint}
          </p>
        </form>
      ) : null}
      <Dialog
        open={confirmEnd}
        onClose={() => setConfirmEnd(false)}
        title={c.endTitle}
        actions={
          <>
            <Button variant="secondary" onClick={() => setConfirmEnd(false)}>
              {c.endCancelText}
            </Button>
            <Button variant="danger" onClick={() => void endNow()}>
              {c.endConfirm}
            </Button>
          </>
        }
      >
        <p className="soft">{c.endText}</p>
      </Dialog>
    </section>
  );
}
