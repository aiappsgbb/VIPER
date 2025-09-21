param location string
param acrName string
param managedEnvironmentName string
param logAnalyticsWorkspaceName string
param backendContainerAppName string
param frontendContainerAppName string
param backendImage string
param frontendImage string

@description('Optional environment variables to inject into the Viper backend container.')
param backendEnvVars array = []

@description('Optional environment variables to inject into the Viper UI frontend container.')
param frontendEnvVars array = []

@description('Optional override for the Viper UI base URL that points to the Viper backend.')
param frontendBaseUrl string = ''

@description('Name of the virtual network that hosts the Container Apps environment and private endpoints.')
param virtualNetworkName string

@description('Address prefix allocated to the virtual network.')
param virtualNetworkAddressPrefix string = '10.100.0.0/16'

@description('Name of the subnet used by Azure Container Apps infrastructure.')
param containerAppsSubnetName string = 'apps-infra'

@description('CIDR block for the Azure Container Apps infrastructure subnet.')
param containerAppsSubnetPrefix string = '10.100.0.0/23'

@description('Name of the subnet reserved for private endpoints.')
param privateEndpointSubnetName string = 'private-endpoints'

@description('CIDR block for the private endpoint subnet.')
param privateEndpointSubnetPrefix string = '10.100.2.0/24'

@description('Create a new Storage Account when true. Set to false to reference an existing account.')
param createStorageAccount bool = true

@description('Name of the Storage Account to create or reference.')
param storageAccountName string = ''

@description('Resource group containing the existing Storage Account when createStorageAccount is false.')
param storageAccountResourceGroup string = resourceGroup().name

@description('Create a new Azure AI Search service when true. Set to false to reference an existing service.')
param createSearchService bool = true

@description('Name of the Azure AI Search service to create or reference.')
param searchServiceName string = ''

@description('Resource group containing the existing Azure AI Search service when createSearchService is false.')
param searchServiceResourceGroup string = resourceGroup().name

@description('Create a new Azure Cosmos DB account when true. Set to false to reference an existing account.')
param createCosmosAccount bool = true

@description('Name of the Azure Cosmos DB account to create or reference.')
param cosmosAccountName string = ''

@description('Resource group containing the existing Azure Cosmos DB account when createCosmosAccount is false.')
param cosmosAccountResourceGroup string = resourceGroup().name

@description('Name of the Azure Cosmos DB SQL database to create when provisioning a new account.')
param cosmosDatabaseName string = 'viper'

@description('Name of the Azure Cosmos DB SQL container to create when provisioning a new account.')
param cosmosContainerName string = 'manifests'

@description('Partition key path used by the Azure Cosmos DB SQL container.')
param cosmosContainerPartitionKeyPath string = '/id'

@allowed([
  'Eventual'
  'ConsistentPrefix'
  'Session'
  'BoundedStaleness'
  'Strong'
])
@description('Default consistency level for the Cosmos DB account when created by this deployment.')
param cosmosAccountConsistency string = 'Session'

resource acr 'Microsoft.ContainerRegistry/registries@2023-07-01' existing = {
  name: acrName
}

resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2022-10-01' = {
  name: logAnalyticsWorkspaceName
  location: location
  sku: {
    name: 'PerGB2018'
  }
  retentionInDays: 30
}

var logAnalyticsKeys = listKeys(logAnalytics.id, '2020-08-01')

var sanitizedResourceGroupName = toLower(replace(replace(resourceGroup().name, '-', ''), '_', ''))
var truncatedResourceGroupName = length(sanitizedResourceGroupName) >= 11 ? substring(sanitizedResourceGroupName, 0, 11) : sanitizedResourceGroupName
var storageNamePrefix = empty(truncatedResourceGroupName) ? 'viper' : truncatedResourceGroupName
var generatedStorageAccountName = toLower('${storageNamePrefix}${substring(uniqueString(resourceGroup().id, 'storage'), 0, 12)}')
var resolvedStorageAccountName = toLower(createStorageAccount ? (empty(storageAccountName) ? generatedStorageAccountName : storageAccountName) : storageAccountName)

var searchNamePrefix = empty(sanitizedResourceGroupName) ? 'vipersearch' : (length(sanitizedResourceGroupName) >= 20 ? substring(sanitizedResourceGroupName, 0, 20) : sanitizedResourceGroupName)
var generatedSearchServiceName = toLower('${searchNamePrefix}${substring(uniqueString(resourceGroup().id, 'search'), 0, 6)}')
var resolvedSearchServiceName = toLower(createSearchService ? (empty(searchServiceName) ? generatedSearchServiceName : searchServiceName) : searchServiceName)

var cosmosNamePrefix = empty(sanitizedResourceGroupName) ? 'vipercosmos' : (length(sanitizedResourceGroupName) >= 20 ? substring(sanitizedResourceGroupName, 0, 20) : sanitizedResourceGroupName)
var generatedCosmosAccountName = toLower('${cosmosNamePrefix}${substring(uniqueString(resourceGroup().id, 'cosmos'), 0, 8)}')
var resolvedCosmosAccountName = toLower(createCosmosAccount ? (empty(cosmosAccountName) ? generatedCosmosAccountName : cosmosAccountName) : cosmosAccountName)

var hasStorageAccount = createStorageAccount || !empty(resolvedStorageAccountName)
var hasSearchService = createSearchService || !empty(resolvedSearchServiceName)
var hasCosmosAccount = createCosmosAccount || !empty(resolvedCosmosAccountName)

var storageAccountResourceId = hasStorageAccount ? (createStorageAccount ? resourceId('Microsoft.Storage/storageAccounts', resolvedStorageAccountName) : resourceId(storageAccountResourceGroup, 'Microsoft.Storage/storageAccounts', resolvedStorageAccountName)) : ''
var searchServiceResourceId = hasSearchService ? (createSearchService ? resourceId('Microsoft.Search/searchServices', resolvedSearchServiceName) : resourceId(searchServiceResourceGroup, 'Microsoft.Search/searchServices', resolvedSearchServiceName)) : ''
var cosmosAccountResourceId = hasCosmosAccount ? (createCosmosAccount ? resourceId('Microsoft.DocumentDB/databaseAccounts', resolvedCosmosAccountName) : resourceId(cosmosAccountResourceGroup, 'Microsoft.DocumentDB/databaseAccounts', resolvedCosmosAccountName)) : ''

resource virtualNetwork 'Microsoft.Network/virtualNetworks@2023-05-01' = {
  name: virtualNetworkName
  location: location
  properties: {
    addressSpace: {
      addressPrefixes: [
        virtualNetworkAddressPrefix
      ]
    }
    subnets: [
      {
        name: containerAppsSubnetName
        properties: {
          addressPrefix: containerAppsSubnetPrefix
          delegations: [
            {
              name: 'containerapps-delegation'
              properties: {
                serviceName: 'Microsoft.App/environments'
              }
            }
          ]
        }
      }
      {
        name: privateEndpointSubnetName
        properties: {
          addressPrefix: privateEndpointSubnetPrefix
          privateEndpointNetworkPolicies: 'Disabled'
        }
      }
    ]
  }
}

var containerAppsSubnetId = resourceId('Microsoft.Network/virtualNetworks/subnets', virtualNetworkName, containerAppsSubnetName)
var privateEndpointSubnetId = resourceId('Microsoft.Network/virtualNetworks/subnets', virtualNetworkName, privateEndpointSubnetName)

resource managedEnvironment 'Microsoft.App/managedEnvironments@2023-05-01' = {
  name: managedEnvironmentName
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalytics.properties.customerId
        sharedKey: logAnalyticsKeys.primarySharedKey
      }
    }
    vnetConfiguration: {
      infrastructureSubnetId: containerAppsSubnetId
    }
  }
}

resource storageAccount 'Microsoft.Storage/storageAccounts@2022-09-01' = if (createStorageAccount) {
  name: resolvedStorageAccountName
  location: location
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    allowBlobPublicAccess: false
    allowSharedKeyAccess: true
    minimumTlsVersion: 'TLS1_2'
    publicNetworkAccess: 'Disabled'
    supportsHttpsTrafficOnly: true
    networkAcls: {
      defaultAction: 'Deny'
      bypass: 'AzureServices'
    }
  }
}

resource searchService 'Microsoft.Search/searchServices@2020-08-01' = if (createSearchService) {
  name: resolvedSearchServiceName
  location: location
  sku: {
    name: 'standard'
  }
  properties: {
    replicaCount: 1
    partitionCount: 1
    hostingMode: 'default'
    publicNetworkAccess: 'Disabled'
    disableLocalAuth: false
    networkRuleSet: {
      ipRules: []
    }
  }
}

resource cosmosAccount 'Microsoft.DocumentDB/databaseAccounts@2023-04-15' = if (createCosmosAccount) {
  name: resolvedCosmosAccountName
  location: location
  kind: 'GlobalDocumentDB'
  properties: {
    databaseAccountOfferType: 'Standard'
    locations: [
      {
        locationName: location
        failoverPriority: 0
        isZoneRedundant: false
      }
    ]
    enableAutomaticFailover: false
    enableFreeTier: false
    enableAnalyticalStorage: false
    publicNetworkAccess: 'Disabled'
    multipleWriteLocations: false
    disableKeyBasedMetadataWriteAccess: false
    minimalTlsVersion: 'Tls12'
    apiProperties: {
      serverVersion: '4.0'
    }
    consistencyPolicy: {
      defaultConsistencyLevel: cosmosAccountConsistency
    }
    backupPolicy: {
      type: 'Periodic'
      periodicModeProperties: {
        backupIntervalInMinutes: 240
        backupRetentionIntervalInHours: 8
        backupStorageRedundancy: 'Geo'
      }
    }
    capabilities: []
  }
}

resource cosmosDatabase 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2023-04-15' = if (createCosmosAccount) {
  parent: cosmosAccount
  name: cosmosDatabaseName
  properties: {
    resource: {
      id: cosmosDatabaseName
    }
    options: {}
  }
}

resource cosmosContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2023-04-15' = if (createCosmosAccount) {
  parent: cosmosDatabase
  name: cosmosContainerName
  properties: {
    resource: {
      id: cosmosContainerName
      partitionKey: {
        paths: [
          cosmosContainerPartitionKeyPath
        ]
        kind: 'Hash'
      }
    }
    options: {}
  }
}

resource storagePrivateDnsZone 'Microsoft.Network/privateDnsZones@2020-06-01' = if (createStorageAccount) {
  name: 'privatelink.blob.core.windows.net'
  location: 'global'
}

resource storagePrivateDnsLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2020-06-01' = if (createStorageAccount) {
  name: '${storagePrivateDnsZone.name}/${virtualNetworkName}-blob-link'
  properties: {
    registrationEnabled: false
    virtualNetwork: {
      id: virtualNetwork.id
    }
  }
}

resource storagePrivateEndpoint 'Microsoft.Network/privateEndpoints@2023-05-01' = if (createStorageAccount) {
  name: '${resolvedStorageAccountName}-blob-pe'
  location: location
  properties: {
    subnet: {
      id: privateEndpointSubnetId
    }
    privateLinkServiceConnections: [
      {
        name: '${resolvedStorageAccountName}-blob-connection'
        properties: {
          privateLinkServiceId: storageAccount.id
          groupIds: [
            'blob'
          ]
        }
      }
    ]
    privateDnsZoneGroups: [
      {
        name: '${resolvedStorageAccountName}-blob-dns'
        properties: {
          privateDnsZoneConfigs: [
            {
              name: 'blob'
              properties: {
                privateDnsZoneId: storagePrivateDnsZone.id
              }
            }
          ]
        }
      }
    ]
  }
}

resource searchPrivateDnsZone 'Microsoft.Network/privateDnsZones@2020-06-01' = if (createSearchService) {
  name: 'privatelink.search.windows.net'
  location: 'global'
}

resource searchPrivateDnsLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2020-06-01' = if (createSearchService) {
  name: '${searchPrivateDnsZone.name}/${virtualNetworkName}-search-link'
  properties: {
    registrationEnabled: false
    virtualNetwork: {
      id: virtualNetwork.id
    }
  }
}

resource searchPrivateEndpoint 'Microsoft.Network/privateEndpoints@2023-05-01' = if (createSearchService) {
  name: '${resolvedSearchServiceName}-pe'
  location: location
  properties: {
    subnet: {
      id: privateEndpointSubnetId
    }
    privateLinkServiceConnections: [
      {
        name: '${resolvedSearchServiceName}-connection'
        properties: {
          privateLinkServiceId: searchService.id
          groupIds: [
            'searchService'
          ]
        }
      }
    ]
    privateDnsZoneGroups: [
      {
        name: '${resolvedSearchServiceName}-dns'
        properties: {
          privateDnsZoneConfigs: [
            {
              name: 'search'
              properties: {
                privateDnsZoneId: searchPrivateDnsZone.id
              }
            }
          ]
        }
      }
    ]
  }
}

resource cosmosPrivateDnsZone 'Microsoft.Network/privateDnsZones@2020-06-01' = if (createCosmosAccount) {
  name: 'privatelink.documents.azure.com'
  location: 'global'
}

resource cosmosPrivateDnsLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2020-06-01' = if (createCosmosAccount) {
  name: '${cosmosPrivateDnsZone.name}/${virtualNetworkName}-cosmos-link'
  properties: {
    registrationEnabled: false
    virtualNetwork: {
      id: virtualNetwork.id
    }
  }
}

resource cosmosPrivateEndpoint 'Microsoft.Network/privateEndpoints@2023-05-01' = if (createCosmosAccount) {
  name: '${resolvedCosmosAccountName}-sql-pe'
  location: location
  properties: {
    subnet: {
      id: privateEndpointSubnetId
    }
    privateLinkServiceConnections: [
      {
        name: '${resolvedCosmosAccountName}-sql-connection'
        properties: {
          privateLinkServiceId: cosmosAccount.id
          groupIds: [
            'Sql'
          ]
        }
      }
    ]
    privateDnsZoneGroups: [
      {
        name: '${resolvedCosmosAccountName}-sql-dns'
        properties: {
          privateDnsZoneConfigs: [
            {
              name: 'cosmos'
              properties: {
                privateDnsZoneId: cosmosPrivateDnsZone.id
              }
            }
          ]
        }
      }
    ]
  }
}

var backendInternalUrl = format('https://{0}.{1}', backendContainerAppName, managedEnvironment.properties.defaultDomain)
var resolvedBackendBaseUrl = empty(frontendBaseUrl) ? backendInternalUrl : frontendBaseUrl

var backendEnv = [for setting in backendEnvVars: {
  name: setting.name
  value: setting.value
}]

var frontendEnv = arrayConcat(
  [for setting in frontendEnvVars: {
    name: setting.name
    value: setting.value
  }],
  [
    {
      name: 'VIPER_BASE_URL'
      value: resolvedBackendBaseUrl
    },
    {
      name: 'VIPER_BACKEND_INTERNAL_URL'
      value: backendInternalUrl
    }
  ]
)

var registryServer = acr.properties.loginServer
var acrPullRoleGuid = '7f951dda-4ed3-4680-a7ca-43fe172d538d'
var storageRoleGuid = 'ba92f5b4-2d11-453d-a403-e96b0029c9fe'
var searchRoleGuid = 'de139f84-1756-47ae-9be6-808fbbe84772'
var cosmosRoleGuid = 'db49f5e6-0bde-4f5e-8eaa-36847e330f73'

var storageRoleDefinitionId = hasStorageAccount ? subscriptionResourceId('Microsoft.Authorization/roleDefinitions', storageRoleGuid) : ''
var searchRoleDefinitionId = hasSearchService ? subscriptionResourceId('Microsoft.Authorization/roleDefinitions', searchRoleGuid) : ''
var cosmosRoleDefinitionId = hasCosmosAccount ? subscriptionResourceId('Microsoft.Authorization/roleDefinitions', cosmosRoleGuid) : ''
var acrPullRoleDefinitionId = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', acrPullRoleGuid)

resource backendApp 'Microsoft.App/containerApps@2023-05-01' = {
  name: backendContainerAppName
  location: location
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    managedEnvironmentId: managedEnvironment.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: false
        targetPort: 8000
        transport: 'https'
      }
      registries: [
        {
          server: registryServer
          identity: 'SystemAssigned'
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'backend'
          image: backendImage
          env: backendEnv
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 1
      }
    }
  }
}

resource frontendApp 'Microsoft.App/containerApps@2023-05-01' = {
  name: frontendContainerAppName
  location: location
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    managedEnvironmentId: managedEnvironment.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: 3000
        transport: 'https'
        allowInsecure: false
      }
      registries: [
        {
          server: registryServer
          identity: 'SystemAssigned'
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'frontend'
          image: frontendImage
          env: frontendEnv
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 1
      }
    }
  }
}

resource backendAcrPullRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(acr.id, acrPullRoleGuid, backendApp.identity.principalId)
  scope: acr
  properties: {
    principalId: backendApp.identity.principalId
    roleDefinitionId: acrPullRoleDefinitionId
  }
}

resource frontendAcrPullRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(acr.id, acrPullRoleGuid, frontendApp.identity.principalId)
  scope: acr
  properties: {
    principalId: frontendApp.identity.principalId
    roleDefinitionId: acrPullRoleDefinitionId
  }
}

resource backendStorageRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (hasStorageAccount) {
  name: guid(storageAccountResourceId, storageRoleGuid, backendApp.identity.principalId)
  scope: storageAccountResourceId
  properties: {
    principalId: backendApp.identity.principalId
    roleDefinitionId: storageRoleDefinitionId
  }
}

resource frontendStorageRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (hasStorageAccount) {
  name: guid(storageAccountResourceId, storageRoleGuid, frontendApp.identity.principalId)
  scope: storageAccountResourceId
  properties: {
    principalId: frontendApp.identity.principalId
    roleDefinitionId: storageRoleDefinitionId
  }
}

resource backendSearchRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (hasSearchService) {
  name: guid(searchServiceResourceId, searchRoleGuid, backendApp.identity.principalId)
  scope: searchServiceResourceId
  properties: {
    principalId: backendApp.identity.principalId
    roleDefinitionId: searchRoleDefinitionId
  }
}

resource frontendSearchRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (hasSearchService) {
  name: guid(searchServiceResourceId, searchRoleGuid, frontendApp.identity.principalId)
  scope: searchServiceResourceId
  properties: {
    principalId: frontendApp.identity.principalId
    roleDefinitionId: searchRoleDefinitionId
  }
}

resource backendCosmosRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (hasCosmosAccount) {
  name: guid(cosmosAccountResourceId, cosmosRoleGuid, backendApp.identity.principalId)
  scope: cosmosAccountResourceId
  properties: {
    principalId: backendApp.identity.principalId
    roleDefinitionId: cosmosRoleDefinitionId
  }
}

resource frontendCosmosRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (hasCosmosAccount) {
  name: guid(cosmosAccountResourceId, cosmosRoleGuid, frontendApp.identity.principalId)
  scope: cosmosAccountResourceId
  properties: {
    principalId: frontendApp.identity.principalId
    roleDefinitionId: cosmosRoleDefinitionId
  }
}

output frontendUrl string = format('https://{0}.{1}', frontendContainerAppName, managedEnvironment.properties.defaultDomain)
output backendInternalUrl string = backendInternalUrl
output storageAccountOutput string = hasStorageAccount ? resolvedStorageAccountName : ''
output searchServiceOutput string = hasSearchService ? resolvedSearchServiceName : ''
output cosmosAccountOutput string = hasCosmosAccount ? resolvedCosmosAccountName : ''
