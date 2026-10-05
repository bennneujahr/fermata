import type { Metadata } from "next";
import { Fermate } from "@/components/ui/Icon";
import { offline } from "@/copy/help";

export const metadata: Metadata = { title: offline.title };

// Wird vom Service Worker vorgehalten und ohne Verbindung gezeigt (ohne JavaScript nutzbar).
export default function OfflinePage() {
  return (
    <div className="focus-card stack">
      <Fermate className="hero-mark" />
      <h1>{offline.title}</h1>
      <p className="lead">{offline.lead}</p>
      <p>
        <a href="tel:110" className="call call--emergency">
          {offline.emergency}
        </a>
      </p>
      <p>
        <a href="/start" className="btn btn--secondary">
          {offline.retry}
        </a>
      </p>
    </div>
  );
}
