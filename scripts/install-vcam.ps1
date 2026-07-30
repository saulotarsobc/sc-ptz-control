<#
.SYNOPSIS
    Registra a câmera virtual "SC PTZ Virtual Cam" no Windows (requer Administrador).
    USO EM DESENVOLVIMENTO: para o usuário final o instalador NSIS já faz este registro.

.DESCRIPTION
    Passo único de instalação do componente tipo-driver:
      1. Copia ScPtzVCam.dll para um local legível pelo Frame Server (Program Files).
      2. Registra o servidor COM em HKLM (regsvr32 -> DllRegisterServer).
      3. Cria %ProgramData%\ScPtzControl com ACL permissiva para o buffer de frames — o
         processo do Frame Server roda em conta de serviço e precisa ler/escrever ali.

    Depois disto, abra o SC PTZ Control e use "Ativar câmera virtual": o dispositivo passa a
    aparecer em OBS, Meet, Teams, app Câmera etc. Ele existe enquanto o aplicativo estiver
    aberto (câmera virtual de sessão, Windows 11). Para desregistrar: scripts/uninstall-vcam.ps1.
#>
#Requires -RunAsAdministrator
[CmdletBinding()]
param([string]$DllPath)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot

# Precisa bater com native/ScPtzVCam/Guids.h.
$clsid = '{FF324BA5-C131-4546-972A-097595024791}'

# Localiza a DLL: parâmetro, build nativo, ou ao lado deste script (pacote de release).
if (-not $DllPath) {
    $DllPath = @(
        (Join-Path $repo 'native/ScPtzVCam/build/Release/ScPtzVCam.dll'),
        (Join-Path $PSScriptRoot 'ScPtzVCam.dll')
    ) | Where-Object { Test-Path $_ } | Select-Object -First 1
}
if (-not $DllPath -or -not (Test-Path $DllPath)) {
    throw "ScPtzVCam.dll não encontrada. Rode scripts/build-vcam.ps1 antes, ou passe -DllPath."
}

# 1. Copia para um local estável e legível por serviços (não use pastas sob C:\Users\).
$installDir = Join-Path $env:ProgramFiles 'SC PTZ Control'
New-Item -ItemType Directory -Force -Path $installDir | Out-Null
$target = Join-Path $installDir 'ScPtzVCam.dll'
Copy-Item $DllPath $target -Force
Write-Host "DLL copiada para $target"

# 2. Registra o servidor COM em HKLM (o Frame Server carrega a DLL por este CLSID).
& regsvr32.exe /s $target
$regPath = "HKLM:\SOFTWARE\Classes\CLSID\$clsid\InprocServer32"
if (-not (Test-Path $regPath)) {
    throw "Registro COM falhou (regsvr32). Rode como Administrador."
}
Write-Host "COM registrado em HKLM\...\CLSID\$clsid"

# 3. Pasta da memória compartilhada com ACL permissiva.
$dataDir = Join-Path $env:ProgramData 'ScPtzControl'
New-Item -ItemType Directory -Force -Path $dataDir | Out-Null
$acl = Get-Acl $dataDir
# Everyone (S-1-1-0): garante que o processo do Frame Server (conta de serviço) leia/escreva o
# buffer de frames — é apenas o vídeo do canal, sem dados sensíveis.
$everyone = New-Object System.Security.Principal.SecurityIdentifier('S-1-1-0')
$rule = New-Object System.Security.AccessControl.FileSystemAccessRule(
    $everyone, 'Modify', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
$acl.AddAccessRule($rule)
Set-Acl $dataDir $acl
Write-Host "Pasta de frames pronta: $dataDir (ACL: Everyone Modify)"

Write-Host ''
Write-Host "OK — 'SC PTZ Virtual Cam' registrada." -ForegroundColor Green
Write-Host "Abra o SC PTZ Control e clique em 'Ativar câmera virtual'." -ForegroundColor Green
