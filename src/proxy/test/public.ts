import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { startProxy } from "../impl";
import forge from 'node-forge';

const PROXY_PORT = 3110;
const MERCHANT_PORT = 3111;
const REGISTRY_PORT = 9112;

const MERCHANT_URL = `http://127.0.0.1:${MERCHANT_PORT}`;
const REGISTRY_URL = `http://127.0.0.1:${REGISTRY_PORT}`;
const PROXY_URL = `https://127.0.0.1:${PROXY_PORT}`;

let serverCert: string;
let serverKey: string;

let merchantServer: any;
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

    merchantServer = Bun.serve({
        port: MERCHANT_PORT,
        fetch(req) {
            return new Response(JSON.stringify({ id: 1, name: "Test Product" }), {
                headers: { "Content-Type": "application/json" }
            });
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
    proxyServer?.stop();
});

describe("Proxy Public Endpoint", () => {
    test("Public endpoint /test-proxy", async () => {
        const res = await fetch(`${PROXY_URL}/test-proxy`, {
            headers: { 'Connection': 'close' },
            tls: { rejectUnauthorized: false }
        });
        expect(res.status).toBe(200);
        expect(await res.text()).toBe("Proxy Active");
    });
});
