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
@description('Name of an existing Storage Account to grant access to via managed identity.')
param storageAccountName string = ''
@description('Resource group containing the Storage Account. Defaults to the deployment resource group when omitted.')
param storageAccountResourceGroup string = ''
@description('Name of an existing Azure AI Search service to grant access to via managed identity.')
param searchServiceName string = ''
@description('Resource group containing the Azure AI Search service. Defaults to the deployment resource group when omitted.')
param searchServiceResourceGroup string = ''
@description('Name of an existing Azure AI Speech (Cognitive Services) account to grant access to via managed identity.')
param speechAccountName string = ''
@description('Resource group containing the Azure AI Speech account. Defaults to the deployment resource group when omitted.')
param speechAccountResourceGroup string = ''

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
var speechRoleGuid = '0a8a65c3-59df-4f1b-a1c8-8b1f80b7c4d4'

var hasStorageAccount = !empty(storageAccountName)
var hasSearchService = !empty(searchServiceName)
var hasSpeechAccount = !empty(speechAccountName)

var resolvedStorageResourceGroup = hasStorageAccount && !empty(storageAccountResourceGroup) ? storageAccountResourceGroup : resourceGroup().name
var resolvedSearchResourceGroup = hasSearchService && !empty(searchServiceResourceGroup) ? searchServiceResourceGroup : resourceGroup().name
var resolvedSpeechResourceGroup = hasSpeechAccount && !empty(speechAccountResourceGroup) ? speechAccountResourceGroup : resourceGroup().name

resource storageResourceGroup 'Microsoft.Resources/resourceGroups@2021-04-01' existing = if (hasStorageAccount) {
  name: resolvedStorageResourceGroup
}

resource storageAccount 'Microsoft.Storage/storageAccounts@2022-09-01' existing = if (hasStorageAccount) {
  scope: storageResourceGroup
  name: storageAccountName
}

resource searchResourceGroup 'Microsoft.Resources/resourceGroups@2021-04-01' existing = if (hasSearchService) {
  name: resolvedSearchResourceGroup
}

resource searchService 'Microsoft.Search/searchServices@2020-08-01' existing = if (hasSearchService) {
  scope: searchResourceGroup
  name: searchServiceName
}

resource speechResourceGroup 'Microsoft.Resources/resourceGroups@2021-04-01' existing = if (hasSpeechAccount) {
  name: resolvedSpeechResourceGroup
}

resource speechAccount 'Microsoft.CognitiveServices/accounts@2022-12-01' existing = if (hasSpeechAccount) {
  scope: speechResourceGroup
  name: speechAccountName
}

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

var storageRoleDefinitionId = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', storageRoleGuid)
var searchRoleDefinitionId = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', searchRoleGuid)
var speechRoleDefinitionId = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', speechRoleGuid)
var acrPullRoleDefinitionId = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', acrPullRoleGuid)

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
  name: guid(storageAccount.id, storageRoleGuid, backendApp.identity.principalId)
  scope: storageAccount
  properties: {
    principalId: backendApp.identity.principalId
    roleDefinitionId: storageRoleDefinitionId
  }
}

resource frontendStorageRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (hasStorageAccount) {
  name: guid(storageAccount.id, storageRoleGuid, frontendApp.identity.principalId)
  scope: storageAccount
  properties: {
    principalId: frontendApp.identity.principalId
    roleDefinitionId: storageRoleDefinitionId
  }
}

resource backendSearchRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (hasSearchService) {
  name: guid(searchService.id, searchRoleGuid, backendApp.identity.principalId)
  scope: searchService
  properties: {
    principalId: backendApp.identity.principalId
    roleDefinitionId: searchRoleDefinitionId
  }
}

resource frontendSearchRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (hasSearchService) {
  name: guid(searchService.id, searchRoleGuid, frontendApp.identity.principalId)
  scope: searchService
  properties: {
    principalId: frontendApp.identity.principalId
    roleDefinitionId: searchRoleDefinitionId
  }
}

resource backendSpeechRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (hasSpeechAccount) {
  name: guid(speechAccount.id, speechRoleGuid, backendApp.identity.principalId)
  scope: speechAccount
  properties: {
    principalId: backendApp.identity.principalId
    roleDefinitionId: speechRoleDefinitionId
  }
}

resource frontendSpeechRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (hasSpeechAccount) {
  name: guid(speechAccount.id, speechRoleGuid, frontendApp.identity.principalId)
  scope: speechAccount
  properties: {
    principalId: frontendApp.identity.principalId
    roleDefinitionId: speechRoleDefinitionId
  }
}

output frontendUrl string = format('https://{0}.{1}', frontendContainerAppName, managedEnvironment.properties.defaultDomain)
output backendInternalUrl string = backendInternalUrl
