targetScope = 'subscription'

@description('AZD environment name used to name resources.')
param environmentName string

@description('Azure region for all resources.')
param location string

@description('NEIS API key. AZD reads NEIS_API_KEY when set, or prompts for a value interactively.')
@secure()
param neisApiKey string

var abbreviations = loadJsonContent('./abbreviations.json')
var tags = {
  'azd-env-name': environmentName
}
var resourceGroupName = '${abbreviations.resourceGroup}-${environmentName}'

resource resourceGroup 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: resourceGroupName
  location: location
  tags: {
    'azd-env-name': environmentName
  }
}

module application './modules/application.bicep' = {
  name: 'application'
  scope: resourceGroup
  params: {
    name: environmentName
    location: location
    tags: tags
    neisApiKey: neisApiKey
  }
}

output AZURE_RESOURCE_GROUP string = resourceGroup.name
output AZURE_CONTAINER_REGISTRY_ENDPOINT string = application.outputs.registryLoginServer
output AZURE_KEY_VAULT_NAME string = application.outputs.keyVaultName
output AZURE_LOG_ANALYTICS_WORKSPACE_ID string = application.outputs.logAnalyticsWorkspaceId
output FRONTEND_URL string = application.outputs.frontendUrl
output BACKEND_URL string = application.outputs.backendUrl
output BACKEND_HEALTH_URL string = application.outputs.backendHealthUrl
output MCP_URL string = application.outputs.mcpUrl
