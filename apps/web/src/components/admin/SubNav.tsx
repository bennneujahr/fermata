"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export interface SubNavItem {
  href: string;
  label: string;
  /** Nur bei genau diesem Pfad aktiv (sonst auch Unterseiten). */
  exact?: boolean;
  /** Weitere Pfade (Präfixe), unter denen der Eintrag aktiv ist. */
  also?: string[];
  /** Aktiv, wenn kein anderer Eintrag aktiv ist und der Pfad mit href beginnt. */
  fallback?: boolean;
  count?: number | null;
}

function isActive(i: SubNavItem, pathname: string): boolean {
  if (i.fallback) return false;
  return (
    (i.exact ? pathname === i.href : pathname === i.href || pathname.startsWith(`${i.href}/`)) ||
    (i.also ?? []).some((p) => pathname === p || pathname.startsWith(`${p}/`))
  );
}

/** Unternavigation eines Admin-Bereichs (z. B. Sicherheit: Meldungen, Hinweise, Widersprüche, Sanktionen). */
export function SubNav({ items, label }: { items: SubNavItem[]; label: string }) {
  const pathname = usePathname();
  return (
    <nav className="admin-subnav" aria-label={label}>
      <ul className="admin-subnav__list">
        {items.map((i, n) => {
          const active = i.fallback
            ? !items.some((o, m) => m !== n && isActive(o, pathname)) && (pathname === i.href || pathname.startsWith(`${i.href}/`))
            : isActive(i, pathname);
          return (
            <li key={i.href}>
              <Link href={i.href} className="admin-subnav__link" aria-current={active ? "page" : undefined}>
                <span>{i.label}</span>
                {i.count ? <span className="admin-subnav__count">{i.count}</span> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
