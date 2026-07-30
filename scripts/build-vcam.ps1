<#
.SYNOPSIS
    Compila a DLL nativa da câmera virtual "SC PTZ Virtual Cam"
    (native/ScPtzVCam -> native/ScPtzVCam/build/Release/ScPtzVCam.dll).

.DESCRIPTION
    A DLL é a media source de Media Foundation que o Frame Server do Windows carrega quando
    outro aplicativo abre a câmera. O PtzBridge.csproj copia o resultado para junto do
    PtzBridge.exe — sem ela o app roda normalmente e só a câmera virtual fica indisponível.

    Requer CMake no PATH e o toolset C++ do Visual Studio (workload "Desenvolvimento para
    desktop com C++"). x64 apenas.

.PARAMETER Clean
    Apaga a pasta de build antes de configurar.
#>
[CmdletBinding()]
param([switch]$Clean)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$src = Join-Path $repo 'native/ScPtzVCam'
$build = Join-Path $src 'build'

if (-not (Get-Command cmake -ErrorAction SilentlyContinue)) {
    throw "CMake não encontrado no PATH. Instale o CMake ou o workload C++ do Visual Studio."
}

if ($Clean -and (Test-Path $build)) {
    Remove-Item $build -Recurse -Force
}

Write-Host "=== Configurando ScPtzVCam (CMake | x64) ===" -ForegroundColor Cyan
cmake -S $src -B $build -A x64
if ($LASTEXITCODE -ne 0) { throw "Configuração do CMake falhou." }

Write-Host "=== Compilando ScPtzVCam (Release) ===" -ForegroundColor Cyan
cmake --build $build --config Release
if ($LASTEXITCODE -ne 0) { throw "Build da DLL nativa falhou." }

$dll = Join-Path $build 'Release/ScPtzVCam.dll'
if (-not (Test-Path $dll)) { throw "Build concluído, mas ScPtzVCam.dll não foi encontrada." }

Write-Host ""
Write-Host "OK: $dll" -ForegroundColor Green
Write-Host "Registre a câmera uma vez com scripts/install-vcam.ps1 (Administrador)." -ForegroundColor Green
