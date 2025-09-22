targetScope = 'resourceGroup'

@description('Name of the search service to assign roles to.')
param searchServiceName string

@description('Role assignments to create for the search service.')
param assignments array

resource searchService 'Microsoft.Search/searchServices@2020-08-01' existing = {
  name: searchServiceName
}

resource searchRoleAssignments 'Microsoft.Authorization/roleAssignments@2022-04-01' = [for assignment in assignments: {
  name: assignment.name
  scope: searchService
  properties: {
    principalId: assignment.principalId
    roleDefinitionId: assignment.roleDefinitionId
  }
}]
