import type { ReactNode } from "react";
import { SubNav } from "@/components/admin/SubNav";
import { adminCommon } from "@/copy/admin-common";
import { adminVenues as c } from "@/copy/admin-lokale";

export default function VenuesLayout({ children }: { children: ReactNode }) {
  return (
    <div className="stack">
      <SubNav
        label={`${c.title}: ${adminCommon.subnav}`}
        items={[
          { href: "/admin/lokale", label: c.sub.venues, fallback: true },
          { href: "/admin/lokale/zeitraeume", label: c.sub.periods },
          { href: "/admin/lokale/abende", label: c.sub.evenings },
        ]}
      />
      {children}
    </div>
  );
}
