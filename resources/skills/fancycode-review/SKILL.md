---
name: fancycode-review
description: "Code-Review von Änderungen (git diff, Branch, Pull Request): echte Fehler, Sicherheitslücken und Randfälle finden, priorisiert und mit konkretem Vorschlag. Verwenden bei „review“, „prüf mal“, „schau drüber“, vor Commits und Pull Requests."
---

# Code-Review

1. **Umfang klären.** Standard: `git diff` (ungestaged + gestaged). Bei Branch: `git diff <basis>...HEAD`. Bei PR: `gh pr diff <nr>`.
2. **Kontext lesen.** Zu jeder geänderten Stelle die umgebende Funktion und ihre Aufrufer lesen, nicht nur die Diff-Zeilen.
3. **Wonach suchen (in dieser Reihenfolge):**
   - Falsches Verhalten: Logikfehler, vertauschte Bedingungen, Off-by-one, fehlendes `await`, Null/undefined, Fehlerpfade, Nebenläufigkeit.
   - Sicherheit: Eingaben in Shell/SQL/HTML/Pfaden ohne Escaping, Geheimnisse im Code oder Log, fehlende Rechteprüfung.
   - Daten: Migrationen, die Daten verlieren; Formate, die alte Versionen nicht mehr lesen.
   - Erst danach: Lesbarkeit, Doppelungen, Performance mit messbarer Wirkung.
4. **Nur Belegbares melden.** Jeder Punkt mit `pfad:zeile`, einem konkreten Szenario (Eingabe → falsches Ergebnis) und einem Vorschlag. Geschmacksfragen und Stil-Kleinkram weglassen, wenn der Nutzer nicht danach fragt.
5. **Ergebnis.** Sortiert nach Schwere: 🔴 muss behoben werden, 🟡 sollte, ⚪ optional. Kein Fund ist ein gültiges Ergebnis. Änderungen nur machen, wenn der Nutzer es möchte.
