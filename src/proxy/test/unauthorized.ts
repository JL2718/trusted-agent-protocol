import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { startProxy } from "../impl";
import forge from 'node-forge';

const PROXY_PORT = 3140;
const MERCHANT_PORT = 3141;
const REGISTRY_PORT = 9142;

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

describe("Proxy Unauthorized Access", () => {
    test("No Certificate: Requires Signature", async () => {
        const res = await fetch(`${PROXY_URL}/product/1`, {
            headers: { 'Connection': 'close' },
            tls: { rejectUnauthorized: false }
        });
        expect(res.status).toBe(403);
        expect(await res.text()).toContain("Missing Signature Headers and no valid mTLS");
    });
});
