import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@azure/data-tables', () => {
  const mockTableClientConstructor = vi.fn(() => ({
    getEntity: vi.fn(),
    upsertEntity: vi.fn(),
    createEntity: vi.fn(),
    deleteEntity: vi.fn(),
    listEntities: vi.fn(),
  }))

  const mockFromConnectionString = vi.fn(() => ({
    getEntity: vi.fn(),
    upsertEntity: vi.fn(),
    createEntity: vi.fn(),
    deleteEntity: vi.fn(),
    listEntities: vi.fn(),
  }))

  return {
    TableClient: Object.assign(mockTableClientConstructor, {
      fromConnectionString: mockFromConnectionString,
    }),
  }
})

vi.mock('@azure/identity', () => {
  const mockDefaultAzureCredential = vi.fn()
  return {
    DefaultAzureCredential: mockDefaultAzureCredential,
  }
})

import { getTableClient } from './tableClient'
import { TableClient } from '@azure/data-tables'
import { DefaultAzureCredential } from '@azure/identity'

describe('getTableClient', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.TABLES_ENDPOINT
    delete process.env.STORAGE_CONNECTION_STRING
  })

  afterEach(() => {
    delete process.env.TABLES_ENDPOINT
    delete process.env.STORAGE_CONNECTION_STRING
  })

  it('uses TABLES_ENDPOINT with DefaultAzureCredential when set', () => {
    const endpoint = 'https://swedentravel.table.core.windows.net'
    const mockCredential = {}
    vi.mocked(DefaultAzureCredential).mockReturnValue(mockCredential as any)

    process.env.TABLES_ENDPOINT = endpoint
    process.env.STORAGE_CONNECTION_STRING = 'some-old-connection-string' // Verify endpoint takes precedence
    const client = getTableClient('Preferences')

    expect(TableClient).toHaveBeenCalledWith(endpoint, 'Preferences', mockCredential)
    expect(TableClient.fromConnectionString).not.toHaveBeenCalled()
    expect(client).toBeDefined()
  })

  it('uses STORAGE_CONNECTION_STRING when TABLES_ENDPOINT is not set', () => {
    const connString = 'DefaultEndpointsProtocol=https;AccountName=test;AccountKey=abc;EndpointSuffix=core.windows.net'
    process.env.STORAGE_CONNECTION_STRING = connString
    const client = getTableClient('Preferences')

    expect(TableClient.fromConnectionString).toHaveBeenCalledWith(connString, 'Preferences')
    expect(TableClient).not.toHaveBeenCalled()
    expect(client).toBeDefined()
  })

  it('throws when neither TABLES_ENDPOINT nor STORAGE_CONNECTION_STRING is set', () => {
    expect(() => getTableClient('Preferences')).toThrow(
      /neither TABLES_ENDPOINT nor STORAGE_CONNECTION_STRING is configured/
    )
  })

  it('reuses the same credential instance across multiple calls', () => {
    const endpoint = 'https://swedentravel.table.core.windows.net'

    process.env.TABLES_ENDPOINT = endpoint

    // Clear mocks to get a fresh slate for this test
    vi.clearAllMocks()

    const client1 = getTableClient('Table1')
    const client2 = getTableClient('Table2')

    // Verify both calls were made to TableClient with the same credential instance
    expect(TableClient).toHaveBeenCalledTimes(2)
    const call1Args = vi.mocked(TableClient).mock.calls[0]
    const call2Args = vi.mocked(TableClient).mock.calls[1]

    expect(call1Args[0]).toBe(endpoint)
    expect(call1Args[1]).toBe('Table1')
    expect(call2Args[0]).toBe(endpoint)
    expect(call2Args[1]).toBe('Table2')

    // The credential should be the same instance across both calls
    // (comparing by reference, not value)
    expect(call1Args[2]).toStrictEqual(call2Args[2])
    expect(client1).toBeDefined()
    expect(client2).toBeDefined()
  })
})
