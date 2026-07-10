; NSIS custom install — segundo acceso directo "VIM POS Cocina" que abre el MISMO ejecutable con
; --role=cocina (pantalla de cocina / cliente delgado del hub). El acceso directo normal
; "VIM POS" abre el rol caja. Un solo instalador, dos apps.

!macro customInstall
  CreateShortCut "$SMPROGRAMS\VIM POS Cocina.lnk" "$INSTDIR\VIM POS.exe" "--role=cocina" "$INSTDIR\VIM POS.exe" 0 SW_SHOWNORMAL "" "VIM POS - Pantalla de cocina"
  CreateShortCut "$DESKTOP\VIM POS Cocina.lnk" "$INSTDIR\VIM POS.exe" "--role=cocina" "$INSTDIR\VIM POS.exe" 0 SW_SHOWNORMAL "" "VIM POS - Pantalla de cocina"
!macroend

!macro customUnInstall
  Delete "$SMPROGRAMS\VIM POS Cocina.lnk"
  Delete "$DESKTOP\VIM POS Cocina.lnk"
!macroend
