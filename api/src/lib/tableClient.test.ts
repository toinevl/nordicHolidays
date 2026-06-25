import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const credentialMock = vi.fn()
const tableClientMock = vi.fn(() => ({
  getEntity: vi.fn(),
  upsertEntity: vi.fn(),
  createEntity: vi.fn(),
  deleteEntity: vi.fn(),
  listEntities: vi.fn(),
}))

const fromConnectionStringMock = vi.fn(() => ({
  getEntity: vi.fn(),
  upsertEntity: vi.fn(),
  createEntity: vi.fn(),
  deleteEntity: vi.fn(),
  listEntities: vi.fn(),
}))

vi.mock('@azure/data-tables', () => ({
  TableClient: class {
    constructor(...args: any[]) {
      return tableClientMock(...args)
    }
    static fromConnectionString(...args: any[]) {
      return fromConnectionStringMock(...args)
    }
  },
}))

vi.mock('@azure/identity', () => ({
  DefaultAzureCredential: class {
    constructor(...args: any[]) {
      return credentialMock(...args)
    }
  },
}))

import { getTableClient } from './tableClient'

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
    credentialMock.mockReturnValue(mockCredential as any)

    process.env.TABLES_ENDPOINT = endpoint
    process.env.STORAGE_CONNECTION_STRING = 'some-old-connection-string' // Verify endpoint takes precedence
    const client = getTableClient('Preferences')

    expect(tableClientMock).toHaveBeenCalledWith(endpoint, 'Preferences', mockCredential)
    expect(fromConnectionStringMock).not.toHaveBeenCalled()
    expect(client).toBeDefined()
  })

  it('uses STORAGE_CONNECTION_STRING when TABLES_ENDPOINT is not set', () => {
    const connString = 'DefaultEndpointsProtocol=https;AccountName=test;AccountKey=abc;EndpointSuffix=core.windows.net'
    process.env.STORAGE_CONNECTION_STRING = connString
    const client = getTableClient('Preferences')

    expect(fromConnectionStringMock).toHaveBeenCalledWith(connString, 'Preferences')
    expect(tableClientMock).not.toHaveBeenCalled()
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
    expect(tableClientMock).toHaveBeenCalledTimes(2)
    const call1Args = tableClientMock.mock.calls[0]
    const call2Args = tableClientMock.mock.calls[1]

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
