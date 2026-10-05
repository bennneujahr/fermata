# Fermata

Dating ohne Wischen, ohne Feed und ohne freien Chat: Fermata verabredet echte Abende in Partner-Lokalen,
zuerst in Westmecklenburg. Grundlage ist [PLAN.md](PLAN.md).

> **Stand:** Phase 1 ist als Code gebaut (M0–M9). Es fehlen echte Konten bei den Anbietern (Supabase, Brevo, Stripe,
> Didit, AWS, Deepgram, LiveKit) und Entscheidungen, die nur du treffen kannst. Alles Offene steht in
> [docs/PLATZHALTER.md](docs/PLATZHALTER.md), der Weg zum Start in [docs/STARTCHECKLISTE.md](docs/STARTCHECKLISTE.md).
>
> **Pausiert seit 5. Oktober 2026.** Letzter geprüfter Stand: alle Tests grün, CI grün (Commit `2bd6b12`).
> Beim Wiedereinstieg:
> 1. Abhängigkeiten und Container-Versionen auf den aktuellen Stand bringen (Node-Pakete, Python-Pakete,
>    Supabase-Images in `scripts/db.sh` und `apps/web/scripts/stack.sh`, Modellnamen für Bedrock), dann alle Tests laufen lassen.
> 2. Rechtstexte und Rechtslage neu prüfen (`docs/recht/`, Kündigungs- und Widerrufsknopf, Preisangaben).
> 3. Mit der Liste „Zuerst entscheiden“ in [docs/PLATZHALTER.md](docs/PLATZHALTER.md) weitermachen.

## Wo du was findest

| Thema | Datei |
|---|---|
| Was noch entschieden werden muss | [docs/PLATZHALTER.md](docs/PLATZHALTER.md) |
| Technische Entscheidungen | [docs/DECISIONS.md](docs/DECISIONS.md) |
| Betrieb: Konten, Geheimnisse, Deployment, Routinen, Notfälle | [docs/RUNBOOK.md](docs/RUNBOOK.md) |
| Startcheckliste (M9) | [docs/STARTCHECKLISTE.md](docs/STARTCHECKLISTE.md) |
| Datenkarte: welche Daten wo, wie lange | [docs/DATA.md](docs/DATA.md) |
| Rechtstexte, DSFA, VVT, TOM, Löschkonzept (alles ENTWURF) | [docs/recht/](docs/recht/README.md) |
| Kennzahlen | [docs/KENNZAHLEN.md](docs/KENNZAHLEN.md) |
| Bereiche im Detail (Ablauf, Schnittstellen, Tests) | [docs/bereiche/](docs/bereiche/) |
| Bildschirmfotos | [docs/screenshots/](docs/screenshots/) |

## Aufbau (Monorepo)

| Ordner | Inhalt | Meilenstein |
|---|---|---|
| `apps/landing` | Landingpage mit Warteliste (Astro, statisch; eine Server-Funktion für Plakat-Kürzel) | M1 |
| `apps/web` | Web-App / PWA für Mitglieder und Admin (Next.js) | M2, Oberflächen M3–M7 |
| `packages/tokens` | Design-Tokens (CSS-Variablen, JSON, TypeScript), hell und dunkel | M0 |
| `packages/brand` | Fermate (graviert, kompakt), Favicons, App-Symbole, Schriften, Animation „Atem“ | M0 |
| `supabase/migrations` | Datenbank: Schemas, Tabellen, RLS, Regeln als SQL-Funktionen, Cron-Jobs | alle |
| `supabase/tests` | pgTAP-Tests der Datenbankregeln | alle |
| `supabase/functions` | Edge Functions (Deno): Warteliste, Konto, Ausweis, Gespräch, Benachrichtigungen, Zahlung, Sicherheit | alle |
| `services/viola` | Sprach-Agent „Viola“ (Python, LiveKit) und Textmodus | M3 |
| `services/matcher` | Auswahl-Job (Python): Filter, Scores, LLM-Bewertung, Zuordnung, Lokal | M4 |
| `scripts` | Prüfungen (Tonalität, Kontraste, Konfiguration) und Test-Datenbank | M0 |

## Ausprobieren auf dem eigenen Rechner

Voraussetzungen: Node 22, pnpm 10, Docker, Deno 2, Python 3.12 mit `uv`, `psql`.

```bash
pnpm install
pnpm checks                 # Tokens, Tonalität, Kontraste, Größe von „Atem“, Supabase-Konfiguration
pnpm db:test                # Test-Datenbank (Docker) + alle Migrationen + alle pgTAP-Tests
```

**Landingpage:** `cd apps/landing && pnpm dev` (http://localhost:4331). Mit Warteliste: siehe
[docs/bereiche/landing.md](docs/bereiche/landing.md). Eine Vorschau ohne Server baut
`pnpm --filter @fermata/landing preview:artifact`.

**Web-App mit allem Drum und Dran** (Datenbank, Anmeldung per Mail-Code, Mails in Mailpit, Edge Functions):

```bash
bash apps/web/scripts/stack.sh up       # lokaler Supabase-Ersatz
bash apps/web/scripts/serve-e2e.sh      # baut und startet die App auf http://localhost:3041
bash apps/web/scripts/stack.sh down     # alles wieder stoppen
```

Wie du dich als erste Person und als Admin anmeldest, steht in [docs/bereiche/web.md](docs/bereiche/web.md).

**Viola und Auswahl-Job:** `cd services/viola && uv run pytest`, `cd services/matcher && uv run pytest`;
Simulation mit 200 Profilen: [docs/bereiche/matcher.md](docs/bereiche/matcher.md).

## Tests

Jeder Push prüft in GitHub Actions: Prüfungen, Datenbank (pgTAP), Edge Functions (Deno), Landingpage (Build und
Playwright), Web-App (Typen, Lint, Vitest, Build, Playwright), Viola und Auswahl-Job (pytest, ruff, mypy).
Die Zahlen je Bereich stehen in den Dokumenten unter `docs/bereiche/`.

## Grundsätze, die im Code stecken

- **Regeln in der Datenbank:** Fristen, Kontingente, Sperren und Platznummern entscheidet Postgres
  (`api.*`-Funktionen, RLS auf jeder Tabelle). Die spätere Expo-App nutzt dieselben Regeln.
- **Datenschutz zuerst:** Art.-9-Daten verschlüsselt und nur über Ja/Nein-Prüffunktionen für die Auswahl,
  kein Rohaudio, Transkripte nach 30 Tagen gelöscht, keine Cookies auf der Landingpage, keine Drittanbieter im Browser.
- **Ein Mensch entscheidet:** Jeder Vorschlag und jede Sanktion braucht deine Freigabe (Admin nur mit Zwei-Faktor).
- **Einstellungen statt fester Zahlen:** Alle Startwerte liegen in `ops.app_settings` und lassen sich im Admin ändern.
- **Simulierte Uhr:** Alle Regeln fragen `app.now()`; in Tests lässt sich die Zeit vorstellen, in Produktion nicht.
