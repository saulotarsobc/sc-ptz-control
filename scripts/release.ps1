#Requires -Version 5.1
<#
.SYNOPSIS
    Publica uma nova versão do SC PTZ Control no GitHub Releases, da máquina local.

.DESCRIPTION
    Faz, em ordem: verificações de ambiente, bump opcional da versão, checagem
    de tipos, criação/atualização da tag, changelog, criação da Release e build
    + upload dos assets pelo electron-builder.

    Todas as etapas são idempotentes: rodar de novo com a mesma versão não
    duplica tag nem release, e os assets são substituídos.

    O build é o `pnpm dist` completo, então esta máquina precisa do que ele
    precisa: .NET 8 SDK, CMake + toolset C++ e o NetSDK da Intelbras em
    `helpers/` (ver README).

.PARAMETER Version
    Versão explícita, ex.: 4.2.0. Aceita um "v" na frente.

.PARAMETER Bump
    Sobe a versão antes de publicar (major, minor ou patch).
    Sem -Version nem -Bump, publica a versão que já está no package.json.

.PARAMETER SkipChecks
    Pula o `tsc --noEmit`. Use só quando souber o que está fazendo.

.PARAMETER SkipVerify
    Pula a checagem final que baixa o latest.yml publicado sem autenticação.

.PARAMETER DryRun
    Mostra tudo o que seria feito sem criar tag, release ou publicar nada.

.PARAMETER Force
    Permite publicar com alterações não commitadas e mover uma tag que já
    aponte para outro commit.

.EXAMPLE
    pnpm release          # publica a versão que está no package.json
    pnpm release:dry      # simula tudo, sem alterar nada
    pnpm release:notes    # só mostra o changelog que seria usado

    # Para passar parâmetros, chame o script direto — o pnpm não repassa
    # flags de traço simples:
    pwsh .\scripts\release.ps1 -Bump patch
    pwsh .\scripts\release.ps1 -Version 4.2.0 -Force
#>
[CmdletBinding()]
param(
    [string]$Version,
    [ValidateSet('patch', 'minor', 'major')]
    [string]$Bump,
    [switch]$SkipChecks,
    [switch]$SkipVerify,
    [switch]$DryRun,
    [switch]$Force
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. ([System.IO.Path]::Combine($PSScriptRoot, 'common.ps1'))

$repoRoot = Get-RepoRoot
$previousEncoding = Set-Utf8Console
Push-Location $repoRoot

try {
    if ($DryRun) {
        Write-Host ""
        Write-Host "  MODO DRY-RUN — nada será criado nem publicado." -ForegroundColor Yellow
    }

    if ($Version -and $Bump) {
        throw 'Use -Version ou -Bump, não os dois.'
    }

    # =======================================================================
    # 1. Ambiente
    # =======================================================================
    Write-Step '1/8  Verificando o ambiente'

    Assert-Command -Name 'git'    -Hint 'Instale o Git: https://git-scm.com/downloads'
    Assert-Command -Name 'node'   -Hint 'Instale o Node.js: https://nodejs.org'
    Assert-Command -Name 'pnpm'   -Hint 'Instale o pnpm: npm i -g pnpm'
    Assert-Command -Name 'gh'     -Hint 'Instale o GitHub CLI: winget install GitHub.cli'
    # O instalador embute o sidecar C# e a DLL da câmera virtual; sem estas duas
    # ferramentas o `pnpm dist` só quebraria lá na frente, depois de vários minutos.
    Assert-Command -Name 'dotnet' -Hint 'Instale o .NET 8 SDK: winget install Microsoft.DotNet.SDK.8'
    Assert-Command -Name 'cmake'  -Hint 'Instale o CMake ou o workload C++ do Visual Studio.'

    Test-NodeVersion -RepoRoot $repoRoot

    $branch = (Invoke-Git -Arguments @('rev-parse', '--abbrev-ref', 'HEAD') -Silent).Lines[0].Trim()
    Write-Info "Branch atual: $branch"

    # Publicar com a árvore suja significa gerar um instalador que não
    # corresponde a nenhum commit — a tag apontaria para um código diferente
    # do que foi empacotado.
    $dirty = @((Invoke-Git -Arguments @('status', '--porcelain') -Silent).Lines | Where-Object { $_.Trim() })
    if ($dirty.Count -gt 0) {
        if ($Force -or $DryRun) {
            Write-Warn "Há $($dirty.Count) alteração(ões) não commitada(s) — seguindo mesmo assim."
        }
        else {
            throw "Há alterações não commitadas. Commite antes de publicar (ou use -Force)."
        }
    }
    else {
        Write-Ok 'Árvore de trabalho limpa.'
    }

    $tokenInfo = Resolve-GitHubToken -RepoRoot $repoRoot
    Write-Ok "Token do GitHub obtido de: $($tokenInfo.Source)"

    # O electron-builder lê GH_TOKEN do ambiente; o gh também. Definir aqui
    # evita ter que exportar a variável manualmente antes de cada release.
    $env:GH_TOKEN = $tokenInfo.Token

    $target = Get-PublishTarget -PackageJson (Get-PackageJson -RepoRoot $repoRoot)
    Write-Info "Repositório de publicação: $($target.Owner)/$($target.Repo)"

    # =======================================================================
    # 2. Versão
    # =======================================================================
    Write-Step '2/8  Definindo a versão'

    $packageJsonPath = [System.IO.Path]::Combine($repoRoot, 'package.json')
    $packageJsonRaw = Get-Content -LiteralPath $packageJsonPath -Raw -Encoding UTF8
    $currentVersion = ($packageJsonRaw | ConvertFrom-Json).version

    if ($Version) {
        $newVersion = $Version.TrimStart('v')
        if ($newVersion -notmatch '^\d+\.\d+\.\d+$') {
            throw "Versão inválida: '$Version'. Use o formato X.Y.Z."
        }
    }
    elseif ($Bump) {
        if ($currentVersion -notmatch '^(\d+)\.(\d+)\.(\d+)') {
            throw "A versão atual '$currentVersion' não é semver — informe -Version explicitamente."
        }
        $major = [int]$Matches[1]; $minor = [int]$Matches[2]; $patch = [int]$Matches[3]
        switch ($Bump) {
            'major' { $newVersion = "$($major + 1).0.0" }
            'minor' { $newVersion = "$major.$($minor + 1).0" }
            'patch' { $newVersion = "$major.$minor.$($patch + 1)" }
        }
    }
    else {
        $newVersion = $currentVersion
    }

    $tag = "v$newVersion"

    if ($newVersion -ne $currentVersion) {
        if ($DryRun) {
            Write-Info "[dry-run] package.json: $currentVersion -> $newVersion"
        }
        else {
            # Substituição por regex em vez de ConvertTo-Json: o round-trip
            # reordenaria as chaves e reescreveria a formatação do arquivo inteiro.
            $updated = [regex]::Replace(
                $packageJsonRaw,
                '("version"\s*:\s*")' + [regex]::Escape($currentVersion) + '(")',
                '${1}' + $newVersion + '${2}',
                [System.Text.RegularExpressions.RegexOptions]::None,
                [timespan]::FromSeconds(5)
            )
            if ($updated -eq $packageJsonRaw) {
                throw "Não consegui atualizar a versão no package.json (padrão `"version`": `"$currentVersion`" não encontrado)."
            }
            Write-Utf8File -Path $packageJsonPath -Content $updated

            Invoke-Git -Arguments @('add', '--', 'package.json') | Out-Null
            Invoke-Git -Arguments @('commit', '-m', "chore: versão $newVersion") | Out-Null
            Write-Ok "package.json: $currentVersion -> $newVersion (commit criado)."
        }
    }

    Write-Ok "Versão a publicar: $newVersion (tag $tag)"

    # =======================================================================
    # 3. Checagem de tipos
    # =======================================================================
    Write-Step '3/8  Checando os tipos'

    # Não há testes automatizados neste projeto (a verificação é manual contra o
    # equipamento) e o `pnpm lint` está quebrado pela incompatibilidade entre o
    # typescript-eslint 8 e o TypeScript 7 — o `tsc --noEmit` é o que sobra.
    if ($SkipChecks) {
        Write-Warn 'Pulado por -SkipChecks.'
    }
    elseif ($DryRun) {
        Write-Info '[dry-run] npx tsc --noEmit'
    }
    else {
        Invoke-Native -FilePath 'npx' -Arguments @('tsc', '--noEmit') | Out-Null
        Write-Ok 'Sem erros de tipo.'
    }

    # =======================================================================
    # 4. Commits pendentes
    # =======================================================================
    Write-Step '4/8  Sincronizando a branch com o remoto'

    $upstream = Invoke-Git -Arguments @('rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}') -Silent -AllowFailure
    if ($upstream.ExitCode -ne 0) {
        Write-Warn "A branch '$branch' não tem upstream configurado; só a tag será enviada."
    }
    else {
        $ahead = [int]((Invoke-Git -Arguments @('rev-list', '--count', '@{u}..HEAD') -Silent).Lines[0].Trim())
        if ($ahead -gt 0) {
            if ($DryRun) {
                Write-Info "[dry-run] git push origin $branch  ($ahead commit(s) à frente)"
            }
            else {
                Write-Info "$ahead commit(s) à frente do remoto; enviando..."
                Invoke-Git -Arguments @('push', 'origin', $branch) | Out-Null
                Write-Ok 'Branch sincronizada.'
            }
        }
        else {
            Write-Ok 'Branch já está sincronizada.'
        }
    }

    # =======================================================================
    # 5. Tag
    # =======================================================================
    Write-Step "5/8  Preparando a tag $tag"

    $head = (Invoke-Git -Arguments @('rev-parse', 'HEAD') -Silent).Lines[0].Trim()
    $tagExists = (Invoke-Git -Arguments @('rev-parse', '-q', '--verify', "refs/tags/$tag") -Silent -AllowFailure).ExitCode -eq 0

    if ($tagExists) {
        $tagCommit = (Invoke-Git -Arguments @('rev-list', '-n', '1', $tag) -Silent).Lines[0].Trim()
        if ($tagCommit -eq $head) {
            Write-Ok "A tag $tag já existe e aponta para este commit."
        }
        elseif ($Force -or $DryRun) {
            Write-Warn "A tag $tag aponta para outro commit e será movida para $($head.Substring(0,7))."
            if (-not $DryRun) {
                Invoke-Git -Arguments @('tag', '-f', '-a', $tag, '-m', $tag) | Out-Null
                Invoke-Git -Arguments @('push', '--force', 'origin', "refs/tags/$tag") | Out-Null
            }
        }
        else {
            throw "A tag $tag já existe apontando para outro commit ($($tagCommit.Substring(0,7))). Use -Force para movê-la ou suba a versão com -Bump."
        }
    }
    else {
        if ($DryRun) {
            Write-Info "[dry-run] git tag -a $tag && git push origin refs/tags/$tag"
        }
        else {
            Invoke-Git -Arguments @('tag', '-a', $tag, '-m', $tag) | Out-Null
            Write-Ok "Tag $tag criada."
        }
    }

    # A tag pode existir localmente e não no remoto (ex.: criada numa execução
    # anterior que falhou depois).
    if (-not $DryRun) {
        Invoke-Git -Arguments @('push', 'origin', "refs/tags/$tag") -AllowFailure | Out-Null
        Write-Ok "Tag $tag presente no remoto."
    }

    # =======================================================================
    # 6. Changelog
    # =======================================================================
    Write-Step '6/8  Gerando o changelog'

    # out/ está no .gitignore, então o arquivo não polui o repositório.
    $notesFile = [System.IO.Path]::Combine($repoRoot, 'out', 'release-notes.md')
    & ([System.IO.Path]::Combine($PSScriptRoot, 'changelog.ps1')) -Tag $tag -OutFile $notesFile

    Write-Host ''
    Write-Host (Get-Content -LiteralPath $notesFile -Raw -Encoding UTF8)

    # =======================================================================
    # 7. Release no GitHub
    # =======================================================================
    Write-Step "7/8  Criando a Release $tag"

    $exists = (Invoke-Native -FilePath 'gh' -Arguments @('release', 'view', $tag, '--repo', "$($target.Owner)/$($target.Repo)") -Silent -AllowFailure).ExitCode -eq 0

    if ($exists) {
        Write-Ok "A Release $tag já existe — o corpo atual foi preservado."
    }
    elseif ($DryRun) {
        Write-Info "[dry-run] gh release create $tag --notes-file out\release-notes.md --generate-notes"
    }
    else {
        # --generate-notes acrescenta as notas automáticas do GitHub (PRs, novos
        # contribuidores e o link "Full Changelog") abaixo do nosso changelog: a
        # API pré-anexa o corpo informado ao texto gerado.
        # --verify-tag aborta se a tag não chegou ao remoto, evitando que a
        # release seja criada num commit qualquer da branch padrão.
        Invoke-Native -FilePath 'gh' -Arguments @(
            'release', 'create', $tag,
            '--repo', "$($target.Owner)/$($target.Repo)",
            '--title', $tag,
            '--notes-file', $notesFile,
            '--generate-notes',
            '--verify-tag'
        ) | Out-Null
        Write-Ok "Release $tag criada."
    }

    # =======================================================================
    # 8. Build e upload dos assets
    # =======================================================================
    Write-Step '8/8  Build e publicação dos assets'

    if ($DryRun) {
        Write-Info '[dry-run] pnpm run release:publish'
    }
    else {
        # EP_GH_IGNORE_TIME é essencial: sem ela o electron-builder se recusa
        # a subir assets numa release publicada há mais de 2 horas e encerra
        # com sucesso, apenas logando um aviso — a publicação falharia em
        # silêncio ao reexecutar o script.
        $env:EP_GH_IGNORE_TIME = 'true'
        try {
            Invoke-Native -FilePath 'pnpm' -Arguments @('run', 'release:publish') | Out-Null
        }
        finally {
            Remove-Item Env:\EP_GH_IGNORE_TIME -ErrorAction SilentlyContinue
        }
        Write-Ok 'Assets enviados.'
    }

    # =======================================================================
    # Verificação final
    # =======================================================================
    if (-not $DryRun -and -not $SkipVerify) {
        Write-Step 'Verificando a cadeia de auto-update'

        # É exatamente o que o electron-updater faz na máquina do usuário:
        # baixa o latest.yml SEM autenticação. Se a release estiver como
        # rascunho ou o repositório for privado, isso dá 404 e o update
        # nunca chega a ninguém.
        $url = "https://github.com/$($target.Owner)/$($target.Repo)/releases/latest/download/latest.yml"
        $ok = $false
        foreach ($attempt in 1..3) {
            try {
                $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 30

                # Assets de release são servidos como application/octet-stream,
                # então .Content vem como byte[]. Um -match sobre array filtra
                # os elementos em vez de casar o padrão, e $Matches nunca é
                # preenchido — daí a versão sair vazia.
                $yaml = if ($response.Content -is [byte[]]) {
                    [System.Text.Encoding]::UTF8.GetString($response.Content)
                }
                else {
                    [string]$response.Content
                }

                $published = ''
                if ($yaml -match '(?m)^version:\s*(.+)$') {
                    $published = $Matches[1].Trim()
                }
                if ($published -eq $newVersion) {
                    Write-Ok "latest.yml acessível e apontando para $published."
                }
                else {
                    Write-Warn "latest.yml acessível, mas com a versão '$published' (esperada: $newVersion)."
                }
                $ok = $true
                break
            }
            catch {
                if ($attempt -lt 3) {
                    Write-Info "Tentativa $attempt falhou; o GitHub pode levar alguns segundos. Repetindo..."
                    Start-Sleep -Seconds 5
                }
            }
        }
        if (-not $ok) {
            Write-Warn "Não foi possível baixar $url sem autenticação."
            Write-Warn 'O auto-update depende disso: confira se a release está publicada (não rascunho) e se o repositório é público.'
        }
    }

    Write-Host ''
    if ($DryRun) {
        Write-Host "  Dry-run concluído. Nada foi alterado." -ForegroundColor Yellow
    }
    else {
        Write-Host "  Versão $newVersion publicada." -ForegroundColor Green
        Write-Host "  https://github.com/$($target.Owner)/$($target.Repo)/releases/tag/$tag" -ForegroundColor Green
    }
    Write-Host ''
}
catch {
    Write-Host ''
    Write-Host "  FALHOU: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ''
    exit 1
}
finally {
    Pop-Location
    Restore-ConsoleEncoding -Encoding $previousEncoding
}
