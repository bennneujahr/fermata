// Kopf eines Schritts im Kündigungs- und Widerrufsablauf („Schritt 1 von 2 · Ihre Angaben“).
import "./mitgliedschaft.css";

export function FlowStep({ n, eyebrow, title, id }: { n: number; eyebrow: string; title: string; id?: string }) {
  return (
    <div className="flow-step">
      <span className="flow-step__dot" aria-hidden="true">
        {n}
      </span>
      <div className="flow-step__text">
        <p className="flow-step__eyebrow">{eyebrow}</p>
        <h2 className="flow-step__title" id={id}>
          {title}
        </h2>
      </div>
    </div>
  );
}
