#!/usr/bin/env bash
set -euo pipefail

APP_DISPLAY_NAME="SwedenTravel"
SPA_REDIRECT_URIS=(
  "http://localhost:5173"
  "https://zealous-forest-053645a03.7.azurestaticapps.net"
)
FRONT_CHANNEL_LOGOUT_URI="https://zealous-forest-053645a03.7.azurestaticapps.net"

TENANT_ID=$(az account show --query tenantId -o tsv)
SUBSCRIPTION_ID=$(az account show --query id -o tsv)

echo "Tenant: $TENANT_ID"
echo "Subscription: $SUBSCRIPTION_ID"

# Find existing app by display name (first match)
APP_ID=$(az ad app list --display-name "$APP_DISPLAY_NAME" --query "[0].appId" -o tsv 2>/dev/null || true)
APP_OBJECT_ID=""

if [[ -n "${APP_ID:-}" && "$APP_ID" != "null" ]]; then
  echo "Found existing app: $APP_ID"
  APP_OBJECT_ID=$(az ad app show --id "$APP_ID" --query id -o tsv)
else
  echo "Creating app registration: $APP_DISPLAY_NAME"
  APP_OBJECT_ID=$(az ad app create \
    --display-name "$APP_DISPLAY_NAME" \
    --sign-in-audience AzureADMyOrg \
    --spa \
    --redirect-uris "${SPA_REDIRECT_URIS[*]}" \
    --query id -o tsv)
  APP_ID=$(az ad app show --id "$APP_OBJECT_ID" --query appId -o tsv)
fi

# Ensure SPA redirect URIs and front-channel logout URI are set (idempotent)
az ad app update --id "$APP_OBJECT_ID" \
  --set "spa.redirectUris=$SPA_REDIRECT_URIS" \
  --set "spa.frontChannelLogoutUri=$FRONT_CHANNEL_LOGOUT_URI" \
  >/dev/null

echo "============================================"
echo "Copy these into your frontend .env.local and .env.production:"
echo "VITE_ENTRA_CLIENT_ID=$APP_ID"
echo "VITE_ENTRA_TENANT_ID=$TENANT_ID"
echo
echo "To add GitHub repo secrets (PowerShell / terminal):"
echo "  gh secret set VITE_ENTRA_CLIENT_ID --body '$APP_ID'"
echo "  gh secret set VITE_ENTRA_TENANT_ID --body '$TENANT_ID'"
echo "============================================"
