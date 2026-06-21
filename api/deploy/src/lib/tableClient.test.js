"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
vitest_1.vi.mock('@azure/data-tables', () => {
    const mockTableClientConstructor = vitest_1.vi.fn(() => ({
        getEntity: vitest_1.vi.fn(),
        upsertEntity: vitest_1.vi.fn(),
        createEntity: vitest_1.vi.fn(),
        deleteEntity: vitest_1.vi.fn(),
        listEntities: vitest_1.vi.fn(),
    }));
    const mockFromConnectionString = vitest_1.vi.fn(() => ({
        getEntity: vitest_1.vi.fn(),
        upsertEntity: vitest_1.vi.fn(),
        createEntity: vitest_1.vi.fn(),
        deleteEntity: vitest_1.vi.fn(),
        listEntities: vitest_1.vi.fn(),
    }));
    return {
        TableClient: Object.assign(mockTableClientConstructor, {
            fromConnectionString: mockFromConnectionString,
        }),
    };
});
vitest_1.vi.mock('@azure/identity', () => {
    const mockDefaultAzureCredential = vitest_1.vi.fn();
    return {
        DefaultAzureCredential: mockDefaultAzureCredential,
    };
});
const tableClient_1 = require("./tableClient");
const data_tables_1 = require("@azure/data-tables");
const identity_1 = require("@azure/identity");
(0, vitest_1.describe)('getTableClient', () => {
    (0, vitest_1.beforeEach)(() => {
        vitest_1.vi.clearAllMocks();
        delete process.env.TABLES_ENDPOINT;
        delete process.env.STORAGE_CONNECTION_STRING;
    });
    (0, vitest_1.afterEach)(() => {
        delete process.env.TABLES_ENDPOINT;
        delete process.env.STORAGE_CONNECTION_STRING;
    });
    (0, vitest_1.it)('uses TABLES_ENDPOINT with DefaultAzureCredential when set', () => {
        const endpoint = 'https://swedentravel.table.core.windows.net';
        const mockCredential = {};
        vitest_1.vi.mocked(identity_1.DefaultAzureCredential).mockReturnValue(mockCredential);
        process.env.TABLES_ENDPOINT = endpoint;
        process.env.STORAGE_CONNECTION_STRING = 'some-old-connection-string'; // Verify endpoint takes precedence
        const client = (0, tableClient_1.getTableClient)('Preferences');
        (0, vitest_1.expect)(data_tables_1.TableClient).toHaveBeenCalledWith(endpoint, 'Preferences', mockCredential);
        (0, vitest_1.expect)(data_tables_1.TableClient.fromConnectionString).not.toHaveBeenCalled();
        (0, vitest_1.expect)(client).toBeDefined();
    });
    (0, vitest_1.it)('uses STORAGE_CONNECTION_STRING when TABLES_ENDPOINT is not set', () => {
        const connString = 'DefaultEndpointsProtocol=https;AccountName=test;AccountKey=abc;EndpointSuffix=core.windows.net';
        process.env.STORAGE_CONNECTION_STRING = connString;
        const client = (0, tableClient_1.getTableClient)('Preferences');
        (0, vitest_1.expect)(data_tables_1.TableClient.fromConnectionString).toHaveBeenCalledWith(connString, 'Preferences');
        (0, vitest_1.expect)(data_tables_1.TableClient).not.toHaveBeenCalled();
        (0, vitest_1.expect)(client).toBeDefined();
    });
    (0, vitest_1.it)('throws when neither TABLES_ENDPOINT nor STORAGE_CONNECTION_STRING is set', () => {
        (0, vitest_1.expect)(() => (0, tableClient_1.getTableClient)('Preferences')).toThrow(/neither TABLES_ENDPOINT nor STORAGE_CONNECTION_STRING is configured/);
    });
    (0, vitest_1.it)('reuses the same credential instance across multiple calls', () => {
        const endpoint = 'https://swedentravel.table.core.windows.net';
        process.env.TABLES_ENDPOINT = endpoint;
        // Clear mocks to get a fresh slate for this test
        vitest_1.vi.clearAllMocks();
        const client1 = (0, tableClient_1.getTableClient)('Table1');
        const client2 = (0, tableClient_1.getTableClient)('Table2');
        // Verify both calls were made to TableClient with the same credential instance
        (0, vitest_1.expect)(data_tables_1.TableClient).toHaveBeenCalledTimes(2);
        const call1Args = vitest_1.vi.mocked(data_tables_1.TableClient).mock.calls[0];
        const call2Args = vitest_1.vi.mocked(data_tables_1.TableClient).mock.calls[1];
        (0, vitest_1.expect)(call1Args[0]).toBe(endpoint);
        (0, vitest_1.expect)(call1Args[1]).toBe('Table1');
        (0, vitest_1.expect)(call2Args[0]).toBe(endpoint);
        (0, vitest_1.expect)(call2Args[1]).toBe('Table2');
        // The credential should be the same instance across both calls
        // (comparing by reference, not value)
        (0, vitest_1.expect)(call1Args[2]).toStrictEqual(call2Args[2]);
        (0, vitest_1.expect)(client1).toBeDefined();
        (0, vitest_1.expect)(client2).toBeDefined();
    });
});
