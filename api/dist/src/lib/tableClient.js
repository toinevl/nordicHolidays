"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTableClient = getTableClient;
const data_tables_1 = require("@azure/data-tables");
const identity_1 = require("@azure/identity");
// Cache the credential instance at module level to avoid recreating it per call.
let credentialInstance = null;
function getCredential() {
    if (!credentialInstance) {
        credentialInstance = new identity_1.DefaultAzureCredential();
    }
    return credentialInstance;
}
function getTableClient(tableName) {
    const endpoint = process.env.TABLES_ENDPOINT;
    const conn = process.env.STORAGE_CONNECTION_STRING;
    // TABLES_ENDPOINT takes precedence: if set, use managed identity path.
    // This allows local dev with connection string to work when TABLES_ENDPOINT is unset.
    if (endpoint) {
        return new data_tables_1.TableClient(endpoint, tableName, getCredential());
    }
    if (conn) {
        return data_tables_1.TableClient.fromConnectionString(conn, tableName);
    }
    throw new Error('Table Storage authentication failed: neither TABLES_ENDPOINT nor STORAGE_CONNECTION_STRING is configured. ' +
        'Set TABLES_ENDPOINT for managed identity (production) or STORAGE_CONNECTION_STRING (local dev).');
}
