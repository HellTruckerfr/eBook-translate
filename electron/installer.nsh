!macro customInstall
  nsExec::ExecToLog 'taskkill /F /IM "mvs-backend.exe" /T'
  nsExec::ExecToLog 'taskkill /F /IM "MVS Traduction.exe" /T'
  Sleep 1000
!macroend

!macro customUnInstall
  nsExec::ExecToLog 'taskkill /F /IM "mvs-backend.exe" /T'
  nsExec::ExecToLog 'taskkill /F /IM "MVS Traduction.exe" /T'
  Sleep 1000
!macroend
