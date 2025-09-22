targetScope = 'resourceGroup'

@description('Name of the storage account to assign roles to.')
param storageAccountName string

@description('Role assignments to create for the storage account.')
param assignments array

resource storageAccount 'Microsoft.Storage/storageAccounts@2022-09-01' existing = {
  name: storageAccountName
}

resource storageRoleAssignments 'Microsoft.Authorization/roleAssignments@2022-04-01' = [for assignment in assignments: {
  name: assignment.name
  scope: storageAccount
  properties: {
    principalId: assignment.principalId
    roleDefinitionId: assignment.roleDefinitionId
  }
}]
