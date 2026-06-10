"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
(0, vitest_1.describe)('getLlmClient', () => {
    (0, vitest_1.beforeEach)(() => { vitest_1.vi.resetModules(); });
    (0, vitest_1.afterEach)(() => {
        delete process.env.AZURE_FOUNDRY_API_KEY;
        delete process.env.AZURE_FOUNDRY_ENDPOINT;
    });
    (0, vitest_1.it)('throws if AZURE_FOUNDRY_API_KEY is not set', async () => {
        delete process.env.AZURE_FOUNDRY_API_KEY;
        process.env.AZURE_FOUNDRY_ENDPOINT = 'https://my-resource.services.ai.azure.com/models';
        const { getLlmClient } = await Promise.resolve().then(() => __importStar(require('./llmClient')));
        (0, vitest_1.expect)(() => getLlmClient()).toThrow('AZURE_FOUNDRY_API_KEY is not configured');
    });
    (0, vitest_1.it)('throws if AZURE_FOUNDRY_API_KEY is whitespace only', async () => {
        process.env.AZURE_FOUNDRY_API_KEY = '   ';
        process.env.AZURE_FOUNDRY_ENDPOINT = 'https://my-resource.services.ai.azure.com/models';
        const { getLlmClient } = await Promise.resolve().then(() => __importStar(require('./llmClient')));
        (0, vitest_1.expect)(() => getLlmClient()).toThrow('AZURE_FOUNDRY_API_KEY is not configured');
    });
    (0, vitest_1.it)('throws if AZURE_FOUNDRY_ENDPOINT is not set', async () => {
        process.env.AZURE_FOUNDRY_API_KEY = 'test-key';
        delete process.env.AZURE_FOUNDRY_ENDPOINT;
        const { getLlmClient } = await Promise.resolve().then(() => __importStar(require('./llmClient')));
        (0, vitest_1.expect)(() => getLlmClient()).toThrow('AZURE_FOUNDRY_ENDPOINT is not configured');
    });
    (0, vitest_1.it)('returns a client pointed at the Azure Foundry endpoint when configured', async () => {
        process.env.AZURE_FOUNDRY_API_KEY = 'test-key';
        process.env.AZURE_FOUNDRY_ENDPOINT = 'https://my-resource.services.ai.azure.com/models';
        const { getLlmClient } = await Promise.resolve().then(() => __importStar(require('./llmClient')));
        const client = getLlmClient();
        (0, vitest_1.expect)(client.baseURL).toContain('services.ai.azure.com');
    });
});
(0, vitest_1.describe)('getModel', () => {
    (0, vitest_1.beforeEach)(() => { vitest_1.vi.resetModules(); });
    (0, vitest_1.afterEach)(() => { delete process.env.LLM_MODEL; });
    (0, vitest_1.it)('defaults to gpt-4o', async () => {
        delete process.env.LLM_MODEL;
        const { getModel } = await Promise.resolve().then(() => __importStar(require('./llmClient')));
        (0, vitest_1.expect)(getModel()).toBe('gpt-4o');
    });
    (0, vitest_1.it)('returns LLM_MODEL env var when set', async () => {
        process.env.LLM_MODEL = 'gpt-4o-mini';
        const { getModel } = await Promise.resolve().then(() => __importStar(require('./llmClient')));
        (0, vitest_1.expect)(getModel()).toBe('gpt-4o-mini');
    });
});
