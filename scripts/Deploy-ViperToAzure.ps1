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
    [string]$VirtualNetworkName,
    [string]$StorageAccountName,
    [string]$SearchServiceName,
    [string]$CosmosAccountName,
    [string]$SearchIndexName = "viper-search",
    [string]$StorageVideoContainer = "videos",
    [string]$StorageOutputContainer = "analysis",
    [string]$CosmosDatabaseName = "viper",
    [string]$CosmosContainerName = "manifests",
    [string]$ProjectRoot = (Resolve-Path "$PSScriptRoot/.." ).Path,
    [string]$EnvFilePath = (Join-Path ((Resolve-Path "$PSScriptRoot/.." ).Path) ".env"),
    [switch]$SkipEnvFile,
    [string]$AzureEnvFilePath = (Join-Path ((Resolve-Path "$PSScriptRoot/.." ).Path) "azure/.env"),
    [switch]$SkipAzureEnvFile,
    [string]$DatabaseConfigPath = (Join-Path ((Resolve-Path "$PSScriptRoot/.." ).Path) "config/database_urls.json"),
    [string]$CloudDatabaseUrl
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
    $result = & az @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Azure CLI command failed with exit code $LASTEXITCODE."
    }
    return $result
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

function New-DeterministicSuffix {
    param(
        [Parameter(Mandatory)][string]$Seed,
        [int]$Length = 8
    )

    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        $hash = $sha.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($Seed))
    } finally {
        $sha.Dispose()
    }
    $hex = -join ($hash | ForEach-Object { $_.ToString("x2") })
    if ($Length -gt $hex.Length) {
        $Length = $hex.Length
    }
    return $hex.Substring(0, $Length)
}

function New-StorageAccountName {
    param(
        [Parameter(Mandatory)][string]$SubscriptionId,
        [Parameter(Mandatory)][string]$ResourceGroup
    )

    $base = ($ResourceGroup.ToLower() -replace "[^a-z0-9]", "")
    if ($base.Length -lt 3) {
        $base = "viper"
    }
    if ($base.Length -gt 11) {
        $base = $base.Substring(0, 11)
    }
    $suffix = New-DeterministicSuffix -Seed "$SubscriptionId/$ResourceGroup/storage" -Length 12
    $name = ($base + $suffix)
    if ($name.Length -gt 24) {
        $name = $name.Substring(0, 24)
    }
    return $name
}

function New-SearchServiceName {
    param(
        [Parameter(Mandatory)][string]$SubscriptionId,
        [Parameter(Mandatory)][string]$ResourceGroup
    )

    $base = ($ResourceGroup.ToLower() -replace "[^a-z0-9]", "")
    if ($base.Length -lt 3) {
        $base = "viper"
    }
    if ($base.Length -gt 20) {
        $base = $base.Substring(0, 20)
    }
    $suffix = New-DeterministicSuffix -Seed "$SubscriptionId/$ResourceGroup/search" -Length 6
    $name = ($base + $suffix)
    if ($name.Length -gt 60) {
        $name = $name.Substring(0, 60)
    }
    return $name
}

function New-CosmosAccountName {
    param(
        [Parameter(Mandatory)][string]$SubscriptionId,
        [Parameter(Mandatory)][string]$ResourceGroup
    )

    $base = ($ResourceGroup.ToLower() -replace "[^a-z0-9]", "")
    if ($base.Length -lt 3) {
        $base = "viper"
    }
    if ($base.Length -gt 20) {
        $base = $base.Substring(0, 20)
    }
    $suffix = New-DeterministicSuffix -Seed "$SubscriptionId/$ResourceGroup/cosmos" -Length 8
    $name = ($base + $suffix)
    if ($name.Length -gt 44) {
        $name = $name.Substring(0, 44)
    }
    return $name
}

function New-SearchIndexName {
    param([Parameter(Mandatory)][string]$BaseName)

    $sanitized = ($BaseName.ToLower() -replace "[^a-z0-9-]", "-")
    $sanitized = $sanitized.Trim('-')
    if (-not $sanitized) {
        $sanitized = "viper-search"
    }
    if ($sanitized.Length -gt 128) {
        $sanitized = $sanitized.Substring(0, 128)
        $sanitized = $sanitized.Trim('-')
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

Assert-CommandExists -Name "az"
Assert-CommandExists -Name "docker"

$projectRootPath = (Resolve-Path $ProjectRoot).Path
Set-Location $projectRootPath

$databaseConfigPathToUse = $null
if ($DatabaseConfigPath) {
    if (Test-Path $DatabaseConfigPath) {
        $databaseConfigPathToUse = (Resolve-Path $DatabaseConfigPath).Path
    } elseif (-not $CloudDatabaseUrl) {
        throw "Database configuration file '$DatabaseConfigPath' was not found."
    }
}

Write-Host "Building backend Docker image '$BackendImageName'." -ForegroundColor Cyan
Invoke-CheckedDocker -Arguments @("build", "-f", "Dockerfile.backend", "-t", $BackendImageName, ".")

Write-Host "Building frontend Docker image '$FrontendImageName'." -ForegroundColor Cyan
Invoke-CheckedDocker -Arguments @("build", "-f", "Dockerfile.frontend", "-t", $FrontendImageName, ".")

& az account show *> $null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Authenticating with Azure..." -ForegroundColor Cyan
    Invoke-CheckedAz -Arguments @("login") | Out-Null
}
Invoke-CheckedAz -Arguments @("account", "set", "--subscription", $SubscriptionId) | Out-Null

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
if (-not $VirtualNetworkName) {
    $VirtualNetworkName = New-SanitizedName -Base "$ResourceGroupName-vnet" -MaxLength 64 -Default "viper-vnet"
}
if (-not $StorageAccountName) {
    $StorageAccountName = New-StorageAccountName -SubscriptionId $SubscriptionId -ResourceGroup $ResourceGroupName
}
if (-not $SearchServiceName) {
    $SearchServiceName = New-SearchServiceName -SubscriptionId $SubscriptionId -ResourceGroup $ResourceGroupName
}
if (-not $CosmosAccountName) {
    $CosmosAccountName = New-CosmosAccountName -SubscriptionId $SubscriptionId -ResourceGroup $ResourceGroupName
}
$SearchIndexName = New-SearchIndexName -BaseName $SearchIndexName

Write-Host "Ensuring Azure Container Registry '$AcrName'." -ForegroundColor Cyan
Invoke-CheckedAz -Arguments @("acr", "create", "--resource-group", $ResourceGroupName, "--name", $AcrName, "--location", $Location, "--sku", "Basic", "--admin-enabled", "false") | Out-Null

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
$backendBaseUrlOverride = ""

if (-not $SkipEnvFile.IsPresent -and (Test-Path $EnvFilePath)) {
    $parsedEnv = Parse-EnvFile -Path $EnvFilePath
    foreach ($entry in $parsedEnv) {
        if ($entry.name -eq "VIPER_BASE_URL") {
            if (-not [string]::IsNullOrWhiteSpace($entry.value)) {
                $backendBaseUrlOverride = $entry.value
            }
            continue
        }
        if ($entry.name -eq "VIPER_BACKEND_INTERNAL_URL") {
            continue
        }

        $backendEnvVars += $entry
        $frontendEnvVars += $entry
    }
} elseif (-not $SkipEnvFile.IsPresent) {
    Write-Warning "Environment file '$EnvFilePath' was not found. Deployment will continue without injecting application settings."
}

$azureParameterValues = @{}
if (-not $SkipAzureEnvFile.IsPresent -and (Test-Path $AzureEnvFilePath)) {
    foreach ($entry in Parse-EnvFile -Path $AzureEnvFilePath) {
        $azureParameterValues[$entry.name] = $entry.value
    }
} elseif (-not $SkipAzureEnvFile.IsPresent) {
    Write-Warning "Azure environment file '$AzureEnvFilePath' was not found. Role assignments will be skipped unless parameters are provided manually."
}

$storageAccountUrl = "https://$StorageAccountName.blob.core.windows.net"
$searchEndpoint = "https://$SearchServiceName.search.windows.net"
$cosmosEndpoint = "https://$CosmosAccountName.documents.azure.com"

Set-EnvVarValue -Collection ([ref]$backendEnvVars) -Name "AZURE_STORAGE_ACCOUNT_URL" -Value $storageAccountUrl
Set-EnvVarValue -Collection ([ref]$backendEnvVars) -Name "AZURE_STORAGE_VIDEO_CONTAINER" -Value $StorageVideoContainer
Set-EnvVarValue -Collection ([ref]$backendEnvVars) -Name "AZURE_STORAGE_OUTPUT_CONTAINER" -Value $StorageOutputContainer
Set-EnvVarValue -Collection ([ref]$backendEnvVars) -Name "AZURE_SEARCH_ENDPOINT" -Value $searchEndpoint
Set-EnvVarValue -Collection ([ref]$backendEnvVars) -Name "AZURE_SEARCH_INDEX_NAME" -Value $SearchIndexName
Set-EnvVarValue -Collection ([ref]$backendEnvVars) -Name "AZURE_COSMOS_ENDPOINT" -Value $cosmosEndpoint

# Azure-hosted workloads use the production Viper database regardless of local settings.
if ([string]::IsNullOrWhiteSpace($CloudDatabaseUrl)) {
    if (-not $databaseConfigPathToUse) {
        throw "Unable to resolve the cloud database URL. Provide -CloudDatabaseUrl or ensure '$DatabaseConfigPath' exists."
    }
    $CloudDatabaseUrl = Get-DatabaseUrlFromConfig -ConfigPath $databaseConfigPathToUse -Key "cloud"
}
$cloudDatabaseUrl = $CloudDatabaseUrl.Trim()
Set-EnvVarValue -Collection ([ref]$backendEnvVars) -Name "DATABASE_URL" -Value $cloudDatabaseUrl

Set-EnvVarValue -Collection ([ref]$frontendEnvVars) -Name "SEARCH_ENDPOINT" -Value $searchEndpoint
Set-EnvVarValue -Collection ([ref]$frontendEnvVars) -Name "INDEX_NAME" -Value $SearchIndexName
Set-EnvVarValue -Collection ([ref]$frontendEnvVars) -Name "DATABASE_URL" -Value $cloudDatabaseUrl

$azureStorageNameParam = $azureParameterValues['VIPER_AZURE_STORAGE_ACCOUNT_NAME']
if ($azureStorageNameParam) {
    # Preserve compatibility for scenarios where callers provide an existing account.
    $StorageAccountName = $azureStorageNameParam
}
$azureSearchServiceNameParam = $azureParameterValues['VIPER_AZURE_SEARCH_SERVICE_NAME']
if ($azureSearchServiceNameParam) {
    $SearchServiceName = $azureSearchServiceNameParam
}
$azureCosmosNameParam = $azureParameterValues['VIPER_AZURE_COSMOS_ACCOUNT_NAME']
if ($azureCosmosNameParam) {
    $CosmosAccountName = $azureCosmosNameParam
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
    "frontendImage=$frontendRegistryImage",
    "virtualNetworkName=$VirtualNetworkName",
    "storageAccountName=$StorageAccountName",
    "searchServiceName=$SearchServiceName",
    "cosmosAccountName=$CosmosAccountName",
    "cosmosDatabaseName=$CosmosDatabaseName",
    "cosmosContainerName=$CosmosContainerName"
)

if ($backendEnvFile) {
    $parameterValues += "backendEnvVars=@$backendEnvFile"
}
if ($frontendEnvFile) {
    $parameterValues += "frontendEnvVars=@$frontendEnvFile"
}

if ($backendBaseUrlOverride) {
    $parameterValues += "frontendBaseUrl=$backendBaseUrlOverride"
}

$deploymentArgs = @(
    "deployment", "group", "create",
    "--resource-group", $ResourceGroupName,
    "--template-file", $bicepPath,
    "--parameters"
) + $parameterValues

Write-Host "Deploying Azure infrastructure and container apps." -ForegroundColor Cyan
$deploymentResult = Invoke-CheckedAz -Arguments $deploymentArgs
$deploymentJson = $null
try {
    $deploymentJson = $deploymentResult | ConvertFrom-Json
} catch {
    $deploymentJson = $null
}

$deploymentOutputs = $null
if ($deploymentJson -and $deploymentJson.properties -and $deploymentJson.properties.outputs) {
    $deploymentOutputs = $deploymentJson.properties.outputs
}

if ($deploymentOutputs) {
    if ($deploymentOutputs.frontendUrl -and $deploymentOutputs.frontendUrl.value) {
        $frontendUrl = $deploymentOutputs.frontendUrl.value
    }
    if ($deploymentOutputs.backendInternalUrl -and $deploymentOutputs.backendInternalUrl.value) {
        $backendInternalUrl = $deploymentOutputs.backendInternalUrl.value
    }
    if ($deploymentOutputs.storageAccountOutput -and $deploymentOutputs.storageAccountOutput.value) {
        $StorageAccountName = $deploymentOutputs.storageAccountOutput.value
    }
    if ($deploymentOutputs.searchServiceOutput -and $deploymentOutputs.searchServiceOutput.value) {
        $SearchServiceName = $deploymentOutputs.searchServiceOutput.value
    }
    if ($deploymentOutputs.cosmosAccountOutput -and $deploymentOutputs.cosmosAccountOutput.value) {
        $CosmosAccountName = $deploymentOutputs.cosmosAccountOutput.value
    }
}

Write-Host "Ensuring Azure AI Search index '$SearchIndexName'." -ForegroundColor Cyan
$adminKey = Invoke-CheckedAz -Arguments @(
    "search", "admin-key", "show",
    "--service-name", $SearchServiceName,
    "--resource-group", $ResourceGroupName,
    "--query", "primaryKey",
    "-o", "tsv"
)
$adminKey = $adminKey.Trim()

$indexUrl = "https://$SearchServiceName.search.windows.net/indexes('$SearchIndexName')?api-version=2023-11-01"
$indexExists = $false
try {
    Invoke-CheckedAz -Arguments @("rest", "--method", "get", "--url", $indexUrl, "--headers", "api-key=$adminKey") | Out-Null
    $indexExists = $true
} catch {
    $indexExists = $false
}

if (-not $indexExists) {
    $indexDefinition = @{
        name    = $SearchIndexName
        fields  = @(
            @{ name = "id"; type = "Edm.String"; key = $true; searchable = $false; filterable = $false; sortable = $false; facetable = $false }
            @{ name = "videoName"; type = "Edm.String"; searchable = $true; filterable = $true; sortable = $true; facetable = $false }
            @{ name = "videoSlug"; type = "Edm.String"; searchable = $true; filterable = $true; sortable = $false; facetable = $false }
            @{ name = "segmentIndex"; type = "Edm.Int32"; searchable = $false; filterable = $true; sortable = $true; facetable = $false }
            @{ name = "segmentName"; type = "Edm.String"; searchable = $true; filterable = $true; sortable = $false; facetable = $false }
            @{ name = "segmentEntryIndex"; type = "Edm.Int32"; searchable = $false; filterable = $true; sortable = $true; facetable = $false }
            @{ name = "startTimestamp"; type = "Edm.Double"; searchable = $false; filterable = $true; sortable = $true; facetable = $false }
            @{ name = "endTimestamp"; type = "Edm.Double"; searchable = $false; filterable = $true; sortable = $true; facetable = $false }
            @{ name = "sceneTheme"; type = "Edm.String"; searchable = $true; filterable = $true; sortable = $false; facetable = $false }
            @{ name = "summary"; type = "Edm.String"; searchable = $true; filterable = $false; sortable = $false; facetable = $false }
            @{ name = "actions"; type = "Collection(Edm.String)"; searchable = $true; filterable = $true; sortable = $false; facetable = $false }
            @{ name = "characters"; type = "Collection(Edm.String)"; searchable = $true; filterable = $true; sortable = $false; facetable = $false }
            @{ name = "keyObjects"; type = "Collection(Edm.String)"; searchable = $true; filterable = $true; sortable = $false; facetable = $false }
            @{ name = "sentiment"; type = "Edm.String"; searchable = $true; filterable = $true; sortable = $false; facetable = $false }
            @{ name = "organization"; type = "Edm.String"; searchable = $true; filterable = $true; sortable = $false; facetable = $false }
            @{ name = "organizationId"; type = "Edm.String"; searchable = $false; filterable = $true; sortable = $false; facetable = $false }
            @{ name = "collection"; type = "Edm.String"; searchable = $true; filterable = $true; sortable = $false; facetable = $false }
            @{ name = "collectionId"; type = "Edm.String"; searchable = $false; filterable = $true; sortable = $false; facetable = $false }
            @{ name = "user"; type = "Edm.String"; searchable = $true; filterable = $true; sortable = $false; facetable = $false }
            @{ name = "userId"; type = "Edm.String"; searchable = $false; filterable = $true; sortable = $false; facetable = $false }
            @{ name = "videoId"; type = "Edm.String"; searchable = $true; filterable = $true; sortable = $false; facetable = $false }
            @{ name = "contentId"; type = "Edm.String"; searchable = $true; filterable = $true; sortable = $false; facetable = $false }
            @{ name = "videoUrl"; type = "Edm.String"; searchable = $true; filterable = $true; sortable = $false; facetable = $false }
            @{ name = "source"; type = "Edm.String"; searchable = $true; filterable = $true; sortable = $false; facetable = $false }
            @{ name = "content"; type = "Edm.String"; searchable = $true; filterable = $false; sortable = $false; facetable = $false }
            @{ name = "customFields"; type = "Collection(Edm.String)"; searchable = $true; filterable = $true; sortable = $false; facetable = $false }
        )
        semantic = @{
            configurations = @(
                @{
                    name = "sem"
                    prioritizedFields = @{
                        titleField    = @{ fieldName = "segmentName" }
                        contentFields = @(
                            @{ fieldName = "summary" }
                            @{ fieldName = "actions" }
                            @{ fieldName = "characters" }
                            @{ fieldName = "keyObjects" }
                            @{ fieldName = "content" }
                        )
                        keywordsFields = @(
                            @{ fieldName = "sceneTheme" }
                            @{ fieldName = "customFields" }
                        )
                    }
                }
            )
        }
    }
    $indexDefinitionFile = New-TempParameterFile -Content $indexDefinition
    Invoke-CheckedAz -Arguments @(
        "rest", "--method", "put",
        "--url", $indexUrl,
        "--headers", "Content-Type=application/json", "api-key=$adminKey",
        "--body", "@$indexDefinitionFile"
    ) | Out-Null
}

Write-Host "Configuring Azure AI Search query key." -ForegroundColor Cyan
$queryKeysRaw = Invoke-CheckedAz -Arguments @(
    "search", "query-key", "list",
    "--service-name", $SearchServiceName,
    "--resource-group", $ResourceGroupName
)
$queryKeys = @()
if ($queryKeysRaw) {
    try {
        $queryKeys = $queryKeysRaw | ConvertFrom-Json
    } catch {
        $queryKeys = @()
    }
}
$targetQueryKeyName = "viper-query-key"
$queryKeyRecord = $queryKeys | Where-Object { $_.name -eq $targetQueryKeyName } | Select-Object -First 1
if (-not $queryKeyRecord) {
    $queryKeyRecord = Invoke-CheckedAz -Arguments @(
        "search", "query-key", "create",
        "--service-name", $SearchServiceName,
        "--resource-group", $ResourceGroupName,
        "--name", $targetQueryKeyName
    ) | ConvertFrom-Json
}
$searchQueryKey = $queryKeyRecord.key

Invoke-CheckedAz -Arguments @(
    "containerapp", "update",
    "--name", $FrontendContainerAppName,
    "--resource-group", $ResourceGroupName,
    "--set-env-vars", "SEARCH_API_KEY=$searchQueryKey"
) | Out-Null

Write-Host "Fetching frontend FQDN." -ForegroundColor Cyan
if (-not $frontendUrl) {
    $frontendUrl = (Invoke-CheckedAz -Arguments @(
        "containerapp", "show",
        "--name", $FrontendContainerAppName,
        "--resource-group", $ResourceGroupName,
        "--query", "properties.configuration.ingress.fqdn",
        "-o", "tsv"
    )).Trim()
}
if ($frontendUrl) {
    Write-Host "Frontend available at: https://$frontendUrl" -ForegroundColor Green
} else {
    Write-Warning "Unable to resolve the frontend FQDN automatically."
}

if ($tempFiles.Count -gt 0) {
    foreach ($file in $tempFiles) {
        Remove-Item -Path $file -ErrorAction SilentlyContinue
    }
}

Write-Host "Deployment completed successfully." -ForegroundColor Green
