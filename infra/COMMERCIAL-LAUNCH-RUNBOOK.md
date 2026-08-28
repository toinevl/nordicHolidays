# Commercial launch runbook (Fjordvia) — wishlist #150, #154, #156

## Manual steps — NOT run by CI or by this Bicep change

`infra/main.bicep` in this repo is **reference / drift-detection only**. It is
compiled by CI (`az bicep build` + `verify-cors.mjs`) but **nothing deploys it**.
The Bicep edits for #150 (`monthlyBudget`), #154 (`healthWebTest`,
`availabilityAlert`, `latencyAlert`) and #156 (`staticWebAppSku = 'Standard'`)
therefore change **nothing live** on their own. A human runs the commands below,
in order, against the live tenant:

| Fact | Value |
|------|-------|
| Subscription | `2dbeb3f1-e45d-4207-a7e9-185330aad74b` |
| Resource group | `rgNordicHolidays` |
| Region | `westeurope` |
| Static Web App | `nordicholidays` |
| Function App | `nordic-holidays-api` |
| Application Insights | `nordic-holidays-api` |
| Action group (already exists — do NOT create a second) | `nordic-holidays-alerts` |
| Action group resource ID | `/subscriptions/2dbeb3f1-e45d-4207-a7e9-185330aad74b/resourceGroups/rgNordicHolidays/providers/microsoft.insights/actionGroups/nordic-holidays-alerts` |
| Alert email | `toine@van-vliet.eu` |

Run once at the top of the session:

```bash
az account set --subscription 2dbeb3f1-e45d-4207-a7e9-185330aad74b
```

---

## 1. #156 — Upgrade the Static Web App to the Standard SKU

Standard adds the 99.95% SLA, raises the custom-domain cap from 2 to 5, and
unlocks password-protected pre-production environments.

```bash
az staticwebapp update \
  --name nordicholidays \
  --resource-group rgNordicHolidays \
  --sku Standard
```

Verify the SKU changed:

```bash
az staticwebapp show \
  --name nordicholidays \
  --resource-group rgNordicHolidays \
  --query sku
# expect: { "name": "Standard", "tier": "Standard" }
```

Verify the existing custom domains are untouched and still `Ready` (share links
via sweden.van-vliet.eu must not break):

```bash
az staticwebapp hostname list \
  --name nordicholidays --resource-group rgNordicHolidays \
  --query "[].{domain:domainName,status:status}" -o table
# expect: sweden.van-vliet.eu -> Ready, fjordvia.com -> Ready
```

Notes:
- The SKU change is near-instant and does not re-issue certificates or drop
  domain bindings.
- Billing switches from free to the Standard plan's monthly base charge the
  moment this runs — that is the main input to the #150 budget below.
- Adding `www.fjordvia.com` (now possible under the 5-domain Standard cap) is a
  **separate** task, tracked as wishlist **#157**. Use the per-domain procedure
  in `infra/RECOVERY.md` → "fjordvia.com domain binding" (obtain validation
  token → Porkbun DNS record → `az staticwebapp hostname set`). Do NOT do it as
  part of this runbook.

---

## 2. #150 — Monthly cost budget for the resource group

> ✅ **APPLIED 2026-08-28.** A `Monthly` / `Cost` budget for EUR 50 already
> existed on `rgNordicHolidays` as **`monthly-budget`** (start 2026-08-01,
> notifications at 80 % + 100 % → `toine@van-vliet.eu` only). It was
> reconciled in place via the `az rest` PUT below: added the **50 %**
> threshold and wired **all three** notifications to the
> `nordic-holidays-alerts` action group. No new `fjordvia-rg-monthly`
> resource was created — `infra/main.bicep`'s `monthlyBudget` block now
> mirrors `monthly-budget` (name, 2026-08-01→2027-08-01 window,
> `GreaterThan` operator). The commands below are kept as reference; replace
> `fjordvia-rg-monthly` with `monthly-budget` if re-running.

Target shape: a **Monthly**, **Cost** budget named `monthly-budget`, amount
**EUR 50** (`monthlyBudgetAmount` param), window **2026-08-01 → 2027-08-01**,
with **Actual** notifications at **50 / 80 / 100 %** (`GreaterThan`) going to
both `toine@van-vliet.eu` and the existing `nordic-holidays-alerts` action
group. This mirrors the `monthlyBudget` resource in `infra/main.bicep`.

### 2a. Scriptable path — `az rest` PUT (the `az consumption budget create` CLI cannot attach notifications)

`az consumption budget create` has **no** `--notification*` arguments, so it
cannot express the 50/80/100 thresholds or the action group. Use a raw PUT
against the Consumption API instead:

```bash
cat > /tmp/fjordvia-budget.json <<'JSON'
{
  "properties": {
    "category": "Cost",
    "amount": 50,
    "timeGrain": "Monthly",
    "timePeriod": { "startDate": "2026-09-01T00:00:00Z" },
    "notifications": {
      "Actual_GreaterThanOrEqualTo_50_Percent": {
        "enabled": true,
        "operator": "GreaterThanOrEqualTo",
        "threshold": 50,
        "thresholdType": "Actual",
        "contactEmails": [ "toine@van-vliet.eu" ],
        "contactGroups": [ "/subscriptions/2dbeb3f1-e45d-4207-a7e9-185330aad74b/resourceGroups/rgNordicHolidays/providers/microsoft.insights/actionGroups/nordic-holidays-alerts" ]
      },
      "Actual_GreaterThanOrEqualTo_80_Percent": {
        "enabled": true,
        "operator": "GreaterThanOrEqualTo",
        "threshold": 80,
        "thresholdType": "Actual",
        "contactEmails": [ "toine@van-vliet.eu" ],
        "contactGroups": [ "/subscriptions/2dbeb3f1-e45d-4207-a7e9-185330aad74b/resourceGroups/rgNordicHolidays/providers/microsoft.insights/actionGroups/nordic-holidays-alerts" ]
      },
      "Actual_GreaterThanOrEqualTo_100_Percent": {
        "enabled": true,
        "operator": "GreaterThanOrEqualTo",
        "threshold": 100,
        "thresholdType": "Actual",
        "contactEmails": [ "toine@van-vliet.eu" ],
        "contactGroups": [ "/subscriptions/2dbeb3f1-e45d-4207-a7e9-185330aad74b/resourceGroups/rgNordicHolidays/providers/microsoft.insights/actionGroups/nordic-holidays-alerts" ]
      }
    }
  }
}
JSON

az rest --method put \
  --url "https://management.azure.com/subscriptions/2dbeb3f1-e45d-4207-a7e9-185330aad74b/resourceGroups/rgNordicHolidays/providers/Microsoft.Consumption/budgets/fjordvia-rg-monthly?api-version=2023-11-01" \
  --body @/tmp/fjordvia-budget.json

rm -f /tmp/fjordvia-budget.json
```

Verify:

```bash
az consumption budget show \
  --budget-name fjordvia-rg-monthly \
  --resource-group rgNordicHolidays \
  -o jsonc
# expect: amount 50, timeGrain Monthly, three notifications each with the
#         action group in contactGroups
```

Note: the Consumption API requires `startDate` to be the first of a month and
within the allowed past/future window; if `2026-09-01` is rejected as too far in
the past when you actually run this, bump it to the first of the current or next
month (the Bicep literal can stay — it is reference only).

### 2b. Portal path (equivalent, and the easiest way to add/verify notifications)

Azure portal → **Cost Management + Billing** → pick the subscription →
**Budgets** → **+ Add**:

1. Scope: set the budget scope to resource group **`rgNordicHolidays`**
   (Cost Management → "Scope" selector at the top).
2. Name `fjordvia-rg-monthly`, Reset period **Monthly**, Creation date
   **Sep 2026**, Expiration date a few years out, Budget amount **50** (EUR —
   currency follows the billing account).
3. **Set alerts**: three alert conditions, Type **Actual**, **% of budget**
   `50`, `80`, `100`.
4. **Action groups**: select `nordic-holidays-alerts` for each condition, and
   add `toine@van-vliet.eu` under "Alert recipients (email)".
5. Create.

---

## 3. #154 — Availability web test + availability/latency alerts

Mirrors `healthWebTest`, `availabilityAlert`, `latencyAlert` in
`infra/main.bicep`. All three alerts wire to the **existing**
`nordic-holidays-alerts` action group — do not create another.

### 3a. Availability (Standard) web test — portal (recommended)

The `az` path for classic web tests (`az monitor app-insights web-test create`)
only builds the old `Configuration.WebTest` XML "ping" shape and is fiddly to
get right; the portal creates the modern Standard test cleanly:

Azure portal → **Application Insights** `nordic-holidays-api` → **Availability**
→ **+ Add Standard test**:

- Test name: `nordic-holidays-api-health`
- URL: `https://nordic-holidays-api.azurewebsites.net/api/health`
- Parse dependent requests: **off**
- Enable retries for availability test failures: **on**
- Test frequency: **5 minutes** (300 s)
- Test locations (pick at least 3, matching the Bicep):
  **West Europe (emea-nl-ams-azr)**, **UK South (emea-gb-db3-azr)**,
  **France Central (emea-fr-pra-edge)**
- Success criteria: HTTP response **200**, timeout 30 s, SSL certificate
  validity check **on** (7-day remaining-lifetime warning)
- Alerts: on the "Create availability test" blade, **disable** the auto-created
  classic alert rule (leave "Generate classic alert rule" unchecked) — the
  dedicated alert in 3b replaces it and points at the shared action group.

The portal automatically stamps the required
`hidden-link:<appInsights resourceId>: Resource` tag on the web test.

### 3b. Availability alert — fails from 2 of 3 locations

```bash
WEBTEST_ID=$(az resource show \
  --resource-group rgNordicHolidays \
  --resource-type "Microsoft.Insights/webtests" \
  --name nordic-holidays-api-health \
  --query id -o tsv)

APPINSIGHTS_ID=$(az monitor app-insights component show \
  --app nordic-holidays-api --resource-group rgNordicHolidays \
  --query id -o tsv)

az monitor metrics alert create \
  --name nordic-holidays-api-availability-alert \
  --resource-group rgNordicHolidays \
  --description "API /api/health availability web test failing from 2+ of 3 locations (#154)" \
  --severity 1 \
  --evaluation-frequency 5m \
  --window-size 5m \
  --scopes "$WEBTEST_ID" "$APPINSIGHTS_ID" \
  --condition "count microsoft.insights/webtests/webtests/availabilityResults/failedLocation.count > 2" \
  --action "$(az monitor action-group show -g rgNordicHolidays -n nordic-holidays-alerts --query id -o tsv)"
```

If `az monitor metrics alert create` rejects the classic web-test-location
criterion (it sometimes needs the `Microsoft.Azure.Monitor.WebtestLocation
AvailabilityCriteria` shape that the CLI does not expose), create the alert in
the portal instead: **Application Insights → Availability → select the test →
… → Create alert rule**, choose signal "Failed location count", threshold
**greater than 2**, aggregation window **5 minutes**, action group
`nordic-holidays-alerts`. This produces exactly the `availabilityAlert`
resource declared in Bicep.

### 3c. Latency alert — server-side request duration

Static metric alert on `requests/duration`, **Average** aggregation, threshold
**5000 ms**, evaluated every 5 min over a rolling **15-min** window (matches
`latencyAlert` in Bicep):

```bash
APPINSIGHTS_ID=$(az monitor app-insights component show \
  --app nordic-holidays-api --resource-group rgNordicHolidays \
  --query id -o tsv)

az monitor metrics alert create \
  --name nordic-holidays-api-latency-alert \
  --resource-group rgNordicHolidays \
  --description "API server-side request duration averaging over 5000 ms across a 15-minute window (#154)" \
  --severity 2 \
  --evaluation-frequency 5m \
  --window-size 15m \
  --scopes "$APPINSIGHTS_ID" \
  --condition "avg microsoft.insights/components requests/duration > 5000" \
  --action "$(az monitor action-group show -g rgNordicHolidays -n nordic-holidays-alerts --query id -o tsv)"
```

`requests/duration` is reported in **milliseconds**, so `> 5000` = 5 s.
Average (not P95) is used because a static metric alert cannot threshold a
percentile on this metric. If tail latency needs to be caught specifically,
create a `Microsoft.Insights/scheduledQueryRules` KQL rule instead, styled like
the existing `generateHandlerAlertRule` in `main.bicep`:

```kusto
requests
| where timestamp > ago(15m)
| summarize p95 = percentile(duration, 95)
| where p95 > 5000
```

with `evaluationFrequency: PT5M`, `windowSize: PT15M`, threshold `GreaterThanOrEqual 1`,
scope = the App Insights component, action = `nordic-holidays-alerts`.

### 3d. Verify all three

```bash
az monitor metrics alert list -g rgNordicHolidays \
  --query "[?contains(name,'nordic-holidays-api')].{name:name,enabled:enabled,severity:severity}" -o table

az monitor metrics alert show -g rgNordicHolidays -n nordic-holidays-api-availability-alert \
  --query "actions[].actionGroupId"
az monitor metrics alert show -g rgNordicHolidays -n nordic-holidays-api-latency-alert \
  --query "actions[].actionGroupId"
# both must show .../actionGroups/nordic-holidays-alerts and no other action group
```

---

## 4. Not in this runbook

- **wishlist #153 — blob soft-delete** (and container soft-delete / versioning
  on the `nordicholidays` storage account) is a **separate deferred task**. It
  is deliberately NOT included here and has no Bicep change in this batch.
- **wishlist #157 — bind `www.fjordvia.com`** to the Static Web App: unblocked
  by the Standard upgrade in step 1 but tracked and executed separately (see
  `infra/RECOVERY.md`).

---

## 5. Post-change drift check

After the live changes are in, the IaC drift test must still be green:

```bash
az bicep build --file infra/main.bicep --outfile /tmp/main.json \
  && node infra/scripts/verify-cors.mjs /tmp/main.json
```

And a `what-if` should now show little/no delta for the budget, web test and
alert resources (it will still show drift for un-templated app settings — that
is expected, see `infra/README.md`):

```bash
az deployment group what-if \
  --resource-group rgNordicHolidays \
  --template-file infra/main.bicep \
  --parameters infra/main.bicepparam
```
