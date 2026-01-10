import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { startRegistry, MemoryRegistryService } from "./registry/module";
import { startProxy } from "./proxy/impl";
import { startMerchant } from "./merchant/impl";
import { Agent } from "./agent/impl";
import forge from 'node-forge';

const REGISTRY_PORT = 9402;
const MERCHANT_PORT = 3400;
const PROXY_PORT = 3401;

const REGISTRY_URL = `http://localhost:${REGISTRY_PORT}`;
const MERCHANT_URL = `http://localhost:${MERCHANT_PORT}`;
const PROXY_URL = `https://localhost:${PROXY_PORT}`;

let registryServer: any, merchantServer: any, proxyServer: any;
let serverCert: string, serverKey: string;

function generateE2ECerts() {
    const sKeys = forge.pki.rsa.generateKeyPair(2048);
    const sCert = forge.pki.createCertificate();
    sCert.publicKey = sKeys.publicKey;
    sCert.serialNumber = '01';
    sCert.validity.notBefore = new Date();
    sCert.validity.notAfter = new Date();
    sCert.validity.notAfter.setFullYear(sCert.validity.notBefore.getFullYear() + 1);
    sCert.setSubject([{ name: 'commonName', value: 'localhost' }]);
    sCert.setIssuer(sCert.subject.attributes);
    sCert.sign(sKeys.privateKey, forge.md.sha256.create());
    serverCert = forge.pki.certificateToPem(sCert);
    serverKey = forge.pki.privateKeyToPem(sKeys.privateKey);
}

function generateClientCert(agentId: string) {
    const cKeys = forge.pki.rsa.generateKeyPair(2048);
    const cCert = forge.pki.createCertificate();
    cCert.publicKey = cKeys.publicKey;
    cCert.serialNumber = '01';
    cCert.validity.notBefore = new Date();
    cCert.validity.notAfter = new Date();
    cCert.validity.notAfter.setFullYear(cCert.validity.notBefore.getFullYear() + 1);
    cCert.setSubject([{ name: 'commonName', value: agentId }]);
    cCert.setIssuer(cCert.subject.attributes);
    cCert.sign(cKeys.privateKey, forge.md.sha256.create());

    return {
        cert: forge.pki.certificateToPem(cCert),
        key: forge.pki.privateKeyToPem(cKeys.privateKey)
    };
}

beforeAll(async () => {
    generateE2ECerts();
    registryServer = startRegistry(REGISTRY_PORT, new MemoryRegistryService());
    merchantServer = startMerchant({ port: MERCHANT_PORT });
    proxyServer = await startProxy({
        port: PROXY_PORT,
        merchantUrl: MERCHANT_URL,
        registryUrl: REGISTRY_URL,
        tls: { cert: serverCert, key: serverKey }
    });
    proxyServer.start();
    await new Promise(r => setTimeout(r, 500));
});

afterAll(() => {
    registryServer?.stop();
    merchantServer?.stop();
    proxyServer?.stop();
});

describe("TAP End-to-End Configurable Auth", () => {
    test("Agent with authMode: 'signature'", async () => {
        const agent = new Agent({
            name: "Sig Agent",
            registryUrl: REGISTRY_URL,
            proxyUrl: PROXY_URL,
            authMode: 'signature'
        });
        agent.generateKey("sig-key");
        await agent.register();

        const originalFetch = global.fetch;
        (global as any).fetch = (url: any, init: any) => {
            if (url.startsWith(PROXY_URL)) {
                return originalFetch(url, { ...init, tls: { rejectUnauthorized: false } });
            }
            return originalFetch(url, init);
        };

        const res = await agent.fetch("/product/1");
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.id.toString()).toBe("1");

        global.fetch = originalFetch;
    });

    test("Agent with authMode: 'mTLS'", async () => {
        // 1. Create agent and register identity
        const agent = new Agent({
            name: "mTLS Agent",
            registryUrl: REGISTRY_URL,
            proxyUrl: PROXY_URL
        });
        agent.generateKey("mtls-key");
        await agent.register();
        const agentId = (agent as any).agentId; // Use the actual registered ID

        // 2. Generate client cert for this agentId
        const clientTls = generateClientCert(agentId);

        // 3. Re-configure agent for mTLS
        const mtlsAgent = new Agent({
            name: "mTLS Agent",
            registryUrl: REGISTRY_URL,
            proxyUrl: PROXY_URL,
            authMode: 'mTLS',
            tls: {
                ...clientTls,
                rejectUnauthorized: false
            }
        });

        const originalFetch = global.fetch;
        (global as any).fetch = (url: any, init: any) => {
            if (url.startsWith(PROXY_URL)) {
                // If the test provides tls options, merge them
                const tls = { ...init.tls, rejectUnauthorized: false };
                return originalFetch(url, { ...init, tls });
            }
            return originalFetch(url, init);
        };

        const res = await mtlsAgent.fetch("/product/1");
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.id.toString()).toBe("1");

        global.fetch = originalFetch;
    });
});
