"use client";
import { useState } from "react";
import { Button } from "@/components/ui";
import { adminCommon as c } from "@/copy/admin-common";

/** Kopiert den Text eines Elements (id) in die Zwischenablage. */
export function CopyButton({ targetId, label }: { targetId: string; label?: string }) {
  const [state, setState] = useState<"idle" | "ok" | "error">("idle");
  return (
    <div className="cluster">
      <Button
        variant="secondary"
        size="sm"
        icon="copy"
        onClick={async () => {
          const el = document.getElementById(targetId);
          const text = el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement ? el.value : (el?.textContent ?? "");
          try {
            await navigator.clipboard.writeText(text);
            setState("ok");
          } catch {
            setState("error");
          }
        }}
      >
        {label ?? c.copy}
      </Button>
      <span role="status" className="muted text-sm">
        {state === "ok" ? c.copied : state === "error" ? c.copyFailed : ""}
      </span>
    </div>
  );
}
