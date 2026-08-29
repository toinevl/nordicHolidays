# Data Processing Agreement (DPA) — Fjordvia White-Label Trip-Planner Widget

> **Template — not legal advice.** Adapt with counsel before signing. Placeholders appear
> as `[PLACEHOLDER]` tokens in red-outline spans on the legal pages; in this document they
> are bracketed tokens to fill per contract.

---

## 1. Parties

**Controller ("Partner"):**

- Legal name: [PARTNER_LEGAL_NAME]
- Registered address: [PARTNER_ADDRESS]
- Chamber of Commerce (KvK): [PARTNER_KVK]
- E-mail: [PARTNER_EMAIL]
- Represented by: [PARTNER_REPRESENTATIVE]

**Processor ("Fjordvia"):**

- Legal name: [LEGAL_NAME]
- Registered address: [ADDRESS]
- Chamber of Commerce (KvK): [KVK]
- VAT identification (btw-id): [VAT_ID]
- E-mail: [EMAIL]
- Represented by: [REPRESENTATIVE]

## 2. Role allocation

The Partner operates one or more websites and/or online services ([PARTNER_SITES]) and
determines the purposes and means of processing personal data of its site visitors: the
Partner is the **controller** for those data.

Fjordvia provides the Partner a white-label trip-planner widget and related hosting and
support services. In providing these services, Fjordvia processes personal data on
documented instructions from the Partner: Fjordvia is the **processor** within the meaning
of Article 28 GDPR, and where Fjordvia engages sub-processors it complies with Section 6
of this Agreement.

Where Fjordvia determines the purposes and means of a processing operation itself — for
example its own service telemetry for security, abuse prevention, and service improvement,
or its own direct business administration — Fjordvia acts as an independent **controller**
for those data and that processing is governed by the Fjordvia privacy statement, not by
this Agreement.

## 3. Subject matter, duration, nature and purpose of processing, data categories, categories of data subjects

- **Subject matter:** the processing of personal data in the course of providing the
  white-label trip-planner widget and associated hosting and support.
- **Duration:** the term of the Main Agreement between the parties ([MAIN_AGREEMENT_DATE]),
  plus any post-termination retention permitted under Section 10.
- **Nature and purpose:** (a) capturing and storing leads generated via the widget; (b)
  generating and serving personalized itineraries via the widget; (c) aggregate service
  telemetry needed to operate, secure and support the widget.
- **Categories of personal data:**
  - lead data: e-mail address and the accompanying consent flag (whether the visitor
    consented to be contacted);
  - widget telemetry: the Fjordvia partner identifier (`partnerId`) sent with widget
    requests;
  - itinerary data: trip parameters and the resulting itinerary content created via the
    widget (destinations, dates, traveller notes) to the extent these can identify a
    traveller;
  - support and correspondence data the Partner shares with Fjordvia.
- **Categories of data subjects:** visitors to the Partner's website(s) who use the
  widget; the Partner's staff who correspond with Fjordvia.

## 4. Fjordvia obligations

Fjordvia will:

1. process personal data only on documented instructions from the Partner, including with
   regard to transfers, unless required to do so by Union or Member State law; in that
   case Fjordvia informs the Partner of that legal requirement before processing, unless
   that law prohibits this;
2. ensure persons authorized to process personal data have committed themselves to
   confidentiality or are under an appropriate statutory obligation of confidentiality;
3. take all measures required under Section 7 (security measures);
4. respect the conditions for engaging sub-processors under Section 6;
5. assist the Partner, in so far as possible, in fulfilling obligations to respond to
   data-subject requests under Chapter III GDPR (Section 8), to notify a personal-data
   breach (Section 9), and to carry out data-protection impact assessments and prior
   consultation, taking into account the nature of the processing and the information
   available to Fjordvia;
6. at the Partner's choice, delete or return all personal data after the end of the
   provision of services, and delete existing copies, subject to Section 10;
7. make available to the Partner all information necessary to demonstrate compliance with
   Article 28 GDPR and allow for and contribute to audits, including inspections,
   conducted by the Partner or another auditor mandated by the Partner, subject to
   Section 11 (audit rights).

## 5. Partner obligations

The Partner will:

1. provide Fjordvia with documented, lawful instructions and ensure its use of the widget
   (including the consent flag it configures) has a proper legal basis under GDPR;
2. where required, inform its site visitors and obtain consent before data captured by
   the widget is processed, and configure the widget accordingly;
3. indemnify Fjordvia against claims arising from instructions that violate data
   protection law;
4. respond to data-subject requests in the first instance (Section 8).

## 6. Sub-processors

### 6.1 General authorization

The Partner grants **general written authorization** to Fjordvia to engage the
sub-processors listed in Fjordvia's sub-processor register, published at
`docs/legal/subprocessors.md` (current list reproduced in Section 6.3). Fjordvia will
keep the register current and available to the Partner.

### 6.2 Notice of change — 30 days

Fjordvia will inform the Partner of any intended addition or replacement of a
sub-processor **at least 30 days before** the new or replacement sub-processor begins
processing, via e-mail to [PARTNER_EMAIL] or a published notice of change. The Partner
may object on reasonable, data-protection-related grounds within that 30-day window by
written notice. If the parties cannot resolve the objection, the Partner may terminate
the affected services; if no resolution is reached and the Partner does not terminate,
Fjordvia may not engage the contested sub-processor until it is resolved.

### 6.3 Current sub-processors

At the date of this template the sub-processor register lists:

1. Microsoft Azure (hosting, storage, database) — EU (West Europe, Netherlands)
2. Azure Maps — EU / global content-delivery network
3. Azure OpenAI / Azure AI Foundry — EU (West Europe) or EU Data Boundary
4. Azure Application Insights — EU (West Europe)
5. Travelpayouts — international (see register)
6. DiscoverCars.com — international (see register)
7. GetYourGuide — international (see register)

Fjordvia imposes the same data-protection obligations as in this Agreement on each
sub-processor by written contract. Fjordvia remains fully liable to the Partner for the
performance of each sub-processor's obligations.

## 7. Security measures

Fjordvia implements at least the following technical and organizational measures:

- **TLS in transit:** all traffic to and within the service is encrypted in transit
  (HTTPS/TLS; minimum TLS 1.2).
- **Encryption at rest:** personal data in Azure storage and database services are
  encrypted at rest with Azure-managed keys.
- **Rate limiting:** public endpoints (including lead capture) apply per-IP rate limits
  to mitigate abuse and automated form spam.
- **Edit tokens:** itinerary editing is restricted by single, unguessable edit tokens
  rather than accounts; tokens are generated server-side, never logged in full, and can
  be revoked by deleting the itinerary.
- Access to production systems is limited to the owner of the business; access uses
  multi-factor authentication where available.
- Backups and logging are enabled on the production environment; logs are access-restricted.

## 8. Data-subject requests

Fjordvia does not respond to data-subject requests directly; requests addressed to
Fjordvia are forwarded to the Partner within 5 business days. Fjordvia assists the
Partner via its **documented request-handling process** (runbook:
`docs/legal/dsr-runbook.md` — to be created; interim process below) so the Partner can
fulfil its Chapter III GDPR obligations:

- identification of the data: Fjordvia looks up lead, telemetry and itinerary records
  connected to the e-mail address or identifier supplied by the Partner;
- correction/erasure: Fjordvia can correct or permanently delete lead records and
  itineraries (including edit-token revocation by deletion) on the Partner's written
  instruction;
- portability: Fjordvia exports lead and itinerary data in a structured, commonly used
  machine-readable format (JSON/CSV);
- response time: Fjordvia aims to complete assistance within 10 business days of the
  Partner's instruction.

## 9. Personal-data breach notification

Fjordvia notifies the Partner **without undue delay, and in any case within 48 hours**
after becoming aware of a personal-data breach affecting the Partner's data, via e-mail
to [PARTNER_EMAIL]. The notification includes, to the extent known: the nature of the
breach, categories and approximate number of data subjects and records concerned, the
likely consequences, and measures taken or proposed. Where full information is not yet
available, Fjordvia supplies it in phases. The Partner is responsible for notifying the
competent supervisory authority and, where required, the data subjects; Fjordvia
assists on request.

## 10. Retention and deletion on termination

- Lead data are retained for the duration of the Partner relationship and deleted within
  **30 days** after termination of the Main Agreement, unless the Partner requests
  earlier deletion or export.
- Itinerary data (including edit tokens) are deleted when the Partner relationship ends
  or on the Partner's written instruction.
- Upon termination the Partner may request a final export (JSON/CSV) of its lead data
  before deletion; Fjordvia provides it within 10 business days.
- Fjordvia may keep data longer where Union or Member State law requires retention;
  Section 4(1) applies accordingly, and the data remain protected under this Agreement
  for as long as they are retained.

## 11. Audit rights

The Partner may audit Fjordvia's compliance with this Agreement:

1. Fjordvia first provides its then-current security documentation, sub-processor
   register, and — when available — summaries of independent audit or certification
   reports covering the services.
2. On reasonable notice (at least 30 days, once per contract year, business days 9–17
   CET), the Partner or a mandated independent auditor may inspect relevant records and
   systems, excluding the data of other partners.
3. Audits must not disrupt production unreasonably; the Partner bears its own audit
   costs, unless the audit reveals material non-compliance, in which case Fjordvia
   reimburses the reasonable audit cost.
4. Findings and remediation commitments are documented in writing and re-checked on the
   next audit or on request.

## 12. Liability

1. Each party's aggregate liability arising under or in connection with this Agreement
   is capped at the total fees paid or payable by the Partner to Fjordvia in the
   **12 months preceding the event** giving rise to the claim, or **[LIABILITY_CAP]**
   if no fees were yet due.
2. The cap does not apply to liability that cannot be limited under mandatory law,
   including wilful misconduct (opzet) or deliberate recklessness (bewuste roekeloosheid)
   of the party's management.
3. Neither party is liable for indirect or consequential damages, including lost profit
   or lost data of third parties, except where the breach concerns confidentiality,
   security obligations (Section 7) or GDPR obligations, in which case Section 12(1)
   governs.

## 13. Miscellaneous

- **Priority:** this DPA supplements the Main Agreement ([MAIN_AGREEMENT_DATE]); on
  conflict regarding processing of personal data, this DPA prevails.
- **Changes:** amendments are recorded in writing (including e-mail) signed by both
  parties.
- **Applicable law:** [GOVERNING_LAW], default Dutch law.
- **Data transfers:** Fjordvia hosts within the EU (Azure West Europe, Netherlands);
  transfers outside the EEA by sub-processors occur only per the register
  (`docs/legal/subprocessors.md`) with an appropriate transfer basis per Chapter V GDPR.

---

*End of template. Version 2026-08-28 (draft).*
