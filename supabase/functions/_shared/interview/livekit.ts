// LiveKit-Zugang (JWT, HS256) für ein Gespräch mit Viola. Raumname = Sitzungs-ID.
// Der Agent wird über die Raumkonfiguration im Token beauftragt (agent dispatch); das funktioniert mit
// LiveKit Cloud (Weg A/B) und mit einem selbst betriebenen LiveKit-Server (Weg C) gleich.
// Keine Aufnahme: Die Raumkonfiguration enthält bewusst keine Egress-Angaben.
import { signHs256 } from "./jwt.ts";

export type LiveKitTokenInput = {
  apiKey: string;
  apiSecret: string;
  room: string;
  identity: string;
  ttlSeconds: number;
  agentName: string;
  agentMetadata: Record<string, unknown>;
  now?: number;
};

export async function createLiveKitToken(input: LiveKitTokenInput): Promise<string> {
  const now = input.now ?? Math.floor(Date.now() / 1000);
  return await signHs256(
    {
      iss: input.apiKey,
      sub: input.identity,
      nbf: now - 5,
      exp: now + input.ttlSeconds,
      kind: "standard",
      video: {
        room: input.room,
        roomJoin: true,
        canPublish: true,
        canSubscribe: true,
        canPublishData: true,
        // Nur das Mikrofon: keine Kamera, keine Bildschirmfreigabe.
        canPublishSources: ["microphone"],
        canUpdateOwnMetadata: false,
      },
      roomConfig: {
        name: input.room,
        emptyTimeout: 120,
        departureTimeout: 20,
        maxParticipants: 2,
        agents: [{ agentName: input.agentName, metadata: JSON.stringify(input.agentMetadata) }],
      },
    },
    input.apiSecret,
  );
}
