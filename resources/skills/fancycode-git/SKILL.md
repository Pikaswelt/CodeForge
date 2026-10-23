---
name: fancycode-git
description: "Saubere Git-Arbeit: Branch anlegen, sinnvoll committen, Commit-Nachrichten schreiben, Pull Requests mit gh erstellen, Konflikte lösen. Verwenden bei commit, push, Branch, Pull Request, Merge- oder Rebase-Konflikten."
---

# Git und Pull Requests

- **Vorher schauen:** `git status`, `git diff`, `git log --oneline -10`. Fremde, nicht zur Aufgabe gehörende Änderungen nicht mitcommitten und nie verwerfen.
- **Branch:** Auf `main`/`master` nicht direkt committen, wenn das Repo mit Pull Requests arbeitet. Name: `fix/<kurz>`, `feat/<kurz>`.
- **Commits:** nur die Dateien der Aufgabe gezielt `git add <pfad>`. Keine Secrets, Build-Ausgaben oder `.env`-Dateien. Nachricht im Stil des Repos (sonst: kurze Zeile im Imperativ, Leerzeile, warum).
- **Push und PR nur auf Wunsch.** PR mit `gh pr create --title … --body …`: was, warum, wie getestet.
- **Konflikte:** jede Konfliktstelle verstehen (beide Seiten lesen), beide Absichten zusammenführen, danach bauen/testen. Nie blind `--ours`/`--theirs`.
- **Nie ohne ausdrücklichen Wunsch:** `push --force`, `reset --hard`, `clean -fd`, Branches löschen, History umschreiben auf geteilten Branches.
