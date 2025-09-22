[CmdletBinding()]
param(
    [string]$ProjectRoot = (Resolve-Path "$PSScriptRoot/.." ).Path,
    [string]$EnvFilePath = (Join-Path ((Resolve-Path "$PSScriptRoot/.." ).Path) ".env"),
    [string]$BackendImageName = "viper-backend",
    [string]$FrontendImageName = "viper-frontend",
    [string]$BackendContainerName = "viper-backend",
    [string]$FrontendContainerName = "viper-frontend",
    [string]$DockerNetworkName = "viper-network",
    [string]$DatabaseConfigPath = (Join-Path ((Resolve-Path "$PSScriptRoot/.." ).Path) "config/database_urls.json"),
    [string]$LocalDatabaseUrl
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Assert-CommandExists {
    param([Parameter(Mandatory)][string]$Name)

    if (-not (Get-Command -Name $Name -ErrorAction SilentlyContinue)) {
        throw "The required command '$Name' was not found on this system. Please install it before running this script."
    }
}

function Invoke-CheckedCommand {
    param(
        [Parameter(Mandatory)][string]$FilePath,
        [string[]]$Arguments = @()
    )

    Write-Host "Running: $FilePath $($Arguments -join ' ')"
    & $FilePath @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Command '$FilePath' failed with exit code $LASTEXITCODE."
    }
}

function Remove-ContainerIfExists {
    param([Parameter(Mandatory)][string]$Name)

    $inspect = & docker container inspect $Name 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Removing existing container '$Name'."
        Invoke-CheckedCommand -FilePath "docker" -Arguments @("rm", "-f", $Name)
    }
}

function Ensure-DockerNetwork {
    param([Parameter(Mandatory)][string]$Name)

    & docker network inspect $Name 2>$null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Creating Docker network '$Name'."
        Invoke-CheckedCommand -FilePath "docker" -Arguments @("network", "create", $Name)
    } else {
        Write-Host "Docker network '$Name' already exists."
    }
}

function Parse-EnvFile {
    param([Parameter(Mandatory)][string]$Path)

    $result = @()
    if (-not (Test-Path $Path)) {
        return $result
    }

    foreach ($line in Get-Content -Path $Path) {
        if ([string]::IsNullOrWhiteSpace($line)) { continue }
        if ($line.TrimStart().StartsWith("#")) { continue }
        $separatorIndex = $line.IndexOf("=")
        if ($separatorIndex -lt 0) { continue }
        $key = $line.Substring(0, $separatorIndex).Trim()
        $value = $line.Substring($separatorIndex + 1).Trim()
        if (-not $key) { continue }
        if ($value.StartsWith('"') -and $value.EndsWith('"') -and $value.Length -ge 2) {
            $value = $value.Substring(1, $value.Length - 2)
        } elseif ($value.StartsWith("'") -and $value.EndsWith("'") -and $value.Length -ge 2) {
            $value = $value.Substring(1, $value.Length - 2)
        }
        $result += [PSCustomObject]@{ name = $key; value = $value }
    }

    return $result
}

function Set-EnvVarValue {
    param(
        [Parameter(Mandatory)][ref]$Collection,
        [Parameter(Mandatory)][string]$Name,
        [Parameter(Mandatory)][string]$Value
    )

    $items = @()
    if ($Collection.Value) {
        $items = @($Collection.Value | Where-Object { $_.name -ne $Name })
    }
    $items += [PSCustomObject]@{ name = $Name; value = $Value }
    $Collection.Value = $items
}

function Format-EnvVarLine {
    param([Parameter(Mandatory)][pscustomobject]$Entry)

    $escapedValue = $Entry.value -replace '"', '\"'
    return '{0}="{1}"' -f $Entry.name, $escapedValue
}

function New-TempEnvFile {
    param([Parameter(Mandatory)][object[]]$Entries)

    $tempPath = [System.IO.Path]::GetTempFileName()
    $lines = $Entries | ForEach-Object { Format-EnvVarLine -Entry $_ }
    [System.IO.File]::WriteAllLines($tempPath, $lines)
    return $tempPath
}

function Get-DatabaseUrlFromConfig {
    param(
        [Parameter(Mandatory)][string]$ConfigPath,
        [Parameter(Mandatory)][string]$Key
    )

    if (-not (Test-Path $ConfigPath)) {
        throw "Database configuration file '$ConfigPath' was not found."
    }

    try {
        $config = Get-Content -Path $ConfigPath -Raw | ConvertFrom-Json
    } catch {
        throw "Database configuration file '$ConfigPath' is not valid JSON: $($_.Exception.Message)"
    }

    $property = $config.PSObject.Properties[$Key]
    if (-not $property) {
        throw "Database configuration '$ConfigPath' does not define a '$Key' entry."
    }

    $value = [string]$property.Value
    if ([string]::IsNullOrWhiteSpace($value)) {
        throw "Database configuration '$ConfigPath' entry '$Key' must be a non-empty string."
    }

    return $value
}

Assert-CommandExists -Name "python"
Assert-CommandExists -Name "docker"

$projectRootPath = (Resolve-Path $ProjectRoot).Path
Set-Location $projectRootPath

Write-Host "Installing cobrapy from the local source tree." -ForegroundColor Cyan
Invoke-CheckedCommand -FilePath "python" -Arguments @("-m", "pip", "install", "--upgrade", "pip")

$editableSourcePath = Join-Path $projectRootPath "src/cobrapy"
if (-not (Test-Path $editableSourcePath)) {
    throw "Unable to locate cobrapy source at '$editableSourcePath'."
}

Push-Location $editableSourcePath
try {
    Invoke-CheckedCommand -FilePath "python" -Arguments @("-m", "pip", "install", "-e", ".")
} finally {
    Pop-Location
}

Write-Host "Building backend Docker image '$BackendImageName'." -ForegroundColor Cyan
Invoke-CheckedCommand -FilePath "docker" -Arguments @("build", "-f", "Dockerfile.backend", "-t", $BackendImageName, ".")

Write-Host "Building frontend Docker image '$FrontendImageName'." -ForegroundColor Cyan
Invoke-CheckedCommand -FilePath "docker" -Arguments @("build", "-f", "Dockerfile.frontend", "-t", $FrontendImageName, ".")

$envEntries = @()
$tempEnvFile = $null

if (Test-Path $EnvFilePath) {
    $resolvedEnvFilePath = (Resolve-Path $EnvFilePath).Path
    $envEntries = Parse-EnvFile -Path $resolvedEnvFilePath
} else {
    Write-Warning "Environment file '$EnvFilePath' was not found. Containers will start with only the injected settings."
}

$databaseConfigPathToUse = $null
if ($DatabaseConfigPath) {
    if (Test-Path $DatabaseConfigPath) {
        $databaseConfigPathToUse = (Resolve-Path $DatabaseConfigPath).Path
    } elseif (-not $LocalDatabaseUrl) {
        throw "Database configuration file '$DatabaseConfigPath' was not found."
    }
}

if ([string]::IsNullOrWhiteSpace($LocalDatabaseUrl)) {
    if (-not $databaseConfigPathToUse) {
        throw "Unable to resolve the local database URL. Provide -LocalDatabaseUrl or ensure '$DatabaseConfigPath' exists."
    }
    $LocalDatabaseUrl = Get-DatabaseUrlFromConfig -ConfigPath $databaseConfigPathToUse -Key "local"
}

if (-not [string]::IsNullOrWhiteSpace($LocalDatabaseUrl)) {
    $normalizedLocalDatabaseUrl = $LocalDatabaseUrl.Trim()
    Set-EnvVarValue -Collection ([ref]$envEntries) -Name "DATABASE_URL" -Value $normalizedLocalDatabaseUrl
}

if ($envEntries.Count -gt 0) {
    $tempEnvFile = New-TempEnvFile -Entries $envEntries
}

Ensure-DockerNetwork -Name $DockerNetworkName

Remove-ContainerIfExists -Name $BackendContainerName
Remove-ContainerIfExists -Name $FrontendContainerName

$backendRunArgs = @("run", "-d", "--name", $BackendContainerName, "--network", $DockerNetworkName, "-p", "8000:8000")
if ($tempEnvFile) {
    $backendRunArgs += @("--env-file", $tempEnvFile)
}
$backendRunArgs += $BackendImageName

$frontendRunArgs = @(
    "run", "-d", "--name", $FrontendContainerName,
    "--network", $DockerNetworkName,
    "-p", "3000:3000"
)
if ($tempEnvFile) {
    $frontendRunArgs += @("--env-file", $tempEnvFile)
}
$frontendRunArgs += @("-e", "VIPER_BASE_URL=http://$BackendContainerName:8000")

$frontendRunArgs += @("-e", "VIPER_BACKEND_INTERNAL_URL=http://$BackendContainerName:8000")

$frontendRunArgs += $FrontendImageName

try {
    Write-Host "Starting backend container '$BackendContainerName'." -ForegroundColor Cyan
    Invoke-CheckedCommand -FilePath "docker" -Arguments $backendRunArgs

    Write-Host "Starting frontend container '$FrontendContainerName'." -ForegroundColor Cyan
    Invoke-CheckedCommand -FilePath "docker" -Arguments $frontendRunArgs
} finally {
    if ($tempEnvFile -and (Test-Path $tempEnvFile)) {
        Remove-Item -Path $tempEnvFile -Force
    }
}

Write-Host "The Viper backend is now available at http://localhost:8000." -ForegroundColor Green
Write-Host "The Viper UI frontend is now available at http://localhost:3000." -ForegroundColor Green
