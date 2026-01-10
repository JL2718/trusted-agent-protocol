import { createPrivateKey } from 'node:crypto';
import { createSignatureHeaders } from '@interledger/http-signature-utils';
import forge from 'node-forge';
import type { AgentConfig } from './interface';

export class Agent {
    private config: AgentConfig;
    public keyId: string | null = null;
    public certificate: string | null = null;
    private keyPair: { privateKey: forge.pki.PrivateKey; publicKey: forge.pki.PublicKey } | null = null;
    private privateKeyPem: string | null = null;

    constructor(config: AgentConfig) {
        this.config = config;
    }

    /**
     * Generates a new RSA 2048 Key Pair (using node-forge)
     * RSA is chosen for broad compatibility with X.509 and widely supported in CSRs.
     */
    public generateKey(keyId: string = 'primary-key') {
        if (this.config.debug) console.log(`[Agent] Generating RSA 2048 key pair...`);

        const keys = forge.pki.rsa.generateKeyPair(2048);

        this.keyId = keyId;
        this.keyPair = keys;
        this.privateKeyPem = forge.pki.privateKeyToPem(keys.privateKey);

        if (this.config.debug) console.log(`[Agent] Key generated. KeyID: ${keyId}`);
    }

    /**
     * Onboards the agent by getting a Certificate from the Authority
     */
    public async register() {
        if (!this.keyPair || !this.privateKeyPem) throw new Error("No keys generated. Call generateKey() first.");
        const AUTHORITY_URL = this.config.authorityUrl;

        if (this.config.debug) console.log(`[Agent] Requesting Certificate from Authority at ${AUTHORITY_URL}...`);

        // 1. Generate CSR
        const csr = forge.pki.createCertificationRequest();
        csr.publicKey = this.keyPair.publicKey;
        csr.setSubject([{ name: 'commonName', value: this.config.name }]);
        csr.sign(this.keyPair.privateKey as any, forge.md.sha256.create());

        const csrPem = forge.pki.certificationRequestToPem(csr);

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
        if (!this.privateKeyPem || !this.certificate) throw new Error("Not initialized (Missing Keys or Cert)");

        const method = options.method || 'GET';
        const url = `${this.config.proxyUrl}${path}`;
        const urlObj = new URL(url);

        if (this.config.debug) console.log(`[Agent] Requesting ${method} ${url}...`);

        // Prepare Certificate Header (RFC 9440)
        // Format: :<Base64 DER>:
        const certObj = forge.pki.certificateFromPem(this.certificate);
        const certDer = forge.asn1.toDer(forge.pki.certificateToAsn1(certObj)).getBytes();
        const certB64 = forge.util.encode64(certDer);
        const clientCertHeader = `:${certB64}:`;

        // Headers to sign
        const headersToSign: Record<string, string> = {
            host: urlObj.host,
            'client-cert': clientCertHeader, // Include cert in signature!
            ...(options.headers as Record<string, string> || {})
        };

        // Node crypto private key for interledger lib
        const cryptoKey = createPrivateKey(this.privateKeyPem);

        // Generate Signatures
        const signedHeaders = await createSignatureHeaders({
            request: { method, url, headers: headersToSign },
            privateKey: cryptoKey,
            keyId: "primary-key" // Key ID can be anything or matching cert KID.
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
