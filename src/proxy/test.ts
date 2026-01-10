import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { startProxy } from "./impl";
import { generateKeyPairSync } from "node:crypto";
import { createSignatureHeaders } from "@interledger/http-signature-utils";
import forge from 'node-forge';

const PROXY_PORT = 3101;
const MERCHANT_PORT = 3102;
const REGISTRY_PORT = 9102;

const MERCHANT_URL = `http://localhost:${MERCHANT_PORT}`;
const REGISTRY_URL = `http://localhost:${REGISTRY_PORT}`;
const PROXY_URL = `https://localhost:${PROXY_PORT}`;

// Key Setup for Signatures
const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const publicJwk = publicKey.export({ format: 'jwk' }) as any;
const KEY_ID = "test-key-1";
Object.assign(publicJwk, { kid: KEY_ID, kty: "OKP", alg: "EdDSA", crv: "Ed25519" });

// Agent/Client ID for mTLS
const AGENT_ID = "test-agent-mtls";

// Certificate State
let serverCert: string;
let serverKey: string;
let clientCert: string;
let clientKey: string;

// Mock Servers
let merchantServer: any;
let registryServer: any;
let proxyServer: any;

function generateTestCerts() {
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

    const cKeys = forge.pki.rsa.generateKeyPair(2048);
    const cCert = forge.pki.createCertificate();
    cCert.publicKey = cKeys.publicKey;
    cCert.serialNumber = '01';
    cCert.validity.notBefore = new Date();
    cCert.validity.notAfter = new Date();
    cCert.validity.notAfter.setFullYear(cCert.validity.notBefore.getFullYear() + 1);
    cCert.setSubject([{ name: 'commonName', value: AGENT_ID }]);
    cCert.setIssuer(cCert.subject.attributes);
    cCert.sign(cKeys.privateKey, forge.md.sha256.create());
    clientCert = forge.pki.certificateToPem(cCert);
    clientKey = forge.pki.privateKeyToPem(cKeys.privateKey);
}

beforeAll(async () => {
    generateTestCerts();

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
                return new Response(JSON.stringify(publicJwk), { headers: { "Content-Type": "application/json" } });
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

describe("Proxy with mTLS and Signatures", () => {
    test("Public endpoint /test-proxy", async () => {
        const res = await fetch(`${PROXY_URL}/test-proxy`, {
            tls: { rejectUnauthorized: false }
        });
        expect(res.status).toBe(200);
        expect(await res.text()).toBe("Proxy Active");
    });

    test("Authorized via mTLS: Bypasses Signature Check", async () => {
        const res = await fetch(`${PROXY_URL}/product/1`, {
            tls: {
                cert: clientCert,
                key: clientKey,
                rejectUnauthorized: false
            }
        });
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.name).toBe("Test Product");
    });

    test("No Certificate: Requires Signature", async () => {
        const res = await fetch(`${PROXY_URL}/product/1`, {
            tls: { rejectUnauthorized: false }
        });
        expect(res.status).toBe(403);
        expect(await res.text()).toContain("Missing RFC 9421 Signature Headers");
    });

    test("Valid Signature: Passes without mTLS", async () => {
        const requestOptions = {
            method: "GET",
            url: `${PROXY_URL}/product/1`,
            headers: { "Host": `localhost:${PROXY_PORT}` }
        };

        const signedHeaders = await createSignatureHeaders({
            request: requestOptions,
            privateKey: privateKey,
            keyId: KEY_ID
        }) as any;

        const res = await fetch(requestOptions.url, {
            method: requestOptions.method,
            headers: { ...requestOptions.headers, ...signedHeaders },
            tls: { rejectUnauthorized: false }
        });

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.name).toBe("Test Product");
    });
});
