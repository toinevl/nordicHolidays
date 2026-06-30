import { TableClient } from '@azure/data-tables'
import { DefaultAzureCredential } from '@azure/identity'

// Cache the credential instance at module level to avoid recreating it per call.
let credentialInstance: DefaultAzureCredential | null = null

function getCredential(): DefaultAzureCredential {
  if (!credentialInstance) {
    credentialInstance = new DefaultAzureCredential()
  }
  return credentialInstance
}

export function getTableClient(tableName: string): TableClient {
  const endpoint = process.env.TABLES_ENDPOINT
  const conn = process.env.STORAGE_CONNECTION_STRING

  // TABLES_ENDPOINT takes precedence: if set, use managed identity path.
  // This allows local dev with connection string to work when TABLES_ENDPOINT is unset.
  if (endpoint) {
    return new TableClient(endpoint, tableName, getCredential())
  }

  if (conn) {
    return TableClient.fromConnectionString(conn, tableName, {
      allowInsecureConnection: conn.startsWith('DefaultEndpointsProtocol=http;'),
    })
  }

  throw new Error(
    'Table Storage authentication failed: neither TABLES_ENDPOINT nor STORAGE_CONNECTION_STRING is configured. ' +
    'Set TABLES_ENDPOINT for managed identity (production) or STORAGE_CONNECTION_STRING (local dev).'
  )
}

/**
 * Ensure a table exists before writing to it. Safe to call repeatedly —
 * ignores the "table already exists" conflict. This is needed because the
 * PUT handlers fall back to createEntity when no existing row is found,
 * and createEntity fails if the table itself does not exist yet.
 */
export async function ensureTable(tableName: string): Promise<TableClient> {
  const client = getTableClient(tableName)
  try {
    await client.createTable()
  } catch (err: any) {
    if (err?.statusCode !== 409 && err?.code !== 'TableAlreadyExists') throw err
  }
  return client
}
