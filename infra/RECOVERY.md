# Recovery & Manual Runbooks

This file is the source of truth for live-resource facts and manual (non-IaC)
procedures. If `README.md` prose and this file disagree, trust this file.

Contents:
- [fjordvia.com domain binding (#80)](#fjordviacom-domain-binding-80) — manual
  steps to bind the new domain; **step 1 must happen before the next push to
  `main`**.
- [Recovery: GitHub OIDC App Registration](#recovery-github-oidc-app-registration)

---

# fjordvia.com domain binding (#80)

Manual steps to bind **fjordvia.com** to the Static Web App `nordicholidays`
(resource group `rgNordicHolidays`) alongside the existing
**sweden.van-vliet.eu** binding, which **stays live** — existing share links
must keep working, so do not remove or touch the sweden.van-vliet.eu binding
or its DNS at any point in this runbook.

Context:

- The IaC (`main.bicep` param `customDomainNames`, `allowedCorsOrigins`) and
  CI (`deploy-api.yml` `ALLOWED_ORIGINS` defaults, `verify-cors.mjs`) already
  declare `https://fjordvia.com` as of #80. **Declaring it in IaC changes
  nothing live** — this repo's Bicep is reference/drift-detection only, so
  every step below is a manual action against the live tenant.
- **SWA Free tier allows a maximum of 2 custom domains.**
  sweden.van-vliet.eu + fjordvia.com fills that quota. **fjordvia.eu can
  therefore NOT also be bound** on Free tier — it becomes a registrar-side
  301 redirect at Porkbun instead (step 5).
- DNS for fjordvia.com / fjordvia.eu is hosted at **Porkbun**.
- SWA default hostname (target for DNS records):
  `agreeable-island-03429a403.7.azurestaticapps.net` (from repo variable
  `NORDIC_HOLIDAYS_SWA_URL`; confirm with
  `az staticwebapp show -n nordicholidays -g rgNordicHolidays --query defaultHostname`).

## Step 1 — Add https://fjordvia.com to the live Function App platform CORS

> **DO THIS BEFORE THE NEXT PUSH TO `main`.** The repo now declares
> `https://fjordvia.com` as a required origin everywhere (Bicep, workflow
> defaults, `verify-cors.mjs`). Until the live platform CORS matches, the
> live Function App has drifted from the IaC — and the moment fjordvia.com
> DNS resolves to the SWA (step 3/4), any visitor on the new domain gets
> "NetworkError when attempting to fetch resource" on Generate, exactly the
> 2026-06-29 incident class. Platform CORS is not managed by any workflow or
> Bicep deployment in this repo; only this manual command changes it.

```bash
az functionapp cors add \
  --resource-group rgNordicHolidays \
  --name nordic-holidays-api \
  --allowed-origins https://fjordvia.com

# Verify (should list https://sweden.van-vliet.eu AND https://fjordvia.com):
az functionapp cors show \
  --resource-group rgNordicHolidays \
  --name nordic-holidays-api
```

## Step 2 — GitHub repo variable `NORDIC_HOLIDAYS_ALLOWED_ORIGINS`

This variable, when set, **overrides** the `ALLOWED_ORIGINS` default in
`deploy-api.yml` (app-level CORS allow-list). As of 2026-07-15 it is **not
set** (verified via `gh variable list`), so the updated workflow default
(`https://sweden.van-vliet.eu,https://fjordvia.com,http://localhost:5173`)
takes effect on the next API deploy and **no action is needed**. If it has
been set since, it must gain the new origin:

```bash
gh variable list   # check first
gh variable set NORDIC_HOLIDAYS_ALLOWED_ORIGINS \
  --body "https://sweden.van-vliet.eu,https://fjordvia.com,http://localhost:5173"
```

Note: the app-level `ALLOWED_ORIGINS` setting is only applied by the
`deploy-api.yml` run, so trigger it (push under `api/**` or
`workflow_dispatch`) after step 1 if you want the app layer updated
immediately.

## Step 3 — Porkbun DNS records for fjordvia.com

fjordvia.com is a **zone apex** (root domain) — a real CNAME is not allowed
at the apex, so there are two workable paths at Porkbun. Both need the
existing default records Porkbun pre-creates on the apex (their parked-page
ALIAS/CNAME) **deleted first**, or the new record conflicts.

**Path A — TXT validation + ALIAS for traffic (recommended, matches the
`dns-txt-token` validation the Bicep declares for 2-label domains):**

1. Start the binding to obtain the validation token (see step 4 for the
   command) — with `--validation-method dns-txt-token`, Azure generates a
   token while the domain sits in "Validating" state. Read it with:
   ```bash
   az staticwebapp hostname show \
     --name nordicholidays --resource-group rgNordicHolidays \
     --hostname fjordvia.com --query "validationToken" -o tsv
   ```
2. At Porkbun (DNS for fjordvia.com), create:
   - **TXT** record, host `fjordvia.com` (apex, leave host field empty at
     Porkbun), value = the validation token.
   - **ALIAS** record, host apex, answer
     `agreeable-island-03429a403.7.azurestaticapps.net` — Porkbun's ALIAS
     type does CNAME-flattening at the apex and serves it as A records.
3. Validation typically completes within minutes of the TXT record
   propagating; the TXT record can be removed after the domain shows
   "Ready", the ALIAS must stay.

**Path B — CNAME-flattening only (`cname-delegation`):** create just the
ALIAS record pointing at the SWA default hostname and bind with
`--validation-method cname-delegation`. This can work because Porkbun
flattens the ALIAS, but Azure's CNAME lookup sees A records, not a CNAME,
so validation of an apex this way is unreliable — if it stalls in
"Validating", fall back to Path A. (Path A is why the Bicep declares
`dns-txt-token` for 2-label domains.)

## Step 4 — Bind the domain on the Static Web App

```bash
az staticwebapp hostname set \
  --name nordicholidays \
  --resource-group rgNordicHolidays \
  --hostname fjordvia.com \
  --validation-method dns-txt-token
```

(or Azure Portal → Static Web App `nordicholidays` → Custom domains → Add →
"Custom domain on other DNS" → TXT validation). Then poll until Ready:

```bash
az staticwebapp hostname list \
  --name nordicholidays --resource-group rgNordicHolidays \
  --query "[].{domain:domainName,status:status}" -o table
```

Free-tier certificate issuance is automatic once validated. This is the
second and **last** free custom-domain slot — do not attempt to add
fjordvia.eu as well (it will be rejected/over-quota).

## Step 5 — fjordvia.eu: registrar-side 301 redirect at Porkbun

fjordvia.eu is registered but cannot be bound (2-domain Free-tier quota,
above). At Porkbun → Domain Management → fjordvia.eu → **URL Forwarding**:

- Forward `fjordvia.eu` (and check "include path"/wildcard so
  `fjordvia.eu/x` → `fjordvia.com/x`) to `https://fjordvia.com`
- Type: **301 permanent redirect**
- Porkbun's URL forwarding requires the domain to use Porkbun's default
  nameservers/DNS; it auto-creates the needed A records for their
  redirect service.

## Step 6 — Verification

```bash
# 1. Domain serves the app (follow cert + content):
curl -sSI https://fjordvia.com | head -5          # expect HTTP/2 200, SWA headers

# 2. Platform CORS preflight from the new origin against the live API:
curl -sSi -X OPTIONS https://nordic-holidays-api.azurewebsites.net/api/generate \
  -H "Origin: https://fjordvia.com" \
  -H "Access-Control-Request-Method: POST" | grep -i access-control-allow-origin
# expect: access-control-allow-origin: https://fjordvia.com

# 3. Old domain still fine (share links must not break):
curl -sSI https://sweden.van-vliet.eu | head -5   # expect HTTP/2 200

# 4. fjordvia.eu redirect:
curl -sSI https://fjordvia.eu | grep -iE "HTTP|location"
# expect: 301 + location: https://fjordvia.com/

# 5. IaC drift test still green:
az bicep build --file infra/main.bicep && node infra/scripts/verify-cors.mjs

# 6. In a browser: open https://fjordvia.com, run a Generate, confirm no
#    NetworkError; then open an existing sweden.van-vliet.eu share link.
```

---

# Recovery: GitHub OIDC App Registration

This is the step-by-step runbook for reconstructing the Entra ID app
registration that `deploy-api.yml` uses to authenticate to Azure, in case it
is ever deleted. It exists as a standalone doc (rather than folded into
`main.bicep`) because **Entra app registrations cannot be created via Bicep**
— see "Out of Scope" in `README.md`. If this object is lost and not
recreated exactly as below, every push to `main` that touches `api/**` will
fail at the `azure/login@v2` step of `deploy-api.yml`.

## What actually exists today (verified live, 2026-07-09)

Live values, confirmed via `az ad app show` / `az ad app federated-credential
list` / `az role assignment list` against subscription
`2dbeb3f1-e45d-4207-a7e9-185330aad74b` (tenant `Toine's Premium`,
`3aa156f9-14fb-4ca1-913d-06f6534f327f`):

- **App registration display name:** `swedentravel-github-deploy`
  (appId/Client ID `6c5057ef-ac65-41b5-aba0-533349e8e409`, object ID
  `98ca2ac7-d8c4-4b2f-9313-0a878d88a233`).

  Note this **contradicts** the name previously recorded in `README.md`
  (`nordicholidays-github-deploy`) — that name was never live. The
  `swedentravel-` prefix is a leftover from this repo's prior name
  (`SwedenTravel`, before it was renamed to `nordicHolidays`); the app
  registration itself was never renamed to match. Use the real name above
  when searching for it, not the stale one.

- **Federated credentials on that app** (two — this app registration is
  shared with a second, unrelated repo that also predates the rename):
  | Name | Issuer | Audience | Subject |
  |---|---|---|---|
  | `nordicHolidays-github-fed` | `https://token.actions.githubusercontent.com` | `api://AzureADTokenExchange` | `repo:toinevl/nordicHolidays:ref:refs/heads/main` |
  | `github-main` | `https://token.actions.githubusercontent.com` | `api://AzureADTokenExchange` | `repo:toinevl/SwedenTravel:ref:refs/heads/main` |

  Only the first row (`nordicHolidays-github-fed`) is relevant to this repo.
  The second is a different project's credential riding on the same app
  registration — do not delete it as part of recovering this repo's access,
  and do not assume every credential on this app belongs to nordicHolidays.

- **Role assignment:** `Contributor` on scope
  `/subscriptions/2dbeb3f1-e45d-4207-a7e9-185330aad74b/resourceGroups/rgNordicHolidays`
  (role definition ID `b24988ac-6180-42a0-ab88-20f7382dd24c`, the built-in
  Contributor role), granted to this app's service principal.

- **GitHub secrets consumed by `deploy-api.yml`** (`azure/login@v2` step,
  lines ~29-34): `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`.
  Confirm current values with `gh secret list` (names/timestamps only — the
  CLI cannot read secret values back; if in doubt, re-set them from the IDs
  above after recreating the app registration).

- **Repo used for the federated credential subject:** `toinevl/nordicHolidays`
  (from `gh repo view --json nameWithOwner`).

- Note: `deploy-frontend.yml` does **not** use OIDC/`azure/login` — it
  deploys via `AZURE_STATIC_WEB_APPS_API_TOKEN` (a separate, non-Entra
  deployment token for the Static Web App). This runbook only covers the API
  deploy path.

## Recovery steps, if the app registration is deleted

1. **Create the app registration** (name doesn't functionally matter, but
   use the real recorded name for future clarity, not the stale README one):
   ```bash
   az ad app create --display-name swedentravel-github-deploy
   # Note the returned appId (this is AZURE_CLIENT_ID) and the tenant from
   # `az account show --query tenantId`
   az ad sp create --id <appId>   # create the backing service principal
   ```

2. **Add the federated credential** for this repo's `main` branch. Subject
   format for a non-environment-scoped GitHub Actions workflow is
   `repo:<org>/<repo>:ref:<ref path>` (confirmed via Microsoft Learn,
   "Configure an app to trust an external identity provider"):
   ```bash
   az ad app federated-credential create \
     --id <appId> \
     --parameters '{
       "name": "nordicHolidays-github-fed",
       "issuer": "https://token.actions.githubusercontent.com",
       "subject": "repo:toinevl/nordicHolidays:ref:refs/heads/main",
       "audiences": ["api://AzureADTokenExchange"]
     }'
   ```
   If `deploy-api.yml` is ever triggered from another ref (a different
   branch, a tag, or a `pull_request` event), an additional federated
   credential is needed for that trigger — the subject must match the
   ref/event exactly (pattern matching is not supported); see
   `https://learn.microsoft.com/entra/workload-id/workload-identity-federation-create-trust`.

3. **Grant Contributor on the resource group:**
   ```bash
   az role assignment create \
     --assignee <appId> \
     --role Contributor \
     --scope /subscriptions/2dbeb3f1-e45d-4207-a7e9-185330aad74b/resourceGroups/rgNordicHolidays
   ```

4. **Update GitHub repo secrets** (`toinevl/nordicHolidays` → Settings →
   Secrets and variables → Actions), or via `gh`:
   ```bash
   gh secret set AZURE_CLIENT_ID --body "<appId>"
   gh secret set AZURE_TENANT_ID --body "3aa156f9-14fb-4ca1-913d-06f6534f327f"
   gh secret set AZURE_SUBSCRIPTION_ID --body "2dbeb3f1-e45d-4207-a7e9-185330aad74b"
   ```

5. **Verify:** trigger `deploy-api.yml` via `workflow_dispatch` (or push a
   no-op change under `api/**`) and confirm the `Login to Azure` step
   succeeds, then follow the "Verifying a deploy" section of the top-level
   `CLAUDE.md` to confirm the run (including its post-deploy smoke test)
   actually goes green — a successful login step alone doesn't confirm the
   rest of the pipeline works.

## Why this can't just live in `main.bicep`

App registrations and their federated credentials are Microsoft Graph
objects (`Microsoft.Graph/applications`, `.../federatedIdentityCredentials`),
not ARM/Bicep resources scoped to a resource group — `targetScope =
'resourceGroup'` in `main.bicep` cannot express them. The Contributor role
assignment *is* an ARM resource and already has a Bicep equivalent pattern
in this file (see `storageTableDataContributorRole` /
`keyVaultSecretsUserRole`), but it's still omitted here because it takes a
`principalId` this template has no way to source without the app
registration already existing — recreating it live-in-Bicep would require
either a data source lookup Bicep doesn't support, or hardcoding the
principal ID, which reintroduces exactly the kind of manual-tracking risk
this doc exists to avoid. Manual recreation via the steps above remains the
supported path.
