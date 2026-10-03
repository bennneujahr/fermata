import type { Metadata } from "next";
import { isPlaceholder, placeholderAnchor, placeholderQuestion } from "@/app/admin/_lib/placeholders";
import { FilterLinks } from "@/components/admin/FilterLinks";
import { Badge, Card, Icon, Notice, PageHeader } from "@/components/ui";
import { admin } from "@/copy/admin";
import { adminSettings as s } from "@/copy/admin-einstellungen";
import { adminRpc, type AdminSettingRow } from "@/lib/admin";
import { formatDateTime } from "@/lib/format";
import { SettingForm } from "./SettingForm";

export const metadata: Metadata = { title: admin.settings.title };

// Platzhalter-Fragen stehen in docs/PLATZHALTER.md im Repository (A2: GitHub bennneujahr/fermata).
const DOCS_URL = "https://github.com/bennneujahr/fermata/blob/main/docs/PLATZHALTER.md";

export default async function AdminSettings({ searchParams }: { searchParams: Promise<{ platzhalter?: string }> }) {
  const { platzhalter } = await searchParams;
  const only = platzhalter === "1";
  const c = admin.settings;
  const all = await adminRpc<AdminSettingRow[]>("admin_settings");
  const placeholders = all.filter((r) => isPlaceholder(r.description));
  const rows = only ? placeholders : all;
  const groups = new Map<string, AdminSettingRow[]>();
  for (const r of rows) groups.set(r.category, [...(groups.get(r.category) ?? []), r]);
  const cats = [...groups.keys()].sort((a, b) => (s.categories[a] ?? a).localeCompare(s.categories[b] ?? b, "de"));
  return (
    <>
      <PageHeader title={c.title} lead={c.lead} />
      <Notice tone={placeholders.length ? "warning" : "success"} title={s.placeholdersTitle}>
        <p>{placeholders.length ? s.placeholdersLead(placeholders.length) : s.placeholdersNone}</p>
        <p className="text-sm">
          <a href={DOCS_URL} rel="noreferrer" target="_blank">
            {s.docsHint}
          </a>
        </p>
      </Notice>
      <FilterLinks
        label={s.placeholdersTitle}
        items={[
          { href: "/admin/einstellungen", label: s.showAll, current: !only },
          { href: "/admin/einstellungen?platzhalter=1", label: s.onlyPlaceholders, current: only },
        ]}
      />
      <nav aria-label={s.jump} className="card card--sunk">
        <p className="eyebrow">{s.jump}</p>
        <ul className="setting-jump">
          {cats.map((cat) => (
            <li key={cat}>
              <a href={`#kategorie-${cat}`}>
                {s.categories[cat] ?? cat} <span className="muted">({groups.get(cat)!.length})</span>
              </a>
            </li>
          ))}
        </ul>
      </nav>
      {cats.map((cat) => {
        const items = groups.get(cat)!;
        return (
          <Card key={cat} title={s.categories[cat] ?? cat} eyebrow={`${cat} · ${s.count(items.length)}`} headingLevel={2} id={`kategorie-${cat}`}>
            <div>
              {items.map((row) => {
                const ph = isPlaceholder(row.description);
                const q = ph ? placeholderQuestion(row.key, row.description) : null;
                return (
                  <div className={["setting", ph && "placeholder-mark"].filter(Boolean).join(" ")} key={row.key}>
                    <div className="stack stack-sm">
                      <p className="setting__key">{row.key}</p>
                      <p className="soft text-sm">{row.description}</p>
                      <div className="cluster">
                        {ph ? (
                          <Badge tone="warning">
                            <Icon name="warning" size={14} /> {c.placeholder}
                          </Badge>
                        ) : null}
                        {q ? (
                          <a className="text-sm" href={`${DOCS_URL}#${placeholderAnchor(q)}`} rel="noreferrer" target="_blank">
                            {s.questionLink(q)}
                          </a>
                        ) : null}
                        {row.is_public ? <Badge>{c.public}</Badge> : null}
                        <span className="muted text-sm">{c.updated(formatDateTime(row.updated_at))}</span>
                      </div>
                    </div>
                    <SettingForm settingKey={row.key} value={JSON.stringify(row.value)} />
                  </div>
                );
              })}
            </div>
          </Card>
        );
      })}
    </>
  );
}
