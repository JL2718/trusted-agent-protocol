import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { startProxy } from "../impl";
import forge from 'node-forge';
import { Agent } from "../../agent/impl";
import https from 'node:https';

const PROXY_PORT = 4125;
const MERCHANT_PORT = 4126;
const REGISTRY_PORT = 4127;

const MERCHANT_URL = `http://[::1]:${MERCHANT_PORT}`;
const REGISTRY_URL = `http://[::1]:${REGISTRY_PORT}`;
const PROXY_URL = `https://[::1]:${PROXY_PORT}`;

const AGENT_ID = "mtls-isolated-agent";

let serverCert: string;
let serverKey: string;
let clientCert: string;
let clientKey: string;

let merchantServer: any;
let registryServer: any;
let proxyServer: any;

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
    ({ cert: clientCert, key: clientKey } = generateCert(AGENT_ID));

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
    await new Promise(r => setTimeout(r, 1000));
});

afterAll(() => {
    merchantServer?.stop();
    registryServer?.stop();
    proxyServer?.stop();
});

describe("Proxy mTLS Authorization", () => {
    test("Authorized via mTLS: Bypasses Signature Check", async () => {
        // Use node:https directly to avoid Bun's fetch connection pooling bug
        return new Promise((resolve, reject) => {
            const req = https.request({
                hostname: '[::1]',
                port: PROXY_PORT,
                path: '/product/1',
                method: 'GET',
                cert: clientCert,
                key: clientKey,
                rejectUnauthorized: false,
                headers: { 'Connection': 'close' }
            }, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        expect(res.statusCode).toBe(200);
                        const json = JSON.parse(data);
                        expect(json.name).toBe("Test Product");
                        resolve(undefined);
                    } catch (e) {
                        reject(e);
                    }
                });
            });
            req.on('error', reject);
            req.end();
        });
    });
});
