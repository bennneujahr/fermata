"""Viola: Gesprächs-Agent von Fermata (Stimme und Text), Hintergrund- und Sicherheits-Agent.

Grundsätze (PLAN 1 Nr. 4–5, 2.2):
- Viola ist klar als KI benannt (Art. 50 AI Act) und sagt das zu Beginn jedes Gesprächs.
- Rohaudio wird nirgends gespeichert; der Dienst schreibt nur Text über die Edge Function interview-agent.
- Art.-9-Inhalte gelangen nie in Profil oder Zusammenfassung (Filter vor dem Speichern, Gegenprüfung in SQL).
"""

__version__ = "0.1.0"
