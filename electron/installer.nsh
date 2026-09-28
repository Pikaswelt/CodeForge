; -- CodeForge Custom Installer Script --

!macro preInit
  nsExec::Exec 'taskkill /im "CodeForge.exe" /t /f'
  nsExec::Exec 'taskkill /im "electron.exe" /t /f'
  Sleep 1000
!macroend

!macro customInit
  nsExec::Exec 'taskkill /im "CodeForge.exe" /t /f'
  nsExec::Exec 'taskkill /im "electron.exe" /t /f'
  Sleep 1000
!macroend

!macro customUnInit
  nsExec::Exec 'taskkill /im "CodeForge.exe" /t /f'
  Sleep 1000
!macroend

!macro customCheckAppRunning
  nsExec::Exec 'taskkill /im "CodeForge.exe" /t /f'
  nsExec::Exec 'taskkill /im "electron.exe" /t /f'
  Sleep 1000
!macroend

; An old uninstaller that fails (error 2) must not block the update with a
; dialog: the new files simply overwrite the old installation.
!macro customUnInstallCheck
  ClearErrors
  DetailPrint "Old uninstaller exit code $R0 ignored."
!macroend

!macro customUnInstallCheckCurrentUser
  ClearErrors
  DetailPrint "Old uninstaller exit code $R0 ignored."
!macroend
