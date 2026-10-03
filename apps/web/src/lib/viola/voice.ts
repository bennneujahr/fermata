"use client";
// Sprachgespräch: eine Verbindung zum LiveKit-Raum (oder zur Attrappe für lokale Läufe und Tests).
// Die Oberfläche kennt nur dieses Interface; livekit-client wird erst beim Verbinden geladen.
import { decodeDataPacket, type ViolaEvent } from "./types";

export const DATA_TOPIC = "viola";

export interface Caption {
  id: string;
  speaker: "viola" | "person";
  text: string;
  final: boolean;
}

export type DisconnectKind = "left" | "lost" | "agent_left";

export interface VoiceHandlers {
  onAgentJoined: () => void;
  onAgentState: (state: string) => void;
  onEvent: (ev: ViolaEvent) => void;
  onCaption: (c: Caption) => void;
  /** Ton des Agenten für die Animation (nur Analyse, keine Aufnahme). */
  onAgentAudio: (stream: MediaStream | null) => void;
  onAudioBlocked: (blocked: boolean) => void;
  onDisconnected: (kind: DisconnectKind) => void;
}

export interface VoiceConnection {
  connect: (url: string, token: string) => Promise<void>;
  setMicEnabled: (on: boolean) => Promise<void>;
  send: (message: Record<string, unknown>) => Promise<void>;
  startAudio: () => Promise<void>;
  disconnect: () => Promise<void>;
}

export type MicProblem = "insecure" | "unsupported" | "denied" | "no_device" | "busy" | "unknown";

/** Vorab-Prüfung des Mikrofons: fragt die Erlaubnis ab und gibt das Mikrofon sofort wieder frei. */
export async function checkMicrophone(): Promise<{ ok: true } | { ok: false; problem: MicProblem }> {
  if (typeof window === "undefined") return { ok: false, problem: "unsupported" };
  if (!window.isSecureContext) return { ok: false, problem: "insecure" };
  if (!navigator.mediaDevices?.getUserMedia) return { ok: false, problem: "unsupported" };
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    for (const t of stream.getTracks()) t.stop();
    return { ok: true };
  } catch (err) {
    return { ok: false, problem: micProblemOf(err) };
  }
}

export function micProblemOf(err: unknown): MicProblem {
  const name = (err as { name?: string } | null)?.name ?? "";
  if (name === "NotAllowedError" || name === "SecurityError" || name === "PermissionDeniedError") return "denied";
  if (name === "NotFoundError" || name === "OverconstrainedError" || name === "DevicesNotFoundError") return "no_device";
  if (name === "NotReadableError" || name === "AbortError" || name === "TrackStartError") return "busy";
  return "unknown";
}

/** Stand der Mikrofon-Erlaubnis, soweit der Browser ihn verrät. */
export async function microphonePermission(): Promise<"granted" | "denied" | "prompt" | "unknown"> {
  try {
    const status = await navigator.permissions.query({ name: "microphone" as PermissionName });
    return status.state;
  } catch {
    return "unknown";
  }
}

/** Verbindung über livekit-client. */
export async function createLiveKitConnection(h: VoiceHandlers): Promise<VoiceConnection> {
  const lk = await import("livekit-client");
  const room = new lk.Room({
    adaptiveStream: false,
    dynacast: false,
    audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  const elements = new Set<HTMLMediaElement>();
  let leaving = false;
  let agentSeen = false;

  const announceAgent = (p: { isAgent: boolean; attributes: Readonly<Record<string, string>> }) => {
    if (!p.isAgent) return;
    if (!agentSeen) {
      agentSeen = true;
      h.onAgentJoined();
    }
    const s = p.attributes["lk.agent.state"];
    if (s) h.onAgentState(s);
  };

  room.on(lk.RoomEvent.ParticipantConnected, (p) => announceAgent(p));
  room.on(lk.RoomEvent.ParticipantAttributesChanged, (changed, p) => {
    if (p.isAgent && changed["lk.agent.state"]) h.onAgentState(changed["lk.agent.state"]);
  });
  room.on(lk.RoomEvent.ParticipantDisconnected, (p) => {
    if (p.isAgent && !leaving) h.onDisconnected("agent_left");
  });
  room.on(lk.RoomEvent.TrackSubscribed, (track, _pub, participant) => {
    if (track.kind !== lk.Track.Kind.Audio) return;
    const el = track.attach();
    el.classList.add("visually-hidden");
    document.body.appendChild(el);
    elements.add(el);
    if (participant.isAgent) h.onAgentAudio(new MediaStream([track.mediaStreamTrack]));
  });
  room.on(lk.RoomEvent.TrackUnsubscribed, (track) => {
    for (const el of track.detach()) {
      elements.delete(el);
      el.remove();
    }
  });
  room.on(lk.RoomEvent.DataReceived, (payload, _participant, _kind, topic) => {
    if (topic !== DATA_TOPIC) return;
    const ev = decodeDataPacket(payload);
    if (ev) h.onEvent(ev);
  });
  room.on(lk.RoomEvent.AudioPlaybackStatusChanged, () => h.onAudioBlocked(!room.canPlaybackAudio));
  room.on(lk.RoomEvent.Disconnected, () => {
    for (const el of elements) el.remove();
    elements.clear();
    h.onAgentAudio(null);
    h.onDisconnected(leaving ? "left" : "lost");
  });
  // Untertitel: LiveKit Agents schickt Transkriptionen als Text-Streams (nur an die Person, nicht gespeichert).
  room.registerTextStreamHandler("lk.transcription", async (reader, info) => {
    const attrs = reader.info.attributes ?? {};
    const trackId = attrs["lk.transcribed_track_id"];
    const own = info.identity === room.localParticipant.identity || (trackId ? room.localParticipant.trackPublications.has(trackId) : false);
    const speaker = own ? "person" : "viola";
    let text = "";
    for await (const chunk of reader) {
      text += chunk;
      h.onCaption({ id: reader.info.id, speaker, text, final: false });
    }
    h.onCaption({ id: reader.info.id, speaker, text, final: true });
  });

  return {
    async connect(url, token) {
      await room.connect(url, token, { autoSubscribe: true });
      for (const p of room.remoteParticipants.values()) announceAgent(p);
      await room.localParticipant.setMicrophoneEnabled(true);
      h.onAudioBlocked(!room.canPlaybackAudio);
    },
    async setMicEnabled(on) {
      await room.localParticipant.setMicrophoneEnabled(on);
    },
    async send(message) {
      await room.localParticipant.publishData(new TextEncoder().encode(JSON.stringify(message)), { reliable: true, topic: DATA_TOPIC });
    },
    async startAudio() {
      await room.startAudio();
      h.onAudioBlocked(!room.canPlaybackAudio);
    },
    async disconnect() {
      leaving = true;
      await room.disconnect(true);
    },
  };
}
