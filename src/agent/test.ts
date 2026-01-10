import { describe, test, expect, spyOn, mock } from "bun:test";
import { Agent } from "./src";

const CONFIG = {
    name: "Test Agent",
    registryUrl: "http://mock-registry",
    proxyUrl: "http://mock-proxy",
    debug: false
};

describe("TAP Agent", () => {
    test("generateKey() should create valid JWKs", () => {
        const agent = new Agent(CONFIG);
        agent.generateKey("test-key");

        // Access private property via 'any' casting for testing
        const keys = (agent as any).keyPair;
        expect(keys).toBeDefined();
        expect(keys.publicJwk.kid).toBe("test-key");
        expect(keys.publicJwk.kty).toBe("OKP");
    });

    test("register() should call registry API", async () => {
        const agent = new Agent(CONFIG);
        agent.generateKey();

        // Mock fetch
        const originalFetch = global.fetch;
        global.fetch = mock(async (url) => {
            if (url.toString().includes("/agents")) {
                return new Response(JSON.stringify({ id: "agent-123" }), { status: 201 });
            }
            return new Response("Not Found", { status: 404 });
        });

        await agent.register();
        expect((agent as any).agentId).toBe("agent-123");

        // Restore fetch
        global.fetch = originalFetch;
    });
});
