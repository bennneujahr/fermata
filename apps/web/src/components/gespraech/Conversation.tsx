"use client";
// Ablauf des Gesprächs im Browser: Wahl (Sprechen / Lieber schreiben) → Mikrofon → Zugang (interview-token)
// → KI-Hinweis → Stimme oder Text → Ende mit Weg zur Zusammenfassung.
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { requestInterviewAction, textAccessAction, transcriptTurnsAction } from "@/app/actions/gespraech";
import { Button, ButtonLink, Card, Notice } from "@/components/ui";
import { Icon } from "@/components/ui/Icon";
import type { AddressForm } from "@/copy/form";
import { gespraech } from "@/copy/gespraech";
import type { CrisisLines, InterviewKind, InterviewMode, InterviewTokenResponse, ViolaEvent } from "@/lib/viola/types";
import { checkMicrophone, type MicProblem } from "@/lib/viola/voice";
import { Atem } from "./Atem";
import { AiNotice, CrisisPanel } from "./Notices";
import { TextChat, type ChatItem } from "./TextChat";
import { VoiceCall } from "./VoiceCall";

type Stage =
  | { name: "choose" }
  | { name: "mic" }
  | { name: "mic_problem"; problem: MicProblem }
  | { name: "requesting"; mode: InterviewMode }
  | { name: "voice"; token: InterviewTokenResponse }
  | { name: "text"; token: InterviewTokenResponse; items: ChatItem[]; ended?: { reason: string; summaryPending: boolean } }
  | { name: "lost"; sessionId: string }
  | { name: "ended"; sessionId: string; reason: string; summaryPending: boolean };

const SAFETY_ENDS = new Set(["krise", "minderjaehrig", "missbrauch"]);

export interface ConversationProps {
  form: AddressForm;
  kind: InterviewKind;
  eveningId: string | null;
  voice: { enabled: boolean; fake: boolean };
  openSessionId: string | null;
  continueSession: { id: string; mode: InterviewMode } | null;
  intro?: React.ReactNode;
  /** Nummern aus api.help_contacts(), falls ein Datenpaket ohne Nummern käme. */
  crisisFallback?: CrisisLines | null;
}

export function Conversation({ form, kind, eveningId, voice, openSessionId, continueSession, intro, crisisFallback }: ConversationProps) {
  const c = gespraech(form);
  const router = useRouter();
  const [stage, setStage] = useState<Stage>({ name: "choose" });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [crisis, setCrisis] = useState<CrisisLines | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const onEvent = useCallback(
    (ev: ViolaEvent) => {
      if (ev.type !== "crisis_resources") return;
      const lines = ev.lines ?? {};
      const own = Array.isArray(lines.telefonseelsorge) && lines.telefonseelsorge.length > 0;
      setCrisis({
        ...lines,
        telefonseelsorge: own ? lines.telefonseelsorge : (crisisFallback?.telefonseelsorge ?? []),
        notruf: typeof lines.notruf === "string" && lines.notruf ? lines.notruf : (crisisFallback?.notruf ?? "112"),
      });
    },
    [crisisFallback],
  );

  const request = async (mode: InterviewMode, continues: string | null = null) => {
    setError(null);
    setInfo(null);
    if (mode === "voice") {
      setStage({ name: "mic" });
      const mic = await checkMicrophone();
      if (!mic.ok) {
        setStage({ name: "mic_problem", problem: mic.problem });
        return;
      }
    }
    setStage({ name: "requesting", mode });
    const res = await requestInterviewAction({ kind, mode, eveningId, continuesSessionId: continues });
    if (!res.ok) {
      setError(res.error);
      setStage({ name: "choose" });
      return;
    }
    setNotice(res.data.ai_notice);
    if (res.data.session.mode === "voice" && res.data.voice) setStage({ name: "voice", token: res.data });
    else setStage({ name: "text", token: res.data, items: [] });
  };

  const toText = async (sessionId: string, opts: { switched?: boolean; resume?: boolean } = {}) => {
    setError(null);
    setStage({ name: "requesting", mode: "text" });
    // Nach dem Wechsel braucht der Worker einen Moment, bis die Sitzung im Textmodus offen ist.
    let res = await textAccessAction(sessionId);
    for (let i = 0; !res.ok && res.error === "session_closed" && opts.switched && i < 3; i++) {
      await new Promise((r) => setTimeout(r, 800));
      res = await textAccessAction(sessionId);
    }
    if (!res.ok) {
      setError(res.error);
      setStage({ name: "choose" });
      return;
    }
    setNotice(res.data.ai_notice);
    const items: ChatItem[] = [];
    if (opts.resume || opts.switched) {
      const turns = await transcriptTurnsAction(sessionId);
      turns.forEach((t, i) => items.push({ id: `t${i}`, role: t.role === "person" ? "person" : "viola", text: t.text }));
    }
    if (opts.switched) setInfo(c.switchingNote);
    setStage({ name: "text", token: res.data, items });
  };

  const onEnded = useCallback(
    (sessionId: string) => (reason: string, summaryPending: boolean) => {
      // Im Textmodus bleibt der Verlauf stehen (Violas letzte Worte), darunter der Abschluss.
      setStage((s) => (s.name === "text" ? { ...s, ended: { reason, summaryPending } } : { name: "ended", sessionId, reason, summaryPending }));
    },
    [],
  );

  const endedCard = (sessionId: string, reason: string, summaryPending: boolean) => (
    <Card variant="night" id="beendet" title={c.endedTitle}>
      <div className="stack stack-sm">
        <Icon name="checkCircle" size={28} />
        <p role="status" className="soft">
          {SAFETY_ENDS.has(reason) ? c.endedSafety : summaryPending ? c.endedText : c.endedNoSummary}
        </p>
      </div>
      <div className="cluster">
        {SAFETY_ENDS.has(reason) ? (
          <ButtonLink href="/hilfe" variant="secondary" icon="help">
            {c.toHelp}
          </ButtonLink>
        ) : (
          <ButtonLink href={`/gespraech/${sessionId}`} iconAfter="arrowRight">
            {c.toSummary}
          </ButtonLink>
        )}
        <Button
          variant="quiet"
          size="sm"
          onClick={() => {
            setStage({ name: "choose" });
            setNotice(null);
            router.refresh();
          }}
        >
          {c.backToStart}
        </Button>
      </div>
    </Card>
  );

  const errorText = error ? (c.errors[error] ?? c.errors.generic) : null;

  return (
    <div className="stack stack-lg conversation" data-stage={stage.name}>
      {crisis ? <CrisisPanel lines={crisis} form={form} /> : null}
      {notice && (stage.name === "voice" || stage.name === "text") ? <AiNotice text={notice} form={form} /> : null}
      {info && stage.name === "text" ? (
        <Notice tone="info" live="polite">
          {info}
        </Notice>
      ) : null}

      {stage.name === "choose" || stage.name === "mic" || stage.name === "requesting" || stage.name === "mic_problem" ? (
        <>
          {intro}
          {errorText ? (
            <Notice tone="warning" live="assertive" title={errorText}>
              {error === "session_active" && openSessionId ? (
                <Button size="sm" variant="secondary" onClick={() => void toText(openSessionId, { resume: true })}>
                  {c.openCta}
                </Button>
              ) : null}
            </Notice>
          ) : null}
          {openSessionId ? (
            <Card title={c.openTitle} variant="accent" id="offen">
              <p className="soft">{c.openText}</p>
              <div>
                <Button onClick={() => void toText(openSessionId, { resume: true })} icon="send" loading={stage.name === "requesting"}>
                  {c.openCta}
                </Button>
              </div>
            </Card>
          ) : null}
          {continueSession && !openSessionId ? (
            <Card title={c.continueTitle} variant="accent" id="fortsetzen">
              <p className="soft">{c.continueText}</p>
              <div className="cluster">
                {voice.enabled ? (
                  <Button onClick={() => void request("voice", continueSession.id)} icon="voice" disabled={stage.name !== "choose" && stage.name !== "mic_problem"}>
                    {c.continueSpeak}
                  </Button>
                ) : null}
                <Button variant="secondary" onClick={() => void request("text", continueSession.id)} icon="send" disabled={stage.name !== "choose" && stage.name !== "mic_problem"}>
                  {c.continueWrite}
                </Button>
              </div>
            </Card>
          ) : null}
          <Card variant="night" id="beginnen" labelledBy="beginnen-titel">
            <div className="conversation__choose">
              <Atem state={stage.name === "mic" || stage.name === "requesting" ? "denkt" : "ruhig"} label={c.atemLabel} />
              <h2 id="beginnen-titel">{c.chooseTitle}</h2>
              <div className="choice-cards">
                <div className="choice-card">
                  <Button
                    onClick={() => void request("voice")}
                    icon="voice"
                    block
                    disabled={!voice.enabled || (stage.name !== "choose" && stage.name !== "mic_problem")}
                    loading={stage.name === "mic" || (stage.name === "requesting" && stage.mode === "voice")}
                    aria-describedby="sprechen-hinweis"
                  >
                    {c.speak}
                  </Button>
                  <p id="sprechen-hinweis" className="soft text-sm">
                    {voice.enabled ? c.speakText : c.voiceOff}
                  </p>
                </div>
                <div className="choice-card">
                  <Button
                    variant="secondary"
                    onClick={() => void request("text")}
                    icon="send"
                    block
                    disabled={stage.name !== "choose" && stage.name !== "mic_problem"}
                    loading={stage.name === "requesting" && stage.mode === "text"}
                    aria-describedby="schreiben-hinweis"
                  >
                    {c.write}
                  </Button>
                  <p id="schreiben-hinweis" className="soft text-sm">
                    {c.writeText}
                  </p>
                </div>
              </div>
              {stage.name === "mic" ? (
                <p role="status" className="soft">
                  {c.micChecking}
                </p>
              ) : null}
            </div>
          </Card>
          {stage.name === "mic_problem" ? (
            <Notice tone="warning" live="assertive" title={c.micTitle}>
              <p>{c.micProblems[stage.problem] ?? c.micProblems.unknown}</p>
              <div className="cluster">
                <Button size="sm" variant="secondary" onClick={() => void request("voice")}>
                  {c.micRetry}
                </Button>
                <Button size="sm" onClick={() => void request("text")} icon="send">
                  {c.write}
                </Button>
              </div>
            </Notice>
          ) : null}
        </>
      ) : null}

      {stage.name === "voice" ? (
        <VoiceCall
          token={stage.token}
          form={form}
          fake={voice.fake}
          onEvent={onEvent}
          onEnded={onEnded(stage.token.session.id)}
          onSwitchToText={() => void toText(stage.token.session.id, { switched: true })}
          onLost={() => setStage({ name: "lost", sessionId: stage.token.session.id })}
        />
      ) : null}

      {stage.name === "text" ? (
        <TextChat token={stage.token} form={form} initialItems={stage.items} onEvent={onEvent} onEnded={onEnded(stage.token.session.id)} />
      ) : null}

      {stage.name === "lost" ? (
        <Notice tone="warning" live="assertive" title={c.lostTitle}>
          <p>{c.lostText}</p>
          <div className="cluster">
            <Button size="sm" onClick={() => void toText(stage.sessionId, { switched: true })} icon="send">
              {c.openCta}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => void request("voice", stage.sessionId)} icon="voice">
              {c.reconnect}
            </Button>
          </div>
        </Notice>
      ) : null}

      {stage.name === "text" && stage.ended ? endedCard(stage.token.session.id, stage.ended.reason, stage.ended.summaryPending) : null}
      {stage.name === "ended" ? endedCard(stage.sessionId, stage.reason, stage.summaryPending) : null}
    </div>
  );
}
