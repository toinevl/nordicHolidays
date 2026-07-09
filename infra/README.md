# NordicHolidays Azure Infrastructure as Code

This directory contains Bicep Infrastructure as Code (IaC) templates that **capture the manually-built Azure stack as of 2026-06-12** for the NordicHolidays application.

## Purpose

The templates in this directory are a **reference implementation** of the existing live infrastructure in resource group `rgNordicHolidays` (subscription `2dbeb3f1-e45d-4207-a7e9-185330aad74b`, region `westeurope`). They document the current architecture and can be used to validate drift and plan future infrastructure changes.

## Scope

### Resources Included
- **Storage Account** (`nordicholidays`)
  - Table Storage with tables: Itineraries, Preferences, Profiles, RateLimits
  - Blob Storage (for Function App deployment packages)
- **Key Vault** (`kv-nordicholidays`, RBAC-enabled)
- **Function App** (`nordic-holidays-api`, Flex Consumption, Node 22)
  - System-assigned managed identity
  - Application settings (excluding secrets)
- **Application Insights** (`nordic-holidays-api`)
- **Static Web App** (`nordicholidays`, Free tier), including the
  `sweden.van-vliet.eu` custom domain binding (`customDomains` child resource)
- **Role Assignments**
  - Function App identity → Storage Table Data Contributor (on storage account)
  - Function App identity → Key Vault Secrets User (on key vault)

### Out of Scope
- **Entra App Registration** (live display name `swedentravel-github-deploy` — a
  name inherited from this repo's prior name and never renamed; see
  [`RECOVERY.md`](./RECOVERY.md) for the verified live details, this doc
  previously had the wrong name here): Not manageable via Bicep (app
  registration objects are created/managed separately). The GitHub OIDC
  federated credential and Contributor role assignment on rgNordicHolidays
  must be set up manually or via Microsoft Graph. **If this app registration
  is ever deleted, follow [`RECOVERY.md`](./RECOVERY.md) to reconstruct it
  step by step** — do not guess at the federated credential subject/issuer
  format from scratch.
- **SWA Custom Domain Binding** (`sweden.van-vliet.eu`): now declared as a
  `Microsoft.Web/staticSites/customDomains` child resource in `main.bicep`
  (param `customDomainName`), so recreating the Static Web App from this
  template no longer silently drops it. DNS (the CNAME record itself) is
  still managed outside Bicep and must already exist for the binding to
  validate.
- **Secrets and Sensitive Values**: The actual secret values (e.g., AZURE_FOUNDRY_API_KEY) are not stored in the template. Deploy secrets via Azure Key Vault or CI/CD pipelines.

## Template Files

- **`main.bicep`**: Resource-group-scoped template defining all Azure resources
- **`main.bicepparam`**: Parameter defaults matching the live resource names
- **`README.md`**: This file

## Validation

### Build the Bicep Template
To compile the Bicep template to ARM JSON and check for syntax errors:

```bash
az bicep build --file infra/main.bicep
```

### Run What-If Deployment
To validate the template against the current resource group and see what changes would be made (without applying):

```bash
az deployment group what-if \
  --resource-group rgNordicHolidays \
  --template-file infra/main.bicep \
  --parameters infra/main.bicepparam
```

**Note:** The what-if report may show changes due to drift (properties not captured in the template, such as current app settings, existing secrets, or resource-specific configurations). This is expected and does not indicate a template error.

### Validate Template
To validate the template for correctness without deploying:

```bash
az deployment group validate \
  --resource-group rgNordicHolidays \
  --template-file infra/main.bicep \
  --parameters infra/main.bicepparam
```

## Deployment Status

**Current Status:** These templates are **reference/documentation only**. Deployment is currently managed via GitHub Actions workflows and manual Azure Portal configuration.

**Future Deployments:** To adopt IaC-driven deployment, the following will be required:
1. Integrate Bicep templates into GitHub Actions CI/CD pipeline
2. Manage secrets (AZURE_FOUNDRY_API_KEY, etc.) via Azure Key Vault or GitHub Secrets
3. Set up Entra app registration and federated credentials for GitHub Actions
4. Implement rollback and drift detection workflows

## Known Limitations

1. **App Settings**: Some app settings in the live Function App are not parameterized in the template (e.g., OLD_ANTHROPIC_API_KEY, OPENROUTER_API_KEY). These can be added if needed.
2. **Static Web App Configuration**: SWA deployment and routing configuration are not defined in the template (API associations, build configuration, etc.).
3. **Regional Variation**: The Function App's server farm name (`ASP-rgNordicHolidays-846d`) is hardcoded. In a multi-region deployment, this would need to be parameterized.

## Parameters

See `main.bicepparam` for all parameters. Key parameters:

| Parameter | Default | Description |
|-----------|---------|-------------|
| `storageAccountName` | `nordicholidays` | Name of the storage account (must be globally unique) |
| `keyVaultName` | `kv-nordicholidays` | Name of the Key Vault |
| `functionAppName` | `nordic-holidays-api` | Name of the Function App |
| `location` | `westeurope` | Azure region |
| `nodeVersion` | `22` | Node.js runtime version for Function App |

## References

- [Azure Bicep Documentation](https://learn.microsoft.com/en-us/azure/azure-resource-manager/bicep/)
- [Flex Consumption Function App](https://learn.microsoft.com/en-us/azure/azure-functions/flex-consumption-plan)
- [Azure Key Vault RBAC](https://learn.microsoft.com/en-us/azure/key-vault/general/rbac-guide)
