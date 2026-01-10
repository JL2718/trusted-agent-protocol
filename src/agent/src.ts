import { createPrivateKey, createPublicKey } from 'node:crypto';
import { createSignatureHeaders } from '@interledger/http-signature-utils';
import { Crypto } from '@peculiar/webcrypto';
import { Pkcs10CertificateRequestGenerator } from '@peculiar/x509';
import type { AgentConfig } from './interface';

const crypto = new Crypto();

export class Agent {
    private config: AgentConfig;
    public keyId: string | null = null;
    public certificate: string | null = null;
    private keyPair: CryptoKeyPair | null = null;

    constructor(config: AgentConfig) {
        this.config = config;
    }

    /**
     * Generates a new Key Pair
     * Supported types: 'rsa', 'ec' (P-256), 'ed25519'
     */
    public async generateKey(keyId: string = 'primary-key', type: 'rsa' | 'ec' | 'ed25519' = 'rsa') {
        if (this.config.debug) console.log(`[Agent] Generating ${type} key pair...`);

        let algo: any;
        if (type === 'rsa') {
            algo = { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" };
        } else if (type === 'ec') {
            algo = { name: "ECDSA", namedCurve: "P-256", hash: "SHA-256" };
        } else if (type === 'ed25519') {
            algo = { name: "Ed25519" };
        }

        this.keyPair = await crypto.subtle.generateKey(algo, true, ["sign", "verify"]);
        this.keyId = keyId;

        if (this.config.debug) console.log(`[Agent] Key generated. KeyID: ${keyId}`);
    }

    /**
     * Onboards the agent by getting a Certificate from the Authority
     */
    public async register() {
        if (!this.keyPair) throw new Error("No keys generated. Call generateKey() first.");
        const AUTHORITY_URL = this.config.authorityUrl;

        if (this.config.debug) console.log(`[Agent] Requesting Certificate from Authority at ${AUTHORITY_URL}...`);

        // 1. Generate CSR
        let signingAlg: any;
        // Map WebCrypto key algorithm to signing algorithm params for CSR
        if (this.keyPair.privateKey.algorithm.name === 'RSASSA-PKCS1-v1_5') {
            signingAlg = { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" };
        } else if (this.keyPair.privateKey.algorithm.name === 'ECDSA') {
            signingAlg = { name: "ECDSA", hash: "SHA-256" };
        } else if (this.keyPair.privateKey.algorithm.name === 'Ed25519') {
            signingAlg = { name: "Ed25519" };
        }

        const csr = await Pkcs10CertificateRequestGenerator.create({
            name: `CN=${this.config.name}`,
            keys: this.keyPair,
            signingAlgorithm: signingAlg
        });

        const csrPem = csr.toString("pem");

        // 2. Submit CSR
        const res = await fetch(`${AUTHORITY_URL}/sign`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ csr: csrPem })
        });

        if (!res.ok) {
            const txt = await res.text();
            throw new Error(`Authority Error: ${res.status} ${txt}`);
        }

        const data = await res.json() as any;
        this.certificate = data.certificate;

        if (this.config.debug) console.log(`[Agent] Certificate Acquired!`);
    }

    /**
     * Makes a signed request to the Proxy
     */
    public async fetch(path: string, options: RequestInit = {}) {
        if (!this.keyPair || !this.certificate) throw new Error("Not initialized (Missing Keys or Cert)");

        const method = options.method || 'GET';
        const url = `${this.config.proxyUrl}${path}`;
        const urlObj = new URL(url);

        if (this.config.debug) console.log(`[Agent] Requesting ${method} ${url}...`);

        // Prepare Certificate Header (RFC 9440)
        // Convert PEM to Base64 DER for the header
        const pemLines = this.certificate.split('\n');
        const b64Body = pemLines.filter(l => !l.startsWith('-----')).join('');
        const clientCertHeader = `:${b64Body}:`;

        // Headers to sign
        const headersToSign: Record<string, string> = {
            host: urlObj.host,
            'client-cert': clientCertHeader, 
            ...(options.headers as Record<string, string> || {})
        };

        // Convert WebCrypto Key to Node Crypto KeyObject for the library
        // We export to PKCS8 (private) PEM, then createPrivateKey
        const pkcs8 = await crypto.subtle.exportKey("pkcs8", this.keyPair.privateKey);
        // Convert ArrayBuffer to PEM string manually or buffer
        const pkcs8Buffer = Buffer.from(pkcs8);
        const nodePrivateKey = createPrivateKey({
            key: pkcs8Buffer,
            format: 'der',
            type: 'pkcs8'
        });

        // Generate Signatures
        const signedHeaders = await createSignatureHeaders({
            request: { method, url, headers: headersToSign },
            privateKey: nodePrivateKey,
            keyId: "primary-key" 
        });

        // Merge headers
        const finalHeaders = {
            ...headersToSign,
            ...signedHeaders
        };

        return fetch(url, {
            ...options,
            headers: finalHeaders as any
        });
    }
}
