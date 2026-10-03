"use client";
// Attrappe für das Sprachgespräch (VIOLA_VOICE_MODE=fake, nie in production): verhält sich wie der
// LiveKit-Raum mit Viola, ohne Netz. Für lokale Läufe und E2E-Tests; Steuerung über window.__violaFake.
import { parseViolaEvent } from "./types";
import type { VoiceConnection, VoiceHandlers } from "./voice";

export interface FakeControl {
  /** lk.agent.state des Agenten setzen (initializing, listening, thinking, speaking). */
  state: (s: string) => void;
  /** Datenpaket auf dem Topic „viola“ wie vom Agenten. */
  packet: (obj: Record<string, unknown>) => void;
  caption: (speaker: "viola" | "person", text: string) => void;
  /** Verbindung bricht ab (wie Netzverlust). */
  drop: () => void;
  /** Was die Oberfläche an den Agenten geschickt hat. */
  sent: Record<string, unknown>[];
  mic: boolean;
  connected: boolean;
}

declare global {
  interface Window {
    __violaFake?: FakeControl;
  }
}

const GREETING = "Guten Tag. Ich bin Viola, eine künstliche Intelligenz von Fermata, kein Mensch.";

export function createFakeConnection(h: VoiceHandlers): VoiceConnection {
  let ctx: AudioContext | null = null;
  let captionId = 0;
  const timers: number[] = [];
  const control: FakeControl = {
    state: (s) => h.onAgentState(s),
    packet: (obj) => {
      const ev = parseViolaEvent(obj);
      if (ev) h.onEvent(ev);
    },
    caption: (speaker, text) => h.onCaption({ id: `fake-${++captionId}`, speaker, text, final: true }),
    drop: () => {
      control.connected = false;
      h.onAgentAudio(null);
      h.onDisconnected("lost");
    },
    sent: [],
    mic: false,
    connected: false,
  };
  window.__violaFake = control;

  const agentAudio = (): MediaStream | null => {
    try {
      ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.value = 0.25;
      const dest = ctx.createMediaStreamDestination();
      osc.connect(gain).connect(dest);
      osc.start();
      return dest.stream;
    } catch {
      return null;
    }
  };

  return {
    async connect() {
      await new Promise((r) => setTimeout(r, 120));
      control.connected = true;
      control.mic = true;
      h.onAgentJoined();
      h.onAgentState("initializing");
      h.onAgentAudio(agentAudio());
      timers.push(
        window.setTimeout(() => {
          if (!control.connected) return;
          h.onAgentState("speaking");
          h.onEvent({ type: "ai_notice", spoken: true });
          control.caption("viola", GREETING);
        }, 300),
        window.setTimeout(() => {
          if (control.connected) h.onAgentState("listening");
        }, 1500),
      );
    },
    async setMicEnabled(on) {
      control.mic = on;
    },
    async send(message) {
      control.sent.push(message);
    },
    async startAudio() {
      h.onAudioBlocked(false);
    },
    async disconnect() {
      for (const t of timers) window.clearTimeout(t);
      control.connected = false;
      h.onAgentAudio(null);
      if (ctx) await ctx.close().catch(() => undefined);
      h.onDisconnected("left");
    },
  };
}
