"use client";
import { useState, useTransition } from "react";
import { revokeConsentAction } from "@/app/actions/account";
import { Button, Dialog, Notice } from "@/components/ui";
import { actions, errors } from "@/copy/common";

export function RevokeButton({ kind, label, title, text, confirmLabel, doneLabel }: { kind: string; label: string; title: string; text: string; confirmLabel: string; doneLabel: string }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<"ok" | "error" | null>(null);
  return (
    <>
      <Button variant="quiet" size="sm" onClick={() => setOpen(true)}>
        {label}
      </Button>
      {result === "ok" ? <span role="status" className="muted text-sm">{doneLabel}</span> : null}
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={title}
        actions={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              {actions.cancel}
            </Button>
            <Button
              variant="danger"
              loading={pending}
              onClick={() =>
                start(async () => {
                  const r = await revokeConsentAction(kind);
                  setResult(r.ok ? "ok" : "error");
                  setOpen(false);
                })
              }
            >
              {confirmLabel}
            </Button>
          </>
        }
      >
        <p className="soft">{text}</p>
        {result === "error" ? <Notice tone="danger">{errors.generic()}</Notice> : null}
      </Dialog>
    </>
  );
}
