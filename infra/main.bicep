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

@description('Azure Maps account name (must be globally unique alphanumeric, 3-24 chars)')
param azureMapsAccountName string = 'nordicholidays-maps'

@description('Azure Maps account location — Maps is available in fewer regions than general compute; westeurope/eastus/northeurope are safe defaults. Must match the Function App region for lowest latency.')
param azureMapsLocation string = 'westeurope'

@description('Static Web App name')
param staticWebAppName string = 'nordicholidays'

@description('Azure region')
param location string = 'westeurope'

@description('Node runtime version')
param nodeVersion string = '22'

@description('Storage account SKU')
param storageAccountSku string = 'Standard_LRS'

@description('Static Web App SKU. Standard (was Free until #156) — Standard adds a 99.95% SLA, raises the custom-domain cap from 2 to 5, and unlocks password-protected pre-production environments, all needed for the Fjordvia commercial launch. Changing this default does NOT change the live SKU (this template is reference/drift-detection only) — the live upgrade is a manual `az staticwebapp update ... --sku Standard`, see infra/COMMERCIAL-LAUNCH-RUNBOOK.md.')
param staticWebAppSku string = 'Standard'

@description('Custom domains to bind to the Static Web App. Pass an empty array to skip creating bindings (e.g. for an environment that has no custom domain yet). NOTE: on the Standard SWA tier the custom-domain cap rises from 2 to 5 (it was 2 on Free, which sweden.van-vliet.eu + fjordvia.com filled). www.fjordvia.com can now be added as a third binding (and fjordvia.eu could graduate from the Porkbun-side 301 redirect to a real binding). The array is left unchanged here on purpose — binding a new domain is a live-tenant action with its own DNS work and is tracked separately as wishlist #157 (see infra/RECOVERY.md, "fjordvia.com domain binding", for the per-domain procedure).')
param customDomainNames array = [
  'sweden.van-vliet.eu'
  'fjordvia.com'
]

@description('Allowed origins for browser CORS preflight (platform-level, enforced on the Function App). The Static Web App default hostname is appended automatically.')
param allowedCorsOrigins array = [
  'https://sweden.van-vliet.eu'
  'https://fjordvia.com'
  'http://localhost:5173'
]

@description('Email address for Application Insights alert notifications')
param alertEmail string = 'toine@van-vliet.eu'

@description('Alert name for generateHandler errors')
param alertName string = 'generateHandler-errors-alert'

@description('Action group name for alert notifications')
param actionGroupName string = 'nordic-holidays-alerts'

@description('Monthly Azure cost budget in EUR for this resource group')
param monthlyBudgetAmount int = 50

@description('Travel region label — controls which region data pack the API and frontend use. Nordic = Fjordvia, US = RouteKit.')
param region string = 'nordic'

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
          // #90: fixed 2026-07-19. The original query had three bugs that made
          // every Bicep deploy fail with "'summarize' operator: Failed to resolve
          // scalar expression named 'TimeGenerated'":
          //   1. App Insights `traces` exposes `timestamp`, not `TimeGenerated`
          //   2. `severityLevel` is a string ('Warning'/'Error'/...), not a number;
          //      `>= 3` was invalid — use =~ 'Error' or == 'Error' instead
          //   3. The inner `where Count >= 1` was redundant (the criteria threshold
          //      already enforces it) and the summarize-by-bin shape occasionally
          //      confused the rule evaluator; dropped in favour of a flat count
          query: '''traces
            | where message startswith "generateHandler:"
            | where severityLevel == 'Error'
            | summarize Count = count()'''
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

// Consumption Budget for the resource group (#150)
// Reference/drift-detection only, like the rest of this template — the live
// budget is created by hand (see infra/COMMERCIAL-LAUNCH-RUNBOOK.md,
// "az consumption budget create"). Notifications fire at 50 / 80 / 100 % of
// ACTUAL spend and go to both the alert email and the existing action group
// (no second action group — reuses `actionGroup` above).
resource monthlyBudget 'Microsoft.Consumption/budgets@2023-11-01' = {
  name: 'fjordvia-rg-monthly'
  properties: {
    category: 'Cost'
    amount: monthlyBudgetAmount
    timeGrain: 'Monthly'
    timePeriod: {
      startDate: '2026-09-01T00:00:00Z'
    }
    notifications: {
      Actual_GreaterThanOrEqualTo_50_Percent: {
        enabled: true
        operator: 'GreaterThanOrEqualTo'
        threshold: 50
        thresholdType: 'Actual'
        contactEmails: [
          alertEmail
        ]
        contactGroups: [
          actionGroup.id
        ]
      }
      Actual_GreaterThanOrEqualTo_80_Percent: {
        enabled: true
        operator: 'GreaterThanOrEqualTo'
        threshold: 80
        thresholdType: 'Actual'
        contactEmails: [
          alertEmail
        ]
        contactGroups: [
          actionGroup.id
        ]
      }
      Actual_GreaterThanOrEqualTo_100_Percent: {
        enabled: true
        operator: 'GreaterThanOrEqualTo'
        threshold: 100
        thresholdType: 'Actual'
        contactEmails: [
          alertEmail
        ]
        contactGroups: [
          actionGroup.id
        ]
      }
    }
  }
}

// Availability web test (#154) — Standard ping against the API health endpoint.
// The `hidden-link:<appInsights.id>` tag is REQUIRED: it associates the web test
// with the Application Insights component so results appear in the Availability
// blade and can be alerted on. Reference/drift-detection only — if the `az`
// path for classic web tests is awkward, create it via the portal
// (Application Insights → Availability → Add Standard test); see
// infra/COMMERCIAL-LAUNCH-RUNBOOK.md.
resource healthWebTest 'Microsoft.Insights/webtests@2022-06-15' = {
  name: 'nordic-holidays-api-health'
  location: location
  kind: 'standard'
  tags: {
    'hidden-link:${appInsights.id}': 'Resource'
  }
  properties: {
    SyntheticMonitorId: 'nordic-holidays-api-health'
    Name: 'nordic-holidays-api health'
    Description: 'Standard availability ping against https://nordic-holidays-api.azurewebsites.net/api/health (#154)'
    Enabled: true
    Frequency: 300
    Timeout: 30
    Kind: 'standard'
    RetryEnabled: true
    Locations: [
      {
        Id: 'emea-nl-ams-azr'
      }
      {
        Id: 'emea-gb-db3-azr'
      }
      {
        Id: 'emea-fr-pra-edge'
      }
    ]
    Request: {
      RequestUrl: 'https://nordic-holidays-api.azurewebsites.net/api/health'
      HttpVerb: 'GET'
      ParseDependentRequests: false
      FollowRedirects: false
    }
    ValidationRules: {
      ExpectedHttpStatusCode: 200
      SSLCheck: true
      SSLCertRemainingLifetimeCheck: 7
    }
  }
}

// Availability alert (#154) — fires when the health web test fails from 2 of its
// 3 locations. Wired to the EXISTING action group. Uses the classic web-test
// location-availability criteria; scopes must list BOTH the web test and the
// App Insights component.
resource availabilityAlert 'Microsoft.Insights/metricAlerts@2018-03-01' = {
  name: 'nordic-holidays-api-availability-alert'
  location: 'global'
  tags: {
    'hidden-link:${appInsights.id}': 'Resource'
    'hidden-link:${healthWebTest.id}': 'Resource'
  }
  properties: {
    description: 'API /api/health availability web test failing from 2+ of 3 locations (#154)'
    severity: 1
    enabled: true
    scopes: [
      healthWebTest.id
      appInsights.id
    ]
    evaluationFrequency: 'PT5M'
    windowSize: 'PT5M'
    criteria: {
      'odata.type': 'Microsoft.Azure.Monitor.WebtestLocationAvailabilityCriteria'
      webTestId: healthWebTest.id
      componentId: appInsights.id
      failedLocationCount: 2
    }
    actions: [
      {
        actionGroupId: actionGroup.id
      }
    ]
  }
}

// Latency alert (#154) — server-side request duration on the App Insights
// component. Static metric alert on `requests/duration` with Average
// aggregation, threshold 5000 ms, evaluated every 5 min over a rolling 15-min
// window. Average (not P95) is used because a static metric alert cannot do a
// percentile threshold on this metric without a scheduledQueryRules KQL rule;
// if tail latency needs to be caught specifically, convert this to a
// scheduledQueryRules rule styled like `generateHandlerAlertRule` above with
// `requests | summarize percentile(duration, 95)`. Wired to the EXISTING
// action group.
resource latencyAlert 'Microsoft.Insights/metricAlerts@2018-03-01' = {
  name: 'nordic-holidays-api-latency-alert'
  location: 'global'
  tags: {
    'hidden-link:${appInsights.id}': 'Resource'
  }
  properties: {
    description: 'API server-side request duration averaging over 5000 ms across a 15-minute window (#154)'
    severity: 2
    enabled: true
    scopes: [
      appInsights.id
    ]
    evaluationFrequency: 'PT5M'
    windowSize: 'PT15M'
    criteria: {
      'odata.type': 'Microsoft.Azure.Monitor.SingleResourceMultipleMetricCriteria'
      allOf: [
        {
          name: 'RequestDuration'
          metricNamespace: 'microsoft.insights/components'
          metricName: 'requests/duration'
          operator: 'GreaterThan'
          threshold: 5000
          timeAggregation: 'Average'
          criterionType: 'StaticThresholdCriterion'
        }
      ]
    }
    actions: [
      {
        actionGroupId: actionGroup.id
      }
    ]
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
    AZURE_MAPS_CLIENT_ID: azureMaps.properties.uniqueId  // #89 — Maps account resourceId for RBAC auth
    REGION: region  // Multi-region: 'nordic' (default) or 'us' — selects the API region data pack
  }
}

// Azure Maps account (#89) — real driving distances/times via Route Directions API.
// Gen2 (S0) tier has a free monthly quota that comfortably covers generation volume;
// see wishlist #89 for the routing/distance bug this fixes.
resource azureMaps 'Microsoft.Maps/accounts@2021-02-01' = {
  name: azureMapsAccountName
  location: azureMapsLocation
  sku: {
    name: 'G2'  // Gen2 — includes the free tier + PAYG overflow
  }
  kind: 'Gen2'
  properties: {
    disableLocalAuth: true  // enforce Entra-authenticated access; no shared keys
  }
}

// Grant the Function App's managed identity "Azure Maps Data Reader" over the
// Maps account, so the API can authenticate via RBAC (Entra token) instead of a
// shared key. Role definition GUID verified via `az role definition list --name
// "Azure Maps Data Reader"` on 2026-07-19 (#89).
resource azureMapsDataReaderRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: azureMaps
  name: guid(functionAppName, azureMapsAccountName, 'Azure Maps Data Reader')
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '423170ca-a8f6-4b0f-8487-9e4eb8f49bfa')
    principalId: functionApp.identity.principalId
    principalType: 'ServicePrincipal'
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

// Custom Domain Bindings for Static Web App
// #52: this was previously a manual, undocumented Azure Portal step (bound 2026-06-27).
// #80: generalized to a loop so both sweden.van-vliet.eu and fjordvia.com are declared.
// If the Static Web App is ever recreated from this template, DNS for each entry in
// `customDomainNames` must already exist before the binding validates — declaring it
// here does not itself configure DNS (records live at Porkbun for fjordvia.com and at
// the van-vliet.eu DNS host for sweden.van-vliet.eu).
// Validation method: subdomains (3+ labels, e.g. sweden.van-vliet.eu) validate via
// 'cname-delegation'; apex/root domains (2 labels, e.g. fjordvia.com) cannot carry a
// real CNAME at the zone apex, so they validate via 'dns-txt-token' (a TXT record on
// the apex) with an ALIAS/ANAME or flattened-CNAME record routing the traffic — see
// infra/RECOVERY.md, "fjordvia.com domain binding" for the Porkbun specifics.
resource staticWebAppCustomDomain 'Microsoft.Web/staticSites/customDomains@2024-04-01' = [
  for domain in customDomainNames: {
    parent: staticWebApp
    name: domain
    properties: {
      validationMethod: length(split(domain, '.')) <= 2 ? 'dns-txt-token' : 'cname-delegation'
    }
  }
]

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
output staticWebAppCustomDomainNames array = customDomainNames
