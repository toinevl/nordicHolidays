# Deployment Plan

Status: Planned

## Goal

Publish the NordicHolidays static site to Azure Static Web Apps and configure deployment on every commit to `main`.

## Current Findings

- App type: static single-page HTML application.
- Current files: `index.html`, `README.md`.
- Desired deployment trigger: GitHub Actions on push to `main`.
- Desired verification signal: visible build/version indicator in the deployed page.

## Azure Target

- Azure Static Web Apps Free plan.
- Rationale: best fit for a static HTML site, free tier, built-in GitHub Actions deployment flow, no server required.
- Resource group: `rgNordicHolidays`.
- Region: `westeurope`.
- Proposed app name: `nordicholidays`.
- Default hostname: `nordicholidays.azurestaticapps.net` (exact subdomain will be assigned at creation time).
- Repository: `https://github.com/toinevl/nordicHolidays`.
- Branch: `main`.

## Artifacts

- `index.html`: footer build indicator that reads `build-info.json`.
- `.github/workflows/deploy-frontend.yml`: deploys on every push to `main` and manual `workflow_dispatch`.
- GitHub secret required: `AZURE_STATIC_WEB_APPS_API_TOKEN`.

## Deployment Steps

1. Create the Azure Static Web App resource on the Free SKU.
2. Retrieve the resource deployment token.
3. Store the token as the GitHub secret `AZURE_STATIC_WEB_APPS_API_TOKEN`.
4. Create the GitHub Actions variable `NORDIC_HOLIDAYS_SWA_URL` with the new SWA hostname.
5. Commit and push the workflow and build indicator to `main`.
6. Confirm the GitHub Actions run succeeds.
7. Open the Azure Static Web Apps hostname and verify the footer build number.

## Validation

- Run JavaScript syntax check for inline script.
- Confirm workflow YAML structure.
- Confirm Git status before committing.
- Confirm Azure resource hostname after creation.
- Confirm GitHub Actions dependencies and browser libraries are on supported current versions.
