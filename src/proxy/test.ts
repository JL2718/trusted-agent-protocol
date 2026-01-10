import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { startProxy } from "./src";
import { createSignatureHeaders } from "@interledger/http-signature-utils";
import forge from 'node-forge';
import { createPrivateKey } from 'node:crypto';

const PROXY_PORT = 3001;
const MERCHANT_PORT = 3002;
const AUTHORITY_PORT = 9003;

const MERCHANT_URL = `http://localhost:${MERCHANT_PORT}`;
const AUTHORITY_URL = `http://localhost:${AUTHORITY_PORT}`;
const PROXY_URL = `http://localhost:${PROXY_PORT}`;

// CA Setup
let caKeys: forge.pki.KeyPair;
let caCert: forge.pki.Certificate;

// Client Setup
let clientKeys: forge.pki.KeyPair;
let clientCert: string;

// Mock Servers
let merchantServer: any;
let authorityServer: any;
let proxyService: any;

function setupPki() {
    // 1. Generate CA
    caKeys = forge.pki.rsa.generateKeyPair(2048);
    caCert = forge.pki.createCertificate();
    caCert.publicKey = caKeys.publicKey;
    caCert.serialNumber = '01';
    caCert.validity.notBefore = new Date();
    caCert.validity.notAfter = new Date();
    caCert.validity.notAfter.setFullYear(caCert.validity.notBefore.getFullYear() + 10);
    const attrs = [{ name: 'commonName', value: 'Test Root CA' }];
    caCert.setSubject(attrs);
    caCert.setIssuer(attrs);
    caCert.setExtensions([{ name: 'basicConstraints', cA: true, critical: true }]);
    caCert.sign(caKeys.privateKey, forge.md.sha256.create());

    // 2. Generate Client Cert
    clientKeys = forge.pki.rsa.generateKeyPair(2048);
    const cert = forge.pki.createCertificate();
    cert.publicKey = clientKeys.publicKey;
    cert.serialNumber = '02';
    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date();
    cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);
    cert.setSubject([{ name: 'commonName', value: 'Test Client' }]);
    cert.setIssuer(attrs); // Signed by CA
    cert.sign(caKeys.privateKey, forge.md.sha256.create());
    clientCert = forge.pki.certificateToPem(cert);
}

beforeAll(async () => {
    setupPki();

    // Start Mock Merchant
    merchantServer = Bun.serve({
        port: MERCHANT_PORT,
        fetch(req) {
            const url = new URL(req.url);
            if (url.pathname === "/api/products/1") {
                return new Response(JSON.stringify({ id: 1, name: "Test Product" }), {
                    headers: { "Content-Type": "application/json" }
                });
            }
            return new Response("Not Found", { status: 404 });
        }
    });

    // Start Mock Authority
    authorityServer = Bun.serve({
        port: AUTHORITY_PORT,
        fetch(req) {
            const url = new URL(req.url);
            if (url.pathname === `/ca`) {
                return new Response(JSON.stringify({ certificate: forge.pki.certificateToPem(caCert) }), {
                    headers: { "Content-Type": "application/json" }
                });
            }
            return new Response("Not Found", { status: 404 });
        }
    });

    // Start Proxy
    proxyService = await startProxy({
        port: PROXY_PORT,
        merchantUrl: MERCHANT_URL,
        authorityUrl: AUTHORITY_URL,
        debug: true
    });
});

afterAll(() => {
    if (merchantServer) merchantServer.stop();
    if (authorityServer) authorityServer.stop();
    if (proxyService) proxyService.stop();
});

describe("CDN Proxy", () => {
    test("GET /test-proxy should return 200 without signature", async () => {
        const res = await fetch(`${PROXY_URL}/test-proxy`);
        expect(res.status).toBe(200);
        expect(await res.text()).toBe("Proxy Active");
    });

    test("GET /product/1 without signature should fail", async () => {
        const res = await fetch(`${PROXY_URL}/product/1`);
        expect(res.status).toBe(403);
    });

    test("GET /product/1 with valid signature should pass", async () => {
        const url = `${PROXY_URL}/product/1`;
        
        // Prepare Cert Header
        const certObj = forge.pki.certificateFromPem(clientCert);
        const certDer = forge.asn1.toDer(forge.pki.certificateToAsn1(certObj)).getBytes();
        const certB64 = forge.util.encode64(certDer);
        const clientCertHeader = `:${certB64}:`;

        const headersToSign = {
            host: `localhost:${PROXY_PORT}`,
            'client-cert': clientCertHeader
        };

        const cryptoKey = createPrivateKey(forge.pki.privateKeyToPem(clientKeys.privateKey));

        const signedHeaders = await createSignatureHeaders({
            request: { method: 'GET', url, headers: headersToSign },
            privateKey: cryptoKey,
            keyId: "primary-key"
        });

        const res = await fetch(url, {
            headers: {
                ...headersToSign,
                ...signedHeaders
            } as any
        });

        if (res.status !== 200) {
            console.log("Failed Response:", await res.text());
        }

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.id).toBe(1);
    });
});