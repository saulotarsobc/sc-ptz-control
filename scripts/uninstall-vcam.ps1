<#
.SYNOPSIS
    Remove o registro da câmera virtual "SC PTZ Virtual Cam" (requer Administrador).

.DESCRIPTION
    Desfaz o que scripts/install-vcam.ps1 fez: desregistra o servidor COM, apaga a chave em
    HKLM e remove a DLL copiada. A pasta de frames em %ProgramData%\ScPtzControl só é apagada
    com -RemoveData, porque nada mais vive nela.

    O dispositivo em si é de sessão: ele já some quando o aplicativo fecha.
#>
#Requires -RunAsAdministrator
[CmdletBinding()]
param([switch]$RemoveData)

$ErrorActionPreference = 'Stop'
$clsid = '{FF324BA5-C131-4546-972A-097595024791}'
$target = Join-Path $env:ProgramFiles 'SC PTZ Control\ScPtzVCam.dll'

if (Test-Path $target) {
    & regsvr32.exe /s /u $target
    Remove-Item $target -Force -ErrorAction SilentlyContinue
    Write-Host "DLL desregistrada e removida: $target"
}

# A chave pode ter sobrado apontando para outro caminho (instalador do app, por exemplo).
$regPath = "HKLM:\SOFTWARE\Classes\CLSID\$clsid"
if (Test-Path $regPath) {
    Remove-Item $regPath -Recurse -Force
    Write-Host "Chave removida: HKLM\SOFTWARE\Classes\CLSID\$clsid"
}

if ($RemoveData) {
    $dataDir = Join-Path $env:ProgramData 'ScPtzControl'
    if (Test-Path $dataDir) {
        Remove-Item $dataDir -Recurse -Force
        Write-Host "Pasta de frames removida: $dataDir"
    }
}

Write-Host ''
Write-Host "OK — 'SC PTZ Virtual Cam' desregistrada." -ForegroundColor Green
