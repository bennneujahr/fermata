"""Simulation und Lasttest (M4): synthetische, aber realistische Profile in der Test-Datenbank.

- nur in den Umgebungen test, local und ci (ops.environment()); in Produktion verweigert,
- alle Personen haben E-Mails auf @sim.fermata.test, Lokale heißen „Sim · …“; ein neuer Lauf räumt alte
  Simulationsdaten vorher weg,
- Vornamen nur in den Testdaten, PLZ rund um Schwerin, Wismar, Ludwigslust, Parchim, Hamburg, Lübeck, Rostock,
- verschiedene Geschlechter und Wünsche (auch gleichgeschlechtlich und nichtbinär), Alter 25–65, Fahrbereitschaft,
  Deal-Breaker, freie Zeiten; ein kleiner Teil fällt absichtlich aus dem Pool (zeigt die Pool-Gründe).
Der Job läuft danach mit den Rechten von fermata_matcher, mit Attrappen für Sprachmodell und Embeddings.
"""

from __future__ import annotations

import json
import random
import time
import uuid
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, timedelta
from typing import Any

import psycopg

from .availability import BERLIN
from .db import connect, set_role
from .embeddings import FakeEmbedder
from .llm.client import FakeLLM
from .runner import Runner, RunOptions, RunOutcome

SIM_DOMAIN = "sim.fermata.test"
SIM_VENUE_PREFIX = "Sim · "

# PLZ-Mittelpunkte (gerundete Näherungswerte nur für die Simulation; der echte Import kommt in M2).
REGIONS: dict[str, tuple[float, list[tuple[str, str, float, float]]]] = {
    "Schwerin": (
        0.20,
        [
            ("19053", "Schwerin", 53.628, 11.411),
            ("19055", "Schwerin", 53.645, 11.428),
            ("19057", "Schwerin", 53.655, 11.380),
            ("19059", "Schwerin", 53.613, 11.378),
            ("19061", "Schwerin", 53.585, 11.405),
            ("19063", "Schwerin", 53.590, 11.445),
            ("19089", "Crivitz", 53.578, 11.650),
            ("19205", "Gadebusch", 53.703, 11.117),
            ("19406", "Sternberg", 53.711, 11.826),
        ],
    ),
    "Wismar": (
        0.10,
        [
            ("23966", "Wismar", 53.893, 11.465),
            ("23968", "Wismar", 53.900, 11.420),
            ("23970", "Wismar", 53.880, 11.500),
            ("23936", "Grevesmühlen", 53.863, 11.191),
        ],
    ),
    "Ludwigslust": (
        0.07,
        [
            ("19288", "Ludwigslust", 53.329, 11.497),
            ("19230", "Hagenow", 53.431, 11.188),
            ("19258", "Boizenburg", 53.381, 10.723),
        ],
    ),
    "Parchim": (0.06, [("19370", "Parchim", 53.426, 11.849), ("19386", "Lübz", 53.462, 12.028)]),
    "Hamburg": (
        0.23,
        [
            ("20095", "Hamburg", 53.551, 10.000),
            ("20144", "Hamburg", 53.574, 9.977),
            ("20249", "Hamburg", 53.589, 9.992),
            ("20357", "Hamburg", 53.564, 9.962),
            ("21029", "Hamburg", 53.488, 10.218),
            ("22041", "Hamburg", 53.574, 10.077),
            ("22301", "Hamburg", 53.588, 10.017),
            ("22765", "Hamburg", 53.553, 9.930),
        ],
    ),
    "Lübeck": (
        0.14,
        [
            ("23552", "Lübeck", 53.867, 10.687),
            ("23554", "Lübeck", 53.880, 10.672),
            ("23558", "Lübeck", 53.855, 10.660),
            ("23562", "Lübeck", 53.845, 10.710),
            ("23564", "Lübeck", 53.875, 10.715),
            ("23570", "Lübeck", 53.960, 10.870),
            ("23909", "Ratzeburg", 53.700, 10.757),
            ("23879", "Mölln", 53.627, 10.689),
        ],
    ),
    "Rostock": (
        0.20,
        [
            ("18055", "Rostock", 54.088, 12.140),
            ("18057", "Rostock", 54.085, 12.115),
            ("18059", "Rostock", 54.070, 12.110),
            ("18069", "Rostock", 54.110, 12.080),
            ("18106", "Rostock", 54.140, 12.060),
            ("18119", "Rostock", 54.175, 12.085),
            ("18209", "Bad Doberan", 54.107, 11.909),
            ("18273", "Güstrow", 53.794, 12.176),
        ],
    ),
}

VENUES: list[tuple[str, str, str, float, float]] = [
    ("Café am Pfaffenteich", "19055", "Schwerin", 53.632, 11.414),
    ("Weinstube Altstadt", "19053", "Schwerin", 53.627, 11.416),
    ("Bistro Lankower See", "19057", "Schwerin", 53.651, 11.371),
    ("Hafenkneipe Alter Hafen", "23966", "Wismar", 53.897, 11.459),
    ("Teestube Marktplatz", "23966", "Wismar", 53.891, 11.466),
    ("Schlosscafé", "19288", "Ludwigslust", 53.326, 11.494),
    ("Restaurant an der Elde", "19370", "Parchim", 53.427, 11.847),
    ("Café Isebek", "20144", "Hamburg", 53.576, 9.976),
    ("Weinbar Winterhude", "22301", "Hamburg", 53.590, 10.008),
    ("Kaffeerösterei Speicherstadt", "20095", "Hamburg", 53.544, 9.993),
    ("Altstadtcafé Koberg", "23552", "Lübeck", 53.870, 10.688),
    ("Restaurant an der Wakenitz", "23564", "Lübeck", 53.874, 10.705),
    ("Stadthafen-Café", "18055", "Rostock", 54.091, 12.135),
    ("Kröpeliner Weinkeller", "18055", "Rostock", 54.088, 12.133),
    ("Gasthaus am Inselsee", "18273", "Güstrow", 53.790, 12.180),
]

FEMALE = [
    "Anna",
    "Lena",
    "Marie",
    "Sophie",
    "Laura",
    "Julia",
    "Katharina",
    "Sarah",
    "Lisa",
    "Hannah",
    "Johanna",
    "Clara",
    "Emma",
    "Charlotte",
    "Paula",
    "Greta",
    "Frieda",
    "Ida",
    "Mia",
    "Lea",
    "Nina",
    "Sabine",
    "Petra",
    "Andrea",
    "Claudia",
    "Susanne",
    "Birgit",
    "Kerstin",
    "Anja",
    "Silke",
    "Heike",
    "Martina",
    "Monika",
    "Ulrike",
    "Renate",
    "Ines",
    "Katrin",
    "Maren",
    "Wiebke",
    "Imke",
    "Frauke",
    "Antje",
    "Dörte",
    "Stefanie",
    "Elke",
]
MALE = [
    "Lukas",
    "Jonas",
    "Felix",
    "Leon",
    "Paul",
    "Finn",
    "Max",
    "Moritz",
    "Jan",
    "Tim",
    "Tobias",
    "Philipp",
    "Florian",
    "Sebastian",
    "Matthias",
    "Thomas",
    "Michael",
    "Andreas",
    "Stefan",
    "Frank",
    "Jens",
    "Uwe",
    "Holger",
    "Torsten",
    "Dirk",
    "Sven",
    "Olaf",
    "Lars",
    "Henning",
    "Ole",
    "Hauke",
    "Malte",
    "Björn",
    "Martin",
    "Peter",
    "Klaus",
    "Jürgen",
    "Bernd",
    "Ralf",
    "Hendrik",
    "Jannik",
    "Niklas",
    "Erik",
    "Mats",
    "Arne",
    "Knut",
]
NEUTRAL = ["Kim", "Robin", "Alex", "Sascha", "Charlie", "Luca", "Noa", "Toni", "Mika", "Sam", "Jo", "Eike"]

INTERESTS = [
    "Wandern",
    "Radfahren",
    "Kochen",
    "Backen",
    "Lesen",
    "Jazz",
    "Klassik",
    "Konzerte",
    "Theater",
    "Kino",
    "Segeln",
    "Schwimmen",
    "Gärtnern",
    "Fotografie",
    "Malen",
    "Tanzen",
    "Laufen",
    "Brettspiele",
    "Reisen",
    "die Ostsee",
    "Camping",
    "Angeln",
    "Handwerk",
    "Museen",
    "Chorsingen",
    "Fußball",
    "Tennis",
    "Pilze sammeln",
    "Flohmärkte",
    "Hunde",
    "Kanufahren",
    "Podcasts",
]
VALUE_KEYS = [
    "familie",
    "partnerschaft",
    "freundschaft",
    "freiheit",
    "sicherheit",
    "abenteuer",
    "tradition",
    "karriere",
    "gemeinschaft",
    "natur",
    "kultur",
    "nachhaltigkeit",
    "bildung",
    "ehrlichkeit",
    "verlaesslichkeit",
    "bewegung",
]
LIFESTYLE_KEYS = ["aktiv", "gesellig", "naturnah", "staedtisch", "ruhig", "spontan"]
PERSONALITY_KEYS = [
    "offenheit",
    "gewissenhaftigkeit",
    "extraversion",
    "vertraeglichkeit",
    "emotionale_stabilitaet",
    "humor",
]
WANTS = [
    ("persoenlichkeit", "Jemand, der gut zuhören kann.", 3),
    ("persoenlichkeit", "Humor ist mir wichtig.", 2),
    ("lebensstil", "Gern jemand, der auch mal spontan an die Ostsee fährt.", 2),
    ("werte", "Ehrlichkeit, auch wenn es unbequem ist.", 3),
    ("beziehung", "Ich suche etwas Langfristiges.", 3),
    ("beziehung", "Ich möchte es langsam angehen lassen.", 2),
    ("lebensstil", "Jemand, der Tiere mag.", 2),
    ("sonstiges", "Gemeinsam kochen wäre schön.", 1),
    ("lebensstil", "Am Wochenende lieber draußen als auf dem Sofa.", 2),
    ("werte", "Verlässlichkeit: Wer etwas zusagt, hält sich daran.", 3),
]
OTHER_DEALBREAKERS = [
    "Wer Tiere nicht mag, passt nicht zu mir.",
    "Keine Fernbeziehung auf Dauer.",
    "Wer nie Zeit hat, passt nicht zu mir.",
]
VALUE_WORDS = {
    "familie": "Familie",
    "partnerschaft": "eine verlässliche Partnerschaft",
    "freundschaft": "Freundschaften",
    "freiheit": "Freiraum",
    "sicherheit": "Beständigkeit",
    "abenteuer": "Abwechslung",
    "tradition": "Traditionen",
    "karriere": "Ihr Beruf",
    "gemeinschaft": "Gemeinschaft",
    "natur": "die Natur",
    "kultur": "Kultur",
    "nachhaltigkeit": "Nachhaltigkeit",
    "bildung": "Neues zu lernen",
    "ehrlichkeit": "Ehrlichkeit",
    "verlaesslichkeit": "Verlässlichkeit",
    "bewegung": "Bewegung",
}


@dataclass
class SimPerson:
    id: str
    email: str
    name: str
    gender: str
    seeking: list[str]
    address_form: str
    age: int
    birth_year: int
    plz: str
    lat: float
    lon: float
    profile: dict[str, Any]
    wants: list[tuple[str, str, int]]
    dealbreakers: list[tuple[str, dict[str, Any], str | None]]
    personal_weights: dict[str, float] | None
    religion: tuple[str, bool] | None
    windows: list[tuple[datetime, datetime]]
    flags: set[str] = field(default_factory=set)


def _beta(rnd: random.Random, a: float = 2.0, b: float = 2.0) -> float:
    return round(rnd.betavariate(a, b), 2)


def _pick_region(rnd: random.Random) -> tuple[str, str, float, float]:
    names = list(REGIONS)
    weights = [REGIONS[n][0] for n in names]
    region = rnd.choices(names, weights)[0]
    plz, _place, lat, lon = rnd.choice(REGIONS[region][1])
    return plz, region, lat + rnd.uniform(-0.01, 0.01), lon + rnd.uniform(-0.015, 0.015)


def _gender_and_seeking(rnd: random.Random) -> tuple[str, list[str]]:
    g = rnd.choices(["frau", "mann", "nichtbinaer"], [0.47, 0.47, 0.06])[0]
    other = {"frau": "mann", "mann": "frau"}.get(g)
    r = rnd.random()
    if g == "nichtbinaer":
        seeking = rnd.choice(
            [
                ["frau"],
                ["mann"],
                ["nichtbinaer"],
                ["frau", "nichtbinaer"],
                ["mann", "nichtbinaer"],
                ["frau", "mann", "nichtbinaer"],
            ]
        )
    elif r < 0.72:
        seeking = [other]
    elif r < 0.86:
        seeking = [g]
    elif r < 0.95:
        seeking = ["frau", "mann"]
    else:
        seeking = [other, "nichtbinaer"]
    return g, sorted(seeking)


def _summary(rnd: random.Random, p: dict[str, Any], form: str, name: str, inject_art9: bool, use_name: bool) -> str:
    du = form == "du"
    pers = p["personality"]
    ext = "eher gesellig" if pers["extraversion"] >= 0.55 else "eher ruhig"
    calm = "ausgeglichen" if pers["emotionale_stabilitaet"] >= 0.5 else "manchmal etwas nachdenklich"
    interests = p["life"]["interessen"]
    top_values = sorted(p["values"]["werte"].items(), key=lambda kv: -kv[1])[:2]
    vals = " und ".join(VALUE_WORDS.get(k, k) for k, _ in top_values)
    s = []
    if use_name:
        s.append(f"{name}, das haben wir aus unserem Gespräch mitgenommen.")
    s.append(f"{'Du beschreibst dich' if du else 'Sie beschreiben sich'} als {ext} und {calm}.")
    s.append(
        f"In {'deiner' if du else 'Ihrer'} freien Zeit {'magst du' if du else 'mögen Sie'} "
        f"{', '.join(interests[:-1]) + ' und ' + interests[-1] if len(interests) > 1 else interests[0]}."
    )
    s.append(f"Besonders wichtig {'sind dir' if du else 'sind Ihnen'} {vals}.")
    want = p["values"]["gegenueber"]
    if want:
        key = max(want, key=lambda k: want[k])
        s.append(
            f"{'Du wünschst dir' if du else 'Sie wünschen sich'} ein Gegenüber, bei dem "
            f"„{key.replace('_', ' ')}“ eine große Rolle spielt."
        )
    if p["wants_children"] == "ja":
        s.append(f"{'Du kannst dir' if du else 'Sie können sich'} Kinder gut vorstellen.")
    elif p["wants_children"] == "nein":
        s.append(f"Kinder {'planst du' if du else 'planen Sie'} nicht.")
    if inject_art9:
        s.append(f"{'Dein' if du else 'Ihr'} Glaube gibt {'dir' if du else 'Ihnen'} viel Halt.")
    s.append(
        f"{'Du gehst' if du else 'Sie gehen'} gern {'einen ruhigen Abend' if pers['extraversion'] < 0.5 else 'unter Leute'} an."
    )
    return " ".join(s)


def generate_people(n: int, seed: int, now: datetime, period_start: date, period_days: int) -> list[SimPerson]:
    rnd = random.Random(seed)
    people: list[SimPerson] = []
    year = now.astimezone(BERLIN).year
    for k in range(n):
        g, seeking = _gender_and_seeking(rnd)
        name = rnd.choice(FEMALE if g == "frau" else MALE if g == "mann" else NEUTRAL)
        age = rnd.randint(25, 65)
        plz, _region, lat, lon = _pick_region(rnd)
        form = "du" if rnd.random() < 0.35 else "sie"
        personality = {key: _beta(rnd) for key in PERSONALITY_KEYS}
        werte = {key: _beta(rnd, 2.5, 1.8) for key in rnd.sample(VALUE_KEYS, rnd.randint(6, 9))}
        gegenueber = {key: _beta(rnd, 3, 2) for key in rnd.sample(PERSONALITY_KEYS + VALUE_KEYS[:6], rnd.randint(2, 4))}
        smoking = rnd.choices(["nein", "gelegentlich", "ja"], [0.7, 0.15, 0.15])[0]
        has_children = rnd.random() < (0.55 if age > 35 else 0.15)
        if age < 40:
            wants_children = rnd.choices(["ja", "nein", "offen", "vielleicht"], [0.35, 0.2, 0.3, 0.15])[0]
        else:
            wants_children = rnd.choices(["ja", "nein", "offen", "vielleicht"], [0.05, 0.5, 0.3, 0.15])[0]
        life = {
            "lebensstil": {key: _beta(rnd) for key in rnd.sample(LIFESTYLE_KEYS, 4)},
            "interessen": rnd.sample(INTERESTS, rnd.randint(3, 6)),
            "arbeitszeiten": rnd.choices(["tagsueber", "schicht", "flexibel", "wochenende"], [0.6, 0.15, 0.2, 0.05])[0],
        }
        age_min = age_max = None
        if rnd.random() < 0.7:
            age_min = max(18, age - rnd.randint(2, 9))
            age_max = min(99, age + rnd.randint(3, 10))
        travel_km = rnd.choice([15, 20, 25, 30, 40, 50, 60, 80]) if rnd.random() < 0.6 else None
        travel_min = rnd.choice([20, 30, 45, 60, 90]) if rnd.random() < 0.3 else None
        modes = rnd.sample(["auto", "oepnv", "rad", "zu_fuss"], rnd.randint(1, 3))
        profile = {
            "personality": personality,
            "values": {"werte": werte, "gegenueber": gegenueber},
            "life": life,
            "age_min": age_min,
            "age_max": age_max,
            "travel_modes": modes,
            "travel_max_km": travel_km,
            "travel_max_minutes": travel_min,
            "smoking": smoking,
            "has_children": has_children,
            "wants_children": wants_children,
        }
        dealbreakers: list[tuple[str, dict[str, Any], str | None]] = []
        if smoking == "nein" and rnd.random() < 0.3:
            dealbreakers.append(("raucht", {"gelegentlich_ok": rnd.random() < 0.3}, None))
        if rnd.random() < 0.08:
            dealbreakers.append(("hat_kinder", {}, None))
        if wants_children == "nein" and rnd.random() < 0.3:
            dealbreakers.append(("will_kinder", {}, None))
        if wants_children == "ja" and rnd.random() < 0.4:
            dealbreakers.append(("will_keine_kinder", {}, None))
        if rnd.random() < 0.08:
            dealbreakers.append(("alter", {"min": max(18, age - 12), "max": age + 8}, None))
        if rnd.random() < 0.08:
            dealbreakers.append(("entfernung", {"max_km": rnd.choice([10, 20, 30])}, None))
        if rnd.random() < 0.12:
            dealbreakers.append(("sonstiges", {}, rnd.choice(OTHER_DEALBREAKERS)))
        wants = rnd.sample(WANTS, rnd.randint(1, 3))
        weights = None
        if rnd.random() < 0.3:
            raw = {
                key: rnd.uniform(0.05, 0.5)
                for key in ("werte", "wuensche", "lebensumstaende", "persoenlichkeit", "zeiten")
            }
            total = sum(raw.values())
            weights = {key: round(v / total, 3) for key, v in raw.items()}
        religion = None
        if rnd.random() < 0.2:
            religion = (
                rnd.choice(["christlich", "muslimisch", "jüdisch", "buddhistisch", "keine"]),
                rnd.random() < 0.25,
            )
        windows: list[tuple[datetime, datetime]] = []
        for day in sorted(rnd.sample(range(period_days), rnd.randint(2, 6))):
            d = period_start + timedelta(days=day)
            local_day = datetime(d.year, d.month, d.day, tzinfo=BERLIN)
            if d.weekday() >= 5 and rnd.random() < 0.4:
                start = local_day + timedelta(hours=rnd.choice([11, 12, 13]))
                windows.append((start, start + timedelta(hours=rnd.choice([3, 4, 5]))))
            else:
                start = local_day + timedelta(hours=17, minutes=rnd.choice([0, 30, 60, 90, 120]))
                windows.append((start, start + timedelta(hours=rnd.choice([3, 4, 5]))))
        pid = str(uuid.UUID(int=rnd.getrandbits(128), version=4))
        person = SimPerson(
            id=pid,
            email=f"p{k:05d}.{pid[:8]}@{SIM_DOMAIN}",
            name=name,
            gender=g,
            seeking=seeking,
            address_form=form,
            age=age,
            birth_year=year - age,
            plz=plz,
            lat=lat,
            lon=lon,
            profile=profile,
            wants=wants,
            dealbreakers=dealbreakers,
            personal_weights=weights,
            religion=religion,
            windows=windows,
        )
        profile["summary"] = _summary(
            rnd,
            profile | {"values": profile["values"]},
            form,
            name,
            inject_art9=rnd.random() < 0.03,
            use_name=rnd.random() < 0.05,
        )
        # Ein kleiner Teil fällt absichtlich aus dem Pool.
        r = rnd.random()
        for flag, limit in (
            ("unverified", 0.03),
            ("no_consent", 0.05),
            ("unconfirmed", 0.08),
            ("not_ready", 0.10),
            ("suspended", 0.11),
            ("no_windows", 0.13),
            ("no_evenings", 0.16),
        ):
            if r < limit:
                person.flags.add(flag)
                break
        people.append(person)
    return people


def ensure_test_environment(conn: psycopg.Connection) -> str:
    env = conn.execute("select ops.environment()").fetchone()[0]
    if env not in ("test", "local", "ci"):
        raise RuntimeError(f"Simulation nur in test, local oder ci erlaubt (diese Datenbank: {env}).")
    return env


def reset_simulation(conn: psycopg.Connection) -> None:
    with conn.transaction():
        conn.execute(
            """create temp table if not exists _sim_runs on commit drop as
               select distinct m.run_id from app.match_run_members m join auth.users u on u.id = m.user_id
               where u.email like %s""",
            (f"%@{SIM_DOMAIN}",),
        )
        conn.execute("delete from app.pairings where run_id in (select run_id from _sim_runs)")
        conn.execute("delete from app.match_runs where id in (select run_id from _sim_runs)")
        conn.execute(
            "delete from app.pairings where user_a in (select id from auth.users where email like %s)",
            (f"%@{SIM_DOMAIN}",),
        )
        conn.execute("delete from auth.users where email like %s", (f"%@{SIM_DOMAIN}",))
        conn.execute("delete from app.venues where name like %s", (f"{SIM_VENUE_PREFIX}%",))
        conn.execute(
            """delete from app.match_runs r where not exists (select 1 from app.pairings p where p.run_id = r.id)
               and not exists (select 1 from app.match_run_members m where m.run_id = r.id)
               and r.period_id in (select p.id from app.availability_periods p
                                   where not exists (select 1 from app.availability_windows w where w.period_id = p.id))"""
        )
        conn.execute(
            """delete from app.availability_periods p
               where not exists (select 1 from app.availability_windows w where w.period_id = p.id)
                 and not exists (select 1 from app.match_runs r where r.period_id = p.id)"""
        )


def create_period(conn: psycopg.Connection, start: date, days: int, now: datetime) -> str:
    end = start + timedelta(days=days - 1)
    row = conn.execute(
        """insert into app.availability_periods (starts_on, ends_on, ask_at, answer_until)
           values (%s, %s, %s, %s)
           on conflict (starts_on, ends_on) do update set answer_until = excluded.answer_until
           returning id::text""",
        (start, end, now - timedelta(days=7), now - timedelta(minutes=5)),
    ).fetchone()
    return row[0]


def seed_venues(conn: psycopg.Connection, start: date, days: int, seed: int) -> int:
    rnd = random.Random(seed + 1)
    n_slots = 0
    for name, plz, city, lat, lon in VENUES:
        vid = conn.execute(
            """insert into app.venues (name, street, postal_code, city, lat, lon, reservation_mode, active)
               values (%s, 'Simulationsweg 1', %s, %s, %s, %s, 'email', true) returning id""",
            (SIM_VENUE_PREFIX + name, plz, city, lat, lon),
        ).fetchone()[0]
        rows = []
        for day in range(days):
            d = start + timedelta(days=day)
            local_day = datetime(d.year, d.month, d.day, tzinfo=BERLIN)
            times = [(18, 0), (18, 30), (19, 0), (19, 30), (20, 0)]
            if d.weekday() >= 5:
                times = [(12, 0), (13, 0), (14, 30), *times]
            for h, m in times:
                rows.append((vid, local_day + timedelta(hours=h, minutes=m), rnd.randint(2, 4)))
        with conn.cursor() as cur:
            cur.executemany("insert into app.venue_slots (venue_id, starts_at, tables) values (%s, %s, %s)", rows)
        n_slots += len(rows)
    return n_slots


def seed_people(conn: psycopg.Connection, people: list[SimPerson], period_id: str) -> None:
    for plz_list in REGIONS.values():
        for plz, place, lat, lon in plz_list[1]:
            conn.execute(
                """insert into app.postal_codes (postal_code, place_name, lat, lon, state) values (%s, %s, %s, %s, null)
                   on conflict (postal_code) do nothing""",
                (plz, place, lat, lon),
            )
    ids = [p.id for p in people]
    conn.execute(
        """insert into auth.users (id, email, aud, role, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
           select x.id, x.email, 'authenticated', 'authenticated', now(), now(), '{}'::jsonb, '{}'::jsonb
           from unnest(%s::uuid[], %s::text[]) as x (id, email)""",
        (ids, [p.email for p in people]),
    )
    conn.execute(
        """insert into app.accounts (user_id, status, address_form)
           select x.id, 'active', x.f from unnest(%s::uuid[], %s::text[]) as x (id, f)""",
        (ids, [p.address_form for p in people]),
    )
    verified = [p for p in people if "unverified" not in p.flags]
    conn.execute(
        """insert into app.verifications (user_id, status, is_adult, birth_year, name_match, birth_date_match, completed_at)
           select x.id, 'approved', true, x.y, true, true, now() from unnest(%s::uuid[], %s::int[]) as x (id, y)""",
        ([p.id for p in verified], [p.birth_year for p in verified]),
    )
    consent_rows: list[tuple[str, str]] = []
    for p in people:
        consent_rows.append((p.id, "art9_profile"))
        if "no_consent" not in p.flags:
            consent_rows.append((p.id, "gespraech"))
        if p.religion:
            consent_rows.append((p.id, "art9_religion"))
    conn.execute(
        """insert into app.consents (user_id, kind, action, document_version)
           select x.id, x.k, 'granted', 'sim-v1' from unnest(%s::uuid[], %s::text[]) as x (id, k)""",
        ([r[0] for r in consent_rows], [r[1] for r in consent_rows]),
    )
    conn.execute(
        """insert into sensitive.profile_identity (user_id, gender_enc, seeking_genders_enc)
           select x.id, sensitive.enc(x.g), sensitive.enc(x.s) from unnest(%s::uuid[], %s::text[], %s::text[]) as x (id, g, s)""",
        (ids, [p.gender for p in people], [",".join(p.seeking) for p in people]),
    )
    rel = [p for p in people if p.religion]
    if rel:
        conn.execute(
            """insert into sensitive.profile_sensitive (user_id, religion_enc, religion_importance_enc, religion_must_match)
               select x.id, sensitive.enc(x.r), sensitive.enc(case when x.m then 'wichtig' else 'etwas' end), x.m
               from unnest(%s::uuid[], %s::text[], %s::boolean[]) as x (id, r, m)""",
            (
                [p.id for p in rel],
                [p.religion[0] for p in rel if p.religion],
                [p.religion[1] for p in rel if p.religion],
            ),
        )
    rows = []
    for p in people:
        pr = p.profile
        rows.append(
            (
                p.id,
                p.name,
                p.birth_year,
                pr["summary"],
                None if "unconfirmed" in p.flags else datetime.now(UTC),
                json.dumps(pr["personality"]),
                json.dumps(pr["values"]),
                json.dumps(pr["life"]),
                pr["age_min"],
                pr["age_max"],
                pr["travel_modes"],
                pr["travel_max_minutes"],
                pr["travel_max_km"],
                pr["smoking"],
                pr["has_children"],
                pr["wants_children"],
                "not_ready" not in p.flags,
            )
        )
    with conn.cursor() as cur:
        cur.executemany(
            """insert into app.profile_core (user_id, display_name, birth_year, summary_text, summary_version,
                 summary_confirmed_at, personality, values_profile, life_circumstances, age_min, age_max, travel_modes,
                 travel_max_minutes, travel_max_km, smoking, has_children, wants_children, ready_for_matching)
               values (%s, %s, %s, %s, 1, %s, %s::jsonb, %s::jsonb, %s::jsonb, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
            rows,
        )
        cur.executemany(
            "insert into app.geo (user_id, postal_code, lat, lon) values (%s, %s, %s, %s)",
            [(p.id, p.plz, p.lat, p.lon) for p in people],
        )
        cur.executemany(
            "insert into app.wants (user_id, category, text, importance) values (%s, %s, %s, %s)",
            [(p.id, c, t, i) for p in people for c, t, i in p.wants],
        )
        cur.executemany(
            "insert into app.dealbreakers (user_id, kind, value, text) values (%s, %s, %s::jsonb, %s)",
            [(p.id, k, json.dumps(v), t) for p in people for k, v, t in p.dealbreakers],
        )
        cur.executemany(
            "insert into app.personal_weights (user_id, weights) values (%s, %s::jsonb)",
            [(p.id, json.dumps(p.personal_weights)) for p in people if p.personal_weights],
        )
        cur.executemany(
            "insert into app.availability_windows (user_id, period_id, starts_at, ends_at) values (%s, %s, %s, %s)",
            [(p.id, period_id, s, e) for p in people if "no_windows" not in p.flags for s, e in p.windows],
        )
        cur.executemany(
            "insert into billing.evening_ledger (user_id, kind, amount, note) values (%s, 'free_grant', 1, 'Simulation')",
            [(p.id,) for p in people if "no_evenings" not in p.flags],
        )
        cur.executemany(
            """insert into safety.sanctions (user_id, kind, reason) values (%s, 'vorlaeufige_sperre', 'Simulation')""",
            [(p.id,) for p in people if "suspended" in p.flags],
        )
    # ein paar Blockierungen
    rnd = random.Random(len(people))
    blocks = set()
    for _ in range(max(1, len(people) // 100)):
        a, b = rnd.sample(people, 2)
        blocks.add((a.id, b.id))
    with conn.cursor() as cur:
        cur.executemany(
            "insert into app.blocks (blocker, blocked) values (%s, %s) on conflict do nothing", list(blocks)
        )


def add_windows_for_period(
    conn: psycopg.Connection, people: list[SimPerson], period_id: str, start: date, days: int, seed: int
) -> None:
    rnd = random.Random(seed)
    rows = []
    for p in people:
        for day in sorted(rnd.sample(range(days), rnd.randint(2, 6))):
            d = start + timedelta(days=day)
            local_day = datetime(d.year, d.month, d.day, tzinfo=BERLIN)
            s = local_day + timedelta(hours=17, minutes=rnd.choice([0, 30, 60, 90]))
            rows.append((p.id, period_id, s, s + timedelta(hours=rnd.choice([3, 4, 5]))))
    with conn.cursor() as cur:
        cur.executemany(
            "insert into app.availability_windows (user_id, period_id, starts_at, ends_at) values (%s, %s, %s, %s)",
            rows,
        )


def approve_all(admin_conn: psycopg.Connection, run_id: str) -> dict[str, Any]:
    """Benn spielen: alle Vorschläge mit Empfehlung „freigeben“ freigeben, den Rest ablehnen, Lauf abschließen."""
    admin_id = admin_conn.execute(
        """insert into auth.users (id, email, aud, role, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
           values (gen_random_uuid(), %s, 'authenticated', 'authenticated', now(), now(), '{}', '{}') returning id::text""",
        (f"admin.{uuid.uuid4().hex[:8]}@{SIM_DOMAIN}",),
    ).fetchone()[0]
    admin_conn.execute("insert into app.admin_users (user_id, display_name) values (%s, 'Simulation')", (admin_id,))
    approved = rejected = failed = 0
    errors: dict[str, int] = {}
    with admin_conn.transaction():
        admin_conn.execute(
            "select set_config('request.jwt.claims', %s, true)",
            (json.dumps({"sub": admin_id, "role": "authenticated", "aal": "aal2"}),),
        )
        admin_conn.execute("set local role authenticated")
        rows = admin_conn.execute(
            "select pairing_id::text, review_notes ->> 'empfehlung' from api.admin_run_pairings(%s)", (run_id,)
        ).fetchall()
        for pid, rec in rows:
            try:
                with admin_conn.transaction():
                    if rec in (None, "freigeben", "genauer_pruefen"):
                        admin_conn.execute("select api.admin_approve_pairing(%s, 'Simulation')", (pid,))
                        approved += 1
                    else:
                        admin_conn.execute("select api.admin_reject_pairing(%s, 'Simulation')", (pid,))
                        rejected += 1
            except psycopg.Error as e:
                failed += 1
                msg = (e.diag.message_primary or str(e))[:80]
                errors[msg] = errors.get(msg, 0) + 1
        fin = admin_conn.execute("select api.admin_finish_run(%s, true)", (run_id,)).fetchone()[0]
    evenings = admin_conn.execute(
        "select count(*) from app.evenings e join app.pairings p on p.id = e.pairing_id where p.run_id = %s", (run_id,)
    ).fetchone()[0]
    return {
        "freigegeben": approved,
        "abgelehnt": rejected,
        "nicht_moeglich": failed,
        "fehler": errors,
        "abschluss": fin,
        "abende": evenings,
    }


@dataclass
class SimulationResult:
    profiles: int
    seed_seconds: float
    runs: list[RunOutcome]
    approvals: list[dict[str, Any]]


def simulate(
    admin_url: str,
    *,
    profiles: int = 200,
    seed: int = 42,
    rounds: int = 1,
    approve: bool = False,
    matcher_role: str = "fermata_matcher",
    art9_rate: float = 0.03,
    assignment_engine: str = "auto",
    art9_check: str = "batch",
    log=print,
) -> SimulationResult:
    admin = psycopg.connect(admin_url, autocommit=True, application_name="fermata-matcher-simulation")
    ensure_test_environment(admin)
    now = admin.execute("select app.now()").fetchone()[0]
    period_days = 14
    start = now.astimezone(BERLIN).date() + timedelta(days=4)

    t0 = time.perf_counter()
    reset_simulation(admin)
    people = generate_people(profiles, seed, now, start, period_days)
    with admin.transaction():
        period_id = create_period(admin, start, period_days, now)
        n_slots = seed_venues(admin, start, period_days * max(1, rounds), seed)
        seed_people(admin, people, period_id)
    seed_seconds = time.perf_counter() - t0
    log(f"Simulation: {profiles} Profile, {len(VENUES)} Lokale ({n_slots} Plätze) angelegt in {seed_seconds:.1f} s.")

    outcomes: list[RunOutcome] = []
    approvals: list[dict[str, Any]] = []
    for r in range(rounds):
        if r > 0:
            s = start + timedelta(days=period_days * r)
            with admin.transaction():
                period_id = create_period(admin, s, period_days, now)
                add_windows_for_period(admin, people, period_id, s, period_days, seed + 100 + r)
        matcher = connect(admin_url, None, application_name="fermata-matcher-sim-run")
        set_role(matcher, matcher_role)
        runner = Runner(
            matcher,
            RunOptions(
                llm=FakeLLM(art9_rate=art9_rate),
                embedder=FakeEmbedder(),
                art9_check=art9_check,
                assignment_engine=assignment_engine,
                llm_backend_name="fake",
                embedding_backend_name="fake",
            ),
        )
        outcome = runner.run(period_id=period_id)
        matcher.close()
        outcomes.append(outcome)
        if approve:
            approvals.append(approve_all(admin, outcome.run_id))
    admin.close()
    return SimulationResult(profiles, seed_seconds, outcomes, approvals)
