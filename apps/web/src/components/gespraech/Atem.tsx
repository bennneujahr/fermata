"use client";
import { useEffect, useRef } from "react";
import type { AtemState } from "@/lib/viola/types";

interface AtemElement extends HTMLElement {
  connectAudio?: (source: MediaStream | HTMLMediaElement) => void;
  disconnectAudio?: () => void;
}

/**
 * „Atem“ – Violas Gestalt (packages/brand). Lädt das Web Component nur im Browser.
 * state folgt dem Zustand des Agenten; audio legt die Lautstärke von Violas Stimme auf die Animation
 * (nur Analyse im Browser, keine Aufnahme).
 */
export function Atem({ state = "ruhig", label, audio, size = "md" }: { state?: AtemState; label?: string; audio?: MediaStream | null; size?: "md" | "lg" }) {
  const ref = useRef<AtemElement>(null);

  useEffect(() => {
    void import("@fermata/brand/atem.js");
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let cancelled = false;
    void customElements.whenDefined("fermata-atem").then(() => {
      if (cancelled) return;
      if (audio) el.connectAudio?.(audio);
      else el.disconnectAudio?.();
    });
    return () => {
      cancelled = true;
      el.disconnectAudio?.();
    };
  }, [audio]);

  return (
    <div className={["atem-stage", size === "lg" && "atem-stage--lg"].filter(Boolean).join(" ")}>
      <fermata-atem ref={ref} state={state} label={label} />
    </div>
  );
}
