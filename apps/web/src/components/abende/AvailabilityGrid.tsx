"use client";
// Raster „Freie Abende“: Spalten = Tage einer Woche, Zeilen = halbe Stunden von 17 bis 23 Uhr.
// Maus: klicken oder ziehen. Touch: tippen. Tastatur: ein Tabstopp je Woche, Pfeiltasten, Leertaste/Enter.
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition, type KeyboardEvent, type PointerEvent } from "react";
import { setAvailabilityAction } from "@/app/actions/zeiten";
import { Button, Notice } from "@/components/ui";
import type { AddressForm } from "@/copy/form";
import { zeiten } from "@/copy/zeiten";
import {
  cellInPast,
  cellKey,
  cellsToWindows,
  checkWindows,
  DEFAULT_RULES,
  SLOT_TIMES,
  slotEnd,
  weeksOf,
  type GridRules,
} from "@/lib/availability";
import { formatDateKeyLong, formatDateKeyShort, weekdayOfKey } from "@/lib/berlin";

export function AvailabilityGrid({
  periodId,
  days,
  initial,
  now,
  open,
  form,
  rules = DEFAULT_RULES,
}: {
  periodId: string;
  days: string[];
  initial: string[];
  now: string;
  open: boolean;
  form: AddressForm;
  rules?: GridRules;
}) {
  const c = zeiten(form);
  const router = useRouter();
  const nowDate = useMemo(() => new Date(now), [now]);
  const [saved, setSaved] = useState<Set<string>>(() => new Set(initial));
  const [cells, setCells] = useState<Set<string>>(() => new Set(initial));
  const [focus, setFocus] = useState<Record<number, { col: number; row: number }>>({});
  const [msg, setMsg] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const paint = useRef<{ mode: "add" | "remove"; active: boolean }>({ mode: "add", active: false });
  const lastPointer = useRef<string>("");
  const refs = useRef(new Map<string, HTMLButtonElement>());

  const weeks = useMemo(() => weeksOf(days, weekdayOfKey), [days]);
  const windows = useMemo(() => cellsToWindows(cells, days), [cells, days]);
  const issues = useMemo(() => checkWindows(windows, rules), [windows, rules]);
  const shortCells = useMemo(() => {
    const s = new Set<string>();
    for (const i of issues) {
      if (i.kind !== "too_short") continue;
      for (const t of SLOT_TIMES) if (t >= i.window.from && t < i.window.to) s.add(cellKey(i.window.date, t));
    }
    return s;
  }, [issues]);
  const dirty = useMemo(() => cells.size !== saved.size || [...cells].some((k) => !saved.has(k)), [cells, saved]);

  const isPast = (day: string, t: string) => cellInPast(day, t, nowDate);
  const editable = (day: string, t: string) => open && !isPast(day, t) && !pending;

  const setCell = (key: string, on: boolean) =>
    setCells((prev) => {
      if (prev.has(key) === on) return prev;
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });

  const toggle = (day: string, t: string) => {
    if (!editable(day, t)) return;
    setMsg(null);
    const k = cellKey(day, t);
    setCell(k, !cells.has(k));
  };

  const toggleDay = (day: string) => {
    const keys = SLOT_TIMES.filter((t) => editable(day, t)).map((t) => cellKey(day, t));
    if (!keys.length) return;
    setMsg(null);
    const all = keys.every((k) => cells.has(k));
    setCells((prev) => {
      const next = new Set(prev);
      for (const k of keys) {
        if (all) next.delete(k);
        else next.add(k);
      }
      return next;
    });
  };

  const onPointerDown = (e: PointerEvent<HTMLButtonElement>, day: string, t: string) => {
    lastPointer.current = e.pointerType;
    if (e.pointerType !== "mouse" || e.button !== 0 || !editable(day, t)) return;
    const k = cellKey(day, t);
    paint.current = { mode: cells.has(k) ? "remove" : "add", active: true };
    setMsg(null);
    setCell(k, paint.current.mode === "add");
  };

  const onPointerEnter = (day: string, t: string) => {
    if (!paint.current.active || !editable(day, t)) return;
    setCell(cellKey(day, t), paint.current.mode === "add");
  };

  const stopPaint = () => {
    paint.current.active = false;
  };

  const focusCell = (week: number, col: number, row: number) => {
    const day = weeks[week]?.[col];
    const t = SLOT_TIMES[row];
    if (!day || !t) return;
    setFocus((f) => ({ ...f, [week]: { col, row } }));
    refs.current.get(cellKey(day, t))?.focus();
  };

  const onKey = (e: KeyboardEvent<HTMLButtonElement>, week: number, col: number, row: number) => {
    const cols = weeks[week]?.length ?? 0;
    const rows = SLOT_TIMES.length;
    const moves: Record<string, [number, number]> = {
      ArrowUp: [col, Math.max(0, row - 1)],
      ArrowDown: [col, Math.min(rows - 1, row + 1)],
      ArrowLeft: [Math.max(0, col - 1), row],
      ArrowRight: [Math.min(cols - 1, col + 1), row],
      Home: [col, 0],
      End: [col, rows - 1],
    };
    const m = moves[e.key];
    if (m) {
      e.preventDefault();
      focusCell(week, m[0], m[1]);
    }
  };

  const save = () => {
    setMsg(null);
    start(async () => {
      const res = await setAvailabilityAction(
        periodId,
        windows.map((w) => ({ starts_at: w.starts_at, ends_at: w.ends_at })),
      );
      if (!res.ok) {
        setMsg({ tone: "danger", text: c.errors[res.error] ?? c.errors.generic! });
        return;
      }
      setSaved(new Set(cells));
      setMsg({ tone: "success", text: c.saved });
      router.refresh();
    });
  };

  return (
    <div className="stack stack-lg availability" onPointerUp={stopPaint} onPointerLeave={stopPaint}>
      <div className="availability__weeks">
        {weeks.map((week, w) => {
          const tab = focus[w] ?? { col: 0, row: 0 };
          const weekName = c.weekLabel(formatDateKeyShort(week[0]!), formatDateKeyShort(week[week.length - 1]!));
          return (
            <div className="availability__week" key={week[0]}>
              <table className="avail-table" aria-describedby="raster-hilfe">
                <caption className="avail-table__caption">{weekName}</caption>
                <thead>
                  <tr>
                    <td className="avail-table__corner" />
                    {week.map((day) => {
                      const label = formatDateKeyShort(day);
                      const [wd, rest] = label.split(", ");
                      const any = SLOT_TIMES.some((t) => editable(day, t));
                      return (
                        <th scope="col" key={day} className="avail-table__day">
                          <button
                            type="button"
                            className="avail-day"
                            onClick={() => toggleDay(day)}
                            disabled={!any}
                            aria-label={c.wholeEveningLabel(label)}
                          >
                            <span className="avail-day__wd">{wd},</span>
                            <span className="avail-day__date">{rest}</span>
                          </button>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {SLOT_TIMES.map((t, row) => (
                    <tr key={t}>
                      <th scope="row" className="avail-table__time">
                        {t.endsWith(":00") ? t : <span className="avail-table__half">{t}</span>}
                      </th>
                      {week.map((day, col) => {
                        const k = cellKey(day, t);
                        const on = cells.has(k);
                        const past = isPast(day, t);
                        const isTab = tab.col === col && tab.row === row;
                        return (
                          <td key={k} className="avail-table__cell">
                            <button
                              type="button"
                              ref={(el) => {
                                if (el) refs.current.set(k, el);
                                else refs.current.delete(k);
                              }}
                              className="avail-cell"
                              data-on={on || undefined}
                              data-short={shortCells.has(k) || undefined}
                              data-past={past || undefined}
                              aria-pressed={on}
                              aria-disabled={!editable(day, t) || undefined}
                              aria-label={c.cellLabel(formatDateKeyLong(day), t, slotEnd(t))}
                              tabIndex={isTab ? 0 : -1}
                              onPointerDown={(e) => onPointerDown(e, day, t)}
                              onPointerEnter={() => onPointerEnter(day, t)}
                              onClick={(e) => {
                                // Maus schaltet schon beim Drücken (für Ziehen); Tastatur und Touch hier.
                                if (lastPointer.current === "mouse" && e.detail > 0) return;
                                toggle(day, t);
                              }}
                              onKeyDown={(e) => onKey(e, w, col, row)}
                              onFocus={() => setFocus((f) => ({ ...f, [w]: { col, row } }))}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>

      <section className="card card--sunk stack" aria-labelledby="fenster-titel">
        <h2 className="card__title" id="fenster-titel">
          {c.summaryTitle}
        </h2>
        {windows.length ? (
          <ul className="list-plain window-list">
            {windows.map((wdw) => {
              const short = issues.some((i) => i.kind === "too_short" && i.window.starts_at === wdw.starts_at);
              const day = formatDateKeyLong(wdw.date);
              return (
                <li key={wdw.starts_at} className="window-list__item" data-short={short || undefined}>
                  {short ? c.tooShort(day, wdw.from, wdw.to) : c.summaryWindow(day, wdw.from, wdw.to)}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="muted">{c.summaryEmpty}</p>
        )}
        {issues.some((i) => i.kind === "too_many") ? (
          <p className="field__error">{c.tooMany(windows.length, rules.maxWindows)}</p>
        ) : null}
        {msg ? (
          <Notice tone={msg.tone} live={msg.tone === "danger" ? "assertive" : "polite"}>
            {msg.text}
          </Notice>
        ) : null}
        {open ? (
          <div className="cluster">
            <Button onClick={save} loading={pending} disabled={!dirty || issues.length > 0} icon="check">
              {pending ? c.saving : c.save}
            </Button>
            {dirty ? (
              <Button
                variant="quiet"
                onClick={() => {
                  setCells(new Set(saved));
                  setMsg(null);
                }}
                disabled={pending}
              >
                {c.reset}
              </Button>
            ) : null}
            {dirty ? <span className="muted text-sm">{c.unsaved}</span> : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}
