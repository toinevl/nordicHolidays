"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLlmClient = getLlmClient;
exports.getModel = getModel;
const openai_1 = __importDefault(require("openai"));
function getLlmClient() {
    const key = process.env.AZURE_FOUNDRY_API_KEY;
    if (!key?.trim())
        throw new Error('AZURE_FOUNDRY_API_KEY is not configured');
    const endpoint = process.env.AZURE_FOUNDRY_ENDPOINT;
    if (!endpoint?.trim())
        throw new Error('AZURE_FOUNDRY_ENDPOINT is not configured');
    return new openai_1.default({
        baseURL: endpoint,
        apiKey: key,
    });
}
function getModel() {
    return process.env.LLM_MODEL ?? 'gpt-4o';
}
