"use client";
import { useEffect, useId, useRef, type ReactNode } from "react";

/**
 * Modaler Dialog auf Basis von <dialog> (Fokusfalle, Escape und Hintergrund-Sperre macht der Browser).
 * open steuert die Anzeige; onClose wird bei Escape und „Abbrechen“ gerufen.
 */
export function Dialog({
  open,
  onClose,
  title,
  children,
  actions,
  describedBy,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  describedBy?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  const opener = useRef<Element | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      opener.current = document.activeElement;
      d.showModal();
    } else if (!open && d.open) {
      d.close();
      if (opener.current instanceof HTMLElement) opener.current.focus();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby={`${id}-title`}
      aria-describedby={describedBy}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="dialog__inner">
        <h2 id={`${id}-title`}>{title}</h2>
        {children}
        {actions ? <div className="dialog__actions">{actions}</div> : null}
      </div>
    </dialog>
  );
}
