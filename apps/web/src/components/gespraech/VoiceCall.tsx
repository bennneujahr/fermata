"use client";
// Sprachgespräch: LiveKit-Raum mit Viola. „Atem“ folgt dem Zustand des Agenten (lk.agent.state) und ihrer Stimme.
// Knöpfe: Pause (Mikrofon stumm), Text statt Stimme, Beenden. Untertitel optional, nie gespeichert.
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Dialog, Notice } from "@/components/ui";
import type { AddressForm } from "@/copy/form";
import { gespraech } from "@/copy/gespraech";
import { atemStateFor, type InterviewTokenResponse, type ViolaEvent } from "@/lib/viola/types";
import { createLiveKitConnection, type Caption, type DisconnectKind, type VoiceConnection, type VoiceHandlers } from "@/lib/viola/voice";
import { Atem } from "./Atem";

export function VoiceCall({
  token,
  form,
  fake,
  onEvent,
  onEnded,
  onSwitchToText,
  onLost,
}: {
  token: InterviewTokenResponse;
  form: AddressForm;
  fake: boolean;
  onEvent: (ev: ViolaEvent) => void;
  onEnded: (reason: string, summaryPending: boolean) => void;
  onSwitchToText: () => void;
  onLost: (kind: DisconnectKind) => void;
}) {
  const c = gespraech(form);
  const [phase, setPhase] = useState<"connecting" | "waiting" | "live" | "failed">("connecting");
  const [agentState, setAgentState] = useState<string | undefined>();
  const [paused, setPaused] = useState(false);
  const [audio, setAudio] = useState<MediaStream | null>(null);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [captions, setCaptions] = useState<Caption[]>([]);
  const [showCaptions, setShowCaptions] = useState(true);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [busy, setBusy] = useState(false);
  const conn = useRef<VoiceConnection | null>(null);
  const finished = useRef(false);
  const startedAt = useRef<number>(0);
  const [minutesLeft, setMinutesLeft] = useState(token.session.max_minutes);

  const callbacks = useRef({ onEvent, onEnded, onSwitchToText, onLost });
  useEffect(() => {
    callbacks.current = { onEvent, onEnded, onSwitchToText, onLost };
  }, [onEvent, onEnded, onSwitchToText, onLost]);

  const leave = useCallback(async () => {
    finished.current = true;
    await conn.current?.disconnect().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!token.voice) return;
    let alive = true;
    const handlers: VoiceHandlers = {
      onAgentJoined: () => alive && setPhase("live"),
      onAgentState: (s) => alive && setAgentState(s),
      onEvent: (ev) => {
        if (!alive) return;
        callbacks.current.onEvent(ev);
        if (ev.type === "ended") {
          finished.current = true;
          callbacks.current.onEnded(ev.reason, ev.summary_pending === true);
          void conn.current?.disconnect().catch(() => undefined);
        }
        if (ev.type === "switch_to_text") {
          finished.current = true;
          void conn.current?.disconnect().catch(() => undefined);
          callbacks.current.onSwitchToText();
        }
      },
      onCaption: (cap) =>
        alive &&
        setCaptions((list) => {
          const others = list.filter((x) => x.id !== cap.id);
          return [...others, cap].slice(-4);
        }),
      onAgentAudio: (s) => alive && setAudio(s),
      onAudioBlocked: (b) => alive && setAudioBlocked(b),
      onDisconnected: (kind) => {
        if (!alive || finished.current) return;
        finished.current = true;
        callbacks.current.onLost(kind);
      },
    };
    void (async () => {
      try {
        const make = fake ? (await import("@/lib/viola/fake-voice")).createFakeConnection : null;
        const connection = make ? make(handlers) : await createLiveKitConnection(handlers);
        if (!alive) return;
        conn.current = connection;
        await connection.connect(token.voice!.url, token.voice!.token);
        startedAt.current = Date.now();
        if (alive) setPhase((p) => (p === "connecting" ? "waiting" : p));
      } catch {
        if (alive) setPhase("failed");
      }
    })();
    return () => {
      alive = false;
      finished.current = true;
      void conn.current?.disconnect().catch(() => undefined);
    };
  }, [token, fake]);

  useEffect(() => {
    if (!startedAt.current) startedAt.current = Date.now();
    const t = window.setInterval(() => {
      const used = Math.floor((Date.now() - startedAt.current) / 60_000);
      setMinutesLeft(Math.max(0, token.session.max_minutes - used));
    }, 15_000);
    return () => window.clearInterval(t);
  }, [token.session.max_minutes]);

  const togglePause = async () => {
    const next = !paused;
    setPaused(next);
    await conn.current?.setMicEnabled(!next).catch(() => undefined);
  };

  const switchToText = async () => {
    setBusy(true);
    finished.current = true;
    await conn.current?.send({ type: "switch_to_text" }).catch(() => undefined);
    // Kurz warten, damit das Datenpaket ankommt, dann den Raum verlassen.
    await new Promise((r) => setTimeout(r, 300));
    await leave();
    onSwitchToText();
  };

  const endCall = async () => {
    setConfirmEnd(false);
    setBusy(true);
    finished.current = true;
    // Vorgesehen für den Worker (noch nicht ausgewertet): Ende durch die Person. Ohne Auswertung endet die
    // Sitzung beim Verlassen mit „technik“ und kann fortgesetzt werden.
    await conn.current?.send({ type: "end" }).catch(() => undefined);
    await new Promise((r) => setTimeout(r, 200));
    await leave();
    onEnded("person_beendet", true);
  };

  const atem = atemStateFor(agentState, paused);
  const stateText = phase === "connecting" ? c.connecting : phase === "waiting" ? c.waitingForViola : c.states[atem];

  if (phase === "failed") {
    return (
      <Notice tone="danger" live="assertive" title={c.errors.connect_failed}>
        <div className="cluster">
          <Button variant="secondary" size="sm" onClick={onSwitchToText} icon="send">
            {c.write}
          </Button>
        </div>
      </Notice>
    );
  }

  return (
    <section className="voice card card--night" aria-labelledby="stimme-titel" data-agent-state={agentState ?? "none"} data-phase={phase}>
      <h2 className="visually-hidden" id="stimme-titel">
        {c.chatLabel}
      </h2>
      <Atem state={phase === "live" ? atem : "ruhig"} label={stateText} audio={audio} size="lg" />
      <p className="voice__state" aria-hidden="true">
        {stateText}
      </p>
      {paused ? <p className="voice__paused">{c.pausedNote}</p> : null}
      {audioBlocked ? (
        <div className="cluster voice__audio">
          <span>{c.audioBlocked}</span>
          <Button size="sm" variant="secondary" onClick={() => void conn.current?.startAudio()}>
            {c.audioStart}
          </Button>
        </div>
      ) : null}
      {showCaptions ? (
        <div className="voice__captions" aria-label={c.captionsLabel} role="region">
          {captions.length ? (
            <ul className="list-plain">
              {captions.map((cap) => (
                <li key={cap.id} className={`voice__caption voice__caption--${cap.speaker}`}>
                  <span className="voice__speaker">{cap.speaker === "viola" ? c.speakerViola : c.speakerMe}</span> {cap.text}
                </li>
              ))}
            </ul>
          ) : (
            <p className="voice__caption-empty">{c.captionsNote}</p>
          )}
        </div>
      ) : null}
      <div className="voice__controls">
        <Button variant="secondary" onClick={() => void togglePause()} disabled={busy || phase !== "live"}>
          {paused ? c.resume : c.pause}
        </Button>
        <Button variant="secondary" icon="send" onClick={() => void switchToText()} disabled={busy}>
          {c.switchToText}
        </Button>
        <Button variant="danger" onClick={() => setConfirmEnd(true)} disabled={busy}>
          {c.end}
        </Button>
      </div>
      <div className="voice__meta">
        <button type="button" className="link-button" onClick={() => setShowCaptions((v) => !v)}>
          {showCaptions ? c.captionsHide : c.captionsShow}
        </button>
        <span>{c.remaining(Math.max(1, minutesLeft))}</span>
      </div>
      <Dialog
        open={confirmEnd}
        onClose={() => setConfirmEnd(false)}
        title={c.endTitle}
        actions={
          <>
            <Button variant="secondary" onClick={() => setConfirmEnd(false)}>
              {c.endCancel}
            </Button>
            <Button variant="danger" onClick={() => void endCall()}>
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
