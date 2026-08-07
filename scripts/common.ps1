#Requires -Version 5.1
<#
    Funções compartilhadas pelos scripts de release.

    Este arquivo NÃO é um ponto de entrada: ele é carregado via dot-source
    pelos outros scripts (`. "$PSScriptRoot\common.ps1"`).
#>

Set-StrictMode -Version Latest

# ---------------------------------------------------------------------------
# Saída no console
# ---------------------------------------------------------------------------

function Write-Step {
    param([Parameter(Mandatory)][string]$Message)
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Write-Info {
    param([Parameter(Mandatory)][string]$Message)
    Write-Host "    $Message" -ForegroundColor DarkGray
}

function Write-Ok {
    param([Parameter(Mandatory)][string]$Message)
    Write-Host "    $Message" -ForegroundColor Green
}

function Write-Warn {
    param([Parameter(Mandatory)][string]$Message)
    Write-Host "    ! $Message" -ForegroundColor Yellow
}

# ---------------------------------------------------------------------------
# Codificação do console
# ---------------------------------------------------------------------------

<#
    Faz o PowerShell ler a saída dos programas externos como UTF-8.

    O PowerShell decodifica o stdout de programas externos usando
    [Console]::OutputEncoding. Como estes scripts rodam com -NoProfile, esse
    valor é o code page OEM do console (850 no Windows pt-BR) e não o que
    estiver no perfil do usuário. O git, o vite e o electron-builder escrevem
    UTF-8, então sem isto a saída chega embaralhada — "Ôêô" no lugar de "✓",
    "Configura├º├Áes" no lugar de "Configurações".

    Não é só cosmético: o changelog é montado a partir do `git log`, e as
    mensagens de commit deste repositório são em pt-BR — o texto corrompido
    acabaria dentro do corpo da release no GitHub.

    Devolve a codificação anterior para o chamador restaurar — a troca também
    muda o code page do console, que é compartilhado com o terminal.
#>
function Set-Utf8Console {
    $previous = [Console]::OutputEncoding
    try {
        [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
    }
    catch {
        Write-Warn "Não foi possível usar UTF-8 no console: $($_.Exception.Message)"
    }
    return $previous
}

function Restore-ConsoleEncoding {
    param($Encoding)
    if ($null -eq $Encoding) { return }
    try { [Console]::OutputEncoding = $Encoding } catch { }
}

# ---------------------------------------------------------------------------
# Execução de programas externos
# ---------------------------------------------------------------------------

<#
    Roda um executável externo e trata o código de saída.

    O PowerShell não lança exceção quando um .exe falha — só atualiza
    $LASTEXITCODE. Sem isso, um `git push` que falha passaria despercebido e o
    script seguiria publicando. O stderr é redirecionado para o stdout porque
    o git escreve mensagens normais lá (ex.: "To https://github.com/..."), o
    que viraria erro com $ErrorActionPreference = 'Stop'.
#>
function Invoke-Native {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$FilePath,
        [string[]]$Arguments = @(),
        [switch]$Silent,        # não ecoa a saída no console
        [switch]$AllowFailure   # devolve o código em vez de abortar
    )

    $lines = New-Object 'System.Collections.Generic.List[string]'
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        & $FilePath @Arguments 2>&1 | ForEach-Object {
            $line = if ($_ -is [System.Management.Automation.ErrorRecord]) { $_.ToString() } else { [string]$_ }
            $lines.Add($line)
            if (-not $Silent) { Write-Host "    $line" -ForegroundColor DarkGray }
        }
        $exitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previous
    }

    if ($exitCode -ne 0 -and -not $AllowFailure) {
        $cmd = "$FilePath $($Arguments -join ' ')"
        throw "Comando falhou (exit $exitCode): $cmd`n$($lines -join "`n")"
    }

    return [pscustomobject]@{
        ExitCode = $exitCode
        Lines    = $lines.ToArray()
    }
}

function Invoke-Git {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string[]]$Arguments,
        [switch]$Silent,
        [switch]$AllowFailure
    )
    return Invoke-Native -FilePath 'git' -Arguments $Arguments -Silent:$Silent -AllowFailure:$AllowFailure
}

function Assert-Command {
    param(
        [Parameter(Mandatory)][string]$Name,
        [Parameter(Mandatory)][string]$Hint
    )
    $found = Get-Command $Name -ErrorAction SilentlyContinue
    if (-not $found) {
        throw "'$Name' não foi encontrado no PATH. $Hint"
    }
}

# ---------------------------------------------------------------------------
# Projeto
# ---------------------------------------------------------------------------

function Get-RepoRoot {
    # Os scripts vivem em <raiz>/scripts, então a raiz é o diretório pai.
    return (Resolve-Path ([System.IO.Path]::Combine($PSScriptRoot, '..'))).Path
}

function Get-PackageJson {
    param([string]$RepoRoot = (Get-RepoRoot))
    $path = [System.IO.Path]::Combine($RepoRoot, 'package.json')
    if (-not (Test-Path -LiteralPath $path)) {
        throw "package.json não encontrado em $RepoRoot"
    }
    return (Get-Content -LiteralPath $path -Raw -Encoding UTF8 | ConvertFrom-Json)
}

<#
    Extrai owner/repo do campo `repository` do package.json.

    Diferente do ls-biblia, aqui a configuração do electron-builder é gerada
    (scripts/generate-electron-builder.ts -> electron-builder.json, que é
    git-ignorado), então não dá para ler o bloco `publish` como fonte da
    verdade: ele pode nem existir ainda. O gerador lê exatamente este mesmo
    campo para montar o `publish`, então o script e o publisher não têm como
    apontar para repositórios diferentes.
#>
function Get-PublishTarget {
    param([Parameter(Mandatory)]$PackageJson)

    $repository = $null
    if ($PackageJson.PSObject.Properties.Name -contains 'repository') {
        $repository = $PackageJson.repository
    }

    $url = if ($repository -is [string]) { $repository }
    elseif ($repository -and $repository.PSObject.Properties.Name -contains 'url') { $repository.url }
    else { $null }

    if (-not $url) {
        throw "package.json não tem o campo 'repository' — sem ele nem o script nem o electron-builder sabem onde publicar."
    }

    # Cobre https://github.com/owner/repo(.git), git+https://... e git@github.com:owner/repo.git
    if ($url -notmatch 'github\.com[:/]([^/]+)/([^/]+?)(?:\.git)?/?$') {
        throw "Não consegui extrair owner/repo de 'repository.url' ($url). Use uma URL do GitHub."
    }

    return [pscustomobject]@{
        Owner = $Matches[1]
        Repo  = $Matches[2]
    }
}

<#
    Descobre o token do GitHub, em ordem de preferência:
      1. variável de ambiente GH_TOKEN / GITHUB_TOKEN
      2. arquivos locais electron-builder.env ou .env (ambos no .gitignore)
      3. o login do GitHub CLI (`gh auth token`)

    O item 3 é o que faz o script funcionar sem nenhuma configuração extra
    em uma máquina que já tenha rodado `gh auth login`.
#>
function Resolve-GitHubToken {
    param([string]$RepoRoot = (Get-RepoRoot))

    foreach ($name in @('GH_TOKEN', 'GITHUB_TOKEN')) {
        $value = [Environment]::GetEnvironmentVariable($name)
        if ($value -and $value.Trim()) {
            return [pscustomobject]@{ Token = $value.Trim(); Source = "variável de ambiente $name" }
        }
    }

    foreach ($file in @('electron-builder.env', '.env')) {
        $path = [System.IO.Path]::Combine($RepoRoot, $file)
        if (-not (Test-Path -LiteralPath $path)) { continue }
        foreach ($line in (Get-Content -LiteralPath $path)) {
            if ($line -match '^\s*(?:export\s+)?GH_TOKEN\s*=\s*(.+?)\s*$') {
                # Remove aspas simples ou duplas ao redor do valor.
                $token = $Matches[1].Trim().Trim('"').Trim("'")
                if ($token) {
                    return [pscustomobject]@{ Token = $token; Source = $file }
                }
            }
        }
    }

    $gh = Get-Command 'gh' -ErrorAction SilentlyContinue
    if ($gh) {
        $result = Invoke-Native -FilePath 'gh' -Arguments @('auth', 'token') -Silent -AllowFailure
        if ($result.ExitCode -eq 0 -and $result.Lines.Count -gt 0) {
            $token = ($result.Lines[0]).Trim()
            if ($token) {
                return [pscustomobject]@{ Token = $token; Source = 'gh auth token' }
            }
        }
    }

    throw @"
Nenhum token do GitHub encontrado.

Resolva de uma das formas:
  * gh auth login                      (recomendado — nada mais a configurar)
  * `$env:GH_TOKEN = 'ghp_xxx'          (só para a sessão atual)
  * criar electron-builder.env com GH_TOKEN="ghp_xxx"

O token precisa de escopo 'repo' para criar releases e subir assets.
"@
}

<#
    Compara a versão do Node em execução com o .nvmrc (se houver) ou com
    `engines.node`. Só avisa — versões diferentes normalmente funcionam, mas
    explicam builds que só quebram em uma das máquinas.
#>
function Test-NodeVersion {
    param([string]$RepoRoot = (Get-RepoRoot))

    $actual = (Invoke-Native -FilePath 'node' -Arguments @('--version') -Silent).Lines[0].Trim()
    $actualMajor = [int](($actual -replace '^v', '').Split('.')[0])

    $nvmrc = [System.IO.Path]::Combine($RepoRoot, '.nvmrc')
    if (Test-Path -LiteralPath $nvmrc) {
        $expected = (Get-Content -LiteralPath $nvmrc -Raw).Trim()
        if ($expected) {
            $expectedMajor = [int](($expected -replace '^v', '').Split('.')[0])
            if ($expectedMajor -ne $actualMajor) {
                Write-Warn "Node em uso: $actual, mas .nvmrc pede $expected."
            }
            else {
                Write-Info "Node $actual (.nvmrc: $expected)"
            }
            return
        }
    }

    # Sem .nvmrc, o piso vem de `engines.node` (ex.: ">=24").
    $pkg = Get-PackageJson -RepoRoot $RepoRoot
    $engine = $null
    if ($pkg.PSObject.Properties.Name -contains 'engines' -and
        $pkg.engines.PSObject.Properties.Name -contains 'node') {
        $engine = $pkg.engines.node
    }
    if (-not $engine) { return }

    if ($engine -match '(\d+)') {
        $minimumMajor = [int]$Matches[1]
        if ($actualMajor -lt $minimumMajor) {
            Write-Warn "Node em uso: $actual, mas engines.node pede $engine."
            return
        }
    }
    Write-Info "Node $actual (engines.node: $engine)"
}

# Escreve UTF-8 sem BOM: o `gh` e o GitHub esperam UTF-8, e o BOM apareceria
# como lixo no início do corpo da release.
function Write-Utf8File {
    param(
        [Parameter(Mandatory)][string]$Path,
        [Parameter(Mandatory)][AllowEmptyString()][string]$Content
    )
    $encoding = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($Path, $Content, $encoding)
}
