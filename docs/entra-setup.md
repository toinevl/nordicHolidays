# Entra Setup For SwedenTravel

This document captures the exact app registration steps required to add Microsoft Entra identity to SwedenTravel.

## 1. Tenant requirements
- An Entra ID tenant (External ID or Azure AD B2C) is required.
- The tenant must allow **Accounts in any organizational directory and personal Microsoft accounts**.

## 2. Register the SPA app
1. Open the Entra admin center: https://entra.microsoft.com
2. Go to **Identity > Applications > App registrations** and select **New registration**.
3. Set:
   - **Name:** SwedenTravel
   - **Supported account types:** Accounts in any organizational directory and personal Microsoft accounts
   - **Redirect URI:** Web — `https://<swa-host>/.auth/login/aad/callback`
   - **Front-channel logout URI:** `https://<swa-host>/`
4. Save the registration.

## 3. Expose an API scope
1. In the app registration, open **Expose an API**.
2. Set the Application ID URI if needed: `api://<client-id>`
3. Add a scope:
   - **Scope name:** `user_impersonation`
   - **Who can consent?:** Admins and users
   - **State:** Enabled
4. Save. The full scope identifier is `api://<client-id>/user_impersonation`.

## 4. Configure platforms
- Under **Authentication > Single-page application**:
  - Redirect URI must match: `https://<swa-host>/.auth/login/aad/callback`
  - Enable **Access tokens** and **ID tokens**.

## 5. Create user flows
1. Go to **Entra External ID** (or B2C) > **User flows**.
2. Create:
   - **Sign up and sign in** flow
   - **Edit profile** flow (collect displayName, givenName, surname at minimum)
   - **Password reset** flow

## 6. Collect runtime secrets and IDs
Use environment variables in both local and production deployments. Do not commit real tenant or client IDs.

### Frontend
| Variable | Source | Purpose |
|---|---|---|
| `VITE_ENTRA_TENANT_ID` | Entra ID overview | MSAL authority base |
| `VITE_ENTRA_CLIENT_ID` | Entra ID app registration | Frontend MSAL client ID |

### API
| Variable | Source | Purpose |
|---|---|---|
| `ENTRA_ISSUER_HOST` | Entra ID discovery | Token issuer host, default `login.microsoftonline.com` |
| `ENTRA_API_AUDIENCE` | Azure AD app intended-for | API Application (client) ID |
| `ENTRA_REQUIRED_SCOPE` | Exposed API scope | Default: `user_impersonation` |

### Azure Function App application settings
Add the API validation settings in the Azure portal or via Function App configuration:

- `ENTRA_ISSUER_HOST`
- `ENTRA_API_AUDIENCE`
- `ENTRA_REQUIRED_SCOPE`

## 7. Secrets handling
- Do not commit real values.
- In local development, store real values in `api/local.settings.json`, which is gitignored.
- In Azure, keep real values in Key Vault or Function App Application Settings.
- Sample placeholder files:
  - `docs/.samples/local.settings.entra.json`
  - `frontend/.env.production`

## 8. Tokens
- The SPA obtains ID tokens and access tokens via MSAL.js v2.
- The API validates the bearer token using the `sub` claim.
- Refresh tokens should not be stored in localStorage beyond MSAL cache defaults.

## 9. Validation
After setup:
- Confirm `/.auth/login/aad/callback` resolves under the SWA host.
- Confirm tenant login succeeds for both personal and work accounts.
- Confirm the `user_impersonation` scope appears in the access token claims.

## Troubleshooting
- Redirect mismatch: exact scheme, host, and path must be registered in Entra.
- 403 on API: validate audience equals API Application (client) ID.
- Silent token failure: confirm redirect URI uses HTTPS in production and matches registration exactly.
