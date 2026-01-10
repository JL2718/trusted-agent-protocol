import { describe, test, expect, mock } from "bun:test";
import { Agent } from "./src";
import forge from 'node-forge';

const CONFIG = {
    name: "Test Agent",
    authorityUrl: "http://mock-authority",
    proxyUrl: "http://mock-proxy",
    debug: false
};

// Helper to create a valid dummy cert
function createDummyCert() {
    const keys = forge.pki.rsa.generateKeyPair(2048);
    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = '01';
    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date();
    cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);
    const attrs = [{ name: 'commonName', value: 'Test' }];
    cert.setSubject(attrs);
    cert.setIssuer(attrs);
    cert.sign(keys.privateKey);
    return forge.pki.certificateToPem(cert);
}

describe("TAP Agent", () => {
    test("generateKey() should create valid RSA keys", () => {
        const agent = new Agent(CONFIG);
        agent.generateKey("test-key");

        // Access private property via 'any' casting for testing
        const keys = (agent as any).keyPair;
        expect(keys).toBeDefined();
        // Check if it's RSA (has n and e)
        expect(keys.publicKey.n).toBeDefined();
        expect((agent as any).privateKeyPem).toContain("BEGIN RSA PRIVATE KEY");
    });

    test("register() should call Authority API", async () => {
        const agent = new Agent(CONFIG);
        agent.generateKey();

        // Mock fetch
        const originalFetch = global.fetch;
        global.fetch = mock(async (url, init) => {
            const u = url.toString();
            if (u.includes("/sign")) {
                const body = JSON.parse(init?.body as string);
                expect(body.csr).toBeDefined();
                return new Response(JSON.stringify({
                    certificate: "-----BEGIN CERTIFICATE-----\nMOCK_CERT\n-----END CERTIFICATE-----",
                    caCertificate: "MOCK_CA"
                }), { status: 200 });
            }
            return new Response("Not Found", { status: 404 });
        });

        await agent.register();
        expect(agent.certificate).toContain("MOCK_CERT");

        // Restore fetch
        global.fetch = originalFetch;
    });

    test("fetch() should sign request and include Client-Cert", async () => {
        const agent = new Agent(CONFIG);
        agent.generateKey();
        
        // Mock register success with a valid cert structure
        agent.certificate = createDummyCert();
        
        const originalFetch = global.fetch;
        global.fetch = mock(async (url, init) => {
            const headers = init?.headers as Record<string, string>;
            // Headers in JS object are case sensitive, library usually returns Pascal-Case
            const hasSignature = headers['Signature'] || headers['signature'];
            const hasSigInput = headers['Signature-Input'] || headers['signature-input'];
            const hasClientCert = headers['Client-Cert'] || headers['client-cert'];

            expect(hasSignature).toBeDefined();
            expect(hasSigInput).toBeDefined();
            expect(hasClientCert).toBeDefined();
            expect(hasClientCert).toMatch(/^:[A-Za-z0-9+/=]+:$/); // Byte sequence format
            return new Response("OK", { status: 200 });
        });

        await agent.fetch("/test");

        global.fetch = originalFetch;
    });
});