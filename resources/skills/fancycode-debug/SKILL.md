---
name: fancycode-debug
description: "Systematische Fehlersuche: Bug reproduzieren, Ursache eingrenzen, gezielt beheben und mit einem Test absichern. Verwenden bei Fehlermeldungen, Abstürzen, Stacktraces, falschem Verhalten, flackernden Tests oder „geht nicht“."
---

# Fehler systematisch finden

1. **Reproduzieren.** Den genauen Fehler auslösen (Befehl, Test, Eingabe) und die vollständige Meldung lesen. Ohne Reproduktion nur Vermutungen äußern, nichts „auf Verdacht“ umbauen.
2. **Eingrenzen.** Vom Stacktrace bzw. der ersten Fehlerzeile aus rückwärts: Welche Datei, welche Zeile, welcher Wert? Logs, `git log -p` / `git diff` der betroffenen Stelle und letzte Änderungen ansehen. Hypothesen einzeln prüfen (Ausgabe, kleiner Testlauf), die widerlegten verwerfen.
3. **Ursache statt Symptom.** Ein `try/catch`, das den Fehler verschluckt, oder ein Sonderfall für genau diese Eingabe ist keine Lösung. Prüfen, ob dieselbe Ursache an anderen Stellen steckt (grep nach dem Muster).
4. **Kleinste passende Änderung.** Stil des Projekts beibehalten, nichts nebenbei umbauen.
5. **Absichern.** Einen Test schreiben, der vorher fehlschlägt und jetzt grün ist, wenn das Projekt Tests hat. Danach die betroffene Testsuite bzw. den Build laufen lassen.
6. **Melden.** In 2–4 Sätzen: Ursache, Änderung (pfad:zeile), wie geprüft. Was nicht geprüft werden konnte, ausdrücklich sagen.
