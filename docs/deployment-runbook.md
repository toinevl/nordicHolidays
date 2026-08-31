# NordicHolidays — Deployment Guide & Runbook (D-3)

Reference for operators deploying or troubleshooting `nordicHolidays`.
Covers environment variables, deploy commands, post-deploy smoke tests,
and rollback procedures.

## 0. Facts at a Glance

| Resource | Name | Notes |
|---|---|---|
| Subscription | `2dbeb3f1-e45d-4207-a7e9-185330aad74b` | `az account set --subscription ...` first |
| Resource group | `rgNordicHolidays` | westeurope |
| Static Web App | `nordicholidays` | Free SKU; custom domain `sweden.van-vliet.eu` |
| Function App | `nordic-holidays-api` | Flex Consumption, Node 22 |
| Storage Account | `nordicholidays` | Tables: Itineraries, Preferences, Profiles, RateLimits |
| Key Vault | `kv-nordicholidays` | Holds `AZURE-FOUNDRY-API-KEY` |
| AI Foundry | serverless endpoint | Default model `gpt-4o` (`LLM_MODEL`) |
| Application Insights | `nordic-holidays-api` | Request sampling enabled |

## 1. Environment Variables (API)

Set via GitHub Actions `vars` / `secrets` (see `.github/workflows/deploy-api.yml`):

| Variable | Scope | Default | Purpose |
|---|---|---|---|
| `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID` | secret | — | OIDC federated credential for GH Actions |
| `ENTRA_ISSUER_HOST` | secret | `login.microsoftonline.com` | Entra B2C/JWT issuer for Bearer auth (currently disabled) |
| `ENTRA_API_AUDIENCE` | secret | — | Expected `aud` claim for Entra tokens |
| `NORDIC_HOLIDAYS_FUNCTION_APP_NAME` | var | `nordic-holidays-api` | Target Function App name |
| `NORDIC_HOLIDAYS_ALLOWED_ORIGINS` | var | `https://sweden.van-vliet.eu,https://fjordvia.com,http://localhost:5173` | App-level CORS allow-list (see WR-01) |
| `NORDIC_HOLIDAYS_GENERATE_DAILY_CAP` | var | `500` | Global daily cap on `/api/generate` (see A-1, #149) |
| `NORDIC_HOLIDAYS_RETENTION_ITINERARY_DAYS` | var | `365` | Cleanup cron deletes Itineraries older than this |
| `NORDIC_HOLIDAYS_RETENTION_LEADS_DAYS` | var | `730` | Cleanup cron deletes Leads older than this |
| `NORDIC_HOLIDAYS_RETENTION_DRY_RUN` | var | `1` | If `1`, cleanup logs only, no deletes |

Runtime app settings (managed by Bicep + deploy workflow):

| App Setting | Value source | Notes |
|---|---|---|
| `APPLICATIONINSIGHTS_CONNECTION_STRING` | App Insights component | Auto-wired via Bicep; DO NOT edit manually |
| `STORAGE_CONNECTION_STRING` | Storage account key | Auto-wired via Bicep |
| `TABLES_ENDPOINT` | Storage primary endpoint | Auto-wired via Bicep |
| `AZURE_FOUNDRY_ENDPOINT` | Hardcoded in Bicep | `https://proj-tvv-openclaw-resource...` |
| `AZURE_FOUNDRY_API_KEY` | Key Vault secret ref | `@Microsoft.KeyVault(...)` — lives in Key Vault |
| `AZURE_MAPS_CLIENT_ID` | Azure Maps account | For real driving distances (#89) |
| `LLM_MODEL` | Hardcoded in Bicep | Default `gpt-4o` |
| `REGION` | Param | `nordic` (default) or `us` |

## 2. Deploy API

```bash
# 1. Authenticate to Azure (OIDC via GitHub Actions handles this in CI)
az account set --subscription 2dbeb3f1-e45d-4207-a7e9-185330aad74b

# 2. Set/refresh app settings (idempotent)
az functionapp config appsettings set \
  --resource-group rgNordicHolidays \
  --name nordic-holidays-api \
  --settings \
    ENTRA_ISSUER_HOST="login.microsoftonline.com" \
    ENTRA_API_AUDIENCE="<your-audience>" \
    ENTRA_REQUIRED_SCOPE="user_impersonation" \
    ALLOWED_ORIGINS="https://sweden.van-vliet.eu,https://fjordvia.com,http://localhost:5173" \
    GENERATE_DAILY_CAP="500" \
    RETENTION_ITINERARY_DAYS="365" \
    RETENTION_LEADS_DAYS="730" \
    RETENTION_DRY_RUN="1"

# 3. Build + zip-deploy
cd api
npm ci && npm run build
rm -rf deploy && mkdir deploy
cp package.json deploy/ && cp package-lock.json deploy/ || true
cp host.json deploy/
cp -r dist deploy/dist
cp -r node_modules deploy/node_modules
cd deploy && zip -r ../../api.zip . && cd .. && rm -rf deploy

az functionapp deployment source config-zip \
  --resource-group rgNordicHolidays \
  --name nordic-holidays-api \
  --src ./api.zip \
  --build-remote false

# 4. Smoke test (see section 4)
```

## 3. Deploy Frontend

Frontend deploys independently on push to `frontend/**`:

```bash
cd frontend
npm ci && npm run build
# CI handles the SWA deployment via Azure/static-web-apps-deploy@v1
```

## 4. Post-Deploy Smoke Test

**Always verify after push — a green `git push` does NOT mean the deploy succeeded**
(see CLAUDE.md §Verifying a deploy):

```bash
API_URL="https://nordic-holidays-api.azurewebsites.net/api"
MAX_RETRIES=20
RETRY_DELAY=15

# Health check (with retry for cold start)
for i in $(seq 1 $MAX_RETRIES); do
  status=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/health")
  if [ "$status" = "200" ]; then
    echo "✓ health OK"
    break
  fi
  echo "Retry $i/$MAX_RETRIES... waiting ${RETRY_DELAY}s"
  sleep $RETRY_DELAY
done

# Itineraries public read (no owner header — must be 200)
curl -sf "$API_URL/itineraries" > /dev/null && echo "✓ itineraries list"

# Invalid body → 400
curl -sf -X POST "$API_URL/itineraries" \
  -H "Content-Type: application/json" \
  -d '{"bad":"body"}' -w "%%{http_code}" | grep -q "400" && echo "✓ 400 on bad body"

# Verify custom domain serves the frontend
curl -sf https://sweden.van-vliet.eu > /dev/null && echo "✓ frontend live"
```

CI workflow smoke test reference: `.github/workflows/deploy-api.yml` (lines 96-173).

### Verify deployment commands

```bash
gh run list --workflow=deploy-api.yml --limit 1
gh run watch <run-id> --exit-status

gh run list --workflow=deploy-frontend.yml --limit 1
gh run watch <run-id> --exit-status
```

## 5. Rollback

### API rollback (zip-deploy previous build)

```bash
# Get the previous successful deployment slot/zip
# API uses zip-deploy (no slots on Free/SWA Free). Rollback = redeploy prior artifact.
# If you have the prior api.zip in source control history:
git checkout HEAD~1 -- api/dist/  # adjust as needed
# Rebuild and redeploy using the steps in section 2.
```

**Note**: The API has no staging slot on the Free tier. For true blue/green,
upgrade the Static Web App to Standard ($9/mo, see COMMERCIAL-LAUNCH-RUNBOOK.md §1)
which enables preview environments.

### Frontend rollback

The SWA preserves the last 10 production deployments. Roll back via portal or:

```bash
az staticwebapp environment list \
  --name nordicholidays \
  --resource-group rgNordicHolidays \
  -o table

# Promote a prior environment to production
az staticwebapp environment set \
  --name nordicholidays \
  --resource-group rgNordicHolidays \
  --environment-name <old-env-id>
```

## 6. Common Failure Modes

| Symptom | Likely cause | Fix |
|---|---|---|
| New endpoint 404s after deploy | Function file not imported in `api/src/index.ts` | Add `import './functions/<name>'` (CLAUDE.md — this ships dead endpoints silently) |
| CORS error in browser console | Platform CORS allow-list mismatch | Check `az functionapp cors list` and `ALLOWED_ORIGINS` app setting |
| 500 with non-ASCII city name | Non-ASCII response header value | Headers must be ASCII-only (CLAUDE.md §HTTP response headers) |
| Cold start >10s | Flex Consumption cold start | Expected on first request after idle; health web test covers this |
| Non-ASCII in `mustVisit`/`avoid` cities rejected | Zod `.max(500)` string limit | Fine — input validation is correct; ensure tests use realistic Nordic names |

## 7. Verify Bicep drift

```bash
az bicep build --file infra/main.bicep --outfile /tmp/main.json
node infra/scripts/verify-cors.mjs /tmp/main.json

az deployment group what-if \
  --resource-group rgNordicHolidays \
  --template-file infra/main.bicep \
  --parameters infra/main.bicepparam
```

## See Also

- `COMMERCIAL-LAUNCH-RUNBOOK.md` — cost budget, availability web tests, itineraries table wipe (#169)
- `infra/RECOVERY.md` — Entra app registration recovery, domain bindings
- `CLAUDE.md` — project conventions (non-ASCII fixtures, ASCII-only headers, parallel subagent rules)
- `PARALLEL-IMPROVEMENT-PLAN.md` — full parallel improvement streams
