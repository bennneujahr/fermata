import type { Metadata } from "next";
import { Badge, Card, PageHeader } from "@/components/ui";
import { admin } from "@/copy/admin";
import { adminRpc, type AdminSettingRow } from "@/lib/admin";
import { formatDateTime } from "@/lib/format";
import { SettingForm } from "./SettingForm";

export const metadata: Metadata = { title: admin.settings.title };

export default async function AdminSettings() {
  const c = admin.settings;
  const rows = await adminRpc<AdminSettingRow[]>("admin_settings");
  const groups = new Map<string, AdminSettingRow[]>();
  for (const r of rows) groups.set(r.category, [...(groups.get(r.category) ?? []), r]);
  return (
    <>
      <PageHeader title={c.title} lead={c.lead} />
      {[...groups.entries()].map(([cat, items]) => (
        <Card key={cat} title={cat} headingLevel={2} id={`kategorie-${cat}`}>
          <div>
            {items.map((s) => (
              <div className="setting" key={s.key}>
                <div className="stack stack-sm">
                  <p className="setting__key">{s.key}</p>
                  <p className="soft text-sm">{s.description}</p>
                  <div className="cluster">
                    {s.is_public ? <Badge>{c.public}</Badge> : null}
                    {s.description.includes("PLATZHALTER") ? <Badge tone="warning">{c.placeholder}</Badge> : null}
                    <span className="muted text-sm">{c.updated(formatDateTime(s.updated_at))}</span>
                  </div>
                </div>
                <SettingForm settingKey={s.key} value={JSON.stringify(s.value)} />
              </div>
            ))}
          </div>
        </Card>
      ))}
    </>
  );
}
