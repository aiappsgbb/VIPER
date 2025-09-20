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

resource acr 'Microsoft.ContainerRegistry/registries@2023-07-01' existing = {
  name: acrName
}

var acrCredentials = listCredentials(acr.id, '2019-05-01-preview')

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

var resolvedFrontendBaseUrl = empty(frontendBaseUrl) ? format('https://{0}.{1}', frontendContainerAppName, managedEnvironment.properties.defaultDomain) : frontendBaseUrl

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
      value: resolvedFrontendBaseUrl
    }
  ]
)

var registryServer = acr.properties.loginServer
var registrySecretName = 'acr-password'
var registrySecretValue = acrCredentials.passwords[0].value

resource backendApp 'Microsoft.App/containerApps@2023-05-01' = {
  name: backendContainerAppName
  location: location
  properties: {
    managedEnvironmentId: managedEnvironment.id
    configuration: {
      ingress: {
        external: false
        targetPort: 8000
        transport: 'auto'
      }
      registries: [
        {
          server: registryServer
          username: acrCredentials.username
          passwordSecretRef: registrySecretName
        }
      ]
      secrets: [
        {
          name: registrySecretName
          value: registrySecretValue
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
  properties: {
    managedEnvironmentId: managedEnvironment.id
    configuration: {
      ingress: {
        external: true
        targetPort: 3000
        transport: 'auto'
      }
      registries: [
        {
          server: registryServer
          username: acrCredentials.username
          passwordSecretRef: registrySecretName
        }
      ]
      secrets: [
        {
          name: registrySecretName
          value: registrySecretValue
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

output frontendUrl string = format('https://{0}.{1}', frontendContainerAppName, managedEnvironment.properties.defaultDomain)
output backendInternalUrl string = format('https://{0}.{1}', backendContainerAppName, managedEnvironment.properties.defaultDomain)
