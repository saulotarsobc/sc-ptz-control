; Passos extras do instalador NSIS para a câmera virtual "SC PTZ Virtual Cam".
;
; A media source (resources\ptz-bridge\ScPtzVCam.dll) é um componente COM: o Frame Server do
; Windows a instancia pelo CLSID quando outro aplicativo abre a câmera. Por isso o registro
; vai em HKLM e o instalador precisa ser por máquina (nsis.perMachine).
;
; O CLSID precisa bater com native\ScPtzVCam\Guids.h e com scripts\install-vcam.ps1.

!define VCAM_CLSID "{FF324BA5-C131-4546-972A-097595024791}"
!define VCAM_NAME  "SC PTZ Virtual Cam"

!macro customInstall
  DetailPrint "Registrando a câmera virtual ${VCAM_NAME}..."
  WriteRegStr HKLM "Software\Classes\CLSID\${VCAM_CLSID}" "" "${VCAM_NAME}"
  WriteRegStr HKLM "Software\Classes\CLSID\${VCAM_CLSID}\InprocServer32" "" "$INSTDIR\resources\ptz-bridge\ScPtzVCam.dll"
  WriteRegStr HKLM "Software\Classes\CLSID\${VCAM_CLSID}\InprocServer32" "ThreadingModel" "Both"

  ; Buffer de frames compartilhado entre o sidecar (sessão do usuário) e o Frame Server
  ; (conta de serviço). Sem a ACL permissiva o Frame Server não abre o arquivo e a câmera
  ; sai só com o quadro preto. *S-1-1-0 = Todos, na forma de SID por causa da localização.
  ExpandEnvStrings $0 "%ProgramData%"
  CreateDirectory "$0\ScPtzControl"
  nsExec::ExecToLog 'icacls "$0\ScPtzControl" /grant *S-1-1-0:(OI)(CI)M'
!macroend

!macro customUnInstall
  DeleteRegKey HKLM "Software\Classes\CLSID\${VCAM_CLSID}"

  ExpandEnvStrings $0 "%ProgramData%"
  Delete "$0\ScPtzControl\vcam-frames.bin"
  RMDir "$0\ScPtzControl"
!macroend
