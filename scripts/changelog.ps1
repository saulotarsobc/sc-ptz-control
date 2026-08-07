#Requires -Version 5.1
<#
.SYNOPSIS
    Monta o changelog em Markdown a partir dos commits desde a versão anterior.

.DESCRIPTION
    Agrupa os commits pelos tipos do padrão do projeto (.github/commit.md).
    Commits fora do padrão vão para "Outras mudanças" — nada é descartado
    silenciosamente, exceto o commit de bump gerado pelo release.ps1, cuja
    mensagem é só a versão.

    Sem -OutFile o Markdown é impresso na tela, o que serve para conferir as
    notas antes de publicar (`pnpm release:notes`).

.PARAMETER Tag
    Tag sendo publicada. Padrão: "v" + a versão do package.json.

.PARAMETER From
    Tag inicial do intervalo. Padrão: a maior tag existente que não seja -Tag.

.PARAMETER OutFile
    Caminho para gravar o Markdown. Sem isso, escreve na saída padrão.

.EXAMPLE
    .\scripts\changelog.ps1
    .\scripts\changelog.ps1 -From v4.0.2 -OutFile out\release-notes.md
#>
[CmdletBinding()]
param(
    [string]$Tag,
    [string]$From,
    [string]$OutFile
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. ([System.IO.Path]::Combine($PSScriptRoot, 'common.ps1'))

$repoRoot = Get-RepoRoot
$previousEncoding = Set-Utf8Console
Push-Location $repoRoot
try {
    if (-not $Tag) {
        $Tag = 'v' + (Get-PackageJson -RepoRoot $repoRoot).version
    }

    # ---------------------------------------------------------------------
    # Intervalo de commits
    # ---------------------------------------------------------------------
    if (-not $From) {
        # A maior tag por ordem de versão que não seja a que está sendo
        # publicada. `-v:refname` ordena semanticamente (v4.10.0 > v4.9.0),
        # coisa que a ordem alfabética erraria.
        $tags = @(
            (Invoke-Git -Arguments @('tag', '--list', 'v*', '--sort=-v:refname') -Silent).Lines |
                Where-Object { $_ -and $_.Trim() -ne $Tag }
        )
        if ($tags.Count -gt 0) { $From = $tags[0].Trim() }
    }

    if ($From) {
        $range = "$From..HEAD"
        Write-Host "    Commits de $From até $Tag" -ForegroundColor DarkGray
    }
    else {
        $range = 'HEAD'
        Write-Host "    Primeira release: usando todo o histórico" -ForegroundColor DarkGray
    }

    # ---------------------------------------------------------------------
    # Coleta dos commits
    # ---------------------------------------------------------------------
    # 0x1f separa campos e 0x1e separa registros: o corpo do commit é multilinha
    # e quebraria qualquer parsing por linha. O git expande %x1f/%x1e sozinho,
    # então não há escape de PowerShell envolvido.
    $format = '%s%x1f%h%x1f%b%x1e'
    $raw = ((Invoke-Git -Arguments @('log', '--no-merges', '--reverse', "--format=$format", $range) -Silent).Lines) -join "`n"

    # O commit de bump é ruído de release, não mudança. Cobre tanto o formato do
    # `npm version` (só o número) quanto o que o release.ps1 cria.
    $bumpPattern = '^(?:v?\d+\.\d+\.\d+|chore(?:\([^)]*\))?:\s*versão\s+v?\d+\.\d+\.\d+)$'

    $commits = @()
    foreach ($record in ($raw -split [char]0x1e)) {
        $record = $record.Trim("`r", "`n", ' ')
        if (-not $record) { continue }

        $fields = $record -split [char]0x1f
        if ($fields.Count -lt 2) { continue }

        $subject = $fields[0].Trim()
        if (-not $subject -or $subject -match $bumpPattern) { continue }

        $type = 'other'
        $scope = ''
        $description = $subject
        $breaking = $false

        # Casa "tipo:", "tipo(escopo):" e "tipo!:" (breaking change).
        if ($subject -match '^(?<type>[a-zA-Z]+)(?:\((?<scope>[^)]+)\))?(?<bang>!)?:\s*(?<desc>.+)$') {
            $type = $Matches['type'].ToLowerInvariant()
            $scope = if ($Matches['scope']) { $Matches['scope'] } else { '' }
            $description = $Matches['desc'].Trim()
            $breaking = [bool]$Matches['bang']
        }

        $body = if ($fields.Count -ge 3) { $fields[2] } else { '' }
        if ($body -match 'BREAKING[ -]CHANGE') { $breaking = $true }

        $commits += [pscustomobject]@{
            Subject     = $subject
            Hash        = $fields[1].Trim()
            Type        = $type
            Scope       = $scope
            Description = $description
            Breaking    = $breaking
        }
    }

    # ---------------------------------------------------------------------
    # Agrupamento
    # ---------------------------------------------------------------------
    $sections = @(
        [pscustomobject]@{ Title = '✨ Novidades';          Types = @('feat') }
        [pscustomobject]@{ Title = '🐛 Correções';          Types = @('fix') }
        [pscustomobject]@{ Title = '♻️ Melhorias internas'; Types = @('perf', 'refactor') }
        [pscustomobject]@{ Title = '📚 Documentação';       Types = @('docs') }
        [pscustomobject]@{ Title = '🧹 Manutenção';         Types = @('test', 'chore', 'build', 'ci', 'style', 'revert') }
    )

    function Format-CommitLine {
        param([Parameter(Mandatory)][pscustomobject]$Commit)
        $prefix = if ($Commit.Scope) { "**$($Commit.Scope):** " } else { '' }
        return "- $prefix$($Commit.Description) (``$($Commit.Hash)``)"
    }

    $blocks = @()

    # Vem primeiro: é o que decide se o usuário pode atualizar sem pensar.
    $breakingCommits = @($commits | Where-Object { $_.Breaking })
    if ($breakingCommits.Count -gt 0) {
        $items = @($breakingCommits | ForEach-Object { Format-CommitLine $_ })
        $blocks += "### ⚠️ Mudanças incompatíveis`n`n" + ($items -join "`n")
    }

    $knownTypes = @($sections | ForEach-Object { $_.Types } | Sort-Object -Unique)

    foreach ($section in $sections) {
        $items = @(
            $commits |
                Where-Object { $section.Types -contains $_.Type } |
                ForEach-Object { Format-CommitLine $_ }
        )
        if ($items.Count -gt 0) {
            $blocks += "### $($section.Title)`n`n" + ($items -join "`n")
        }
    }

    # Um tipo convencional fora da tabela (ex.: "wip") cairia no vazio — aqui ele
    # aparece junto com os commits sem prefixo nenhum, em vez de sumir.
    $others = @(
        $commits |
            Where-Object { $knownTypes -notcontains $_.Type } |
            ForEach-Object { Format-CommitLine $_ }
    )
    if ($others.Count -gt 0) {
        $blocks += "### 📦 Outras mudanças`n`n" + ($others -join "`n")
    }

    if ($blocks.Count -gt 0) {
        $markdown = ($blocks -join "`n`n") + "`n"
    }
    else {
        $markdown = "_Sem commits novos desde a versão anterior._`n"
    }

    # ---------------------------------------------------------------------
    # Saída
    # ---------------------------------------------------------------------
    if ($OutFile) {
        $full = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($repoRoot, $OutFile))
        $dir = [System.IO.Path]::GetDirectoryName($full)
        if (-not (Test-Path -LiteralPath $dir)) {
            New-Item -ItemType Directory -Path $dir -Force | Out-Null
        }
        Write-Utf8File -Path $full -Content $markdown
        Write-Host "    Changelog gravado em $full" -ForegroundColor DarkGray
    }
    else {
        Write-Output $markdown
    }
}
finally {
    Pop-Location
    Restore-ConsoleEncoding -Encoding $previousEncoding
}
