# B2B per-partner reporting — App Insights queries

> Copy-paste KQL for [Azure Portal → Application Insights → Logs](https://portal.azure.com).
> Grounded in the actual telemetry call sites (evidence lines cited per query).
> Last updated: 2026-08-28.

## Telemetry shapes (what the code actually emits)

| Signal | Shape | Evidence |
| --- | --- | --- |
| Affiliate click | `ctx.log(JSON.stringify({ marker: 'AFFILIATE_CLICK', linkType, city?, locale?, ts }))` → `traces` table, JSON in `message` | `api/src/functions/track.ts:55-61` |
| Lead captured | Table Storage row only (**no trace**) — `Leads` table, `partitionKey = partnerId`, fields `email/itineraryId/consent/locale/createdAt` | `api/src/functions/leads.ts:59-67` |
| Itinerary generation | **No partner dimension.** `generate.ts` has no `partner`/`track`/`trace` call site (grep 2026-08-28: 0 hits) | `api/src/functions/generate.ts` |

> ⚠ **partnerId is currently stamped on NEITHER telemetry stream.** The click
> trace carries linkType/city/locale but not which partner's widget fired it;
> leads are queryable per partner but only via Table Storage, not App Insights.
> Per-partner reporting therefore has a gap today — see "Proposed @C-lane
> change" at the bottom.

## Affiliate clicks (all partners, last 30 days)

The click event is a JSON blob inside the trace `message` — parse it out:

```kusto
// Evidence: track.ts:56 marker 'AFFILIATE_CLICK', fields linkType/city/locale/ts
traces
| where timestamp > ago(30d)
| where message has "AFFILIATE_CLICK"
| extend e = parse_json(message)
| summarize clicks = count() by tostring(e.linkType), bin(timestamp, 1d)
| render timechart
```

By city (top routes proxy — city = the stop whose affiliate link was clicked):

```kusto
traces
| where timestamp > ago(30d)
| where message has "AFFILIATE_CLICK"
| extend e = parse_json(message)
| summarize clicks = count() by tostring(e.city)
| top 20 by clicks desc
```

## Leads per partner (last 30 days)

Leads land in Table Storage (not App Insights), partitioned by partnerId.
Fastest path is a table query, e.g. Storage Explorer filtered on
`PartitionKey eq '<slug>'`, or CLI:

```bash
# Evidence: leads.ts:59-67 — partitionKey = body.partnerId, createdAt ISO
az data-table entity query \
  --account-name <storage-account> --table-name Leads \
  --filter-string "PartitionKey eq 'campfly' and createdAt ge '2026-07-29'"
```

Count per partner for the last 30 days (run per slug, or export and group):

```bash
az data-table entity query --account-name <storage-account> --table-name Leads \
  --filter-string "createdAt ge datetime'2026-07-29'" \
  --select "PartitionKey" | jq -r '.items | group_by(.PartitionKey) | map({partner: .[0].PartitionKey, leads30d: length})"
```

*(CLI note: the datetime literal format in `--filter-string` must be
`datetime'YYYY-MM-DDTHH:MM:SSZ'` for OData.)*

## Generations per partner (last 30 days)

**Not currently measurable per partner.** `generate.ts` emits no telemetry with
a partner dimension (verified by grep 2026-08-28: no `partner`, `track` or
`trace` call sites in the handler). Until that changes, the closest available
proxy is total `/api/generate` request volume in App Insights
(`requests` table), which mixes consumer + all widget traffic:

```kusto
// All /api/generate invocations, regardless of partner (requests table)
requests
| where timestamp > ago(30d)
| where name in~ ("/api/generate", "generate")
| summarize count() by bin(timestamp, 1d)
```

## Proposed @C-lane change (smallest stamp)

To make clicks and generations attributable per partner, one structured trace
each — same pattern as the click marker, ~3 lines per handler:

1. `track.ts` — include `partnerId` in the JSON when the request carries
   `X-Partner-Id` (the frontend widget already knows its slug via
   `getActiveWidgetConfig()`; it must start sending the header — frontend side
   is @H lane, will follow).
2. `generate.ts` — one `ctx.log(JSON.stringify({ marker: 'GENERATION', partnerId, tripDays, country, ts }))`
   when `?partner=` / `X-Partner-Id` is present.

Then per-partner queries become:

```kusto
traces
| where timestamp > ago(30d)
| where message has "GENERATION"
| extend e = parse_json(message)
| summarize generations = count() by tostring(e.partnerId)
| top 20 by generations desc
```

## Top routes per partner (once partnerId is stamped)

```kusto
traces
| where timestamp > ago(30d)
| where message has "AFFILIATE_CLICK"
| extend e = parse_json(message)
| summarize clicks = count() by tostring(e.partnerId), tostring(e.city)
| top 20 by clicks desc
```
