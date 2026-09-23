; Pri deinstalaciji ukloni i stavku za automatsko pokretanje sa Windows-om
; (Electron je upisuje pod AppUserModelId aplikacije).
!macro customUnInstall
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "com.vanja.knjigabudzeta"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "com.vanja.knjigabudzeta"
!macroend
