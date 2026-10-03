"""Kommandozeile: fermata-matcher run | simulate | report.

Umgebungsvariablen (siehe docs/bereiche/matcher.md):
  FERMATA_MATCHER_DB_URL     Verbindung (Login-Rolle des Jobs); Standard: Test-Datenbank auf Port 54362
  FERMATA_MATCHER_DB_ROLE    Rolle nach dem Verbinden (Standard fermata_matcher; „none“ = keine)
  FERMATA_LLM_BACKEND        fake | bedrock | bedrock-mantle | none   (Standard fake; in Produktion nie fake)
  FERMATA_EMBEDDING_BACKEND  fake | titan | none                      (Standard fake; in Produktion nie fake)
  FERMATA_ENV                production | staging | local | test | ci (production sperrt Attrappen, ebenso die
                             Datenbank, wenn ops.environment() production meldet)
  FERMATA_AWS_REGION         Standard eu-central-1
  FERMATA_LLM_MODEL_ID       überschreibt analysis.llm_model_id (z. B. für bedrock-mantle)
"""

from __future__ import annotations

import argparse
import json
import sys
from typing import Any

from .config import ProductionGuardError, RuntimeConfig, ensure_production_safe
from .db import connect, environment_or_none, load_settings
from .embeddings import make_embedder
from .llm.client import make_llm
from .runner import RunError, Runner, RunOptions, run_report


def _print_summary(report: dict[str, Any], run_id: str, status: str, out=sys.stdout) -> None:
    def line(text: str = "") -> None:
        print(text, file=out)

    pool = report.get("pool", {})
    flt = report.get("filter", {})
    res = report.get("ergebnis", {})
    llm = report.get("llm", {})
    zu = report.get("zuordnung", {})
    line(f"Lauf {run_id} · Status {status}")
    z = report.get("zeitraum", {})
    line(f"Zeitraum {z.get('von')} bis {z.get('bis')}")
    line(f"Pool: {pool.get('im_pool')} von {pool.get('konten')} Konten. Nicht im Pool: {pool.get('ausgeschlossen')}")
    line(f"Paare geprüft: {flt.get('paare_geprueft')}, bestanden: {flt.get('paare_bestanden')}")
    line(f"Verworfen: {flt.get('verworfen')}")
    pre = report.get("vorauswahl", {})
    line(f"Vorauswahl ({pre.get('modus')}, Top-{pre.get('kandidaten_je_person')}): {pre.get('paare')} Paare")
    line(
        f"Über Mindestscore {report.get('mindestscore', {}).get('wert')}: {report.get('mindestscore', {}).get('paare_darueber')}"
    )
    line(
        f"Vorschläge: {res.get('vorschlaege')} · Personen mit Vorschlag: {res.get('personen_mit_vorschlag')} "
        f"({100 * (res.get('anteil_im_pool') or 0):.1f} % des Pools)"
    )
    line(f"Ohne Vorschlag: {res.get('ohne_vorschlag')}")
    line(
        f"Zuordnung: {zu.get('teilgraphen')} Teilgraphen, größte {zu.get('groesste_teilgraphen')}, "
        f"{zu.get('sekunden')} s, Verfahren {zu.get('verfahren')}"
    )
    kosten = llm.get("kosten", {})
    line(
        f"LLM ({llm.get('backend')}): {llm.get('aufrufe_bewertung')} Bewertungen, {llm.get('wiederverwendet')} "
        f"wiederverwendet, {llm.get('aufrufe_pruef_agent')} Prüfungen, Fehler {llm.get('fehler')}; "
        f"geschätzte Kosten {kosten.get('gesamt_eur')} €"
    )
    pr = report.get("pruefung", {})
    line(f"Prüfung: Ersatztext {pr.get('ersatztext_verwendet')}, Filter-Treffer {pr.get('filter_treffer')}")
    line(f"Laufzeit (s): {report.get('laufzeit_sekunden')}")
    fair = report.get("fairness", {})
    if fair:
        line(f"Fairness (k={fair.get('k')}): Geschlecht {json.dumps(fair.get('nach_geschlecht'), ensure_ascii=False)}")
        line(f"                Altersband {json.dumps(fair.get('nach_altersband'), ensure_ascii=False)}")


def cmd_run(args: argparse.Namespace) -> int:
    cfg = RuntimeConfig.from_env()
    conn = connect(args.db_url or cfg.db_url, None if args.role == "none" else (args.role or cfg.db_role))
    llm_name = args.llm or cfg.llm_backend
    emb_name = args.embeddings or cfg.embedding_backend
    # Produktionssperre vor allem anderen (DSFA M-3): keine erfundenen Bewertungen für echte Menschen.
    try:
        ensure_production_safe(llm_name, emb_name, cfg.env, environment_or_none(conn))
    except ProductionGuardError as e:
        print(str(e), file=sys.stderr)
        return 3
    settings = load_settings(conn)
    llm = make_llm(
        args.llm or cfg.llm_backend,
        region=cfg.aws_region,
        model_id=settings.llm_model_id,
        override=cfg.llm_model_override,
        art9_rate=cfg.fake_art9_rate,
    )
    embedder = make_embedder(
        args.embeddings or cfg.embedding_backend, region=cfg.aws_region, model_id=settings.embedding_model_id
    )
    runner = Runner(
        conn,
        RunOptions(
            llm=llm,
            embedder=embedder,
            art9_check=args.art9_check,
            assignment_engine=args.engine,
            llm_backend_name=llm_name,
            embedding_backend_name=emb_name,
            env=cfg.env,
        ),
    )
    try:
        outcome = runner.run(period_id=args.period, next_due=args.next, run_id=args.run_id)
    except RunError as e:
        print(f"Kein Lauf: {e}", file=sys.stderr)
        return 2
    if args.json:
        print(
            json.dumps(
                {"run_id": outcome.run_id, "status": outcome.status, "report": outcome.report},
                ensure_ascii=False,
                indent=2,
                default=str,
            )
        )
    else:
        _print_summary(outcome.report, outcome.run_id, outcome.status)
    return 0


def cmd_simulate(args: argparse.Namespace) -> int:
    from .simulate import simulate

    cfg = RuntimeConfig.from_env()
    result = simulate(
        args.db_url or cfg.db_url,
        profiles=args.profiles,
        seed=args.seed,
        rounds=args.rounds,
        approve=args.approve_all,
        art9_rate=args.art9_rate,
        assignment_engine=args.engine,
        art9_check=args.art9_check,
        log=(lambda *_a, **_k: None) if args.json else print,
    )
    if args.json:
        print(
            json.dumps(
                {
                    "profiles": result.profiles,
                    "seed_seconds": round(result.seed_seconds, 2),
                    "runs": [{"run_id": r.run_id, "status": r.status, "report": r.report} for r in result.runs],
                    "approvals": result.approvals,
                },
                ensure_ascii=False,
                indent=2,
                default=str,
            )
        )
        return 0
    for k, outcome in enumerate(result.runs):
        print()
        print(f"── Runde {k + 1} ──")
        _print_summary(outcome.report, outcome.run_id, outcome.status)
        if k < len(result.approvals):
            print(f"Freigabe (Simulation): {json.dumps(result.approvals[k], ensure_ascii=False, default=str)}")
    return 0


def cmd_report(args: argparse.Namespace) -> int:
    cfg = RuntimeConfig.from_env()
    conn = connect(args.db_url or cfg.db_url, None if args.role == "none" else (args.role or cfg.db_role))
    try:
        data = run_report(conn, args.run_id)
    except RunError as e:
        print(str(e), file=sys.stderr)
        return 2
    if args.json:
        print(json.dumps(data, ensure_ascii=False, indent=2, default=str))
    else:
        _print_summary(data.get("report") or {}, data["id"], data["status"])
        if data.get("error"):
            print(f"Fehler: {data['error'].splitlines()[0]}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="fermata-matcher", description="Fermata · Auswahl-Job (M4)")
    sub = parser.add_subparsers(dest="command", required=True)

    def common(p: argparse.ArgumentParser) -> None:
        p.add_argument("--db-url", help="Datenbank-URL (sonst FERMATA_MATCHER_DB_URL)")
        p.add_argument("--json", action="store_true", help="Ausgabe als JSON")

    p_run = sub.add_parser("run", help="Einen Auswahl-Lauf ausführen")
    common(p_run)
    target = p_run.add_mutually_exclusive_group(required=True)
    target.add_argument("--period", help="ID des Zeitraums (app.availability_periods)")
    target.add_argument("--next", action="store_true", help="nächsten fälligen Lauf ausführen")
    target.add_argument("--run-id", help="einen angelegten Lauf (Status scheduled) ausführen")
    p_run.add_argument("--role", help="Rolle nach dem Verbinden (Standard fermata_matcher, „none“ = keine)")
    p_run.add_argument("--llm", choices=["fake", "bedrock", "bedrock-mantle", "none"])
    p_run.add_argument("--embeddings", choices=["fake", "titan", "none"])
    p_run.add_argument("--engine", default="auto", choices=["auto", "networkx", "mwmatching", "greedy"])
    p_run.add_argument("--art9-check", default="batch", choices=["batch", "single"])
    p_run.set_defaults(func=cmd_run)

    p_sim = sub.add_parser("simulate", help="Synthetische Profile in der Test-Datenbank und ein voller Lauf")
    common(p_sim)
    p_sim.add_argument("--profiles", type=int, default=200)
    p_sim.add_argument("--seed", type=int, default=42)
    p_sim.add_argument(
        "--rounds", type=int, default=1, help="mehrere Zeiträume nacheinander (zeigt Wartebonus und Wiederverwendung)"
    )
    p_sim.add_argument(
        "--approve-all", action="store_true", help="als Admin alle Vorschläge freigeben (legt Abende an)"
    )
    p_sim.add_argument(
        "--art9-rate", type=float, default=0.03, help="Anteil absichtlich problematischer Texte der Attrappe"
    )
    p_sim.add_argument("--engine", default="auto", choices=["auto", "networkx", "mwmatching", "greedy"])
    p_sim.add_argument("--art9-check", default="batch", choices=["batch", "single"])
    p_sim.set_defaults(func=cmd_simulate)

    p_rep = sub.add_parser("report", help="Bericht eines Laufs anzeigen")
    common(p_rep)
    p_rep.add_argument("run_id")
    p_rep.add_argument("--role", help="Rolle nach dem Verbinden (Standard fermata_matcher)")
    p_rep.set_defaults(func=cmd_report)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    return int(args.func(args) or 0)


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
