!macro preInit
  ; Electron-builder lit HKCU\Software\com.helltrucker.ebook-translate\InstallLocation
  ; dans .onInit apres avoir pose sa valeur par defaut.
  ; On ecrit TOUJOURS ici pour garantir que C:\eBook Translate soit le defaut.
  WriteRegStr HKCU "Software\com.helltrucker.ebook-translate" "InstallLocation" "C:\eBook Translate"
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
