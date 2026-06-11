"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
vitest_1.vi.mock('@azure/data-tables', () => ({
    TableClient: {
        fromConnectionString: vitest_1.vi.fn(() => ({
            getEntity: vitest_1.vi.fn(),
            upsertEntity: vitest_1.vi.fn(),
            createEntity: vitest_1.vi.fn(),
            deleteEntity: vitest_1.vi.fn(),
            listEntities: vitest_1.vi.fn(),
        })),
    },
}));
const tableClient_1 = require("./tableClient");
const data_tables_1 = require("@azure/data-tables");
(0, vitest_1.describe)('getTableClient', () => {
    (0, vitest_1.beforeEach)(() => vitest_1.vi.clearAllMocks());
    (0, vitest_1.it)('creates a TableClient for the given table name', () => {
        process.env.STORAGE_CONNECTION_STRING = 'DefaultEndpointsProtocol=https;AccountName=test;AccountKey=abc;EndpointSuffix=core.windows.net';
        const client = (0, tableClient_1.getTableClient)('Preferences');
        (0, vitest_1.expect)(data_tables_1.TableClient.fromConnectionString).toHaveBeenCalledWith(process.env.STORAGE_CONNECTION_STRING, 'Preferences');
        (0, vitest_1.expect)(client).toBeDefined();
    });
    (0, vitest_1.it)('throws if STORAGE_CONNECTION_STRING is not set', () => {
        delete process.env.STORAGE_CONNECTION_STRING;
        (0, vitest_1.expect)(() => (0, tableClient_1.getTableClient)('Preferences')).toThrow('STORAGE_CONNECTION_STRING');
    });
});
