!macro preInit
  StrCpy $INSTDIR "C:\eBook Translate"
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
