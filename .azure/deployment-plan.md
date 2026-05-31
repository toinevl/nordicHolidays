# Deployment Plan

Status: Deployed

## Goal

Publish the SwedenTravel static site to the best free Azure hosting option and configure deployment on every commit to `main`.

## Current Findings

- App type: static single-page HTML application.
- Current files: `index.html`, `README.md`.
- Desired deployment trigger: GitHub Actions on push to `main`.
- Desired verification signal: visible build/version indicator in the deployed page.

## Azure Target

- Azure Static Web Apps Free plan.
- Rationale: best fit for a static HTML site, free tier, built-in GitHub Actions deployment flow, no server required.
- Resource group: `rgWebsite` (existing).
- Region: `westeurope`.
- Proposed app name: `swedentravel`.
- Default hostname: `zealous-forest-053645a03.7.azurestaticapps.net`.
- Repository: `https://github.com/toinevl/SwedenTravel`.
- Branch: `main`.

## Artifacts

- `index.html`: footer build indicator that reads `build-info.json`.
- `.github/workflows/azure-static-web-apps.yml`: deploys on every push to `main` and manual `workflow_dispatch`.
- GitHub secret required: `AZURE_STATIC_WEB_APPS_API_TOKEN`.

## Deployment Steps

1. Create the Azure Static Web App resource on the Free SKU.
2. Retrieve the resource deployment token.
3. Store the token as the GitHub secret `AZURE_STATIC_WEB_APPS_API_TOKEN`.
4. Commit and push the workflow and build indicator to `main`.
5. Confirm the GitHub Actions run succeeds.
6. Open the Azure Static Web Apps hostname and verify the footer build number.

## Validation

- Run JavaScript syntax check for inline script.
- Confirm workflow YAML structure.
- Confirm Git status before committing.
- Confirm Azure resource hostname after creation.

## Execution Log

- Planning started.
- Confirmed repo root is `/home/toine/projects/playground/SwedenTravel`.
- Confirmed branch is `main` and remote is `https://github.com/toinevl/SwedenTravel.git`.
- Selected Azure Static Web Apps Free over App Service Free because the app is static HTML with no server or build step.
- Added GitHub Actions workflow and build indicator.
- Created Azure Static Web App `swedentravel` in `rgWebsite`.
- Stored the deployment token in GitHub secret `AZURE_STATIC_WEB_APPS_API_TOKEN`.
- Pushed commit `78f014c` to `main`; GitHub Actions deployment run `26720720643` completed successfully.
- Verified deployed `build-info.json` reports run `1`, ref `main`, and SHA `78f014c845cefb335bbe6a444faa7ad486084e9d`.
