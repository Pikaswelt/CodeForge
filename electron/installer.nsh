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