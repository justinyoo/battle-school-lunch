targetScope = 'resourceGroup'

@description('AZD environment name used to name resources.')
param name string

@description('Azure region for all resources.')
param location string

@description('Common AZD resource tags.')
param tags object = {}

@description('NEIS API key stored in Key Vault and exposed only to the backend.')
@secure()
param neisApiKey string

@description('Container image used while provisioning the backend. AZD replaces it during deployment.')
param backendImage string = 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'

@description('Container image used while provisioning the frontend. AZD replaces it during deployment.')
param frontendImage string = 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'

var abbreviations = loadJsonContent('../abbreviations.json')
var suffix = take(uniqueString(subscription().id, resourceGroup().id, name), 6)
var registryName = replace(toLower('${abbreviations.containerRegistry}${name}${suffix}'), '-', '')
var logAnalyticsName = toLower('${abbreviations.logAnalyticsWorkspace}-${name}-${suffix}')
var insightsName = toLower('${abbreviations.applicationInsights}-${name}-${suffix}')
var keyVaultName = take(replace(toLower('${abbreviations.keyVault}${name}${suffix}'), '-', ''), 24)
var environmentName = toLower('${abbreviations.containerAppEnvironment}-${name}-${suffix}')
var backendName = toLower('${abbreviations.containerApp}-${name}-backend')
var frontendName = toLower('${abbreviations.containerApp}-${name}-frontend')
var backendIdentityName = take(replace(toLower('${abbreviations.userAssignedIdentity}-${name}-backend'), '-', ''), 128)

resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: logAnalyticsName
  location: location
  properties: {
    retentionInDays: 30
    features: {
      enableLogAccessUsingOnlyResourcePermissions: true
    }
    sku: {
      name: 'PerGB2018'
    }
  }
  tags: union(tags, {
    'azd-service-name': 'monitoring'
  })
}

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: insightsName
  location: location
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logAnalytics.id
  }
  tags: union(tags, {
    'azd-service-name': 'monitoring'
  })
}

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: keyVaultName
  location: location
  properties: {
    tenantId: tenant().tenantId
    enableRbacAuthorization: true
    enablePurgeProtection: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 90
    sku: {
      family: 'A'
      name: 'standard'
    }
  }
  tags: union(tags, {
    'azd-service-name': 'secrets'
  })
}

resource neisApiKeySecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'neis-api-key'
  properties: {
    value: neisApiKey
  }
}

resource registry 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: registryName
  location: location
  sku: {
    name: 'Basic'
  }
  properties: {
    adminUserEnabled: false
    publicNetworkAccess: 'Enabled'
  }
  tags: union(tags, {
    'azd-service-name': 'registry'
  })
}

resource containerEnvironment 'Microsoft.App/managedEnvironments@2023-05-01' = {
  name: environmentName
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalytics.properties.customerId
        sharedKey: logAnalytics.listKeys().primarySharedKey
      }
    }
  }
  tags: union(tags, {
    'azd-service-name': 'container-environment'
  })
}

resource backendIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: backendIdentityName
  location: location
  tags: union(tags, {
    'azd-service-name': 'backend-identity'
  })
}

resource backendKeyVaultAccess 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(keyVault.id, backendIdentity.id, 'keyvault-secrets-user')
  scope: keyVault
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '4633458b-17de-408a-b874-0445c86b69e6')
    principalId: backendIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

resource backend 'Microsoft.App/containerApps@2024-03-01' = {
  name: backendName
  location: location
  identity: {
    type: 'SystemAssigned,UserAssigned'
    userAssignedIdentities: {
      '${backendIdentity.id}': {}
    }
  }
  properties: {
    managedEnvironmentId: containerEnvironment.id
    configuration: {
      registries: [
        {
          server: registry.properties.loginServer
          identity: 'system'
        }
      ]
      ingress: {
        external: false
        targetPort: 8000
        transport: 'auto'
        allowInsecure: false
      }
      secrets: [
        {
          name: 'neis-api-key'
          keyVaultUrl: '${keyVault.properties.vaultUri}secrets/neis-api-key'
          identity: backendIdentity.id
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'backend'
          image: backendImage
          env: [
            {
              name: 'NEIS_API_KEY'
              secretRef: 'neis-api-key'
            }
            {
              name: 'NEIS_BASE_URL'
              value: 'https://open.neis.go.kr/hub'
            }
            {
              name: 'CORS_ORIGINS'
              value: ''
            }
          ]
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          probes: [
            {
              type: 'Liveness'
              httpGet: {
                path: '/health'
                port: 8000
              }
              initialDelaySeconds: 10
              periodSeconds: 30
            }
          ]
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 2
        rules: [
          {
            name: 'http-scaling'
            http: {
              metadata: {
                concurrentRequests: '50'
              }
            }
          }
        ]
      }
    }
  }
  tags: union(tags, {
    'azd-service-name': 'backend'
  })
  dependsOn: [
    neisApiKeySecret
    backendKeyVaultAccess
  ]
}

resource frontend 'Microsoft.App/containerApps@2024-03-01' = {
  name: frontendName
  location: location
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    managedEnvironmentId: containerEnvironment.id
    configuration: {
      registries: [
        {
          server: registry.properties.loginServer
          identity: 'system'
        }
      ]
      ingress: {
        external: true
        targetPort: 80
        transport: 'auto'
        allowInsecure: false
      }
    }
    template: {
      containers: [
        {
          name: 'frontend'
          image: frontendImage
          env: [
            {
              name: 'BACKEND_URL'
              value: 'http://${backendName}'
            }
          ]
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          probes: [
            {
              type: 'Liveness'
              httpGet: {
                path: '/'
                port: 80
              }
              initialDelaySeconds: 10
              periodSeconds: 30
            }
          ]
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 2
        rules: [
          {
            name: 'http-scaling'
            http: {
              metadata: {
                concurrentRequests: '50'
              }
            }
          }
        ]
      }
    }
  }
  tags: union(tags, {
    'azd-service-name': 'frontend'
  })
}

output frontendUrl string = 'https://${frontend.properties.configuration.ingress.fqdn}'
output backendHealthUrl string = 'https://${backend.properties.configuration.ingress.fqdn}/health'
output registryName string = registry.name
output registryLoginServer string = registry.properties.loginServer
output keyVaultName string = keyVault.name
output logAnalyticsWorkspaceId string = logAnalytics.id
output backendPrincipalId string = backend.identity.principalId
output frontendPrincipalId string = frontend.identity.principalId
