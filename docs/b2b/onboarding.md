# B2B partner onboarding — Fjordvia widget

> How a partner gets from "signed pilot agreement" to "live embed on their site".
> Everything here reflects what the code does **today** (grounded in
> `api/src/lib/partners.ts`, `api/src/functions/leads.ts`, `frontend/src/lib/widget.ts`).
> Last updated: 2026-08-28.

## 1. What the partner embeds

```html
<iframe
  src="https://fjordvia.com/?partner=SLUG&lang=nl"
  title="Fjordvia reisplanner"
  width="100%"
  height="900"
  style="border:0; max-width:1200px;"
  loading="lazy"
></iframe>
```

- `partner=SLUG` — the partner's slug (the Partners-table `rowKey`). Without it the
  site renders in normal consumer mode.
- `lang=nl|en|de` — initial UI locale. Visitors can still switch.
- **Responsive embedding:** give the iframe a width of `100%` and a fixed height
  (900px works well; the app itself is not height-adaptive). Use
  `loading="lazy"` so the widget doesn't compete with the partner's own
  above-the-fold content.

In widget mode the app hides its own header, nav, B2B section and footer, and
shows a fixed "Powered by Fjordvia" bar instead (`frontend/src/lib/widget.ts`
→ `isWidgetMode()`).

## 2. Adding a partner (manual Partners-table row)

Partners live in the **`Partners`** Azure Table Storage table,
`partitionKey: "partners"`, `rowKey: <slug>` (`api/src/lib/partners.ts`).

Entity fields (as read by `entityToConfig`):

| Table field | Type | Meaning |
| --- | --- | --- |
| `rowKey` | string | Partner slug — must match the `?partner=` value in the embed URL |
| `displayName` | string | Shown in widget chrome / reports |
| `primaryColor` | string | HEX colour → CSS var `--primary` (brand theming) |
| `accentColor` | string | HEX colour → CSS var `--accent-2` |
| `affiliateTravelpayouts` | string (optional) | Partner's own Travelpayouts marker |
| `affiliateGyg` | string (optional) | Partner's own GetYourGuide partner ID |
| `affiliateDiscovercars` | string (optional) | Partner's own DiscoverCars AID |
| `generateQuotaPerMonth` | number | Monthly LLM-generation quota (default 0 = unset) |
| `rateLimitPerHour` | number | Widget API rate limit per hour (default 0 = unset) |
| `leadCaptureEmail` | string (optional) | Where lead notifications go |
| `createdAt` | string (ISO) | Row creation timestamp |

Configs are cached in-memory for 5 minutes — a new/changed row applies within
~5 minutes, no redeploy needed.

**Insert via Azure Storage Explorer or CLI** (`az data-table` / Storage
Explorer), e.g.:

```bash
az data-table entity create \
  --account-name <storage-account> --table-name Partners \
  --entity partitionKey=partners rowKey=campfly displayName="Campfly" \
  primaryColor=#e07a3f accentColor=#2f6f4f \
  generateQuotaPerMonth=500 rateLimitPerHour=60 \
  leadCaptureEmail=hallo@campfly.example createdAt=2026-08-28T00:00:00Z
```

*(The example values above are illustrative — check the storage account name in
`infra/main.bicep` before running.)*

## 3. Theming

Widget theming is applied by setting two CSS variables on
`document.documentElement` from the partner config
(`frontend/src/main.ts`, `applyPartnerTheme`):

- `primaryColor` → `--primary`
- `accentColor` → `--accent-2`

Any colour the partner's brand uses for buttons/links should be supplied as
`primaryColor`; the accent colours secondary highlights. Both must be valid CSS
hex values.

## 4. Quota & limits

- **`generateQuotaPerMonth` / `rateLimitPerHour`** are read from the partner
  config. **Note (2026-08-28): enforcement of these two fields is *planned but
  not yet implemented* in `api/src/functions/generate.ts` — there is currently
  no `llmDailyCap` / `partner_capacity_reached` check in the code.** Per-partner
  cost caps are wishlist item **#151** (blocked on @C lane). Until #151 ships,
  global rate limits (`#149`) are the only guard.
- The widget's API calls otherwise run through the same rate limiting as the
  public site.

## 4b. Lead capture

If the partner wants lead capture, their row can set `leadCaptureEmail`.
The widget shows an optional e-mail + consent field on itinerary save;
`POST /api/leads` stores `{ partnerId, email, itineraryId?, consent: true, locale }`
in the **`Leads`** table (`api/src/functions/leads.ts`), partitioned by
`partnerId` — one row per submission, `consent` is literally `true` (zod
`z.literal(true)`), e-mail is never echoed in responses.

## 5. What the partner gets

- A white-label trip planner on their own domain, in NL/EN/DE.
- Their own affiliate IDs on booking links (see FAQ below).
- Per-partner reporting: leads + generations + affiliate clicks — see
  [`reporting.md`](./reporting.md).

## 6. FAQ

**Can partners use their own affiliate IDs?**
The `Partners` table has fields for it (`affiliateTravelpayouts`,
`affiliateGyg`, `affiliateDiscovercars`) and the frontend loads them into the
widget config (`getActiveWidgetConfig()`), **but no consumer wires them into
the actual link generation yet** — booking links currently always use
Fjordvia's own IDs (or plain links when unset). Per-partner affiliate-ID
consumption is future work; until then, answer partners with "on the roadmap,
expected during pilot".

**Does the partner need an account/login?**
No. The widget is fully anonymous for their visitors; partners are identified
by the slug in the embed URL.

**What data of the partner's visitors is processed?**
See `docs/legal/dpa-template.md` and `docs/legal/subprocessors.md` (GDPR
art. 28 roles: partner = controller, Fjordvia = processor).

**Can the widget be styled beyond the two colours?**
Not today — theming is limited to `--primary` and `--accent-2`. Custom CSS is
out of scope for the pilot.
