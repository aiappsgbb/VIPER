targetScope = 'resourceGroup'

@description('Name of the Cognitive Services account to assign roles to.')
param accountName string

@description('Role assignments to create for the Cognitive Services account.')
param assignments array

resource account 'Microsoft.CognitiveServices/accounts@2023-05-01' existing = {
  name: accountName
}

resource cognitiveServicesRoleAssignments 'Microsoft.Authorization/roleAssignments@2022-04-01' = [for assignment in assignments: {
  name: assignment.name
  scope: account
  properties: {
    principalId: assignment.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: assignment.roleDefinitionId
  }
}]

