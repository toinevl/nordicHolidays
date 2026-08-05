using './us.bicep'

param storageAccountName = 'routekit'
param functionAppName = 'routekit-api'
param staticWebAppName = 'routekit'
param location = 'eastus'
param staticWebAppSku = 'Free'
param customDomainNames = []
param allowedCorsOrigins = [
  'http://localhost:5173'
]
param sharedResourceGroupName = 'rgNordicHolidays'
param sharedAppInsightsName = 'nordic-holidays-api'
param sharedKeyVaultName = 'kv-nordicholidays'
param sharedMapsAccountName = 'nordicholidays-maps'
