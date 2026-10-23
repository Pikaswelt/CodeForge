#!/usr/bin/env python3
"""Sprachaufnahmen für die Einführung (src/components/WelcomeTour.tsx) mit ElevenLabs erzeugen.

Rohdateien bleiben in scripts/welcome-raw/ liegen und werden nie doppelt erzeugt (kostet Credits).
Fertige Dateien: public/welcome/<de|en>/NN.mp3 (lautheitsangeglichen, mono).
"""
import pathlib
import subprocess
import sys

EL = "/root/.agents/skills/elevenlabs/el.py"
ROOT = pathlib.Path(__file__).resolve().parent.parent
RAW = ROOT / "scripts" / "welcome-raw"
OUT = ROOT / "public" / "welcome"

VOICES = {
    "de": "nAsjqE0r0zhHFIRxx5kK",  # Tim – Clear and Natural Narrator
    "en": "6EGP7RTBu9DVkJNS0xHj",  # Adam Tyler – Friendly Explainer
}

LINES = {
    "de": [
        "[excited] Willkommen bei FancyCode Desktop! Aus CodeForge ist FancyCode geworden: neuer Name, neues Logo und jede Menge Neues. Ich zeig dir kurz, was sich geändert hat.",
        "Du brauchst jetzt nur noch ein FancyServers-Konto. Ein Login und ein Abo gelten für alle unsere Apps.",
        "Neu eingebaut ist FancyCode, unser eigener Coding-Agent. Er liest deinen Code, ändert Dateien und führt Befehle aus, ganz ohne eigenen API-Schlüssel.",
        "Unter Plugins findest du Erweiterungen. Mit dabei: der Minecraft Hub. Schalte ihn ein, und jede KI hilft dir bei Minecraft-Servern und Plugins, auf deinem Server oder hier auf dem PC.",
        "Skills sind fertige Anleitungen, zum Beispiel für Fehlersuche, Code-Review und Git. FancyCode Desktop gibt sie automatisch an FancyCode, Claude Code, OpenCode und Co. weiter.",
        "Und deine Agenten melden sich jetzt bei dir. Unten rechts siehst du, wenn einer verbunden ist, wenn er fertig ist oder wenn er eine Frage für dich hat. Ein Klick bringt dich direkt zur Arbeit.",
        "[warmly] Das war's schon! Jetzt richten wir alles für dich ein. Viel Spaß mit FancyCode Desktop!",
    ],
    "en": [
        "[excited] Welcome to FancyCode Desktop! CodeForge is now FancyCode: a new name, a new logo and lots of new things. Let me quickly show you what has changed.",
        "All you need now is one FancyServers account. One login and one plan work for all of our apps.",
        "New and built in: FancyCode, our own coding agent. It reads your code, edits files and runs commands, without an API key of your own.",
        "Under Plugins you'll find extensions, including the Minecraft Hub. Turn it on, and any AI helps you with Minecraft servers and plugins, on your server or right here on your PC.",
        "Skills are ready-made guides, for example for debugging, code review and Git. FancyCode Desktop hands them to FancyCode, Claude Code, OpenCode and more, automatically.",
        "And your agents now check in with you. In the bottom right corner you'll see when one connects, when it's done, or when it has a question for you. One click takes you straight to the work.",
        "[warmly] That's it! Now let's get everything set up for you. Have fun with FancyCode Desktop!",
    ],
}


def main():
    langs = sys.argv[1:] or list(LINES)
    for lang in langs:
        (RAW / lang).mkdir(parents=True, exist_ok=True)
        (OUT / lang).mkdir(parents=True, exist_ok=True)
        for index, text in enumerate(LINES[lang], start=1):
            raw = RAW / lang / f"{index:02d}.mp3"
            if not raw.exists():
                subprocess.run(["python3", EL, "tts", VOICES[lang], text, str(raw), "--model", "eleven_v4"], check=True)
            out = OUT / lang / f"{index:02d}.mp3"
            subprocess.run(
                ["ffmpeg", "-y", "-loglevel", "error", "-i", str(raw), "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-ac", "1", "-ar", "44100", "-b:a", "96k", str(out)],
                check=True,
            )
            print(out.relative_to(ROOT))


if __name__ == "__main__":
    main()
