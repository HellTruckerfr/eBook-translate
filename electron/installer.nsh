!macro preInit
  ; perMachine=true : SHCTX = HKLM. On ecrit dans les deux vues registre.
  SetRegView 64
  WriteRegExpandStr HKLM "${INSTALL_REGISTRY_KEY}" "InstallLocation" "C:\eBook Translate"
  ClearErrors
  WriteRegExpandStr HKCU "${INSTALL_REGISTRY_KEY}" "InstallLocation" "C:\eBook Translate"
  ClearErrors
  SetRegView 32
  WriteRegExpandStr HKLM "${INSTALL_REGISTRY_KEY}" "InstallLocation" "C:\eBook Translate"
  ClearErrors
  WriteRegExpandStr HKCU "${INSTALL_REGISTRY_KEY}" "InstallLocation" "C:\eBook Translate"
  ClearErrors
!macroend

!macro customInstall
  nsExec::ExecToLog 'taskkill /F /IM "ebook-backend.exe" /T'
  nsExec::ExecToLog 'taskkill /F /IM "eBook Translate.exe" /T'
  Sleep 1000
!macroend

!macro customUnInstall
  nsExec::ExecToLog 'taskkill /F /IM "ebook-backend.exe" /T'
  nsExec::ExecToLog 'taskkill /F /IM "eBook Translate.exe" /T'
  Sleep 3000
  ; Suppression forcée du backend et des ressources (contournement verrou PyInstaller)
  RMDir /r "$INSTDIR\resources"
  ; Batch différé : supprime le dossier principal après la sortie du désinstalleur
  FileOpen $0 "$TEMP\ebook-cleanup.bat" w
  FileWrite $0 "@echo off$\r$\n"
  FileWrite $0 "ping 127.0.0.1 -n 6 >nul$\r$\n"
  FileWrite $0 "rmdir /s /q $\"$INSTDIR$\"$\r$\n"
  FileClose $0
  Exec '"$SYSDIR\cmd.exe" /c start "" /min "$TEMP\ebook-cleanup.bat"'
!macroend
