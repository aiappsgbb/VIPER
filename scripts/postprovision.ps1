#!/usr/bin/env pwsh

# Post-provision script for VIPER deployment
# This script runs after infrastructure is provisioned to:
# 1. Create Azure AI Search index if it doesn't exist
# 2. Create and configure search query key for frontend

param(
    [string]$ResourceGroupName = $env:AZURE_RESOURCE_GROUP,
    [string]$SearchServiceName = $env:AZURE_SEARCH_SERVICE_NAME,
    [string]$SearchIndexName = $env:AZURE_SEARCH_INDEX_NAME,
    [string]$FrontendAppName = $env:SERVICE_FRONTEND_NAME
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Write-Host "Running post-provision configuration for VIPER..." -ForegroundColor Cyan

# Validate required parameters
if ([string]::IsNullOrWhiteSpace($ResourceGroupName)) {
    Write-Error "AZURE_RESOURCE_GROUP environment variable is not set"
    exit 1
}

if ([string]::IsNullOrWhiteSpace($SearchServiceName)) {
    Write-Host "Azure Search Service not configured, skipping search index setup" -ForegroundColor Yellow
    exit 0
}

if ([string]::IsNullOrWhiteSpace($SearchIndexName)) {
    $SearchIndexName = "viper-search"
}

if ([string]::IsNullOrWhiteSpace($FrontendAppName)) {
    Write-Error "SERVICE_FRONTEND_NAME environment variable is not set"
    exit 1
}

Write-Host "Configuration:" -ForegroundColor Cyan
Write-Host "  Resource Group: $ResourceGroupName"
Write-Host "  Search Service: $SearchServiceName"
Write-Host "  Search Index: $SearchIndexName"
Write-Host "  Frontend App: $FrontendAppName"

# Get Azure Search admin key
Write-Host "`nRetrieving Azure Search admin key..." -ForegroundColor Cyan
$adminKey = az search admin-key show `
    --service-name $SearchServiceName `
    --resource-group $ResourceGroupName `
    --query primaryKey `
    -o tsv

if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to retrieve Azure Search admin key"
    exit 1
}

# Check if index exists
Write-Host "Checking if search index exists..." -ForegroundColor Cyan
$indexUrl = "https://$SearchServiceName.search.windows.net/indexes('$SearchIndexName')?api-version=2023-11-01"
$indexExists = $false

try {
    az rest --method get --url $indexUrl --headers "api-key=$adminKey" | Out-Null
    $indexExists = $true
    Write-Host "Search index '$SearchIndexName' already exists" -ForegroundColor Green
} catch {
    Write-Host "Search index '$SearchIndexName' does not exist, creating..." -ForegroundColor Yellow
}

# Create index if it doesn't exist
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

    # Save index definition to temp file
    $tempFile = [System.IO.Path]::GetTempFileName()
    try {
        $indexDefinition | ConvertTo-Json -Depth 10 | Set-Content -Path $tempFile -Encoding UTF8
        
        Write-Host "Creating search index..." -ForegroundColor Cyan
        az rest --method put `
            --url $indexUrl `
            --headers "Content-Type=application/json" "api-key=$adminKey" `
            --body "@$tempFile"
        
        if ($LASTEXITCODE -ne 0) {
            Write-Error "Failed to create search index"
            exit 1
        }
        
        Write-Host "Search index created successfully" -ForegroundColor Green
    } finally {
        Remove-Item -Path $tempFile -ErrorAction SilentlyContinue
    }
}

# Configure search query key
Write-Host "`nConfiguring Azure Search query key..." -ForegroundColor Cyan
$targetQueryKeyName = "viper-query-key"

# List existing query keys
$queryKeysJson = az search query-key list `
    --service-name $SearchServiceName `
    --resource-group $ResourceGroupName

if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to list query keys"
    exit 1
}

$queryKeys = $queryKeysJson | ConvertFrom-Json
$queryKeyRecord = $queryKeys | Where-Object { $_.name -eq $targetQueryKeyName } | Select-Object -First 1

if (-not $queryKeyRecord) {
    Write-Host "Creating new query key '$targetQueryKeyName'..." -ForegroundColor Cyan
    $queryKeyJson = az search query-key create `
        --service-name $SearchServiceName `
        --resource-group $ResourceGroupName `
        --name $targetQueryKeyName
    
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to create query key"
        exit 1
    }
    
    $queryKeyRecord = $queryKeyJson | ConvertFrom-Json
    Write-Host "Query key created successfully" -ForegroundColor Green
} else {
    Write-Host "Query key '$targetQueryKeyName' already exists" -ForegroundColor Green
}

$searchQueryKey = $queryKeyRecord.key

# Update frontend container app with search API key
Write-Host "`nUpdating frontend container app with search API key..." -ForegroundColor Cyan
az containerapp update `
    --name $FrontendAppName `
    --resource-group $ResourceGroupName `
    --set-env-vars "SEARCH_API_KEY=$searchQueryKey" | Out-Null

if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to update frontend container app"
    exit 1
}

Write-Host "`nPost-provision configuration completed successfully!" -ForegroundColor Green
