!macro preInit
  ; Electron-builder lit SHCTX (HKCU pour install user) en 64-bit APRES preInit.
  ; On ecrit dans les 4 combinaisons (32/64-bit x HKCU/HKLM) pour etre sur.
  SetRegView 64
  WriteRegExpandStr HKCU "${INSTALL_REGISTRY_KEY}" "InstallLocation" "C:\eBook Translate"
  ClearErrors
  WriteRegExpandStr HKLM "${INSTALL_REGISTRY_KEY}" "InstallLocation" "C:\eBook Translate"
  ClearErrors
  SetRegView 32
  WriteRegExpandStr HKCU "${INSTALL_REGISTRY_KEY}" "InstallLocation" "C:\eBook Translate"
  ClearErrors
  WriteRegExpandStr HKLM "${INSTALL_REGISTRY_KEY}" "InstallLocation" "C:\eBook Translate"
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
  Sleep 1000
!macroend
