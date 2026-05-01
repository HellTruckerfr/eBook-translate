!macro preInit
  ; Electron-builder lit HKCU\Software\com.helltrucker.ebook-translate\InstallLocation
  ; apres avoir pose sa valeur par defaut — on ecrit en registre avant cette lecture
  SetRegView 64
  ReadRegStr $R0 HKCU "Software\com.helltrucker.ebook-translate" "InstallLocation"
  ${If} $R0 == ""
    WriteRegStr HKCU "Software\com.helltrucker.ebook-translate" "InstallLocation" "C:\eBook Translate"
  ${EndIf}
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
