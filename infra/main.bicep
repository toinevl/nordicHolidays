targetScope = 'resourceGroup'

// Parameters
@minLength(3)
@maxLength(24)
@description('Globally unique storage account name')
param storageAccountName string = 'nordicholidays'

@description('Key Vault name')
param keyVaultName string = 'kv-nordicholidays'

@description('Function App name')
param functionAppName string = 'nordic-holidays-api'

@description('Application Insights name')
param appInsightsName string = 'nordic-holidays-api'

@description('Static Web App name')
param staticWebAppName string = 'nordicholidays'

@description('Azure region')
param location string = 'westeurope'

@description('Node runtime version')
param nodeVersion string = '22'

@description('Storage account SKU')
param storageAccountSku string = 'Standard_LRS'

@description('Static Web App SKU - Free tier')
param staticWebAppSku string = 'Free'

@description('Custom domain to bind to the Static Web App. Leave empty to skip creating the binding (e.g. for an environment that has no custom domain yet).')
param customDomainName string = 'sweden.van-vliet.eu'

@description('Allowed origins for browser CORS preflight (platform-level, enforced on the Function App). The Static Web App default hostname is appended automatically.')
param allowedCorsOrigins array = [
  'https://sweden.van-vliet.eu'
  'http://localhost:5173'
]

@description('Email address for Application Insights alert notifications')
param alertEmail string = 'toine@van-vliet.eu'

@description('Alert name for generateHandler errors')
param alertName string = 'generateHandler-errors-alert'

@description('Action group name for alert notifications')
param actionGroupName string = 'nordic-holidays-alerts'

// Variables
var serverFarmName = 'ASP-${resourceGroup().name}-846d'
var corsAllowedOrigins = union(allowedCorsOrigins, ['https://${staticWebApp.properties.defaultHostname}'])

// Storage Account
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

// Table Services for Storage Account
resource tableServices 'Microsoft.Storage/storageAccounts/tableServices@2023-01-01' = {
  parent: storageAccount
  name: 'default'
  properties: {}
}

// Storage Tables
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

// Blob Services for Storage Account (required for Function App deployment package)
resource blobServices 'Microsoft.Storage/storageAccounts/blobServices@2023-01-01' = {
  parent: storageAccount
  name: 'default'
  properties: {}
}

// Key Vault
resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: keyVaultName
  location: location
  properties: {
    tenantId: subscription().tenantId
    sku: {
      family: 'A'
      name: 'standard'
    }
    enableRbacAuthorization: true
    publicNetworkAccess: 'Enabled'
    enabledForDeployment: true
    enabledForTemplateDeployment: true
    enabledForDiskEncryption: false
  }
}

// Application Insights
resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: appInsightsName
  location: location
  kind: 'web'
  properties: {
    Application_Type: 'web'
    RetentionInDays: 30
    publicNetworkAccessForIngestion: 'Enabled'
    publicNetworkAccessForQuery: 'Enabled'
  }
}

// Action Group for Alert Notifications
resource actionGroup 'Microsoft.Insights/actionGroups@2023-01-01' = {
  name: actionGroupName
  location: 'Global'
  properties: {
    groupShortName: 'nordicAlerts'
    enabled: true
    emailReceivers: [
      {
        name: 'emailReceiver'
        emailAddress: alertEmail
        useCommonAlertSchema: true
      }
    ]
  }
}

// Scheduled Query Rule for generateHandler Errors
resource generateHandlerAlertRule 'Microsoft.Insights/scheduledQueryRules@2023-03-15-preview' = {
  name: alertName
  location: location
  properties: {
    displayName: 'generateHandler Error Alert'
    description: 'Alert when generateHandler logs errors in Application Insights'
    enabled: true
    scopes: [
      appInsights.id
    ]
    severity: 3
    evaluationFrequency: 'PT5M'
    windowSize: 'PT5M'
    criteria: {
      allOf: [
        {
          query: '''traces
            | where message startswith "generateHandler:"
            | where severityLevel >= 3
            | summarize Count = count() by bin(TimeGenerated, 5m)
            | where Count >= 1'''
          timeAggregation: 'Count'
          operator: 'GreaterThanOrEqual'
          threshold: 1
          failingPeriods: {
            numberOfEvaluationPeriods: 1
            minFailingPeriodsToAlert: 1
          }
        }
      ]
    }
    actions: {
      actionGroups: [
        actionGroup.id
      ]
    }
  }
}

// Server Farm for Function App (Flex Consumption)
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

// Function App
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

  dependsOn: [
    appInsights
  ]
}

// Function App Configuration - App Settings
resource functionAppConfig 'Microsoft.Web/sites/config@2024-04-01' = {
  parent: functionApp
  name: 'appsettings'
  properties: {
    APPLICATIONINSIGHTS_CONNECTION_STRING: appInsights.properties.ConnectionString
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
    AZURE_FOUNDRY_API_KEY: '@Microsoft.KeyVault(SecretUri=${keyVault.properties.vaultUri}secrets/AZURE-FOUNDRY-API-KEY)'
  }
}

// Static Web App
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

// Custom Domain Binding for Static Web App
// #52: this was previously a manual, undocumented Azure Portal step (bound 2026-06-27).
// If the Static Web App is ever recreated from this template, DNS for `customDomainName`
// must already have a CNAME record pointing at the SWA's default hostname before this
// resource will validate successfully — declaring it here does not itself configure DNS.
resource staticWebAppCustomDomain 'Microsoft.Web/staticSites/customDomains@2024-04-01' = if (!empty(customDomainName)) {
  parent: staticWebApp
  name: customDomainName
  properties: {
    validationMethod: 'cname-delegation'
  }
}

// Role Assignment: Function App Identity -> Storage Account (Storage Table Data Contributor)
resource storageTableDataContributorRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: storageAccount
  name: guid(functionAppName, storageAccountName, 'Storage Table Data Contributor')
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '0a9a7e1f-b9d0-4cc4-a60d-0319b160aaa3')
    principalId: functionApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

// Role Assignment: Function App Identity -> Key Vault (Key Vault Secrets User)
resource keyVaultSecretsUserRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: keyVault
  name: guid(functionAppName, keyVaultName, 'Key Vault Secrets User')
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '4633458b-17de-408a-b874-0445c86b69e6')
    principalId: functionApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

// Outputs
output storageAccountId string = storageAccount.id
output storageAccountName string = storageAccount.name
output keyVaultId string = keyVault.id
output keyVaultName string = keyVault.name
output keyVaultUri string = keyVault.properties.vaultUri
output functionAppId string = functionApp.id
output functionAppName string = functionApp.name
output functionAppUrl string = 'https://${functionApp.properties.defaultHostName}'
output functionAppIdentityPrincipalId string = functionApp.identity.principalId
output appInsightsId string = appInsights.id
output appInsightsName string = appInsights.name
output appInsightsConnectionString string = appInsights.properties.ConnectionString
output appInsightsInstrumentationKey string = appInsights.properties.InstrumentationKey
output staticWebAppId string = staticWebApp.id
output staticWebAppName string = staticWebApp.name
output staticWebAppDefaultDomain string = staticWebApp.properties.defaultHostname ?? 'Not assigned'
output staticWebAppCustomDomainName string = customDomainName
