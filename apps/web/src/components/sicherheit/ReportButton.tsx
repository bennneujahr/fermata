"use client";
// Wiederverwendbarer Knopf „Etwas melden“ mit Dialog (api.report). Für Abende, Termine, Gespräch, Konto – überall.
// Beispiel (Abend-Seite): <ReportButton form={form} eveningId={id} eveningLabel="Sa., 10.10., 19:30 · Café am See" counterpartName="Jonas" />
// Ohne JavaScript bzw. als Link: /sicherheit/melden?abend=<id> (gleiches Formular als eigene Seite).
import { useState } from "react";
import { Button, Dialog, type ButtonVariant } from "@/components/ui";
import type { AddressForm } from "@/copy/form";
import { report as reportCopy } from "@/copy/sicherheit";
import { ReportForm } from "./ReportForm";

export function ReportButton({
  form = "sie",
  eveningId,
  eveningLabel,
  counterpartName = null,
  label,
  variant = "secondary",
  size,
  police,
}: {
  form?: AddressForm;
  /** Meldung zu diesem Abend (Bereich „abend“, betrifft auf Wunsch das Gegenüber). */
  eveningId?: string;
  /** Kurze Beschreibung des Abends für die Anzeige, z. B. Datum und Lokal. */
  eveningLabel?: string;
  counterpartName?: string | null;
  label?: string;
  variant?: ButtonVariant;
  size?: "md" | "sm";
  police?: { number: string; tel: string };
}) {
  const c = reportCopy(form);
  const [open, setOpen] = useState(false);
  // Neuer Schlüssel bei jedem Öffnen: das Formular beginnt leer.
  const [round, setRound] = useState(0);
  const evening = eveningId ? { id: eveningId, label: eveningLabel ?? "", counterpartName } : null;
  return (
    <>
      <Button
        variant={variant}
        size={size}
        icon="flag"
        onClick={() => {
          setRound((r) => r + 1);
          setOpen(true);
        }}
        aria-haspopup="dialog"
      >
        {label ?? c.open}
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={c.dialogTitle} className="report-dialog">
        {open ? (
          <ReportForm
            key={round}
            form={form}
            evening={evening}
            police={police}
            onCancel={() => setOpen(false)}
            doneHeadingLevel={3}
          />
        ) : null}
      </Dialog>
    </>
  );
}
