import { TableClient } from '@azure/data-tables'

export function getTableClient(tableName: string): TableClient {
  const conn = process.env.STORAGE_CONNECTION_STRING
  if (!conn) throw new Error('STORAGE_CONNECTION_STRING is not configured')
  return TableClient.fromConnectionString(conn, tableName)
}
