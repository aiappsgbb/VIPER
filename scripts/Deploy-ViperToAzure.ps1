[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$SubscriptionId,
    [Parameter(Mandatory = $true)][string]$ResourceGroupName,
    [Parameter(Mandatory = $true)][string]$Location,
    [string]$AcrName,
    [string]$ManagedEnvironmentName,
    [string]$LogAnalyticsWorkspaceName,
    [string]$BackendContainerAppName,
    [string]$FrontendContainerAppName,
    [string]$BackendImageName = "viper-backend",
    [string]$FrontendImageName = "viper-frontend",
    [string]$BackendImageTag = "latest",
    [string]$FrontendImageTag = "latest",
    [string]$ProjectRoot = (Resolve-Path "$PSScriptRoot/.." ).Path,
    [string]$EnvFilePath = (Join-Path ((Resolve-Path "$PSScriptRoot/.." ).Path) ".env"),
    [switch]$SkipEnvFile
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Assert-CommandExists {
    param([Parameter(Mandatory)][string]$Name)

    if (-not (Get-Command -Name $Name -ErrorAction SilentlyContinue)) {
        throw "The required command '$Name' was not found on this system. Please install it before running this script."
    }
}

function Invoke-CheckedAz {
    param([Parameter(Mandatory)][string[]]$Arguments)

    Write-Host "az $($Arguments -join ' ')"
    & az @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Azure CLI command failed with exit code $LASTEXITCODE."
    }
}

function Invoke-CheckedDocker {
    param([Parameter(Mandatory)][string[]]$Arguments)

    Write-Host "docker $($Arguments -join ' ')"
    & docker @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Docker command failed with exit code $LASTEXITCODE."
    }
}

function New-SanitizedName {
    param(
        [Parameter(Mandatory)][string]$Base,
        [Parameter(Mandatory)][int]$MaxLength,
        [string]$Default = "viper"
    )

    $sanitized = ($Base.ToLower() -replace "[^a-z0-9-]", "-").Trim('-')
    if (-not $sanitized) {
        $sanitized = $Default
    }
    if ($sanitized.Length -gt $MaxLength) {
        $sanitized = $sanitized.Substring(0, $MaxLength)
        $sanitized = $sanitized.Trim('-')
    }
    if ($sanitized.Length -lt 2) {
        $sanitized = $Default
    }
    return $sanitized
}

function New-AcrName {
    param(
        [Parameter(Mandatory)][string]$Base
    )

    $sanitized = ($Base.ToLower() -replace "[^a-z0-9]", "")
    if ($sanitized.Length -lt 5) {
        $sanitized = ($sanitized + "acr")
    }
    if ($sanitized.Length -gt 40) {
        $sanitized = $sanitized.Substring(0, 40)
    }
    $random = Get-Random -Minimum 1000 -Maximum 9999
    return "${sanitized}${random}"
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

Assert-CommandExists -Name "az"
Assert-CommandExists -Name "docker"

$projectRootPath = (Resolve-Path $ProjectRoot).Path
Set-Location $projectRootPath

& az account show *> $null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Authenticating with Azure..." -ForegroundColor Cyan
    Invoke-CheckedAz -Arguments @("login") | Out-Null
}
Invoke-CheckedAz -Arguments @("account", "set", "--subscription", $SubscriptionId)

Invoke-CheckedAz -Arguments @("group", "create", "--name", $ResourceGroupName, "--location", $Location) | Out-Null

if (-not $AcrName) {
    $AcrName = New-AcrName -Base $ResourceGroupName
}
if (-not $ManagedEnvironmentName) {
    $ManagedEnvironmentName = New-SanitizedName -Base "$ResourceGroupName-env" -MaxLength 32 -Default "viper-env"
}
if (-not $LogAnalyticsWorkspaceName) {
    $LogAnalyticsWorkspaceName = New-SanitizedName -Base "$ResourceGroupName-logs" -MaxLength 63 -Default "viper-logs"
}
if (-not $BackendContainerAppName) {
    $BackendContainerAppName = New-SanitizedName -Base "$ResourceGroupName-backend" -MaxLength 32 -Default "viper-backend"
}
if (-not $FrontendContainerAppName) {
    $FrontendContainerAppName = New-SanitizedName -Base "$ResourceGroupName-frontend" -MaxLength 32 -Default "viper-frontend"
}

Write-Host "Ensuring Azure Container Registry '$AcrName'." -ForegroundColor Cyan
Invoke-CheckedAz -Arguments @("acr", "create", "--resource-group", $ResourceGroupName, "--name", $AcrName, "--location", $Location, "--sku", "Basic", "--admin-enabled", "true") | Out-Null
Invoke-CheckedAz -Arguments @("acr", "login", "--name", $AcrName) | Out-Null

$backendRegistryImage = "$AcrName.azurecr.io/$BackendImageName:$BackendImageTag"
$frontendRegistryImage = "$AcrName.azurecr.io/$FrontendImageName:$FrontendImageTag"

Write-Host "Tagging backend image as '$backendRegistryImage'." -ForegroundColor Cyan
Invoke-CheckedDocker -Arguments @("tag", $BackendImageName, $backendRegistryImage)
Write-Host "Pushing backend image to Azure Container Registry." -ForegroundColor Cyan
Invoke-CheckedDocker -Arguments @("push", $backendRegistryImage)

Write-Host "Tagging frontend image as '$frontendRegistryImage'." -ForegroundColor Cyan
Invoke-CheckedDocker -Arguments @("tag", $FrontendImageName, $frontendRegistryImage)
Write-Host "Pushing frontend image to Azure Container Registry." -ForegroundColor Cyan
Invoke-CheckedDocker -Arguments @("push", $frontendRegistryImage)

$backendEnvVars = @()
$frontendEnvVars = @()
$frontendBaseUrlOverride = ""

if (-not $SkipEnvFile.IsPresent -and (Test-Path $EnvFilePath)) {
    $parsedEnv = Parse-EnvFile -Path $EnvFilePath
    foreach ($entry in $parsedEnv) {
        if ($entry.name -eq "VIPER_BASE_URL") {
            if (-not [string]::IsNullOrWhiteSpace($entry.value)) {
                $frontendBaseUrlOverride = $entry.value
            }
            continue
        }
        $backendEnvVars += $entry
        $frontendEnvVars += $entry
    }
} elseif (-not $SkipEnvFile.IsPresent) {
    Write-Warning "Environment file '$EnvFilePath' was not found. Deployment will continue without injecting application settings."
}

$tempFiles = @()
function New-TempParameterFile {
    param([Parameter(Mandatory)][object]$Content)

    $tempPath = [System.IO.Path]::ChangeExtension([System.IO.Path]::GetTempFileName(), ".json")
    $json = $Content | ConvertTo-Json -Depth 10
    [System.IO.File]::WriteAllText($tempPath, $json, [System.Text.Encoding]::UTF8)
    $script:tempFiles += $tempPath
    return $tempPath
}

if ($backendEnvVars.Count -gt 0) {
    $backendEnvFile = New-TempParameterFile -Content $backendEnvVars
}
if ($frontendEnvVars.Count -gt 0) {
    $frontendEnvFile = New-TempParameterFile -Content $frontendEnvVars
}

$bicepPath = Join-Path $projectRootPath "azure/containerapps.bicep"
if (-not (Test-Path $bicepPath)) {
    throw "Unable to locate '$bicepPath'."
}

$parameterValues = @(
    "location=$Location",
    "acrName=$AcrName",
    "managedEnvironmentName=$ManagedEnvironmentName",
    "logAnalyticsWorkspaceName=$LogAnalyticsWorkspaceName",
    "backendContainerAppName=$BackendContainerAppName",
    "frontendContainerAppName=$FrontendContainerAppName",
    "backendImage=$backendRegistryImage",
    "frontendImage=$frontendRegistryImage"
)

if ($backendEnvFile) {
    $parameterValues += "backendEnvVars=@$backendEnvFile"
}
if ($frontendEnvFile) {
    $parameterValues += "frontendEnvVars=@$frontendEnvFile"
}
if ($frontendBaseUrlOverride) {
    $parameterValues += "frontendBaseUrl=$frontendBaseUrlOverride"
}

$deploymentArgs = @(
    "deployment", "group", "create",
    "--resource-group", $ResourceGroupName,
    "--template-file", $bicepPath,
    "--parameters"
) + $parameterValues

Write-Host "Deploying Azure Container Apps environment." -ForegroundColor Cyan
Invoke-CheckedAz -Arguments $deploymentArgs

Write-Host "Fetching frontend FQDN." -ForegroundColor Cyan
$frontendFqdn = (& az containerapp show --name $FrontendContainerAppName --resource-group $ResourceGroupName --query "properties.configuration.ingress.fqdn" -o tsv)
if ($LASTEXITCODE -eq 0 -and $frontendFqdn) {
    Write-Host "Frontend available at: https://$frontendFqdn" -ForegroundColor Green
} else {
    Write-Warning "Unable to resolve the frontend FQDN automatically."
}

if ($tempFiles.Count -gt 0) {
    foreach ($file in $tempFiles) {
        Remove-Item -Path $file -ErrorAction SilentlyContinue
    }
}

Write-Host "Deployment completed." -ForegroundColor Green
