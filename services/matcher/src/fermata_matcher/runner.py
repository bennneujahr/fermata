"""Ein Auswahl-Lauf von Anfang bis Ende (PLAN 2.3 Nr. 5).

Status von app.match_runs: scheduled → running → review (Benn prüft) oder failed.
Stufen: Pool → Embeddings → harte Filter → Art.-9-Prüfungen (nur Ja/Nein aus der Datenbank) → Regel-Scores →
Vorauswahl → LLM-Rubrik → Gesamtscore → Zuordnung und Lokal → Prüf-Agent → Speichern → Bericht.
"""

from __future__ import annotations

import json
import traceback
import uuid
from collections import Counter
from dataclasses import dataclass, field
from datetime import timedelta
from typing import Any

import psycopg

from . import __version__
from .art9 import SanitizeStats, address_mode, check_reasons, sanitize_text
from .assignment import AssignmentResult, assign
from .availability import BERLIN
from .config import MatchSettings
from .db import db_now, load_settings
from .embeddings import Embedder, EmbeddingStats, compute_embeddings, plan_embeddings, vector_literal
from .filters import REASON_ORDER, hard_filter, pair_limit_km
from .llm.client import LLMClient
from .llm.evaluate import LLMStats, PairEvaluation, evaluate_pairs, input_hash, pair_payload, person_input
from .llm.prompts import REVIEW_VERSION, RUBRIC_VERSION
from .llm.review import ReviewInput, review_pairings
from .llm.templates import template_reasons
from .models import PairInfo, Period, Person, Venue
from .pool import POOL_REASONS, eligible_user_ids, load_people, pair_history, wait_rounds
from .preselect import pre_score, top_n
from .report import StageTimer, cost_estimate, distribution
from .scoring import RuleScore, combine, rule_score, wait_bonus
from .venues import VenueChoice, choose_venue, initial_capacity

Pair = tuple[int, int]

ACTIVE_RUN_STATUSES = ("running", "review", "approved", "partially_approved")


class RunError(RuntimeError):
    pass


@dataclass
class RunOptions:
    llm: LLMClient | None = None
    embedder: Embedder | None = None
    art9_check: str = "batch"  # batch | single (Einzelaufruf der ursprünglichen Prüffunktionen)
    assignment_engine: str = "auto"
    max_venue_rounds: int = 3
    llm_backend_name: str = "fake"
    embedding_backend_name: str = "fake"


@dataclass
class RunOutcome:
    run_id: str
    status: str
    report: dict[str, Any] = field(default_factory=dict)


def _f(x: float | None) -> float | None:
    return None if x is None else round(float(x), 4)


class Runner:
    def __init__(self, conn: psycopg.Connection, options: RunOptions | None = None):
        self.conn = conn
        self.opt = options or RunOptions()
        self.timer = StageTimer()
        self.report: dict[str, Any] = {}

    # ------------------------------------------------------------------ Lauf anlegen oder übernehmen
    def resolve_run(
        self, *, period_id: str | None, next_due: bool, run_id: str | None, settings: MatchSettings
    ) -> tuple[str, str]:
        c = self.conn
        snapshot = json.dumps(settings.snapshot())
        with c.transaction():
            if run_id:
                row = c.execute(
                    """update app.match_runs set status = 'running', started_at = app.now(), settings_snapshot = %s::jsonb
                       where id = %s and status = 'scheduled' returning id::text, period_id::text""",
                    (snapshot, run_id),
                ).fetchone()
                if not row:
                    raise RunError(f"Lauf {run_id} ist nicht im Status scheduled.")
                return row[0], row[1]
            if next_due:
                row = c.execute(
                    """select id::text, period_id::text from app.match_runs
                       where status = 'scheduled' and scheduled_for <= app.now() and period_id is not null
                       order by scheduled_for, created_at limit 1 for update skip locked"""
                ).fetchone()
                if row:
                    c.execute(
                        """update app.match_runs set status = 'running', started_at = app.now(), settings_snapshot = %s::jsonb
                           where id = %s""",
                        (snapshot, row[0]),
                    )
                    return row[0], row[1]
                prow = c.execute(
                    """select p.id::text from app.availability_periods p
                       where p.answer_until <= app.now() and p.ends_on >= (app.now() at time zone 'Europe/Berlin')::date
                         and not exists (select 1 from app.match_runs r where r.period_id = p.id
                                         and r.status in ('scheduled', 'running', 'review', 'approved', 'partially_approved'))
                       order by p.starts_on limit 1"""
                ).fetchone()
                if not prow:
                    raise RunError("Kein fälliger Zeitraum: Antwortfrist noch offen oder Lauf schon vorhanden.")
                period_id = prow[0]
            assert period_id is not None
            if not c.execute("select 1 from app.availability_periods where id = %s", (period_id,)).fetchone():
                raise RunError(f"Zeitraum {period_id} gibt es nicht.")
            busy = c.execute(
                "select id::text, status from app.match_runs where period_id = %s and status = any(%s) limit 1",
                (period_id, list(ACTIVE_RUN_STATUSES)),
            ).fetchone()
            if busy:
                raise RunError(f"Für diesen Zeitraum gibt es schon einen Lauf ({busy[0]}, Status {busy[1]}).")
            sched = c.execute(
                """update app.match_runs set status = 'running', started_at = app.now(), settings_snapshot = %s::jsonb
                   where id = (select id from app.match_runs where period_id = %s and status = 'scheduled'
                               order by created_at limit 1 for update skip locked)
                   returning id::text""",
                (snapshot, period_id),
            ).fetchone()
            if sched:
                return sched[0], period_id
            new_id = c.execute(
                """insert into app.match_runs (period_id, scheduled_for, started_at, status, settings_snapshot)
                   values (%s, app.now(), app.now(), 'running', %s::jsonb) returning id::text""",
                (period_id, snapshot),
            ).fetchone()[0]
            return new_id, period_id

    # ------------------------------------------------------------------ Hauptablauf
    def run(self, *, period_id: str | None = None, next_due: bool = False, run_id: str | None = None) -> RunOutcome:
        settings = load_settings(self.conn)
        rid, pid = self.resolve_run(period_id=period_id, next_due=next_due, run_id=run_id, settings=settings)
        try:
            report = self._execute(rid, pid, settings)
        except Exception as e:
            self.report["fehler"] = {"art": type(e).__name__, "text": str(e)[:2000]}
            self.report["laufzeit_sekunden"] = self.timer.as_json()
            with self.conn.transaction():
                self.conn.execute(
                    """update app.match_runs set status = 'failed', finished_at = app.now(), error = %s, report = %s::jsonb
                       where id = %s""",
                    (
                        f"{type(e).__name__}: {e}\n{traceback.format_exc()[-1500:]}",
                        json.dumps(self.report, default=str),
                        rid,
                    ),
                )
            raise
        return RunOutcome(rid, "review", report)

    def _execute(self, run_id: str, period_id: str, s: MatchSettings) -> dict[str, Any]:
        c = self.conn
        now = db_now(c)
        run_year = now.astimezone(BERLIN).year
        p_row = c.execute(
            "select id::text, starts_on, ends_on from app.availability_periods where id = %s", (period_id,)
        ).fetchone()
        period = Period(p_row[0], p_row[1], p_row[2])
        rep = self.report
        rep.update(
            {
                "version": 1,
                "job_version": __version__,
                "zeitraum": {"id": period.id, "von": str(period.starts_on), "bis": str(period.ends_on)},
                "gestartet": now.isoformat(),
            }
        )

        # 1. Pool
        with self.timer.stage("pool"):
            ids, excluded, n_accounts = eligible_user_ids(c, period_id, exclude_run=run_id)
            people = load_people(c, ids, period_id, run_year)
            rounds = wait_rounds(c, [p.user_id for p in people], run_id)
            for p in people:
                p.wait_rounds = rounds.get(p.user_id, 0)
            with c.transaction():
                c.execute(
                    """insert into app.match_run_members (run_id, user_id, wait_rounds)
                       select %s, x.u, x.w from unnest(%s::uuid[], %s::int[]) as x (u, w)""",
                    (run_id, [p.user_id for p in people], [p.wait_rounds for p in people]),
                )
            rep["pool"] = {
                "konten": n_accounts,
                "im_pool": len(people),
                "ausgeschlossen": {r: excluded[r] for r in POOL_REASONS if excluded.get(r)},
            }
        index = {p.user_id: k for k, p in enumerate(people)}

        # 2. Eingaben bereinigen (für LLM und Embeddings) und Embeddings
        sanitize_stats = SanitizeStats()
        inputs = [person_input(p, sanitize_stats) for p in people]
        rep["eingaben_bereinigt"] = {
            "entfernte_saetze_oder_felder": sanitize_stats.removed_sentences,
            "kategorien": sorted(sanitize_stats.categories),
            "namen_ersetzt": sanitize_stats.names_replaced,
            "geschlechtshinweise_neutralisiert": sanitize_stats.gender_neutralized,
        }
        emb_stats = EmbeddingStats()
        with self.timer.stage("embeddings"):
            if s.embeddings_enabled and self.opt.embedder is not None and people:
                emb_stats = self._ensure_embeddings(people)
            rep["embeddings"] = {
                "aktiv": bool(s.embeddings_enabled),
                "backend": self.opt.embedding_backend_name if self.opt.embedder else "none",
                **emb_stats.as_json(),
            }

        # 3. Harte Filter
        with self.timer.stage("filter"):
            venues = self._load_venues(period, now + timedelta(hours=s.slot_lead_hours))
            uids = [p.user_id for p in people]
            paired, blocked, rejected = pair_history(c, uids, now, s.rejected_pair_cooldown_days)
            excluded_pairs: dict[Pair, str] = {}
            for reason, pairs in (
                ("kuerzlich_abgelehnt", rejected),
                ("blockiert", blocked),
                ("schon_vorgeschlagen", paired),
            ):
                for a, b in pairs:
                    if a in index and b in index:
                        excluded_pairs[(index[a], index[b])] = reason
            fres = hard_filter(people, venues, s, period, excluded_pairs)
        drops: Counter = fres.drops
        pairs_info: dict[Pair, PairInfo] = fres.pairs

        with self.timer.stage("art9_pruefung"):
            pairs_info = self._art9_checks(people, pairs_info, drops)

        rep["filter"] = {
            "paare_geprueft": fres.checked_pairs,
            "paare_bestanden": len(pairs_info),
            "verworfen": {r: drops[r] for r in REASON_ORDER if drops.get(r)},
            "lokale_aktiv": len(venues),
            "lokale_mit_freiem_platz": sum(1 for v in venues if v.slots),
        }

        # 4. Regel-Scores
        with self.timer.stage("regel_scores"):
            rules: dict[Pair, RuleScore] = {}
            for pair, info in pairs_info.items():
                i, j = pair
                rules[pair] = rule_score(
                    people[i],
                    people[j],
                    s,
                    distance_km=info.distance_km,
                    limit_km=pair_limit_km(people, i, j, s),
                    shared_days=info.shared_days,
                )

        # 5. Vorauswahl
        with self.timer.stage("vorauswahl"):
            similarity = self._similarities(people, list(pairs_info)) if s.embeddings_enabled else {}
            rule_values = {p: r.score for p, r in rules.items()}
            pres = {p: pre_score(p, similarity, rule_values) for p in pairs_info}
            selected = top_n(pres, s.candidates_per_person, s.topn_mode)
            rep["vorauswahl"] = {
                "kandidaten_je_person": s.candidates_per_person,
                "modus": s.topn_mode,
                "paare": len(selected),
                "mit_embedding_aehnlichkeit": sum(1 for p in selected if p in similarity),
                "nur_regel_score": sum(1 for p in selected if p not in similarity),
            }

        # 6. LLM-Rubrik
        llm_stats = LLMStats()
        evaluations: dict[Pair, PairEvaluation] = {}
        modes = {p: address_mode(people[p[0]].address_form, people[p[1]].address_form) for p in selected}
        payloads = {p: pair_payload(inputs[p[0]], inputs[p[1]], pairs_info[p].distance_km, modes[p]) for p in selected}
        use_llm = s.llm_enabled and self.opt.llm is not None
        with self.timer.stage("llm"):
            if use_llm and payloads:
                assert self.opt.llm is not None
                prior = self._prior_evaluations(people, payloads, self.opt.llm.model_id)
                evaluations = evaluate_pairs(
                    self.opt.llm, payloads, prior, effort=s.llm_effort, concurrency=s.llm_concurrency, stats=llm_stats
                )

        # 7. Gesamtscore und Kanten
        base: dict[Pair, float] = {}
        bonus: dict[Pair, float] = {}
        for p in selected:
            ev = evaluations.get(p)
            llm_score = ev.score if ev and ev.error is None else None
            base[p] = combine(rules[p].score, llm_score, s)
            bonus[p] = wait_bonus(people[p[0]].wait_rounds, people[p[1]].wait_rounds, s)
        eligible = {p for p in selected if base[p] >= s.min_score}
        candidate_ids = {p: str(uuid.uuid4()) for p in selected}

        with self.timer.stage("speichern_kandidaten"), c.transaction():
            self._insert_candidates(
                run_id, people, selected, rules, evaluations, similarity, base, bonus, candidate_ids
            )

        # 8. Zuordnung und Lokal (bei vollen Plätzen bis zu max_venue_rounds Runden)
        with self.timer.stage("zuordnung_und_lokal"):
            final, assignment, no_venue = self._assign_with_venues(people, venues, pairs_info, eligible, base, bonus, s)

        # 9. Prüf-Agent
        with self.timer.stage("pruef_agent"):
            items: list[ReviewInput] = []
            for p, choice in final.items():
                i, j = p
                ev = evaluations.get(p)
                hints: list[str] = []
                if not choice.ratio_ok:
                    hints.append("Anfahrt ungleich: kein Lokal mit freiem Platz näher an der Mitte.")
                if use_llm and (ev is None or ev.error):
                    hints.append("Keine LLM-Bewertung; Gesamtscore nur aus Regeln.")
                if rules[p].missing:
                    hints.append("Teil-Scores ohne Angaben (neutral 0,5): " + ", ".join(rules[p].missing) + ".")
                draft = ev.reasons_draft if ev and ev.error is None and ev.reasons_draft else None
                if draft is None:
                    draft = template_reasons(inputs[i], inputs[j], modes[p])
                items.append(
                    ReviewInput(
                        key=p,
                        person_a=inputs[i],
                        person_b=inputs[j],
                        names=[people[i].display_name, people[j].display_name],
                        mode=modes[p],
                        scores={
                            "gesamt": round(base[p] + bonus[p], 4),
                            "qualitaet": round(base[p], 4),
                            "regel": round(rules[p].score, 4),
                            "llm": None if ev is None or ev.score is None else round(ev.score, 4),
                            "wartebonus": round(bonus[p], 4),
                            "teil_scores": {k: _f(v) for k, v in rules[p].subscores.items()},
                        },
                        rationale=ev.rationale if ev else None,
                        concerns=ev.concerns if ev else [],
                        reasons_draft=draft,
                        venue={
                            "anfahrt_km": [round(choice.distance_a_km, 1), round(choice.distance_b_km, 1)],
                            "verhaeltnis": round(choice.ratio, 2),
                            "verhaeltnis_ok": choice.ratio_ok,
                        },
                        hints=hints,
                    )
                )
            reviews = review_pairings(
                self.opt.llm if use_llm else None,
                items,
                effort=s.llm_effort,
                concurrency=s.llm_concurrency,
                stats=llm_stats,
            )

        # 10. Speichern
        with self.timer.stage("speichern"), c.transaction():
            pairing_rows = []
            for p, choice in sorted(final.items(), key=lambda kv: -(base[kv[0]] + bonus[kv[0]])):
                i, j = p
                rv = reviews[p]
                pairing_rows.append(
                    (
                        str(uuid.uuid4()),
                        candidate_ids[p],
                        people[i].user_id,
                        people[j].user_id,
                        round(base[p] + bonus[p], 4),
                        venues[choice.venue_index].id,
                        choice.reason,
                        rv.reasons_text,
                        json.dumps(rv.notes, ensure_ascii=False),
                    )
                )
            if pairing_rows:
                cols = list(zip(*pairing_rows, strict=True))
                c.execute(
                    """insert into app.pairings (id, run_id, candidate_id, user_a, user_b, total_score, venue_id, venue_reason,
                                                 reasons_text, review_notes, status)
                       select x.id, %s, x.cid, x.a, x.b, x.total, x.venue, x.vreason, x.reasons, x.notes::jsonb, 'pending_review'
                       from unnest(%s::uuid[], %s::uuid[], %s::uuid[], %s::uuid[], %s::numeric[], %s::uuid[], %s::text[],
                                   %s::text[], %s::text[]) as x (id, cid, a, b, total, venue, vreason, reasons, notes)""",
                    (run_id, *[list(col) for col in cols]),
                )
                c.execute(
                    "update app.pair_candidates set selected = true where id = any(%s::uuid[])",
                    ([candidate_ids[p] for p in final],),
                )
                # geprüfter Text auch beim Kandidaten vermerken
                c.execute(
                    """update app.pair_candidates pc set reasons_art9_clean = x.clean
                       from unnest(%s::uuid[], %s::boolean[]) as x (id, clean) where pc.id = x.id""",
                    ([candidate_ids[p] for p in final], [reviews[p].reasons_clean for p in final]),
                )
            outcome = self._member_outcomes(people, pairs_info, eligible, final, no_venue)
            c.execute(
                """update app.match_run_members m set outcome = x.o, unmatched_reason = x.r
                   from unnest(%s::uuid[], %s::text[], %s::text[]) as x (u, o, r)
                   where m.run_id = %s and m.user_id = x.u""",
                (
                    [people[k].user_id for k in range(len(people))],
                    [outcome[k][0] for k in range(len(people))],
                    [outcome[k][1] for k in range(len(people))],
                    run_id,
                ),
            )

        # 11. Bericht
        with self.timer.stage("bericht"):
            fairness = c.execute("select sensitive.match_run_fairness(%s)", (run_id,)).fetchone()[0]
        n_pairs = len(final)
        unmatched = Counter(r for o, r in outcome.values() if o == "unmatched")
        total_scores = [base[p] + bonus[p] for p in selected]
        rep["scores"] = {
            "regel": distribution([rules[p].score for p in selected]),
            "llm": distribution([e.score for e in evaluations.values() if e.score is not None]),
            "qualitaet": distribution([base[p] for p in selected]),
            "gesamt_mit_bonus": distribution(total_scores),
            "vorgeschlagen": distribution([base[p] + bonus[p] for p in final]),
        }
        rep["mindestscore"] = {"wert": s.min_score, "paare_darueber": len(eligible)}
        rep["zuordnung"] = assignment.summary()
        waiting = [p.wait_rounds for p in people if p.wait_rounds > 0]
        rep["ergebnis"] = {
            "vorschlaege": n_pairs,
            "personen_mit_vorschlag": 2 * n_pairs,
            "anteil_im_pool": round(2 * n_pairs / len(people), 4) if people else 0.0,
            "ohne_vorschlag": dict(sorted(unmatched.items())),
            "wartebonus": {
                "personen_mit_wartezeit": len(waiting),
                "hoechste_wartezeit_laeufe": max(waiting, default=0),
                "vorschlaege_mit_bonus": sum(1 for p in final if bonus[p] > 0),
            },
        }
        per_venue = Counter(venues[ch.venue_index].name for ch in final.values())
        rep["lokale"] = {
            "nach_lokal": dict(per_venue.most_common()),
            "verhaeltnis_ueberschritten": sum(1 for ch in final.values() if not ch.ratio_ok),
        }
        art9_hits: Counter = Counter()
        for rv in reviews.values():
            for h in rv.notes["art9_filter"]["treffer"]:
                art9_hits[h] += 1
        rep["pruefung"] = {
            "version": REVIEW_VERSION,
            "ersatztext_verwendet": sum(1 for rv in reviews.values() if rv.notes["ersatztext_verwendet"]),
            "filter_treffer": dict(sorted(art9_hits.items())),
            "agent_art9_verdacht": sum(1 for rv in reviews.values() if (rv.notes["agent"] or {}).get("art9_verdacht")),
            "empfehlungen": dict(Counter(str(rv.notes.get("empfehlung")) for rv in reviews.values())),
        }
        prices = s.llm_price_usd_per_mtok
        costs = cost_estimate(
            llm_stats.usage.cost_usd(prices), emb_stats.tokens, s.embedding_price_usd_per_mtok, s.usd_eur_rate
        )
        rep["llm"] = {
            "aktiv": use_llm,
            "backend": self.opt.llm_backend_name if use_llm else "none",
            "modell": self.opt.llm.model_id if use_llm and self.opt.llm else None,
            "rubrik_version": RUBRIC_VERSION,
            "aufwand": s.llm_effort,
            "bewertungen_angefragt": llm_stats.requested,
            "aufrufe_bewertung": llm_stats.calls,
            "wiederverwendet": llm_stats.reused,
            "fehler": llm_stats.errors,
            "fehlerarten": llm_stats.error_kinds,
            "ablehnungen": llm_stats.refusals,
            "aufrufe_pruef_agent": llm_stats.review_calls,
            "fehler_pruef_agent": llm_stats.review_errors,
            "token": {
                "eingabe": llm_stats.usage.input_tokens,
                "ausgabe": llm_stats.usage.output_tokens,
                "cache_lesen": llm_stats.usage.cache_read_tokens,
                "cache_schreiben": llm_stats.usage.cache_write_tokens,
            },
            "kosten": costs,
            "preisannahmen_usd_je_mio_token": prices,
            "kosten_hinweis": "Schätzung aus Token-Zählung und Listenpreisen (Einstellungen matching.*price*)."
            + (" Attrappe: Token geschätzt." if self.opt.llm_backend_name == "fake" else ""),
        }
        rep["fairness"] = fairness
        rep["laufzeit_sekunden"] = self.timer.as_json()
        with c.transaction():
            c.execute(
                """update app.match_runs set status = 'review', finished_at = app.now(), pool_size = %s, candidate_pairs = %s,
                          proposed_pairs = %s, report = %s::jsonb, cost_eur = %s, error = null
                   where id = %s""",
                (
                    len(people),
                    len(selected),
                    n_pairs,
                    json.dumps(rep, ensure_ascii=False, default=str),
                    costs["gesamt_eur"],
                    run_id,
                ),
            )
        return rep

    # ------------------------------------------------------------------ Hilfen
    def _ensure_embeddings(self, people: list[Person]) -> EmbeddingStats:
        c = self.conn
        embedder = self.opt.embedder
        assert embedder is not None
        texts = {p.user_id: sanitize_text(p.summary_text, [p.display_name])[0] for p in people}
        existing = {
            uid: (model, h)
            for uid, model, h in c.execute(
                "select user_id::text, model, source_hash from app.profile_embeddings where user_id = any(%s::uuid[])",
                ([p.user_id for p in people],),
            )
        }
        todo, up_to_date = plan_embeddings(texts, existing, embedder.model_id)
        vectors, stats = compute_embeddings(embedder, texts, todo)
        stats.present = up_to_date
        stats.skipped_empty = sum(1 for t in texts.values() if not t.strip())
        if vectors:
            with c.transaction(), c.cursor() as cur:
                cur.executemany(
                    """insert into app.profile_embeddings (user_id, model, embedding, source_hash, updated_at)
                       values (%s, %s, %s::extensions.vector, %s, now())
                       on conflict (user_id) do update set model = excluded.model, embedding = excluded.embedding,
                         source_hash = excluded.source_hash, updated_at = now()""",
                    [(uid, embedder.model_id, vector_literal(v), h) for uid, (v, h) in vectors.items()],
                )
        current = {uid for uid, (m, _) in existing.items() if m == embedder.model_id} | set(vectors)
        for p in people:
            p.has_embedding = p.user_id in current
        return stats

    def _load_venues(self, period: Period, earliest) -> list[Venue]:
        rows = self.conn.execute(
            """
            select v.id::text, v.name, v.city, v.lat, v.lon, s.id::text, s.starts_at, s.tables - s.reserved
            from app.venues v
            left join app.venue_slots s
              on s.venue_id = v.id and s.reserved < s.tables and s.starts_at >= %(earliest)s
             and s.starts_at >= (%(start)s::date)::timestamp at time zone 'Europe/Berlin'
             and s.starts_at < ((%(end)s::date + 1)::timestamp at time zone 'Europe/Berlin')
            where v.active
            order by v.id, s.starts_at
            """,
            {"earliest": earliest, "start": period.starts_on, "end": period.ends_on},
        ).fetchall()
        venues: dict[str, Venue] = {}
        for vid, name, city, lat, lon, sid, starts, free in rows:
            v = venues.setdefault(vid, Venue(vid, name, city, float(lat), float(lon)))
            if sid is not None:
                v.slots.append((int(starts.timestamp()), sid, int(free)))
        return list(venues.values())

    def _art9_checks(self, people: list[Person], pairs: dict[Pair, PairInfo], drops: Counter) -> dict[Pair, PairInfo]:
        """Geschlecht und Religion: nur Ja/Nein aus den Prüffunktionen der Datenbank."""
        for reason, single, batch in (
            ("geschlecht", "sensitive.gender_compatible", "sensitive.gender_compatible_pairs"),
            ("religion", "sensitive.religion_compatible", "sensitive.religion_compatible_pairs"),
        ):
            if not pairs:
                break
            keys = list(pairs)
            a = [people[i].user_id for i, _ in keys]
            b = [people[j].user_id for _, j in keys]
            if self.opt.art9_check == "single":
                rows = self.conn.execute(
                    f"select x.a::text, x.b::text, {single}(x.a, x.b) from unnest(%s::uuid[], %s::uuid[]) as x (a, b)",
                    (a, b),
                ).fetchall()
            else:
                rows = self.conn.execute(
                    f"select user_a::text, user_b::text, compatible from {batch}(%s::uuid[], %s::uuid[])", (a, b)
                ).fetchall()
            ok = {(x, y) for x, y, comp in rows if comp}
            kept: dict[Pair, PairInfo] = {}
            for key in keys:
                i, j = key
                if (people[i].user_id, people[j].user_id) in ok:
                    kept[key] = pairs[key]
                else:
                    drops[reason] += 1
            pairs = kept
        return pairs

    def _similarities(self, people: list[Person], pairs: list[Pair]) -> dict[Pair, float]:
        cand = [(i, j) for i, j in pairs if people[i].has_embedding and people[j].has_embedding]
        if not cand:
            return {}
        rows = self.conn.execute(
            """select x.a::text, x.b::text, 1 - (ea.embedding operator(extensions.<=>) eb.embedding)
               from unnest(%s::uuid[], %s::uuid[]) as x (a, b)
               join app.profile_embeddings ea on ea.user_id = x.a
               join app.profile_embeddings eb on eb.user_id = x.b and eb.model = ea.model""",
            ([people[i].user_id for i, _ in cand], [people[j].user_id for _, j in cand]),
        ).fetchall()
        idx = {p.user_id: k for k, p in enumerate(people)}
        return {(idx[a], idx[b]): float(sim) for a, b, sim in rows if sim is not None}

    def _prior_evaluations(
        self, people: list[Person], payloads: dict[Pair, dict[str, Any]], model_id: str
    ) -> dict[str, dict[str, Any]]:
        keys = list(payloads)
        hashes = [input_hash(payloads[p], model_id) for p in keys]
        rows = self.conn.execute(
            """select distinct on (pc.input_hash) pc.input_hash, pc.llm_score, pc.llm_rationale, pc.reasons_draft,
                      pc.subscores -> 'llm_bedenken'
               from unnest(%s::uuid[], %s::uuid[], %s::text[]) as x (a, b, h)
               join app.pair_candidates pc on pc.user_a = x.a and pc.user_b = x.b and pc.input_hash = x.h
               where pc.llm_score is not null
               order by pc.input_hash, pc.created_at desc""",
            ([people[i].user_id for i, _ in keys], [people[j].user_id for _, j in keys], hashes),
        ).fetchall()
        return {
            h: {"llm_score": score, "llm_rationale": rat, "reasons_draft": draft, "concerns": concerns or []}
            for h, score, rat, draft, concerns in rows
        }

    def _insert_candidates(
        self,
        run_id: str,
        people: list[Person],
        selected: set[Pair],
        rules: dict[Pair, RuleScore],
        evaluations: dict[Pair, PairEvaluation],
        similarity: dict[Pair, float],
        base: dict[Pair, float],
        bonus: dict[Pair, float],
        candidate_ids: dict[Pair, str],
    ) -> None:
        rows = []
        for p in sorted(selected):
            i, j = p
            ev = evaluations.get(p)
            subs = rules[p].as_json()
            subs["aehnlichkeit"] = _f(similarity.get(p))
            subs["qualitaet"] = round(base[p], 4)
            if ev is not None:
                subs["llm_bedenken"] = ev.concerns
                subs["llm_wiederverwendet"] = ev.reused
                if ev.error:
                    subs["llm_fehler"] = ev.error.split(":")[0]
            draft = ev.reasons_draft if ev and ev.error is None else None
            rows.append(
                (
                    candidate_ids[p],
                    people[i].user_id,
                    people[j].user_id,
                    rules[p].score,
                    ev.score if ev and ev.error is None else None,
                    bonus[p],
                    base[p] + bonus[p],
                    json.dumps(subs, ensure_ascii=False),
                    ev.rationale if ev and ev.error is None else None,
                    draft,
                    None
                    if draft is None
                    else check_reasons(draft, [people[i].display_name, people[j].display_name]).ok,
                    ev.input_hash if ev else None,
                )
            )
        for start in range(0, len(rows), 5000):
            chunk = rows[start : start + 5000]
            cols = [list(col) for col in zip(*chunk, strict=True)]
            self.conn.execute(
                """insert into app.pair_candidates (id, run_id, user_a, user_b, rule_score, llm_score, wait_bonus, total_score,
                                                   subscores, llm_rationale, reasons_draft, reasons_art9_clean, input_hash)
                   select x.id, %s, x.a, x.b, round(x.rule::numeric, 4), round(x.llm::numeric, 4), round(x.bonus::numeric, 4),
                          round(x.total::numeric, 4), x.subs::jsonb, x.rat, x.draft, x.clean, x.h
                   from unnest(%s::uuid[], %s::uuid[], %s::uuid[], %s::float8[], %s::float8[], %s::float8[], %s::float8[],
                               %s::text[], %s::text[], %s::text[], %s::boolean[], %s::text[])
                        as x (id, a, b, rule, llm, bonus, total, subs, rat, draft, clean, h)""",
                (run_id, *cols),
            )

    def _assign_with_venues(
        self,
        people: list[Person],
        venues: list[Venue],
        pairs_info: dict[Pair, PairInfo],
        eligible: set[Pair],
        base: dict[Pair, float],
        bonus: dict[Pair, float],
        s: MatchSettings,
    ) -> tuple[dict[Pair, VenueChoice], AssignmentResult, set[int]]:
        capacity = initial_capacity(venues)
        final: dict[Pair, VenueChoice] = {}
        used: set[int] = set()
        no_venue: set[int] = set()
        total = AssignmentResult()
        edges_pairs = set(eligible)
        for _round in range(max(1, self.opt.max_venue_rounds)):
            edges = [(i, j, base[(i, j)] + bonus[(i, j)]) for i, j in sorted(edges_pairs)]
            if not edges:
                break
            res = assign(
                edges,
                maxcardinality=s.max_cardinality,
                timeout_seconds=s.assignment_timeout_seconds,
                inline_max_nodes=s.assignment_inline_max_nodes,
                engine=self.opt.assignment_engine,
            )
            total.components.extend(res.components)
            total.seconds += res.seconds
            total.notes.extend(res.notes)
            dropped: list[Pair] = []
            for p in sorted(res.pairs, key=lambda q: -(base[q] + bonus[q])):
                choice = choose_venue(pairs_info[p], venues, capacity, s)
                if choice is None:
                    dropped.append(p)
                    continue
                capacity[(choice.venue_index, choice.slot_index)] -= 1
                final[p] = choice
                used.update(p)
            if not dropped:
                break
            for p in dropped:
                no_venue.update(p)
            edges_pairs = {
                q
                for q in edges_pairs
                if q[0] not in used
                and q[1] not in used
                and choose_venue(pairs_info[q], venues, capacity, s) is not None
            }
        total.pairs = list(final)
        return final, total, no_venue - used

    def _member_outcomes(
        self,
        people: list[Person],
        pairs_info: dict[Pair, PairInfo],
        eligible: set[Pair],
        final: dict[Pair, VenueChoice],
        no_venue: set[int],
    ) -> dict[int, tuple[str, str | None]]:
        has_candidates: set[int] = set()
        for i, j in pairs_info:
            has_candidates.update((i, j))
        has_eligible: set[int] = set()
        for i, j in eligible:
            has_eligible.update((i, j))
        matched: set[int] = set()
        for i, j in final:
            matched.update((i, j))
        out: dict[int, tuple[str, str | None]] = {}
        for k in range(len(people)):
            if k in matched:
                out[k] = ("matched", None)
            elif k not in has_candidates:
                out[k] = ("unmatched", "keine_kandidaten")
            elif k not in has_eligible:
                out[k] = ("unmatched", "unter_mindestscore")
            elif k in no_venue:
                out[k] = ("unmatched", "kein_lokal")
            else:
                out[k] = ("unmatched", "nicht_zugeordnet")
        return out


def run_report(conn: psycopg.Connection, run_id: str) -> dict[str, Any]:
    row = conn.execute(
        """select id::text, status, period_id::text, scheduled_for, started_at, finished_at, pool_size, candidate_pairs,
                  proposed_pairs, cost_eur, error, report from app.match_runs where id = %s""",
        (run_id,),
    ).fetchone()
    if not row:
        raise RunError(f"Lauf {run_id} nicht gefunden.")
    keys = (
        "id",
        "status",
        "period_id",
        "scheduled_for",
        "started_at",
        "finished_at",
        "pool_size",
        "candidate_pairs",
        "proposed_pairs",
        "cost_eur",
        "error",
        "report",
    )
    return dict(zip(keys, row, strict=True))
