"use client";
import { useEffect } from "react";

/** „Atem“ – Violas Gestalt (packages/brand). Lädt das Web Component nur im Browser. */
export function Atem({ label }: { label: string }) {
  useEffect(() => {
    void import("@fermata/brand/atem.js");
  }, []);
  return (
    <div className="atem-stage">
      <fermata-atem state="ruhig" label={label} />
    </div>
  );
}
