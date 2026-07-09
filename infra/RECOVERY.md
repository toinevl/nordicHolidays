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
