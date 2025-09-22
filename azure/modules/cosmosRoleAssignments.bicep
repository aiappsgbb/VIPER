targetScope = 'resourceGroup'

@description('Name of the Cosmos DB account to assign roles to.')
param cosmosAccountName string

@description('Role assignments to create for the Cosmos DB account.')
param assignments array

resource cosmosAccount 'Microsoft.DocumentDB/databaseAccounts@2023-04-15' existing = {
  name: cosmosAccountName
}

resource cosmosRoleAssignments 'Microsoft.Authorization/roleAssignments@2022-04-01' = [for assignment in assignments: {
  name: assignment.name
  scope: cosmosAccount
  properties: {
    principalId: assignment.principalId
    roleDefinitionId: assignment.roleDefinitionId
  }
}]
