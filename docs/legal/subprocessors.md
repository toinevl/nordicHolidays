# Fjordvia sub-processor register

> **Live register** of third parties that process personal data on behalf of Fjordvia
> (or on behalf of its B2B partners) for the white-label trip-planner widget and the
> Fjordvia website. Per the DPA template (`docs/legal/dpa-template.md`, Section 6),
> partners grant **general authorization** for the processors listed here and receive
> **at least 30 days' notice** before any addition or replacement.
>
> Last updated: 2026-08-28

## Processors

| Processor | Purpose | Country / region | Transfer basis |
| --- | --- | --- | --- |
| Microsoft Azure (hosting, storage, database) | Hosting of the Fjordvia frontend, API and data stores (Azure Static Web Apps, Functions, storage) | Netherlands (Azure region West Europe) | No transfer outside the EEA — processing within the EEA |
| Azure Maps | Address, place and route geocoding for itinerary planning | EU data boundary; global CDN edge caching | EU Data Boundary commitments; SCCs where content is processed outside the EEA |
| Azure OpenAI / Azure AI Foundry | AI generation of itinerary content (descriptions, tips) | EU (West Europe) / EU Data Boundary | EU Data Boundary commitments; no transfer outside the EEA for production traffic |
| Azure Application Insights | Service telemetry: errors, performance, widget usage diagnostics | Netherlands (Azure region West Europe) | No transfer outside the EEA — processing within the EEA |
| Travelpayouts | Affiliate booking links for flights and hotels in itineraries | International (company: Cyprus/Russia; global CDN) | GDPR Art. 45 adequacy not available — SCCs (Art. 46) + partner notice per DPA §6.2 |
| DiscoverCars.com | Affiliate car-rental booking links in itineraries | International (global service, EU presence) | SCCs (Art. 46) for any non-EEA processing + partner notice per DPA §6.2 |
| GetYourGuide | Affiliate tours & activities booking links in itineraries | EU (Switzerland-headquartered; EU/EEA data processing) | EU/EEA processing; Swiss-EU framework; SCCs where processing occurs outside the EEA |

## Notes

- **Affiliate links (Travelpayouts, DiscoverCars, GetYourGuide):** these process the
  partner's affiliate identifier and click telemetry (IP, user-agent, timestamps) when a
  visitor opens a booking link. Fjordvia does not send traveller names or e-mail
  addresses to these parties.
- **Azure Application Insights** is configured with `destination: EU` export and does not
  receive itinerary free-text content — only request metadata and error traces.
- All Azure services run in the **West Europe (Netherlands)** region per
  `infra/main.bicep` (`param location string = 'westeurope'`).
- Changes to this register trigger the **30-day notice-of-change** clause in the DPA
  template (§6.2). Update the "Last updated" line above when the register changes.
