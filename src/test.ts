import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { startRegistry, MemoryRegistryService } from "./registry/module";
import { startMerchant } from "./merchant/src";
import { startProxy } from "./proxy/src";
import { startAuthority } from "./authority/module";
import { Agent } from "./agent/src";

// Configuration
const REGISTRY_PORT = 9002;
const MERCHANT_PORT = 3000;
const PROXY_PORT = 3001;
const AUTHORITY_PORT = 9003;

const REGISTRY_URL = `http://localhost:${REGISTRY_PORT}`;
const MERCHANT_URL = `http://localhost:${MERCHANT_PORT}`;
const PROXY_URL = `http://localhost:${PROXY_PORT}`;
const AUTHORITY_URL = `http://localhost:${AUTHORITY_PORT}`;

// Servers
let registryServer: any;
let merchantServer: any;
let proxyServer: any;
let authorityServer: any;

beforeAll(async () => {
    // Start Authority
    authorityServer = startAuthority(AUTHORITY_PORT);

    // Start Registry (Legacy/Optional - keeping for completeness if code refs it)
    registryServer = startRegistry(REGISTRY_PORT, new MemoryRegistryService());

    // Start Merchant
    merchantServer = startMerchant({
        port: MERCHANT_PORT,
        debug: false
    });

    // Start Proxy
    // Note: Proxy fetches Root CA on start, so Authority must be up.
    // We add a tiny delay to ensure Authority bind.
    await new Promise(r => setTimeout(r, 200));

    proxyServer = await startProxy({
        port: PROXY_PORT,
        merchantUrl: MERCHANT_URL,
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
});

describe("End-to-End System Test", () => {
    test("Full TAP Flow: Register (Get Cert) -> Proxy -> Merchant", async () => {
        const agent = new Agent({
            name: "E2E Test Agent",
            registryUrl: REGISTRY_URL,
            proxyUrl: PROXY_URL,
            authorityUrl: AUTHORITY_URL,
            debug: false
        });

        // 1. Generate Key
        agent.generateKey();

        // 2. Register/Onboard (Get Cert)
        await agent.register();

        // 3. Access Secured Resource
        const res = await agent.fetch("/product/1");

        if (!res.ok) {
            console.error("Agent Fetch Failed:", await res.text());
        }

        expect(res.status).toBe(200);
        const data = await res.json();

        expect(data).toHaveProperty("id", "1");
        expect(data).toHaveProperty("name", "Premium Coffee");
    });

    test("Request without valid Certificate should be rejected", async () => {
        // We simulate a request without the Client-Cert header by using a raw fetch
        // The Proxy expects 'Client-Cert' header.

        const res = await fetch(`${PROXY_URL}/product/1`, {
            headers: {
                // Missing Client-Cert
                // Missing Signature
            }
        });

        // Should return 403 Forbidden (Missing Client-Cert Header)
        expect(res.status).toBe(403);
        const txt = await res.text();
        expect(txt).toContain("Missing Client-Cert");
    });
});
