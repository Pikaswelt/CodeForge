---
name: fancycode-server
description: "Sicher auf Linux-Servern und V-Servern arbeiten: per SSH verbinden, Dienste (systemd, Docker, PM2) einrichten und neu starten, Logs lesen, deployen, Backups, Firewall und Ports. Verwenden bei Server, VPS, V-Server, Deploy, systemd, Docker, nginx, Ports und „läuft nicht online“."
---

# Auf Servern arbeiten

1. **Erst ansehen, dann ändern.** System (`uname -a`, `cat /etc/os-release`), Speicher (`df -h`, `free -h`), was läuft (`systemctl --type=service --state=running`, `docker ps`, `ss -tlnp`).
2. **Vor jeder Änderung sichern.** Configs kopieren (`cp datei datei.bak-$(date +%F)`), bei Datenbanken einen Dump anbieten.
3. **Dienste:** Logs mit `journalctl -u <dienst> -n 100 --no-pager` bzw. `docker logs --tail 100 <name>`. Nach Config-Änderungen erst prüfen (`nginx -t`, `systemd-analyze verify`), dann neu laden (`reload` vor `restart`).
4. **Deployen:** neue Version neben die alte legen und atomar umschalten (`mv`, Symlink), damit ein Fehler schnell zurückgerollt werden kann. Danach prüfen, ob der Dienst antwortet (`curl -fsS`, Port offen).
5. **Nie ohne ausdrückliche Zustimmung:** Daten löschen, Datenbanken leeren, Firewall so ändern, dass SSH wegfallen könnte, Dienste mit Nutzern darauf hart neu starten, Pakete im großen Stil aktualisieren.
6. **Geheimnisse** (Passwörter, Keys, Tokens) nie ausgeben, in den Chat schreiben oder in Repos legen. Für den Nutzer: Befehl nennen, mit dem er sie selbst setzt.
7. **Melden:** was geändert wurde, wie man es rückgängig macht, was geprüft wurde.
