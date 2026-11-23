---
name: fancycode-desktop
description: "Zusammenarbeit mit FancyCode Desktop über dessen MCP-Server (Werkzeuge fancycode_*): erkennen, ob man in FancyCode Desktop läuft, Popups bei Start und Ende einer Aufgabe, Fragen mit Buttons und Formulare an den Nutzer, andere Terminals und Agenten steuern, Workspaces öffnen. Verwenden, sobald fancycode_*-Werkzeuge verfügbar sind und eine längere Aufgabe beginnt, endet oder eine Entscheidung des Nutzers braucht."
---

# Mit FancyCode Desktop arbeiten

**Läufst du darin?** `fancycode_context` aufrufen (oder `FANCYCODE_DESKTOP=1` in der Umgebung prüfen). Es nennt auch dein
eigenes Terminal (`FANCYCODE_SESSION_ID`) – das steuerst du nie selbst über `fancycode_send`/`fancycode_keys`.
Beim Start meldet FancyCode Desktop automatisch unten rechts „Verbunden mit <Harness>“ (5 Sekunden).

FancyCode Desktop zeigt deine Meldungen als Popup im Fenster (und als System-Benachrichtigung, wenn das Fenster
im Hintergrund ist). Unter jedem Popup ist ein Button, der den Nutzer direkt zu deinem Terminal bringt.

## Popups (`fancycode_notify`)
- **Beim Start einer längeren Aufgabe** (mehr als ein paar Schritte): ein Popup `kind: "info"`, Titel z. B. „Arbeite an: Login-Fehler“.
  Die Verbindung meldet FancyCode Desktop selbst, dafür kein eigenes Popup.
- **Wenn die Aufgabe fertig ist:** genau ein Popup `kind: "success"` mit Titel „Aufgabe fertig“ und einer Zeile Ergebnis.
- **Wenn du festhängst** (Fehler, fehlende Rechte, Login nötig): `kind: "warning"` bzw. `"error"` mit dem, was der Nutzer tun muss.
- Höchstens ein Popup pro Abschnitt, keine Zwischenstände im Minutentakt. Texte kurz, Deutsch, ohne Geheimnisse.

## Rückfragen (`fancycode_ask`)
- Für Entscheidungen mit wenigen klaren Antworten (2–4 Buttons), z. B. „Live deployen oder nur bauen?“.
- Die Antwort kommt als Text zurück. Kommt keine (Zeitüberschreitung), im Chat nachfragen statt zu raten.
- Offene Fragen (Namen, Pfade, lange Texte) lieber normal im Chat stellen.

## Formulare (`fancycode_form`)
- Wenn du mehrere Angaben auf einmal brauchst (z. B. Zielordner, Port, Version, Optionen): ein Formular statt vieler Einzelfragen.
- Felder: `text`, `textarea`, `number`, `select`/`radio` (mit `options`), `checkbox`; `required` für Pflichtfelder, `default` für Vorschläge.
- Nie Passwörter, Tokens oder Schlüssel per Formular abfragen.

## Andere Terminals steuern
1. `fancycode_overview`: Workspaces, Terminals (`session_id`), Accounts, V-Server und Swarm-Board-Zusammenfassung ansehen.
2. `fancycode_read`: Bildschirm eines Terminals lesen. Vor dem Senden prüfen, ob der Agent dort gerade arbeitet.
3. `fancycode_send`: Aufgabe schicken, dann `fancycode_wait` bis er fertig ist, dann `fancycode_read`.
4. Rückfragen im fremden Terminal mit `fancycode_keys` beantworten (`["down","enter"]`, `["y"]`).
5. Neue Terminals: `fancycode_start_terminal` / `fancycode_add_terminal`; aufräumen mit `fancycode_stop`.

Fremde Terminals nie mit `ctrl+c` abbrechen oder beenden, wenn der Nutzer es nicht gesagt hat.

## Swarm-Kanban-Board & Live-Terminal-Status
- `fancycode_status`: Zeigt im Grid- und Tab-Header von FancyCode Desktop live an, woran du gerade arbeitest (`status: "working" | "waiting" | "done"`, `activity: "Refactoring Auth"`).
- `fancycode_tasks_list`: Listet offene, laufende und erledigte Aufgaben vom gemeinsamen Swarm-Kanban-Board.
- `fancycode_task_create`: Legt neue Aufgaben oder Teilaufgaben für den Agent-Schwarm auf dem Board an.
- `fancycode_task_claim`: Übernimmt eine Aufgabe (`task_id`) vom Board, setzt sie auf `in_progress` und aktualisiert deinen Live-Terminal-Titel.
- `fancycode_task_update`: Markiert eine Aufgabe als `done` (inklusive `result`-Zusammenfassung) oder aktualisiert ihren Status.
