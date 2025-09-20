[CmdletBinding()]
param(
    [string]$ProjectRoot = (Resolve-Path "$PSScriptRoot/.." ).Path,
    [string]$EnvFilePath = (Join-Path ((Resolve-Path "$PSScriptRoot/.." ).Path) ".env"),
    [string]$BackendImageName = "viper-backend",
    [string]$FrontendImageName = "viper-frontend",
    [string]$BackendContainerName = "viper-backend",
    [string]$FrontendContainerName = "viper-frontend",
    [string]$DockerNetworkName = "viper-network"
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

Ensure-DockerNetwork -Name $DockerNetworkName

Remove-ContainerIfExists -Name $BackendContainerName
Remove-ContainerIfExists -Name $FrontendContainerName

$backendRunArgs = @("run", "-d", "--name", $BackendContainerName, "--network", $DockerNetworkName, "-p", "8000:8000")
if (Test-Path $EnvFilePath) {
    $backendRunArgs += @("--env-file", (Resolve-Path $EnvFilePath).Path)
}
$backendRunArgs += $BackendImageName
Write-Host "Starting backend container '$BackendContainerName'." -ForegroundColor Cyan
Invoke-CheckedCommand -FilePath "docker" -Arguments $backendRunArgs

$frontendRunArgs = @(
    "run", "-d", "--name", $FrontendContainerName,
    "--network", $DockerNetworkName,
    "-p", "3000:3000"
)
if (Test-Path $EnvFilePath) {
    $frontendRunArgs += @("--env-file", (Resolve-Path $EnvFilePath).Path)
}
$frontendRunArgs += @("-e", "VIPER_BASE_URL=http://$BackendContainerName:8000")
$frontendRunArgs += $FrontendImageName
Write-Host "Starting frontend container '$FrontendContainerName'." -ForegroundColor Cyan
Invoke-CheckedCommand -FilePath "docker" -Arguments $frontendRunArgs

Write-Host "The Viper backend is now available at http://localhost:8000." -ForegroundColor Green
Write-Host "The Viper UI frontend is now available at http://localhost:3000." -ForegroundColor Green
