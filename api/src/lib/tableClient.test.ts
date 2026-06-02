import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@azure/data-tables', () => ({
  TableClient: {
    fromConnectionString: vi.fn(() => ({
      getEntity: vi.fn(),
      upsertEntity: vi.fn(),
      createEntity: vi.fn(),
      deleteEntity: vi.fn(),
      listEntities: vi.fn(),
    })),
  },
}))

import { getTableClient } from './tableClient'
import { TableClient } from '@azure/data-tables'

describe('getTableClient', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates a TableClient for the given table name', () => {
    process.env.STORAGE_CONNECTION_STRING = 'DefaultEndpointsProtocol=https;AccountName=test;AccountKey=abc;EndpointSuffix=core.windows.net'
    const client = getTableClient('Preferences')
    expect(TableClient.fromConnectionString).toHaveBeenCalledWith(
      process.env.STORAGE_CONNECTION_STRING,
      'Preferences'
    )
    expect(client).toBeDefined()
  })

  it('throws if STORAGE_CONNECTION_STRING is not set', () => {
    delete process.env.STORAGE_CONNECTION_STRING
    expect(() => getTableClient('Preferences')).toThrow('STORAGE_CONNECTION_STRING')
  })
})
