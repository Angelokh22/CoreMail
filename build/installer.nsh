!macro customInstall
  DeleteRegKey HKLM "SOFTWARE\Clients\Mail\CoreMail"
  WriteRegStr HKLM "SOFTWARE\Clients\Mail\CoreMail" "" "CoreMail"
  WriteRegStr HKLM "SOFTWARE\Clients\Mail\CoreMail\Capabilities" "ApplicationDescription" "CoreMail Email Client"
  WriteRegStr HKLM "SOFTWARE\Clients\Mail\CoreMail\Capabilities\UrlAssociations" "mailto" "CoreMail.mailto"
  
  WriteRegStr HKCR "CoreMail.mailto" "" "URL:MailTo Protocol"
  WriteRegStr HKCR "CoreMail.mailto" "URL Protocol" ""
  WriteRegStr HKCR "CoreMail.mailto\shell\open\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'
  
  WriteRegStr HKLM "SOFTWARE\RegisteredApplications" "CoreMail" "SOFTWARE\Clients\Mail\CoreMail\Capabilities"
!macroend

!macro customUnInstall
  DeleteRegKey HKLM "SOFTWARE\Clients\Mail\CoreMail"
  DeleteRegKey HKCR "CoreMail.mailto"
  DeleteRegValue HKLM "SOFTWARE\RegisteredApplications" "CoreMail"
!macroend
