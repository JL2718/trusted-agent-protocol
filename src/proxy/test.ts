import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { startProxy } from "./src";
import { generateKeyPairSync } from "node:crypto";
import { createSignatureHeaders } from "@interledger/http-signature-utils";

const PROXY_PORT = 3001;
const MERCHANT_PORT = 3002;
const REGISTRY_PORT = 9002;

const MERCHANT_URL = `http://localhost:${MERCHANT_PORT}`;
const REGISTRY_URL = `http://localhost:${REGISTRY_PORT}`;
const PROXY_URL = `http://localhost:${PROXY_PORT}`;

// Key Setup
const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const publicJwk = publicKey.export({ format: 'jwk' });
const privateJwk = privateKey.export({ format: 'jwk' });
const KEY_ID = "test-key-1";

// Add metadata to JWKs
Object.assign(publicJwk, { kid: KEY_ID, kty: "OKP", alg: "EdDSA", crv: "Ed25519" });
Object.assign(privateJwk, { kid: KEY_ID, kty: "OKP", alg: "EdDSA", crv: "Ed25519" });

// Mock Servers
let merchantServer;
let registryServer;
let proxyServer;

beforeAll(async () => {
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

    // Start Mock Registry
    registryServer = Bun.serve({
        port: REGISTRY_PORT,
        fetch(req) {
            const url = new URL(req.url);
            if (url.pathname === `/keys/${KEY_ID}`) {
                return new Response(JSON.stringify(publicJwk), {
                    headers: { "Content-Type": "application/json" }
                });
            }
            return new Response("Key Not Found", { status: 404 });
        }
    });

    // Start Proxy
    proxyServer = await startProxy({
        port: PROXY_PORT,
        merchantUrl: MERCHANT_URL,
        registryUrl: REGISTRY_URL,
        debug: true
    });
});

afterAll(() => {
    if (merchantServer) merchantServer.stop();
    if (registryServer) registryServer.stop();
    if (proxyServer) proxyServer.stop();
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
        const requestOptions = {
            method: "GET",
            url: `${PROXY_URL}/product/1`,
            headers: {
                "Host": `localhost:${PROXY_PORT}`
            }
        };

        // Generate headers using the library
        // The library expects { request, privateKey, keyId }

        const signedHeaders = await createSignatureHeaders({
            request: requestOptions,
            privateKey: privateKey, // KeyObject
            keyId: KEY_ID
        }); const res = await fetch(requestOptions.url, {
            method: requestOptions.method,
            headers: {
                ...requestOptions.headers,
                ...signedHeaders
            }
        });

        if (res.status !== 200) {
            console.log("Failed Response:", await res.text());
        }

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.id).toBe(1);
        expect(data.name).toBe("Test Product");
    });

    test("GET /product/1 with invalid signature should fail", async () => {
        // Manually construct bad headers or modify valid ones
        const badHeaders = {
            "Signature-Input": `sig1=("@path");created=${Math.floor(Date.now() / 1000)};keyid="${KEY_ID}";alg="ed25519"`,
            "Signature": `sig1=:badsignature:`
        };

        const res = await fetch(`${PROXY_URL}/product/1`, {
            headers: badHeaders
        });
        expect(res.status).toBe(403);
    });
});
