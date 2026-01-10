import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { startRegistry, InMemoryRegistryService } from "./registry/module";
import { startMerchant } from "./merchant/src";
import { startProxy } from "./proxy/src";
import { Agent } from "./agent/src";

// Configuration
const REGISTRY_PORT = 9002;
const MERCHANT_PORT = 3000;
const PROXY_PORT = 3001;

const REGISTRY_URL = `http://localhost:${REGISTRY_PORT}`;
const MERCHANT_URL = `http://localhost:${MERCHANT_PORT}`;
const PROXY_URL = `http://localhost:${PROXY_PORT}`;

// Servers
let registryServer: any;
let merchantServer: any;
let proxyServer: any;

beforeAll(async () => {
    // Start Registry with In-Memory Service
    registryServer = startRegistry(REGISTRY_PORT, new InMemoryRegistryService());

    // Start Merchant
    merchantServer = startMerchant({
        port: MERCHANT_PORT,
        debug: false
    });

    // Start Proxy
    proxyServer = await startProxy({
        port: PROXY_PORT,
        merchantUrl: MERCHANT_URL,
        registryUrl: REGISTRY_URL,
        debug: false
    });

    // Wait for services to be ready (optional but good practice)
    await new Promise(r => setTimeout(r, 500));
});

afterAll(() => {
    if (registryServer) registryServer.stop();
    if (merchantServer) merchantServer.stop();
    if (proxyServer) proxyServer.stop();
});

describe("End-to-End System Test", () => {
    test("Full TAP Flow: Register -> Proxy -> Merchant", async () => {
        const agent = new Agent({
            name: "E2E Test Agent",
            registryUrl: REGISTRY_URL,
            proxyUrl: PROXY_URL,
            debug: false
        });

        // 1. Generate Key
        agent.generateKey();

        // 2. Register
        await agent.register();

        // 3. Access Secured Resource
        const res = await agent.fetch("/product/1");

        expect(res.status).toBe(200);
        const data = await res.json();

        expect(data).toHaveProperty("id", "1");
        expect(data).toHaveProperty("name", "Premium Coffee");
    });

    test("Unregistered Agent should be rejected by Proxy", async () => {
        const agent = new Agent({
            name: "Malicious Agent",
            registryUrl: REGISTRY_URL,
            proxyUrl: PROXY_URL,
            debug: false
        });

        // Generate key but DO NOT register
        agent.generateKey();

        // Access Resource
        // Should fail because Proxy can't find key in Registry
        const res = await agent.fetch("/product/1");

        // The Proxy will try to fetch the key, get 404, and return 403 Forbidden
        expect(res.status).toBe(403);
    });
});
