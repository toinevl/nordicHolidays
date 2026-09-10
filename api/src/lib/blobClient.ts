import { DefaultAzureCredential } from '@azure/identity'
import { BlobServiceClient, ContainerClient } from '@azure/storage-blob'

// Cache the service client at module level to avoid recreating it per call
// (mirrors tableClient.ts).
let serviceClient: BlobServiceClient | null = null

function getServiceClient(): BlobServiceClient {
  if (serviceClient) return serviceClient

  const endpoint = process.env.BLOB_ENDPOINT
  const conn = process.env.STORAGE_CONNECTION_STRING

  // BLOB_ENDPOINT takes precedence: if set, use managed identity path.
  // This allows local dev with connection string to work when BLOB_ENDPOINT is unset.
  if (endpoint) {
    serviceClient = new BlobServiceClient(endpoint, new DefaultAzureCredential())
  } else if (conn) {
    serviceClient = BlobServiceClient.fromConnectionString(conn)
  } else {
    throw new Error(
      'Blob Storage authentication failed: neither BLOB_ENDPOINT nor STORAGE_CONNECTION_STRING is configured. ' +
        'Set BLOB_ENDPOINT for managed identity (production) or STORAGE_CONNECTION_STRING (local dev).'
    )
  }
  return serviceClient
}

export function getBlobContainerClient(containerName: string): ContainerClient {
  return getServiceClient().getContainerClient(containerName)
}
