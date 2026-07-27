#requires -Version 7.0
<#
.SYNOPSIS
    Publishes a new version to GitHub: version bump, annotated tag, push and release with changelog.

.DESCRIPTION
    Automates a version deploy:
      1. validates the environment (clean tree, authenticated gh, tag does not exist);
      2. resolves the new version (explicit or a semver bump from package.json);
      3. builds the changelog by grouping the commits since the last tag by their
         conventional type (feat, fix, refactor, ...);
      4. commits the bump, creates the annotated tag and pushes branch + tag;
      5. optionally runs `pnpm dist` and attaches the installer to the release.

.PARAMETER Version
    Explicit version, e.g. 4.1.0. Accepts a leading "v" as well.

.PARAMETER Bump
    Increments the package.json version: major, minor or patch.
    When neither -Version nor -Bump is given, the version already in package.json is used.

.PARAMETER Build
    Runs `pnpm dist` and attaches the artifacts from out/ to the release.

.PARAMETER Draft
    Creates the release as a draft.

.PARAMETER PreRelease
    Marks the release as a pre-release.

.PARAMETER DryRun
    Changes nothing: only prints the resolved version and the changelog that would be published.

.PARAMETER Remote
    Git remote used for pushing and for resolving the repository. Defaults to origin.

.EXAMPLE
    ./scripts/deploy.ps1 -Bump patch -DryRun
    Prints the changelog for the next patch without touching anything.

.EXAMPLE
    ./scripts/deploy.ps1 -Bump minor -Build
    Publishes 4.1.0 with the installer attached.
#>
[CmdletBinding()]
param(
    [string]$Version,
    [ValidateSet('major', 'minor', 'patch')]
    [string]$Bump,
    [switch]$Build,
    [switch]$Draft,
    [switch]$PreRelease,
    [switch]$DryRun,
    [string]$Remote = 'origin'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Commit messages are in pt-BR and carry accents; without forcing UTF-8, PowerShell
# decodes git output using the console codepage and the changelog comes out mangled.
$previousOutputEncoding = [Console]::OutputEncoding
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

function Write-Step { param([string]$Message) Write-Host "==> $Message" -ForegroundColor Cyan }
function Write-Info { param([string]$Message) Write-Host "    $Message" -ForegroundColor DarkGray }
function Write-Ok { param([string]$Message) Write-Host "    $Message" -ForegroundColor Green }

function Stop-WithError {
    param([string]$Message)
    Write-Host "ERROR: $Message" -ForegroundColor Red
    [Console]::OutputEncoding = $previousOutputEncoding
    exit 1
}

function Invoke-Git {
    param([Parameter(ValueFromRemainingArguments = $true)][string[]]$GitArgs)
    $output = & git @GitArgs
    if ($LASTEXITCODE -ne 0) {
        Stop-WithError "git $($GitArgs -join ' ') failed (exit code $LASTEXITCODE)."
    }
    return $output
}

# -------------------------------------------------------------- environment ---

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Step 'Checking environment'

foreach ($tool in @('git', 'gh')) {
    if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
        Stop-WithError "'$tool' was not found on PATH."
    }
}

& gh auth status *> $null
if ($LASTEXITCODE -ne 0) {
    Stop-WithError "gh is not authenticated. Run 'gh auth login'."
}

$insideRepo = & git rev-parse --is-inside-work-tree 2>$null
if ($LASTEXITCODE -ne 0 -or $insideRepo -ne 'true') {
    Stop-WithError "$root is not a git repository."
}

$dirty = Invoke-Git status --porcelain
if ($dirty -and -not $DryRun) {
    Stop-WithError "Working tree is dirty. Commit or discard the changes before deploying:`n$($dirty -join "`n")"
}

$branch = (Invoke-Git rev-parse --abbrev-ref HEAD).Trim()
$repoSlug = (& gh repo view --json nameWithOwner -q .nameWithOwner).Trim()
if ($LASTEXITCODE -ne 0 -or -not $repoSlug) {
    Stop-WithError 'Could not resolve the GitHub repository (gh repo view).'
}

Write-Info "Repository: $repoSlug"
Write-Info "Branch:     $branch"

# Remote tags are required so we never recreate a version that already exists there.
Write-Info "Fetching tags from $Remote..."
& git fetch $Remote --tags --quiet 2>$null | Out-Null

# ------------------------------------------------------------------ version ---

$packageJsonPath = Join-Path $root 'package.json'
if (-not (Test-Path $packageJsonPath)) {
    Stop-WithError "package.json was not found in $root."
}

$packageJsonRaw = Get-Content $packageJsonPath -Raw -Encoding UTF8
$currentVersion = ($packageJsonRaw | ConvertFrom-Json).version

if ($Version -and $Bump) {
    Stop-WithError 'Use either -Version or -Bump, not both.'
}

if ($Version) {
    $newVersion = $Version.TrimStart('v')
    if ($newVersion -notmatch '^\d+\.\d+\.\d+$') {
        Stop-WithError "Invalid version: '$Version'. Use the X.Y.Z format."
    }
}
elseif ($Bump) {
    if ($currentVersion -notmatch '^(\d+)\.(\d+)\.(\d+)') {
        Stop-WithError "Current version '$currentVersion' is not semver — pass -Version explicitly."
    }
    $major = [int]$Matches[1]; $minor = [int]$Matches[2]; $patch = [int]$Matches[3]
    switch ($Bump) {
        'major' { $newVersion = "$($major + 1).0.0" }
        'minor' { $newVersion = "$major.$($minor + 1).0" }
        'patch' { $newVersion = "$major.$minor.$($patch + 1)" }
    }
}
else {
    # No -Version/-Bump: publish whatever version package.json already holds.
    $newVersion = $currentVersion
}

$newTag = "v$newVersion"

if (Invoke-Git tag --list $newTag) {
    Stop-WithError "Tag $newTag already exists locally. Pick another version or delete the tag."
}
if (& git ls-remote --tags $Remote "refs/tags/$newTag" 2>$null) {
    Stop-WithError "Tag $newTag already exists on $Remote."
}

# ---------------------------------------------------------------- changelog ---

Write-Step 'Building the changelog'

$previousTag = & git describe --tags --abbrev=0 --match 'v*' 2>$null
if ($LASTEXITCODE -ne 0) { $previousTag = $null }

$range = if ($previousTag) { "$previousTag..HEAD" } else { 'HEAD' }
Write-Info "Range: $(if ($previousTag) { "$previousTag -> $newTag" } else { "first release -> $newTag" })"

# 0x1f separates fields and 0x1e separates records — the commit body is multiline
# and would break any line-based parsing.
$logFormat = "%H`u{1f}%h`u{1f}%s`u{1f}%an`u{1f}%b`u{1e}"
$rawLog = (Invoke-Git log --no-merges "--pretty=format:$logFormat" $range) -join "`n"

# Display order: what the end user notices first.
$sections = [ordered]@{
    'feat'     = '✨ Features'
    'fix'      = '🐛 Bug Fixes'
    'perf'     = '⚡ Performance'
    'refactor' = '♻️ Refactoring'
    'docs'     = '📚 Documentation'
    'style'    = '💅 Styling'
    'test'     = '🧪 Tests'
    'build'    = '📦 Build'
    'ci'       = '🤖 CI'
    'chore'    = '🔧 Chores'
    'other'    = '📌 Other'
}

$commits = @()
foreach ($record in $rawLog -split "`u{1e}") {
    $record = $record.Trim("`r", "`n", ' ')
    if (-not $record) { continue }

    $fields = $record -split "`u{1f}"
    if ($fields.Count -lt 4) { continue }

    $subject = $fields[2].Trim()

    # Version bump commits ("4.0.1", "v3.0.4") are release noise, not changes.
    if ($subject -match '^v?\d+\.\d+\.\d+$') { continue }

    $type = 'other'
    $scope = ''
    $description = $subject
    $breaking = $false

    if ($subject -match '^(?<type>[a-zA-Z]+)(?:\((?<scope>[^)]+)\))?(?<bang>!)?:\s*(?<desc>.+)$') {
        $type = $Matches['type'].ToLowerInvariant()
        $scope = if ($Matches['scope']) { $Matches['scope'] } else { '' }
        $description = $Matches['desc'].Trim()
        $breaking = [bool]$Matches['bang']
    }

    $body = if ($fields.Count -ge 5) { $fields[4] } else { '' }
    if ($body -match 'BREAKING[ -]CHANGE') { $breaking = $true }

    # A conventional type outside the table (e.g. "revert") falls back to "other" —
    # otherwise it would vanish from the changelog or emit a duplicate heading.
    if (-not $sections.Contains($type)) { $type = 'other' }

    $commits += [pscustomobject]@{
        Sha         = $fields[1]
        Type        = $type
        Scope       = $scope
        Description = $description
        Author      = $fields[3]
        Breaking    = $breaking
    }
}

if ($commits.Count -eq 0) {
    Stop-WithError "No relevant commits since $previousTag — there is nothing to publish."
}

function Format-CommitLine {
    param([pscustomobject]$Commit)
    $prefix = if ($Commit.Scope) { "**$($Commit.Scope):** " } else { '' }
    return "- $prefix$($Commit.Description) (``$($Commit.Sha)``)"
}

$lines = New-Object System.Collections.Generic.List[string]
$lines.Add("## $newTag — $(Get-Date -Format 'yyyy-MM-dd')")
$lines.Add('')
$commitWord = if ($commits.Count -eq 1) { 'commit' } else { 'commits' }
$since = if ($previousTag) { "since **$previousTag**" } else { 'in the first release' }
$lines.Add("$($commits.Count) $commitWord $since.")
$lines.Add('')

$breakingCommits = @($commits | Where-Object { $_.Breaking })
if ($breakingCommits.Count -gt 0) {
    $lines.Add('### ⚠️ Breaking Changes')
    $lines.Add('')
    foreach ($commit in $breakingCommits) { $lines.Add((Format-CommitLine $commit)) }
    $lines.Add('')
}

foreach ($type in $sections.Keys) {
    $group = @($commits | Where-Object { $_.Type -eq $type })
    if ($group.Count -eq 0) { continue }

    $lines.Add("### $($sections[$type])")
    $lines.Add('')
    foreach ($commit in $group) { $lines.Add((Format-CommitLine $commit)) }
    $lines.Add('')
}

$authors = @($commits | Select-Object -ExpandProperty Author -Unique | Sort-Object)
$lines.Add("**Contributors:** $($authors -join ', ')")

if ($previousTag) {
    $lines.Add('')
    $lines.Add("**Full diff:** https://github.com/$repoSlug/compare/$previousTag...$newTag")
}

$notes = ($lines -join "`n").TrimEnd() + "`n"

Write-Host ''
Write-Host $notes
Write-Host ''

if ($DryRun) {
    Write-Step 'DryRun: nothing was changed.'
    Write-Info "Version that would be published: $currentVersion -> $newVersion ($newTag)"
    [Console]::OutputEncoding = $previousOutputEncoding
    exit 0
}

# --------------------------------------------------------------------- bump ---

if ($newVersion -ne $currentVersion) {
    Write-Step "Updating package.json: $currentVersion -> $newVersion"

    # Regex replacement instead of ConvertTo-Json: the round-trip would reorder the
    # keys and rewrite the whole file's formatting.
    $updated = [regex]::Replace(
        $packageJsonRaw,
        '("version"\s*:\s*")' + [regex]::Escape($currentVersion) + '(")',
        '${1}' + $newVersion + '${2}',
        [System.Text.RegularExpressions.RegexOptions]::None,
        [timespan]::FromSeconds(5)
    )
    if ($updated -eq $packageJsonRaw) {
        Stop-WithError "Could not update the version in package.json (pattern `"version`": `"$currentVersion`" not found)."
    }

    [System.IO.File]::WriteAllText($packageJsonPath, $updated, [System.Text.UTF8Encoding]::new($false))

    Invoke-Git add -- package.json | Out-Null
    Invoke-Git commit -m "chore: bump version to $newVersion" | Out-Null
    Write-Ok 'Bump commit created.'
}
else {
    Write-Info "package.json is already at $newVersion — no bump commit."
}

# ----------------------------------------------------------- tag and push -----

Write-Step "Creating tag $newTag"
Invoke-Git tag -a $newTag -m $newTag | Out-Null

Write-Step "Pushing $branch and $newTag to $Remote"
Invoke-Git push $Remote $branch | Out-Null
Invoke-Git push $Remote $newTag | Out-Null
Write-Ok 'Push completed.'

# -------------------------------------------------------------------- build ---

$assets = @()
if ($Build) {
    Write-Step 'Building the installer (pnpm dist)'
    if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
        Stop-WithError "'pnpm' was not found on PATH — run without -Build or install pnpm."
    }

    & pnpm dist
    if ($LASTEXITCODE -ne 0) {
        Stop-WithError "'pnpm dist' failed. Tag $newTag has already been pushed; run 'gh release create $newTag' manually once it is fixed."
    }

    $outDir = Join-Path $root 'out'
    if (Test-Path $outDir) {
        $assets = @(
            Get-ChildItem -Path $outDir -File |
                Where-Object { $_.Name -like "*$newVersion*.exe" -or $_.Name -like "*$newVersion*.exe.blockmap" -or $_.Name -eq 'latest.yml' } |
                Select-Object -ExpandProperty FullName
        )
    }

    if ($assets.Count -eq 0) {
        Write-Info "No $newVersion artifacts found in out/ — the release will have no attachments."
    }
    else {
        foreach ($asset in $assets) { Write-Ok "Asset: $(Split-Path -Leaf $asset)" }
    }
}

# ------------------------------------------------------------------ release ---

Write-Step "Publishing release $newTag"

$notesPath = Join-Path ([System.IO.Path]::GetTempPath()) "release-notes-$newTag.md"
[System.IO.File]::WriteAllText($notesPath, $notes, [System.Text.UTF8Encoding]::new($false))

try {
    $ghArgs = @('release', 'create', $newTag, '--title', $newTag, '--notes-file', $notesPath, '--target', $branch)
    if ($Draft) { $ghArgs += '--draft' }
    if ($PreRelease) { $ghArgs += '--prerelease' }
    if ($assets.Count -gt 0) { $ghArgs += $assets }

    & gh @ghArgs
    if ($LASTEXITCODE -ne 0) {
        Stop-WithError "Failed to create the release. Tag $newTag is already on the remote — fix it and run: gh release create $newTag --notes-file `"$notesPath`""
    }
}
finally {
    if (Test-Path $notesPath) { Remove-Item $notesPath -Force -ErrorAction SilentlyContinue }
}

Write-Host ''
Write-Ok "Release $newTag published: https://github.com/$repoSlug/releases/tag/$newTag"

[Console]::OutputEncoding = $previousOutputEncoding
