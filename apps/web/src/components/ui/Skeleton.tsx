/** Platzhalter beim Laden. Für Screenreader nur ein Satz („Wird geladen …“). */
export function Skeleton({ lines = 3, label, title }: { lines?: number; label: string; title?: boolean }) {
  return (
    <div className="skeleton" role="status" aria-live="polite">
      <span className="visually-hidden">{label}</span>
      {title ? <span className="skeleton__line skeleton__line--title" aria-hidden="true" /> : null}
      {Array.from({ length: lines }, (_, i) => (
        <span key={i} className="skeleton__line" aria-hidden="true" />
      ))}
    </div>
  );
}
