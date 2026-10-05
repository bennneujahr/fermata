import Link from "next/link";

/** Filter als Links (ohne JavaScript, Zustand in der Adresse). */
export function FilterLinks({ label, items }: { label: string; items: { href: string; label: string; current: boolean }[] }) {
  return (
    <nav className="filter-links" aria-label={label}>
      <span className="filter-links__label" aria-hidden="true">
        {label}
      </span>
      <ul className="filter-links__list">
        {items.map((i) => (
          <li key={i.href}>
            <Link href={i.href} className="filter-links__link" aria-current={i.current ? "true" : undefined}>
              {i.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
