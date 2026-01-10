import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { startRegistry, MemoryRegistryService } from "./registry/module";
import { startProxy } from "./proxy/impl";
import { startMerchant } from "./merchant/impl";
import { Agent } from "./agent/impl";
import forge from 'node-forge';

const REGISTRY_PORT = 9302;
const MERCHANT_PORT = 3300;
const PROXY_PORT = 3301;

const REGISTRY_URL = `http://localhost:${REGISTRY_PORT}`;
const MERCHANT_URL = `http://localhost:${MERCHANT_PORT}`;
const PROXY_URL = `https://localhost:${PROXY_PORT}`;

let registryServer: any, merchantServer: any, proxyServer: any;
let ca: string, cert: string, key: string;

function generateE2ECerts() {
    const caKeys = forge.pki.rsa.generateKeyPair(2048);
    const caCert = forge.pki.createCertificate();
    caCert.publicKey = caKeys.publicKey;
    caCert.serialNumber = '01';
    caCert.validity.notBefore = new Date();
    caCert.validity.notAfter = new Date();
    caCert.validity.notAfter.setFullYear(caCert.validity.notBefore.getFullYear() + 1);
    const attrs = [{ name: 'commonName', value: 'E2E CA' }];
    caCert.setSubject(attrs);
    caCert.setIssuer(attrs);
    caCert.setExtensions([{ name: 'basicConstraints', cA: true }]);
    caCert.sign(caKeys.privateKey, forge.md.sha256.create());
    ca = forge.pki.certificateToPem(caCert);

    const sKeys = forge.pki.rsa.generateKeyPair(2048);
    const sCert = forge.pki.createCertificate();
    sCert.publicKey = sKeys.publicKey;
    sCert.serialNumber = '02';
    sCert.validity.notBefore = new Date();
    sCert.validity.notAfter = new Date();
    sCert.validity.notAfter.setFullYear(sCert.validity.notBefore.getFullYear() + 1);
    sCert.setSubject([{ name: 'commonName', value: 'localhost' }]);
    sCert.setIssuer(caCert.subject.attributes);
    sCert.sign(caKeys.privateKey, forge.md.sha256.create());
    cert = forge.pki.certificateToPem(sCert);
    key = forge.pki.privateKeyToPem(sKeys.privateKey);
}

beforeAll(async () => {
    generateE2ECerts();
    registryServer = startRegistry(REGISTRY_PORT, new MemoryRegistryService());
    merchantServer = startMerchant({ port: MERCHANT_PORT });
    proxyServer = await startProxy({
        port: PROXY_PORT,
        merchantUrl: MERCHANT_URL,
        registryUrl: REGISTRY_URL,
        tls: { cert, key, ca }
    });
    proxyServer.start();
    await new Promise(r => setTimeout(r, 500));
});

afterAll(() => {
    registryServer?.stop();
    merchantServer?.stop();
    proxyServer?.stop();
});

describe("TAP End-to-End (HTTPS)", () => {
    test("Agent registers and fetches via HTTPS Proxy", async () => {
        const agent = new Agent({ name: "E2E Agent", registryUrl: REGISTRY_URL, proxyUrl: PROXY_URL });
        agent.generateKey();
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

    test("Unregistered agent is rejected", async () => {
        const agent = new Agent({ name: "Bad Agent", registryUrl: REGISTRY_URL, proxyUrl: PROXY_URL });
        agent.generateKey();

        const originalFetch = global.fetch;
        (global as any).fetch = (url: any, init: any) => {
            if (url.startsWith(PROXY_URL)) {
                return originalFetch(url, { ...init, tls: { rejectUnauthorized: false } });
            }
            return originalFetch(url, init);
        };

        const res = await agent.fetch("/product/1");
        expect(res.status).toBe(403);
        global.fetch = originalFetch;
    });
});
