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

function generateCert(cn: string) {
    const keys = forge.pki.rsa.generateKeyPair(2048);
    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = '01';
    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date();
    cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);
    cert.setSubject([{ name: 'commonName', value: cn }]);
    cert.setIssuer(cert.subject.attributes);
    cert.sign(keys.privateKey, forge.md.sha256.create());
    return {
        cert: forge.pki.certificateToPem(cert),
        key: forge.pki.privateKeyToPem(keys.privateKey)
    };
}

beforeAll(async () => {
    ({ cert: serverCert, key: serverKey } = generateCert('localhost'));
    registryServer = startRegistry(REGISTRY_PORT, new MemoryRegistryService());
    merchantServer = startMerchant({ port: MERCHANT_PORT });
    proxyServer = await startProxy({
        port: PROXY_PORT,
        merchantUrl: MERCHANT_URL,
        registryUrl: REGISTRY_URL,
        tls: { cert: serverCert, key: serverKey },
        debug: true
    });
    proxyServer.start();
    await new Promise(r => setTimeout(r, 500));
});

afterAll(() => {
    registryServer?.stop();
    merchantServer?.stop();
    proxyServer?.stop();
});

describe("TAP End-to-End Auth Combinations", () => {
    test("1. mTLS + Authority-signed cert (Offline)", async () => {
        const agent = new Agent({
            name: "Authority mTLS Agent",
            registryUrl: REGISTRY_URL,
            proxyUrl: PROXY_URL,
            authMode: 'mTLS'
        });
        agent.generateKey("mtls-key", 'rsa'); // RSA for node-forge support in tests
        await agent.register();
        await agent.requestCertificate();

        const agentTls = (agent as any).keyPair;
        const agentCert = (agent as any).certificate;

        const mtlsAgent = new Agent({
            name: "Authority mTLS Agent",
            registryUrl: REGISTRY_URL,
            proxyUrl: PROXY_URL,
            authMode: 'mTLS',
            tls: {
                key: agentTls.privateKey.export({ format: 'pem', type: 'pkcs8' }),
                cert: agentCert,
                rejectUnauthorized: false
            }
        });

        const res = await mtlsAgent.fetch("/product/1");
        expect(res.status).toBe(200);
        const data = await res.json() as any;
        expect(data.id.toString()).toBe("1");
    });

    test("2. mTLS + Registry-verified (Fallback)", async () => {
        const agent = new Agent({
            name: "Registry mTLS Agent",
            registryUrl: REGISTRY_URL,
            proxyUrl: PROXY_URL,
            authMode: 'mTLS'
        });
        agent.generateKey("reg-mtls-key");
        await agent.register();
        const agentId = (agent as any).agentId;

        // Manually generate a cert NOT signed by the authority
        const selfSignedTls = generateCert(agentId);

        const mtlsAgent = new Agent({
            name: "Registry mTLS Agent",
            registryUrl: REGISTRY_URL,
            proxyUrl: PROXY_URL,
            authMode: 'mTLS',
            tls: {
                ...selfSignedTls,
                rejectUnauthorized: false
            }
        });

        const res = await mtlsAgent.fetch("/product/1");
        expect(res.status).toBe(200);
    });

    test("3. HTTP Sig + Authority-signed cert (Offline)", async () => {
        const agent = new Agent({
            name: "Authority Sig Agent",
            registryUrl: REGISTRY_URL,
            proxyUrl: PROXY_URL,
            authMode: 'signature',
            tls: { rejectUnauthorized: false }
        });
        agent.generateKey("sig-key", 'rsa');
        await agent.register();
        await agent.requestCertificate();

        const res = await agent.fetch("/product/1");
        expect(res.status).toBe(200);
    });

    test("4. HTTP Sig + Registry-verified (Default)", async () => {
        const agent = new Agent({
            name: "Registry Sig Agent",
            registryUrl: REGISTRY_URL,
            proxyUrl: PROXY_URL,
            authMode: 'signature',
            tls: { rejectUnauthorized: false }
        });
        agent.generateKey("reg-sig-key");
        await agent.register();

        const res = await agent.fetch("/product/1");
        expect(res.status).toBe(200);
    });
});
