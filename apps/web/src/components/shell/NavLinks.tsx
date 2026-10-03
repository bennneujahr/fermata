"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/ui/Icon";

export interface NavItem {
  href: string;
  label: string;
  icon: IconName;
}

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function TopNav({ items, label }: { items: NavItem[]; label: string }) {
  const pathname = usePathname();
  return (
    <nav className="topnav" aria-label={label}>
      <ul className="topnav__list">
        {items.map((i) => (
          <li key={i.href}>
            <Link href={i.href} className="topnav__link" aria-current={isActive(pathname, i.href) ? "page" : undefined}>
              {i.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function TabBar({ items, label }: { items: NavItem[]; label: string }) {
  const pathname = usePathname();
  return (
    <nav className="tabbar" aria-label={label}>
      <ul className="tabbar__list">
        {items.map((i) => (
          <li key={i.href}>
            <Link href={i.href} className="tabbar__link" aria-current={isActive(pathname, i.href) ? "page" : undefined}>
              <Icon name={i.icon} className="tabbar__icon" />
              <span>{i.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function SideNav({ items, label }: { items: NavItem[]; label: string }) {
  const pathname = usePathname();
  return (
    <nav className="admin-nav" aria-label={label}>
      <ul className="admin-nav__list">
        {items.map((i) => (
          <li key={i.href}>
            <Link
              href={i.href}
              className="admin-nav__link"
              aria-current={(i.href === "/admin" ? pathname === "/admin" : isActive(pathname, i.href)) ? "page" : undefined}
            >
              <Icon name={i.icon} size={18} />
              <span>{i.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
