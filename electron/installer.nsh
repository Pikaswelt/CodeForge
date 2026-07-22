; ── CodeForge Custom Installer Script ──


!macro preInit
  ; Versuche laufende Instanzen vorab zu beenden
  nsExec::Exec 'taskkill /im "CodeForge.exe" /t /f'
  nsExec::Exec 'taskkill /im "electron.exe" /t /f'
  Sleep 1000
!macroend

!macro customInit
  ; Zusätzliche Sicherheit beim Start des Installers
  nsExec::Exec 'taskkill /im "CodeForge.exe" /t /f'
  nsExec::Exec 'taskkill /im "electron.exe" /t /f'
  Sleep 1000
!macroend

!macro customUnInit
  ; Beende die Anwendung vor der Deinstallation
  nsExec::Exec 'taskkill /im "CodeForge.exe" /t /f'
  Sleep 1000
!macroend
