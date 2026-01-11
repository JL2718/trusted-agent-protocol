import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { startProxy } from "../impl";
import forge from 'node-forge';
import { Agent } from "../../agent/impl";

const PROXY_PORT = 3130;
const MERCHANT_PORT = 3131;
const REGISTRY_PORT = 9132;

const MERCHANT_URL = `http://127.0.0.1:${MERCHANT_PORT}`;
const REGISTRY_URL = `http://127.0.0.1:${REGISTRY_PORT}`;
const PROXY_URL = `https://127.0.0.1:${PROXY_PORT}`;

const AGENT_ID = "proxy-test-agent-sig";
const KEY_ID = "test-key-sig";

let serverCert: string;
let serverKey: string;

let merchantServer: any;
let registryServer: any;
let proxyServer: any;

// We'll capture the agent's JWK during test
let agentJwk: any = null;

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

    merchantServer = Bun.serve({
        port: MERCHANT_PORT,
        fetch(req) {
            return new Response(JSON.stringify({ id: 1, name: "Test Product" }), {
                headers: { "Content-Type": "application/json" }
            });
        }
    });

    registryServer = Bun.serve({
        port: REGISTRY_PORT,
        fetch(req) {
            const url = new URL(req.url);
            if (url.pathname === `/keys/${KEY_ID}`) {
                if (!agentJwk) {
                    return new Response("Not Found", { status: 404 });
                }
                return new Response(JSON.stringify(agentJwk), { headers: { "Content-Type": "application/json" } });
            }
            if (url.pathname === `/agents/${AGENT_ID}`) {
                return new Response(JSON.stringify({ id: AGENT_ID, status: 'active' }), { headers: { "Content-Type": "application/json" } });
            }
            return new Response("Not Found", { status: 404 });
        }
    });

    proxyServer = await startProxy({
        port: PROXY_PORT,
        merchantUrl: MERCHANT_URL,
        registryUrl: REGISTRY_URL,
        debug: true,
        tls: { cert: serverCert, key: serverKey }
    });
    proxyServer.start();
});

afterAll(() => {
    merchantServer?.stop();
    registryServer?.stop();
    proxyServer?.stop();
});

describe("Proxy Signature Authorization", () => {
    test("Valid Signature: Passes without mTLS", async () => {
        const agent = new Agent({
            name: "Proxy Sig Agent",
            registryUrl: REGISTRY_URL,
            proxyUrl: PROXY_URL,
            authMode: 'signature',
            tls: { rejectUnauthorized: false }
        });

        agent.generateKey(KEY_ID);
        // Expose the JWK for the mock registry
        agentJwk = (agent as any).keyPair.publicJwk;

        // We need to bypass the real register because we use a mock registry
        (agent as any).agentId = AGENT_ID;

        const res = await agent.fetch("/product/1", {
            headers: { 'Connection': 'close' }
        });

        expect(res.status).toBe(200);
        const data = await res.json() as any;
        expect(data.name).toBe("Test Product");
    });
});
