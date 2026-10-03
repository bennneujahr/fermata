import type { ReactNode } from "react";
import { SubNav } from "@/components/admin/SubNav";
import { adminCommon } from "@/copy/admin-common";
import { adminSafety as c } from "@/copy/admin-sicherheit";

export default function SafetyLayout({ children }: { children: ReactNode }) {
  return (
    <div className="stack">
      <SubNav
        label={`${c.title}: ${adminCommon.subnav}`}
        items={[
          { href: "/admin/sicherheit", label: c.sub.reports, exact: true, also: ["/admin/sicherheit/meldungen"] },
          { href: "/admin/sicherheit/hinweise", label: c.sub.flags },
          { href: "/admin/sicherheit/widersprueche", label: c.sub.appeals },
          { href: "/admin/sicherheit/sanktionen", label: c.sub.sanctions },
        ]}
      />
      {children}
    </div>
  );
}
