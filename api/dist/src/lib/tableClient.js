"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTableClient = getTableClient;
const data_tables_1 = require("@azure/data-tables");
function getTableClient(tableName) {
    const conn = process.env.STORAGE_CONNECTION_STRING;
    if (!conn)
        throw new Error('STORAGE_CONNECTION_STRING is not configured');
    return data_tables_1.TableClient.fromConnectionString(conn, tableName);
}
