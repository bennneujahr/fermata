# Fermata

Dating ohne Wischen, ohne Feed und ohne freien Chat: Fermata verabredet echte Abende in Partner-Lokalen,
zuerst in Westmecklenburg. Grundlage ist [PLAN.md](PLAN.md).

> Stand: Phase 1 im Bau. Alles, was noch eine Entscheidung braucht, steht in [docs/PLATZHALTER.md](docs/PLATZHALTER.md).

## Aufbau (Monorepo)

| Ordner | Inhalt |
|---|---|
| `apps/landing` | Landingpage mit Warteliste (Astro, statisch, eine Server-Funktion für Plakat-Kürzel) |
| `apps/web` | Web-App / PWA für Mitglieder und Admin (Next.js) |
| `packages/tokens` | Design-Tokens (CSS-Variablen, JSON, TypeScript) |
| `packages/brand` | Fermate (graviert, kompakt), Favicons, App-Symbole, Schriften, Animation „Atem“ |
| `packages/shared` | Gemeinsame Typen und Texte |
| `supabase` | Datenbank (Migrationen, RLS, pgTAP-Tests), Edge Functions (Deno), Mail-Vorlagen |
| `services/viola` | Sprach-Agent „Viola“ (Python, LiveKit) |
| `services/matcher` | Auswahl-Job (Python) |
| `docs` | Entscheidungen, Platzhalter, Datenkarte, Runbook |

## Schnellstart

```bash
pnpm install
pnpm checks          # Tokens, Tonalität, Kontraste, Größe von „Atem“
pnpm db:test         # Datenbank im Docker-Container starten, Migrationen + pgTAP-Tests
```
