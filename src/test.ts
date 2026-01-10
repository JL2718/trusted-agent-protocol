import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { startRegistry, MemoryRegistryService } from "./registry/module";
import { startMerchant } from "./merchant/src";
import { startProxy } from "./proxy/src";
import { startAuthority } from "./authority/module";
import { Agent } from "./agent/src";
import { rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";

// Configuration
const REGISTRY_PORT = 9002;
const MERCHANT_PORT = 3000;
const PROXY_PORT = 3001;
const AUTHORITY_PORT = 9003;

const PROXY_URL = `http://localhost:${PROXY_PORT}`;
const AUTHORITY_URL = `http://localhost:${AUTHORITY_PORT}`;

// Test Data Dir
const TEST_DATA_DIR = join(import.meta.dir, 'e2e-test-data');

// Servers
let registryServer: any;
let merchantServer: any;
let proxyServer: any;
let authorityServer: any;

beforeAll(async () => {
    // Cleanup & Setup Data Dir
    if (rmSync) rmSync(TEST_DATA_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DATA_DIR, { recursive: true });

    // Start Authority
    authorityServer = startAuthority(AUTHORITY_PORT, join(TEST_DATA_DIR, 'authority'));

    // Start Merchant
    merchantServer = startMerchant({
        port: MERCHANT_PORT,
        debug: false
    });

    // Start Proxy
    await new Promise(r => setTimeout(r, 200));

    proxyServer = await startProxy({
        port: PROXY_PORT,
        merchantUrl: `http://localhost:${MERCHANT_PORT}`,
        authorityUrl: AUTHORITY_URL,
        debug: false
    });

    await new Promise(r => setTimeout(r, 200));
});

afterAll(() => {
    if (registryServer) registryServer.stop();
    if (merchantServer) merchantServer.stop();
    if (proxyServer) proxyServer.stop();
    if (authorityServer) authorityServer.stop();
    
    // Cleanup Data Dir
    if (rmSync) rmSync(TEST_DATA_DIR, { recursive: true, force: true });
});

describe("End-to-End System Test (All Key Types)", () => {
    
    const keyTypes = ['rsa', 'ec', 'ed25519'] as const;

    for (const type of keyTypes) {
        test(`Flow with ${type} key`, async () => {
            const agent = new Agent({
                name: `E2E Test Agent ${type}`,
                proxyUrl: PROXY_URL,
                authorityUrl: AUTHORITY_URL,
                debug: false
            });

            // 1. Generate Key
            agent.generateKey('primary', type);

            // 2. Register/Onboard (Get Cert)
            await agent.register();

            // 3. Access Secured Resource
            const res = await agent.fetch("/product/1");

            if (!res.ok) {
                console.error(`Agent (${type}) Fetch Failed:`, await res.text());
            }

            expect(res.status).toBe(200);
        });
    }

});
