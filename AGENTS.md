# Hinweise fuer Agents und Tools

## Commits

- **Keine KI-Attribution.** Keine `Co-Authored-By:`-Trailer auf KI-Tools (Codebuff, Claude, Cursor, ...)
  und keine `Generated with ...`-Zeilen in Commit-Nachrichten. GitHub zaehlt diese Trailer als eigene
  Contributors, und hier soll nur der Mensch stehen, der die Aenderung verantwortet.
- Commit-Nachrichten enden mit dem letzten inhaltlichen Absatz.
- Sprache der Nachrichten: Englisch, Stil wie in der Historie (`feat:`, `fix:`, `release:`).

## Version und Release

- Die Version steht nur in `package.json`; der Android-Build (`android/app/build.gradle`) liest sie von
  dort, der Renderer bekommt sie als `__APP_VERSION__`.
- Ein Release entsteht so: Version in `package.json` erhoehen, committen, pushen, dann ein GitHub-Release
  mit Tag `vX.Y.Z` veroeffentlichen. Die Workflows `windows-release`, `linux-release` und `android.yml`
  bauen danach Installer, AppImage/.deb und APK und haengen sie samt `latest.yml` an das Release.
- Der Changelog wird nicht doppelt gepflegt: er steht im Text des GitHub-Releases und wird von der App
  gelesen (Update-Fenster und "Was ist neu").

## Sicherheit

- Keine Schluessel, Tokens oder Sitzungsdaten committen. Secrets der App liegen im Secrets-Bereich.
