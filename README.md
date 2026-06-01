# SwedenTravel

Interactive 21-day Sweden road trip planner with AI itinerary generation.

## Local development

**Frontend:**
```bash
cd frontend && npm install && npm run dev
```
Opens at http://localhost:5173.

**API:**
```bash
cd api && npm install
# Set AzureWebJobsStorage in api/local.settings.json (Azurite or real connection string)
npm start
```
Runs Functions locally at http://localhost:7071.

## Deployment

Push to `main` — GitHub Actions deploys frontend to Azure SWA and API to the Flex Consumption Function App automatically. Path filters ensure only changed components redeploy.

## Architecture

See `docs/superpowers/specs/2026-06-01-sweden-travel-evolution-design.md`.
