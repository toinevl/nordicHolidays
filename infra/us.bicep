targetScope = 'resourceGroup'

// ═══════════════════════════════════════════════════════════════════════════
// RouteKit (US region) infrastructure
//
// Deploys US-specific resources into a dedicated resource group (rgRouteKit):
//   - Storage Account + tables (isolated data)
//   - Function App + Server Farm (isolated compute)
//   - Static Web App (isolated frontend hosting)
//
// Shares from rgNordicHolidays (no duplication):
//   - Application Insights (shared telemetry)
//   - Key Vault (shared secrets — same AI Foundry key)
//   - Azure Maps account (shared routing/distance API)
// ═══════════════════════════════════════════════════════════════════════════

@minLength(3)
@maxLength(24)
@description('Globally unique storage account name (lowercase, alphanumeric only)')
param storageAccountName string = 'routekit'

@description('Function App name')
param functionAppName string = 'routekit-api'

@description('Static Web App name')
param staticWebAppName string = 'routekit'

@description('Azure region')
param location string = 'eastus'

@description('Node runtime version')
param nodeVersion string = '22'

@description('Storage account SKU')
param storageAccountSku string = 'Standard_LRS'

@description('Static Web App SKU')
param staticWebAppSku string = 'Free'

@description('Custom domains (empty = use default .azurestaticapps.net until configured)')
param customDomainNames array = []

@description('Allowed CORS origins')
param allowedCorsOrigins array = [
  'http://localhost:5173'
]

// ─── Shared resource references (live in rgNordicHolidays) ─────────────────

@description('Resource group containing shared resources (App Insights, Key Vault, Maps)')
param sharedResourceGroupName string = 'rgNordicHolidays'

@description('App Insights name in the shared RG')
param sharedAppInsightsName string = 'nordic-holidays-api'

@description('Key Vault name in the shared RG')
param sharedKeyVaultName string = 'kv-nordicholidays'

@description('Maps account name in the shared RG')
param sharedMapsAccountName string = 'nordicholidays-maps'

// ─── Variables ─────────────────────────────────────────────────────────────

var serverFarmName = 'ASP-${resourceGroup().name}-846d'
var corsAllowedOrigins = union(allowedCorsOrigins, ['https://${staticWebApp.properties.defaultHostname}'])

// ─── Shared resource references (existing, cross-RG) ───────────────────────

resource sharedAppInsights 'Microsoft.Insights/components@2020-02-02' existing = {
  name: sharedAppInsightsName
  scope: resourceGroup(subscription().subscriptionId, sharedResourceGroupName)
}

resource sharedKeyVault 'Microsoft.KeyVault/vaults@2023-07-01' existing = {
  name: sharedKeyVaultName
  scope: resourceGroup(subscription().subscriptionId, sharedResourceGroupName)
}

resource sharedMaps 'Microsoft.Maps/accounts@2021-02-01' existing = {
  name: sharedMapsAccountName
  scope: resourceGroup(subscription().subscriptionId, sharedResourceGroupName)
}

// ─── Storage Account ───────────────────────────────────────────────────────

resource storageAccount 'Microsoft.Storage/storageAccounts@2023-01-01' = {
  name: storageAccountName
  location: location
  kind: 'StorageV2'
  sku: {
    name: storageAccountSku
  }
  properties: {
    accessTier: 'Hot'
    allowBlobPublicAccess: false
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
  }
}

resource tableServices 'Microsoft.Storage/storageAccounts/tableServices@2023-01-01' = {
  parent: storageAccount
  name: 'default'
  properties: {}
}

resource itinerariesTable 'Microsoft.Storage/storageAccounts/tableServices/tables@2023-01-01' = {
  parent: tableServices
  name: 'Itineraries'
}

resource preferencesTable 'Microsoft.Storage/storageAccounts/tableServices/tables@2023-01-01' = {
  parent: tableServices
  name: 'Preferences'
}

resource profilesTable 'Microsoft.Storage/storageAccounts/tableServices/tables@2023-01-01' = {
  parent: tableServices
  name: 'Profiles'
}

resource rateLimitsTable 'Microsoft.Storage/storageAccounts/tableServices/tables@2023-01-01' = {
  parent: tableServices
  name: 'RateLimits'
}

resource blobServices 'Microsoft.Storage/storageAccounts/blobServices@2023-01-01' = {
  parent: storageAccount
  name: 'default'
  properties: {}
}

// ─── Server Farm (Flex Consumption) ────────────────────────────────────────

resource serverFarm 'Microsoft.Web/serverfarms@2024-04-01' = {
  name: serverFarmName
  location: location
  kind: 'elastic'
  sku: {
    name: 'FC1'
    tier: 'FlexConsumption'
  }
  properties: {
    reserved: true
  }
}

// ─── Function App ──────────────────────────────────────────────────────────

resource functionApp 'Microsoft.Web/sites@2024-04-01' = {
  name: functionAppName
  location: location
  kind: 'functionapp,linux'
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: serverFarm.id
    enabled: true
    httpsOnly: false
    publicNetworkAccess: 'Enabled'
    clientAffinityEnabled: false
    siteConfig: {
      numberOfWorkers: 1
      defaultDocuments: []
      netFrameworkVersion: 'v4.0'
      http20Enabled: true
      alwaysOn: false
      cors: {
        allowedOrigins: corsAllowedOrigins
        supportCredentials: false
      }
    }
    functionAppConfig: {
      deployment: {
        storage: {
          type: 'blobContainer'
          value: '${storageAccount.properties.primaryEndpoints.blob}app-package-${functionAppName}-6131254'
          authentication: {
            type: 'StorageAccountConnectionString'
            storageAccountConnectionStringName: 'DEPLOYMENT_STORAGE_CONNECTION_STRING'
          }
        }
      }
      runtime: {
        name: 'node'
        version: nodeVersion
      }
      scaleAndConcurrency: {
        alwaysReady: []
        instanceMemoryMB: 2048
        maximumInstanceCount: 100
        triggers: null
      }
    }
  }
}

// Function App Configuration
resource functionAppConfig 'Microsoft.Web/sites/config@2024-04-01' = {
  parent: functionApp
  name: 'appsettings'
  properties: {
    APPLICATIONINSIGHTS_CONNECTION_STRING: sharedAppInsights.properties.ConnectionString
    AzureWebJobsFeatureFlags: 'EnableWorkerIndexing'
    AzureWebJobsStorage: 'DefaultEndpointsProtocol=https;EndpointSuffix=${environment().suffixes.storage};AccountName=${storageAccountName};AccountKey=${listKeys(storageAccount.id, '2023-01-01').keys[0].value};BlobEndpoint=${storageAccount.properties.primaryEndpoints.blob};FileEndpoint=${storageAccount.properties.primaryEndpoints.file};QueueEndpoint=${storageAccount.properties.primaryEndpoints.queue};TableEndpoint=${storageAccount.properties.primaryEndpoints.table}'
    DEPLOYMENT_STORAGE_CONNECTION_STRING: 'DefaultEndpointsProtocol=https;EndpointSuffix=${environment().suffixes.storage};AccountName=${storageAccountName};AccountKey=${listKeys(storageAccount.id, '2023-01-01').keys[0].value}'
    STORAGE_CONNECTION_STRING: 'DefaultEndpointsProtocol=https;EndpointSuffix=${environment().suffixes.storage};AccountName=${storageAccountName};AccountKey=${listKeys(storageAccount.id, '2023-01-01').keys[0].value};BlobEndpoint=${storageAccount.properties.primaryEndpoints.blob};FileEndpoint=${storageAccount.properties.primaryEndpoints.file};QueueEndpoint=${storageAccount.properties.primaryEndpoints.queue};TableEndpoint=${storageAccount.properties.primaryEndpoints.table}'
    TABLES_ENDPOINT: storageAccount.properties.primaryEndpoints.table
    ALLOWED_ORIGINS: join(corsAllowedOrigins, ',')
    LLM_MODEL: 'gpt-5.4-nano'
    ENTRA_ISSUER_HOST: 'https://${environment().authentication.loginEndpoint}'
    ENTRA_API_AUDIENCE: '46d45892-55e5-4bd4-ad30-bd9fb9b4950b'
    ENTRA_REQUIRED_SCOPE: 'user_impersonation'
    AZURE_FOUNDRY_ENDPOINT: 'https://proj-tvv-openclaw-resource.cognitiveservices.azure.com/openai'
    AZURE_FOUNDRY_API_KEY: '@Microsoft.KeyVault(SecretUri=${sharedKeyVault.properties.vaultUri}secrets/AZURE-FOUNDRY-API-KEY)'
    AZURE_MAPS_CLIENT_ID: sharedMaps.properties.uniqueId
    REGION: 'us'
  }
}

// ─── Role Assignments ──────────────────────────────────────────────────────

// Function App → Storage Account (Storage Table Data Contributor)
resource storageTableDataContributorRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: storageAccount
  name: guid(functionAppName, storageAccountName, 'Storage Table Data Contributor')
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '0a9a7e1f-b9d0-4cc4-a60d-0319b160aaa3')
    principalId: functionApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

// Function App → shared Key Vault (Key Vault Secrets User)
// Cross-RG role assignments can't be declared inline in a resourceGroup-scoped
// Bicep file (BCP139/BCP134). These are performed as post-deployment az CLI
// commands — see infra/README.md "US Deployment" section.

// Function App → shared Maps account (Azure Maps Data Reader)
// Same as above — post-deployment az CLI command.

// ─── Static Web App ────────────────────────────────────────────────────────

resource staticWebApp 'Microsoft.Web/staticSites@2024-04-01' = {
  name: staticWebAppName
  location: location
  sku: {
    name: staticWebAppSku
    tier: staticWebAppSku
  }
  properties: {
    provider: 'GitHub'
    publicNetworkAccess: 'Enabled'
  }
}

resource staticWebAppCustomDomain 'Microsoft.Web/staticSites/customDomains@2024-04-01' = [
  for domain in customDomainNames: {
    parent: staticWebApp
    name: domain
    properties: {
      validationMethod: length(split(domain, '.')) <= 2 ? 'dns-txt-token' : 'cname-delegation'
    }
  }
]

// ─── Outputs ───────────────────────────────────────────────────────────────

output storageAccountName string = storageAccount.name
output functionAppName string = functionApp.name
output functionAppUrl string = 'https://${functionApp.properties.defaultHostName}'
output functionAppIdentityPrincipalId string = functionApp.identity.principalId
output staticWebAppName string = staticWebApp.name
output staticWebAppDefaultDomain string = staticWebApp.properties.defaultHostname ?? 'Not assigned'
