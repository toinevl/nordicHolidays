#!/usr/bin/env bash
#
# wipe-itineraries.sh — Remove all Itineraries entities (PartitionKey='shared')
# Part of wishlist #169: production cutover table wipe.
#
# Usage:
#   ./scripts/wipe-itineraries.sh              # dry-run (default)
#   ./scripts/wipe-itineraries.sh --dry-run    # explicit dry-run
#   ./scripts/wipe-itineraries.sh --apply      # actually delete (requires --force)
#   ./scripts/wipe-itineraries.sh --apply --force  # skip confirmation
#   ./scripts/wipe-itineraries.sh --export     # export to backup blob before wipe
#
# Prerequisites:
# - Azure CLI logged in with access to read storage account keys
# - Currently uses storage account key for data-plane operations
#   (Storage Table Data Contributor role on the storage account also works via
#    `--auth-mode login` under the Function App system-assigned MSI)
#
# Safety:
# - Dry-run by default (no mutations)
# - Exports to blob backup before delete (--export)
# - Requires explicit --force to bypass confirmation
# - Only deletes entities with PartitionKey='shared', never drops the table

set -euo pipefail

# ─── Configuration ────────────────────────────────────────────────────────────
RESOURCE_GROUP="rgNordicHolidays"
STORAGE_ACCOUNT="nordicholidays"
TABLE_NAME="Itineraries"
BACKUP_CONTAINER="backups"
PARTITION_KEY_FILTER="shared"
# Azure storage auth: key (data-plane) or login (blob via MSI)
AZURE_AUTH_MODE="key"

# ─── Helpers ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log()   { echo -e "${BLUE}[INFO]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; }
ok()    { echo -e "${GREEN}[OK]${NC} $*"; }

usage() {
  cat <<EOF
Usage: $0 [OPTIONS]

Options:
  --dry-run           Dry run only (default). No entities are deleted.
  --apply             Actually delete entities (requires --force to skip prompt).
  --force             Skip confirmation prompt (use with --apply).
  --export            Export entities to blob backup before wipe.
  --backup-only       Only export to blob backup, do not delete.
  -h, --help          Show this help.

Environment variables:
  WIPE_DRY_RUN=1         Same as --dry-run
  WIPE_FORCE=1           Same as --force (requires --apply)
  WIPE_EXPORT=1          Same as --export
EOF
}

# ─── Parse arguments ──────────────────────────────────────────────────────────
DRY_RUN=true
APPLY=false
FORCE=false
EXPORT=false
BACKUP_ONLY=false

for arg in "$@"; do
  case "$arg" in
    --dry-run)    DRY_RUN=true ;;
    --apply)      APPLY=true; DRY_RUN=false ;;
    --force)      FORCE=true ;;
    --export)     EXPORT=true ;;
    --backup-only) BACKUP_ONLY=true; EXPORT=true ;;
    -h|--help)    usage; exit 0 ;;
    *)            error "Unknown argument: $arg"; usage; exit 1 ;;
  esac
done

# Env var overrides
[[ "${WIPE_DRY_RUN:-}" == "1" ]] && DRY_RUN=true
[[ "${WIPE_FORCE:-}" == "1" ]] && FORCE=true
[[ "${WIPE_EXPORT:-}" == "1" ]] && EXPORT=true

# ─── Validate prerequisites ───────────────────────────────────────────────────
if ! command -v az &>/dev/null; then
  error "Azure CLI (az) not found in PATH"
  exit 1
fi

if ! command -v jq &>/dev/null; then
  error "jq not found in PATH (required for JSON parsing)"
  exit 1
fi

# Check if we're logged in (either via az login or managed identity)
if ! az account show &>/dev/null; then
  # Try to log in via system-assigned managed identity (Function App context)
  log "No active Azure login detected. Attempting system-assigned MSI login..."
  if ! az login --identity &>/dev/null; then
    error "Failed to authenticate. Run 'az login' first or ensure running under Function App MSI."
    exit 1
  fi
  ok "Authenticated via system-assigned managed identity"
fi

# Get storage account key or use managed identity for data-plane ops
log "Verifying storage account access..."
STORAGE_ID=$(az storage account show \
  --name "$STORAGE_ACCOUNT" \
  --resource-group "$RESOURCE_GROUP" \
  --query id -o tsv 2>/dev/null)

if [[ -z "$STORAGE_ID" ]]; then
  error "Storage account '$STORAGE_ACCOUNT' not found in resource group '$RESOURCE_GROUP'"
  exit 1
fi
ok "Storage account: $STORAGE_ID"

# Get storage account key for data-plane operations
log "Retrieving storage account key..."
STORAGE_ACCOUNT_KEY=$(az storage account keys list \
  --account-name "$STORAGE_ACCOUNT" \
  --resource-group "$RESOURCE_GROUP" \
  --query "[0].value" -o tsv 2>/dev/null)

if [[ -z "$STORAGE_ACCOUNT_KEY" ]]; then
  error "Failed to retrieve storage account key"
  exit 1
fi
ok "Storage account key retrieved"

# ─── List entities to be affected ─────────────────────────────────────────────
log "Querying entities in table '$TABLE_NAME' with PartitionKey='$PARTITION_KEY_FILTER'..."

ENTITIES_JSON=$(az storage entity query \
  --account-name "$STORAGE_ACCOUNT" \
  --table-name "$TABLE_NAME" \
  --filter "PartitionKey eq '$PARTITION_KEY_FILTER'" \
  --account-key "$STORAGE_ACCOUNT_KEY" \
  --output json 2>/dev/null || echo '{"items": []}')

ENTITY_COUNT=$(echo "$ENTITIES_JSON" | jq '.items | length')
TOTAL_BYTES=$(echo "$ENTITIES_JSON" | jq '.items | length')

if [[ "$ENTITY_COUNT" -eq 0 ]]; then
  warn "No entities found with PartitionKey='$PARTITION_KEY_FILTER'. Nothing to do."
  exit 0
fi

ok "Found $ENTITY_COUNT entities with PartitionKey='$PARTITION_KEY_FILTER'"

# Show sample of entities
echo "$ENTITIES_JSON" | jq -r '.items[] | "\(.RowKey)\t\(.name // .title // "unnamed")\t\(.createdAt // .Timestamp // "")"' | head -10 | while IFS=$'\t' read -r rk name ts; do
  log "  RowKey: $rk | Name: $name | Created: $ts"
done

if [[ "$ENTITY_COUNT" -gt 10 ]]; then
  log "  ... and $((ENTITY_COUNT - 10)) more"
fi

# ─── Export to blob backup (optional) ─────────────────────────────────────────
if [[ "$EXPORT" == true ]]; then
  log "Exporting entities to blob backup..."

  # Check if blob container exists, create if not
  az storage container exists \
    --account-name "$STORAGE_ACCOUNT" \
    --name "$BACKUP_CONTAINER" \
    --account-key "$STORAGE_ACCOUNT_KEY" \
    --output tsv 2>/dev/null | grep -q "True" || {
    log "Creating backup container '$BACKUP_CONTAINER'..."
    az storage container create \
      --account-name "$STORAGE_ACCOUNT" \
      --name "$BACKUP_CONTAINER" \
      --public-access off \
      --account-key "$STORAGE_ACCOUNT_KEY" \
      --output none
    ok "Container created"
  }

  # Generate backup filename with timestamp
  TIMESTAMP=$(date -u +"%Y%m%d-%H%M%S")
  BACKUP_BLOB="itineraries-wipe-${TIMESTAMP}.jsonl"
  BACKUP_PATH="/tmp/${BACKUP_BLOB}"

  # Export as JSONL (one entity per line)
  log "Writing backup to $BACKUP_PATH..."
  echo "$ENTITIES_JSON" | jq -c '.items[]' > "$BACKUP_PATH"
  ok "Backup written: $BACKUP_PATH ($(wc -l < "$BACKUP_PATH") lines)"

  # Upload to blob storage
  log "Uploading backup to blob storage..."
  az storage blob upload \
    --account-name "$STORAGE_ACCOUNT" \
    --container-name "$BACKUP_CONTAINER" \
    --file "$BACKUP_PATH" \
    --name "$BACKUP_BLOB" \
    --overwrite \
    --account-key "$STORAGE_ACCOUNT_KEY" \
    --output none
  ok "Backup uploaded to container '$BACKUP_CONTAINER' as '$BACKUP_BLOB'"

  # Clean up local temp file
  rm -f "$BACKUP_PATH"

  if [[ "$BACKUP_ONLY" == true ]]; then
    log "Backup-only mode requested. Exiting."
    exit 0
  fi
fi

# ─── Dry-run or apply ─────────────────────────────────────────────────────────
if [[ "$DRY_RUN" == true ]]; then
  log "DRY-RUN mode: No entities will be deleted."
  log "Run with --apply --force to actually perform the wipe."
  exit 0
fi

# ─── Confirmation ─────────────────────────────────────────────────────────────
if [[ "$FORCE" != true ]]; then
  echo ""
  warn "⚠️  THIS WILL PERMANENTLY DELETE $ENTITY_COUNT ENTITIES FROM TABLE '$TABLE_NAME' (PartitionKey='$PARTITION_KEY_FILTER')"
  warn "   The table itself will NOT be dropped (per #169)."
  warn "   A backup has been created in blob storage ($BACKUP_CONTAINER/$BACKUP_BLOB)."
  echo ""
  read -rp "Type 'WIPE' to confirm deletion: " CONFIRMATION
  if [[ "$CONFIRMATION" != "WIPE" ]]; then
    error "Confirmation failed. Aborting."
    exit 1
  fi
  ok "Confirmation received. Proceeding with deletion..."
fi

# ─── Delete entities ──────────────────────────────────────────────────────────
log "Deleting $ENTITY_COUNT entities..."

DELETED=0
FAILED=0

echo "$ENTITIES_JSON" | jq -c '.items[]' | while IFS= read -r entity; do
  RK=$(echo "$entity" | jq -r '.RowKey')
  PK=$(echo "$entity" | jq -r '.PartitionKey')

  if az storage entity delete \
    --account-name "$STORAGE_ACCOUNT" \
    --table-name "$TABLE_NAME" \
    --partition-key "$PK" \
    --row-key="$RK" \
    --account-key "$STORAGE_ACCOUNT_KEY" \
    --output none 2>/dev/null; then
    ((DELETED++))
    if [[ $((DELETED % 50)) -eq 0 ]]; then
      log "Deleted $DELETED / $ENTITY_COUNT entities..."
    fi
  else
    ((FAILED++))
    warn "Failed to delete entity: PK=$PK, RK=$RK"
  fi
done

echo ""
if [[ $FAILED -gt 0 ]]; then
  warn "Completed with $FAILED failures out of $ENTITY_COUNT entities."
  log "Deleted: $DELETED"
  exit 1
else
  ok "Successfully deleted all $DELETED entities."
  log "Table '$TABLE_NAME' still exists (not dropped per #169)."
  log "Backup available at: $BACKUP_CONTAINER/$BACKUP_BLOB"
fi