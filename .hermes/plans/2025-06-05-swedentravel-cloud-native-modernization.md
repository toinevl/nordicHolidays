# SwedenTravel Cloud-Native Architecture Modernization Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Evolve the current Azure-static-tier app into a cloud-native architecture with Infrastructure as Code, edge-ready delivery, gateway-backed API access, managed identity security, offline-capable frontend, and observable deployments.

**Architecture:** Preserve the existing Vite frontend + Azure Functions backend, but refactor deployment and runtime to use cloud-native patterns: Bicep IaC, APIM/App Gateway gateway, Key Vault-backed secrets, PWA offline shell, and OpenTelemetry/log analytics.

**Tech Stack:** Existing: Vite + TypeScript + Azure Functions v4 + Azure Table Storage + Anthropic Claude. New: Bicep, App Gateway/APIM, Key Vault, Managed Identity, Azure Front Door/static web apps edge, OpenTelemetry, PWA manifest, Azure Log Analytics.

---

## Current Context And Assumptions

### Assumptions
- The user wants the app behavior to remain: itinerary generation with Claude, saved trips via Table Storage, shareable URLs, en/nl UI.
- Azure is the target cloud; ARM/Bicep is preferred over Terraform.
- "Cloud-native" here means: IaC, certified infrastructure patterns, zero secrets in code, separated network tiers, managed identity, edge-first frontend, observability, safe deployments.

### Current Architecture Gaps To Close
| Area | Current | Cloud-Native Target |
|---|---|---|
| Infrastructure | Manual portal/GitHub Actions strings | IaC via Bicep, parameterized environments |
| Secrets | Local.settings + GitHub secrets | Key Vault + Key Vault references |
| API exposure | Direct HTTPS to Function App | Front Door / APIM / App Gateway in front |
| Auth | None / anonymous | Managed Identity for service-to-service; keep user-anonymous |
| Frontend | SPA on SWA Free | Edge CDN + PWA shell + offline cache |
| Observability | Console.error | App Insights / Log Analytics / OpenTelemetry |
| Deployment | Single-action deploy per app | Staged slots + health gates |

## Proposed Approach

1. Add `/infra` Bicep modules for all services so the whole topology is reproducible in one `bicep build` + deploy.
2. Move the API behind a gateway for WAF, routing, and potential future auth.
3. Replace local settings secrets with Key Vault + MI.
4. Evolve the frontend to a PWA with runtime config baked into the edge/APIM layer.

### Target Topology

```
Browser
  -> Azure Front Door (CDN + WAF)  (or Static Web Apps edge)
       -> Azure API Management / Application Gateway
            -> SwedenTravel API (Azure Functions)
                 -> Table Storage (MI authenticated)
                 -> Key Vault (secrets via references)
```

---

## Step-By-Step Plan

### Phase 1: Infrastructure As Code (Bicep)

#### Task 1: Create Bicep file structure

**Objective:** Establish IaC foundation so the app can be deployed reproducibly across environments.

**Files:**
- `infra/main.bicep` — root orchestration
- `infra/modules/storage.bicep` — Storage account + Table Storage table init
- `infra/modules/functions.bicep` — Function App with managed identity
- `infra/modules/keyvault.bicep` — Key Vault + access policies
- `infra/modules/apim.bicep` — APIM instance + API + product
- `infra/main.parameters.json` — environment values

**Step 1: Create `infra/modules/storage.bicep`**

```bicep
@description('Location for all resources.')
param location string = resourceGroup().location

@description('Name prefix for storage account.')
param prefix string

var storageAccountName = '${prefix}st${uniqueString(resourceGroup().id)}'
var itineraryTable = 'Itineraries'
var preferencesTable = 'Preferences'

resource st 'Microsoft.Storage/storageAccounts@2024-01-01' = {
  name: storageAccountName
  location: location
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: { minimumTlsVersion: 'TLS1_2' }
}

// Tables must be created via/after deployment via CLI/script; Bicep only provisions storage here.
// Document required table names: Itineraries, Preferences (partitionKey=owner)

output storageAccountName string = st.name
```

**Step 2: Create `infra/modules/keyvault.bicep`**

```bicep
param location string = resourceGroup().location
param prefix string
param principalId string // Function App MI objectId

var kvName = '${prefix}kv${uniqueString(resourceGroup().id)}'

resource kv 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: kvName
  location: location
  properties: {
    sku: { family: 'A', name: 'standard' }
    tenantId: subscription().tenantId
    enableRbacAuthorization: true
  }
}

// Grant MI access to secrets. Use Azure RBAC for KeyVault (requires subscription plan support).
// Alternatively, fall back to accessPolicies on the vault.
resource kvAccess 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: 'kv-mi-access-${uniqueString(kv.id)}'
  scope: kv
  properties: {
    roleDefinitionId: '/subscriptions/${subscription().subscriptionId}/providers/Microsoft.Authorization/roleDefinitions/b86a8fe4-44ce-4948-aee5-ecc83e3f04ab' // Key Vault Secrets User
    principalId: principalId
  }
}

output keyVaultName string = kv.name
```

**Step 3: Create `infra/modules/functions.bicep`**

```bicep
param location string = resourceGroup().location
param prefix string
param storageAccountId string
param appInsightsId string
param keyVaultUri string

var functionAppName = '${prefix}-travel-api'

resource plan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: '${prefix}-travel-plan'
  location: location
  sku: { name: 'Y1', tier: 'Dynamic' }
  kind: 'functionapp'
}

resource app 'Microsoft.Web/sites@2023-12-01' = {
  name: functionAppName
  location: location
  identity: { type: 'SystemAssigned' }
  properties: {
    serverFarmId: plan.id
    siteConfig: {
      appSettings: [
        { name: 'AzureWebJobsStorage', value: '@Microsoft.KeyVault(VaultName=${keyVaultUri};SecretName=AzureWebJobsStorage)' }
        { name: 'WEBSITE_RUN_FROM_PACKAGE', value: '1' }
        { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: '@Microsoft.KeyVault(VaultName=${keyVaultUri};SecretName=APPLICATIONINSIGHTS_CONNECTION_STRING)' }
        { name: 'ANTHROPIC_API_KEY', value: '@Microsoft.KeyVault(VaultName=${keyVaultUri};SecretName=ANTHROPIC_API_KEY)' }
      ]
      functionAppScaleLimit: 200
    }
  }
}

output functionAppName string = app.name
output functionAppPrincipalId string = app.identity.principalId
```

**Step 4: Create `infra/modules/apim.bicep`**

```bicep
param location string = resourceGroup().location
param prefix string
param functionAppHost string

// APIM standard or developer tier.
resource apim 'Microsoft.ApiManagement/service@2023-03-01-preview' = {
  name: '${prefix}-apim-${uniqueString(resourceGroup().id)}'
  location: location
  sku: { name: 'Developer', capacity: 1 }
  properties: {}
}

resource api 'Microsoft.ApiManagement/service/apis@2023-03-01-preview' = {
  parent: apim
  name: 'sweden-travel-api'
  properties: {
    displayName: 'SwedenTravel API'
    path: ''
    protocols: ['https']
    // API version + backend setting should route to Function App via APIM.
  }
}

output apimName string = apim.name
```

**Step 5: Create `infra/main.bicep`**

```bicep
param environment string = 'dev'
param prefix string

resource rg 'Microsoft.Resources/resourceGroups@2022-09-01' existing = {
  name: 'rg-${prefix}-${environment}'
}

// Assume Key Vault module is last to receive Function MI principalId for RBAC to Secrets

module kv './modules/keyvault.bicep' = {
  name: 'deploy-kv'
  scope: rg
  params: {
    prefix: prefix
    principalId: '' // set after functions module output
  }
}

// Subscription plan + deployment targets assumed created externally or via something like:
// az account set, resource group exist, etc.

// 1. Storage
module storage './modules/storage.bicep' = {
  name: 'deploy-storage'
  scope: rg
  params: { prefix: prefix }
}

// 2. App Insights
resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: 'ai-${prefix}-${environment}'
  scope: rg
  location: resourceGroup().location
  kind: 'web'
  properties: { Application_Type: 'web' }
}

// 3. Function App
module functions './modules/functions.bicep' = {
  name: 'deploy-functions'
  scope: rg
  params: {
    prefix: prefix
    storageAccountId: storage.outputs.storageAccountId
    appInsightsId: appInsights.id
    keyVaultUri: kv.outputs.keyVaultUri
  }
}

// Update KV principalId after MI created:
module kvUpdate './modules/keyvault.bicep' = {
  name: 'kv-rbac'
  scope: rg
  dependsOn: [functions]
  params: {
    prefix: prefix
    principalId: functions.outputs.functionAppPrincipalId
  }
}
```

**Step 6: Verify bicep build**

Run:
```bash
cd infra && az bicep build --file main.bicep
```
Expected: JSON ARM template generated under `infra/main.json`.

**Step 7: Commit**

```bash
git add infra/ && git commit -m "feat: add Bicep IaC for storage, KV, Functions, APIM"
```

---

### Phase 2: Secrets And Identity Modernization

#### Task 2: Provision Key Vault and attach Function MI

**Objective:** Eliminate secrets in code and GitHub configurations.

**Files:**
- `infra/scripts/set-kv-secrets.ps1`
- `api/local.settings.json` — TODOs replaced by KV references

**Step 1: Create `infra/scripts/set-kv-secrets.ps1`**

```powershell
param(
  [string]$VaultName,
  [string]$StorageConnectionString,
  [string]$AnthropicApiKey,
  [string]$AppInsightsConnectionString
)

az keyvault secret set --vault-name $VaultName --name AzureWebJobsStorage --value $StorageConnectionString | Out-Null
az keyvault secret set --vault-name $VaultName --name ANTHROPIC_API_KEY --value $AnthropicApiKey | Out-Null
az keyvault secret set --vault-name $VaultName --name APPLICATIONINSIGHTS_CONNECTION_STRING --value $AppInsightsConnectionString | Out-Null
Write-Host "Secrets provisioned into $VaultName"
```

**Step 2: Update `api/local.settings.json` to use KV-style references only where supported or fallback to local env**

```json
{
  "IsEncrypted": false,
  "Values": {
    "AzureWebJobsStorage": "UseDevelopmentStorage=true",
    "AzureWebJobsSecretStorageType": "files",
    "ANTHROPIC_API_KEY": "",
    "FUNCTIONS_WORKER_RUNTIME": "node"
  }
}
```
Add README.md note to use `az keyvault secret show` for non-local deployments.

**Step 3: Update GitHub Actions secrets references**

Change `deploy-api.yml` to use `az account set` and `az deployment group create` rather than publish profile.

**Step 4: Commit**

```bash
git add infra/scripts/ api/local.settings.json .github/workflows/deploy-api.yml && git commit -m "refactor: migrate API secrets to Key Vault + MI"
```

---

### Phase 3: Network Gateway Layer

#### Task 3: Route API through APIM with health, rate limits, CORS

**Objective:** Add gateway hardening and route management.

**Files:**
- `infra/modules/apim.bicep` — update with policy
- `api/src/functions/cors.ts` — simplify since APIM can handle CORS and preflight
- `api/src/functions/health.ts` — add detailed probe

**Step 1: Add APIM gateway policy for CORS + rate limit**

```xml
<policies>
  <inbound>
    <base />
    <set-header name="X-Functions-Origin" exists-action="override">
      <value>@{context.Request.Headers.GetValueOrDefault("Origin","")}</value>
    </set-header>
    <choose>
      <when condition="@(context.Request.Method == "OPTIONS")">
        <return-response>
          <set-status code="200" reason="OK" />
          <set-header name="Access-Control-Allow-Origin" exists-action="override">
            <value>@(context.Request.Headers.GetValueOrDefault("Origin",""))</value>
          </set-header>
          <set-header name="Access-Control-Allow-Methods" exists-action="override">
            <value>GET,POST,PUT,DELETE,OPTIONS</value>
          </set-header>
          <set-header name="Access-Control-Allow-Headers" exists-action="override">
            <value>Content-Type,Authorization</value>
          </set-header>
          <set-header name="Access-Control-Max-Age" exists-action="override">
            <value>86400</value>
          </set-header>
        </return-response>
      </when>
    </choose>
    <rate-limit calls="100" renewal-period="60" />
  </inbound>
</policies>
```

**Step 2: Update `api/src/functions/health.ts` to return richer status**

```typescript
import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { withCors, corsPreflightResponse } from '../lib/cors'
import { tableClient } from '../lib/tableClient'

export async function healthHandler(req: HttpRequest, _ctx?: InvocationContext): Promise<HttpResponseInit> {
  const origin = req.headers?.get('origin') ?? undefined
  if (req.method === 'OPTIONS') return corsPreflightResponse(origin)

  try {
    await tableClient.listEntities().byPage().next()
    return withCors({ status: 200, body: JSON.stringify({ status: 'healthy', storage: 'reachable' }, null, 2), headers: { 'Content-Type': 'application/json' } }, origin)
  } catch (err: any) {
    return withCors({ status: 503, body: JSON.stringify({ status: 'degraded', storage: 'unreachable', error: err?.message }, null, 2), headers: { 'Content-Type': 'application/json' } }, origin)
  }
}

app.http('health', { methods: ['GET', 'OPTIONS'], authLevel: 'anonymous', route: 'health', handler: healthHandler })
```

**Step 3: Commit**

```bash
git add infra/ api/src/functions/ && git commit -m "feat: APIM gateway with CORS policy; richer health endpoint"
```

---

### Phase 4: Frontend PWA And Offline-First Modernization

#### Task 4: Add PWA manifest, service worker precache, and runtime config

**Objective:** Make the frontend installable, offline-capable, and edge-configured.

**Files:**
- `frontend/public/manifest.webmanifest`
- `frontend/public/sw.js`
- `frontend/src/lib/runtimeConfig.ts`
- `frontend/index.html` — add manifest + sw registration
- `frontend/vite.config.ts` — add Workbox or manual precache

**Step 1: Add `frontend/public/manifest.webmanifest`**

```json
{
  "name": "SwedenTravel",
  "short_name": "SwedenTravel",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#c97d00",
  "icons": [
    { "src": "/icons/192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

**Step 2: Add `frontend/src/lib/runtimeConfig.ts`**

```typescript
export type RuntimeConfig = {
  apiBase: string
}

export function loadRuntimeConfig(): RuntimeConfig {
  const script = document.getElementById('runtime-config')
  if (!script) return { apiBase: '/api' }
  try {
    return JSON.parse((script as HTMLScriptElement).textContent || '{}')
  } catch { return { apiBase: '/api' } }
}
```

**Step 3: Inject runtime config from APIM endpoint in `frontend/index.html`**

```html
<script id="runtime-config" type="application/json">
  {"apiBase": "https://<APIM_GATEWAY_URL>"}
</script>
<script type="module" src="/src/main.ts"></script>
```

**Step 4: Update `frontend/src/main.ts`**

```typescript
import './styles/main.css'
import 'maplibre-gl/dist/maplibre-gl.css'
import { loadRuntimeConfig } from './lib/runtimeConfig'
import { createStore } from './store'
import { apiClient } from './api/client'
import { MapView } from './components/MapView'
import { ItineraryView } from './components/ItineraryView'
import { GeneratorPanel } from './components/GeneratorPanel'
import { SavedTripsPanel } from './components/SavedTripsPanel'
import { StatusBar } from './components/StatusBar'
import { Toast } from './components/Toast'

const cfg = loadRuntimeConfig()
apiClient.configure({ base: cfg.apiBase })

const store = createStore()

const map = new MapView('map', (stop) => store.setState({ selectedStopId: stop.id }))
const itinerary = new ItineraryView((filter) => {}, (stop) => map.flyTo(stop))
const generator = new GeneratorPanel(store, (itineraryData) => {
  itinerary.renderFromItinerary(itineraryData)
  map.reset() // adapt to new route
})
const savedTrips = new SavedTripsPanel(store)
const status = new StatusBar(store)
const toast = new Toast()
```

*(Adapt the existing component names; view code accordingly.)*

**Step 5: Commit**

```bash
git add frontend/public/ frontend/src/lib/runtimeConfig.ts frontend/index.html frontend/src/main.ts && git commit -m "feat: add PWA manifest and runtime config for gateway routing"
```

---

### Phase 5: Observability And Logging Modernization

#### Task 5: Instrument API with OpenTelemetry / App Insights and structured logging

**Objective:** Make failures findable and verify health programmatically.

**Files:**
- `api/src/lib/logger.ts`
- `api/src/functions/generate.ts` — replace console.error with logger
- `api/local.settings.json`

**Step 1: Add `api/src/lib/logger.ts`**

```typescript
export type LogContext = Record<string, unknown>

export function logInfo(message: string, ctx?: LogContext) {
  console.log(JSON.stringify({ level: 'info', message, ...ctx }))
}

export function logError(message: string, error: unknown, ctx?: LogContext) {
  const err = error instanceof Error ? error.message : String(error)
  console.error(JSON.stringify({ level: 'error', message, error: err, ...ctx }))
}
```

**Step 2: Replace bare console.error calls in `api/src/functions/generate.ts` with `logError(...)`**

**Step 3: Commit**

```bash
git add api/src/lib/logger.ts api/src/functions/generate.ts && git commit -m "refactor: instrument API with structured logging"
```

---

### Phase 6: Slotted Release And Deployment Hardening

#### Task 6: Add PR stage slots + warmup probe

**Objective:** Ensure deploy safety and regularity.

**Files:**
- `infra/modules/functions.bicep` — add slot
- `api/host.json` — add warmup route or health route accessible at startup
- `.github/workflows/deploy-api.yml` — add slot swap step

**Step 1: Add stage slot to `infra/modules/functions.bicep`**

```bicep
resource slot 'Microsoft.Web/sites/slots@2023-12-01' = {
  name: '${functionAppName}/staging'
  location: location
  identity: { type: 'SystemAssigned' }
  properties: {
    serverFarmId: plan.id
    siteConfig: {
      appSettings: app.properties.siteConfig.appSettings
    }
  }
}
```

**Step 2: Add deployment swap step in workflow**

```yaml
- name: Deploy to staging slot
  run: az functionapp deployment source config-zip -g $RG -n $FUNC-staging --src api.zip
- name: Warm up
  run: curl -f https://$FUNC-staging.azurewebsites.net/api/health
- name: Swap slots
  run: az functionapp deployment slot swap -g $RG -n $FUNC --slot staging --target-slot production
```

**Step 3: Commit**

```bash
git add infra/modules/functions.bicep .github/workflows/deploy-api.yml && git commit -m "feat: add staging slot + warmup health check for safe swap"
```

---

### Phase 7: Security And Policy Modernization

#### Task 7: Add WAF policy, private endpoints (optional), and lock down storage

**Objective:** Tighten network security posture.

**Files:**
- `infra/modules/waf.bicep`
- `infra/modules/storage.bicep`

**Step 1: Add WAF policy for Front Door or App Gateway**

Use Front Door Standard/Premium or App Gateway with WAF. For example:

```bicep
resource waf 'Microsoft.Network/frontdoorWebApplicationFirewallPolicies@2024-02-01' = {
  name: 'waf-${prefix}-${environment}'
  location: 'global'
  sku: { name: 'Premium_AzureFrontDoor' }
  properties: {
    policySettings: { mode: 'Prevention' }
    managedRules: {
      managedRuleSets: [{ ruleSetType: 'Microsoft_DefaultRuleSet', ruleSetVersion: '2.1' }]
    }
  }
}
```

**Step 2: Restrict storage public access**

```bicep
  properties: { allowBlobPublicAccess: false, minimumTlsVersion: 'TLS1_2', networkAcls: { defaultAction: 'Deny', ipRules: [] } }
```

**Step 3: Commit**

```bash
git add infra/modules/storage.bicep infra/modules/waf.bicep && git commit -m "security: enable WAF policy and restrict storage network access"
```

---

## Open Questions

1. Should the gateway be Azure APIM, App Gateway + WAF, or Front Door? APIM gives the most API governance but is costlier. Front Door is best for global static assets. App Gateway is regional.
2. Key Vault vs. Azure Managed HSM? For current scale Key Vault is fine; HSM may be overkill.
3. Should the frontend use Static Web Apps edge routing or keep SWA and use APIM only for API? SWA handles CI nicely; APIM is independent of Front Door.
4. PWA icons: do you want generated placeholders or custom assets?

---

## Likely Files To Change (Summary)

| File | Change |
|---|---|
| `frontend/public/manifest.webmanifest` | New |
| `frontend/public/sw.js` | New |
| `frontend/src/lib/runtimeConfig.ts` | New |
| `frontend/index.html` | Add manifest + sw registration |
| `frontend/vite.config.ts` | Add Build options + headers for PWA |
| `api/src/lib/logger.ts` | New |
| `api/src/functions/generate.ts` | Replace console.error with logger |
| `api/host.json` | Add warmup behavior if needed |
| `api/local.settings.json` | Reduce secrets in code |
| `infra/` | New IaC directory with Bicep |
| `infra/scripts/set-kv-secrets.ps1` | New |
| `.github/workflows/deploy-api.yml` | Add slot swap + IaC deploy steps |

---

## Validation

- `az bicep build --file infra/main.bicep` should succeed
- `cd api && npm test` should pass after refactors
- `cd frontend && npm test` should pass
- `az functionapp deployment slot create` workflow canary should show health = 200
- Frontend loads offline after first populating PWA cache
- Key Vault references work in Function App without plaintext keys in portal

---

## Risks, Tradeoffs, And Costs

- **Cost:** APIM Developer tier is ~$48/month; Front Door starts cheap but scales with egress. Static Web Apps Free keeps static hosting near-zero.
- **Complexity:** IaC adds moving parts. Keep it simple: deploy infra in its own workflow and link app deploys.
- **Cold start:** Functions Flex Consumption is already low latency; MI doesn't add cold start.
- **Migration:** Existing trips remain in the current storage account; align on migration plan if replacing storage account.

---
