// Identidade COM da câmera virtual "SC PTZ Virtual Cam".
//
// CLSID_ScPtzCamSource é a coclass da media source registrada em
// HKLM\Software\Classes\CLSID\{...}\InprocServer32. O Frame Server do Windows a instancia
// (CoCreateInstance) quando um app abre a câmera; é este mesmo CLSID que passamos como
// sourceId em MFCreateVirtualCamera.
//
// NÃO reutilizar este GUID em outro projeto — em especial, ele é DIFERENTE do CLSID da
// "Play NVR Cam": os dois aplicativos precisam poder conviver na mesma máquina.
#pragma once

#include <initguid.h>
#include <guiddef.h>

// {FF324BA5-C131-4546-972A-097595024791}
DEFINE_GUID(CLSID_ScPtzCamSource,
    0xff324ba5, 0xc131, 0x4546, 0x97, 0x2a, 0x09, 0x75, 0x95, 0x02, 0x47, 0x91);

#define SCVCAM_CLSID_STRING   L"{FF324BA5-C131-4546-972A-097595024791}"
#define SCVCAM_FRIENDLY_NAME  L"SC PTZ Virtual Cam"
