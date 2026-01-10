import { generateKeyPairSync } from 'node:crypto';
import { createSignatureHeaders } from '@interledger/http-signature-utils';
import { AgentConfig } from './interface';

export class Agent {
    private config: AgentConfig;
    private keyId: string | null = null;
    private agentId: string | null = null;
    private keyPair: { publicKey: any; privateKey: any; publicJwk: any; privateJwk: any } | null = null;

    constructor(config: AgentConfig) {
        this.config = config;
    }

    /**
     * Generates a new Ed25519 Key Pair
     */
    public generateKey(keyId: string = 'primary-key') {
        if (this.config.debug) console.log(`[Agent] Generating Ed25519 key pair...`);

        const { privateKey, publicKey } = generateKeyPairSync('ed25519');
        const publicJwk = publicKey.export({ format: 'jwk' });
        const privateJwk = privateKey.export({ format: 'jwk' });

        // Add required metadata for TAP
        Object.assign(publicJwk, { kid: keyId, kty: 'OKP', alg: 'EdDSA', crv: 'Ed25519', use: 'sig' });
        Object.assign(privateJwk, { kid: keyId, kty: 'OKP', alg: 'EdDSA', crv: 'Ed25519', use: 'sig' });

        this.keyId = keyId;
        this.keyPair = { privateKey, publicKey, publicJwk, privateJwk };

        if (this.config.debug) console.log(`[Agent] Key generated. KeyID: ${keyId}`);
    }

    /**
     * Registers the agent and key with the Registry
     */
    public async register() {
        if (!this.keyPair) throw new Error("No keys generated. Call generateKey() first.");

        if (this.config.debug) console.log(`[Agent] Registering with ${this.config.registryUrl}...`);

        // 1. Create Agent
        const agentRes = await fetch(`${this.config.registryUrl}/agents`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: this.config.name,
                domain: this.config.domain || `https://${this.config.name.toLowerCase().replace(/\s+/g, '-')}.example.com`,
                jwk: this.keyPair.publicJwk
            })
        });

        if (!agentRes.ok) {
            const txt = await agentRes.text();
            throw new Error(`Registration failed: ${agentRes.status} ${txt}`);
        }

        const agentData = await agentRes.json();
        this.agentId = agentData.id;
        if (this.config.debug) console.log(`[Agent] Registered. AgentID: ${this.agentId}`);
    }

    /**
     * Makes a request to the Proxy using the configured authentication mode
     */
    public async fetch(path: string, options: RequestInit = {}) {
        const authMode = this.config.authMode || 'signature';
        const method = options.method || 'GET';
        const url = `${this.config.proxyUrl}${path}`;
        const urlObj = new URL(url);

        if (this.config.debug) console.log(`[Agent] Requesting via ${authMode}: ${method} ${url}...`);

        let headers: Record<string, string> = {
            host: urlObj.host,
            ...((options.headers as any) || {})
        };

        const fetchOptions: any = {
            ...options,
            headers
        };

        // 1. Signature Auth
        if (authMode === 'signature') {
            if (!this.keyPair || !this.keyId) {
                throw new Error("Agent keys not generated. Necessary for signature auth.");
            }

            const requestToSign = {
                method,
                url,
                headers
            };

            const signedHeaders = await createSignatureHeaders({
                request: requestToSign,
                privateKey: this.keyPair.privateKey,
                keyId: this.keyId
            });

            fetchOptions.headers = {
                ...headers,
                ...signedHeaders
            };
        }

        // 2. mTLS Auth (Bun specific tls configuration)
        if (authMode === 'mTLS' && this.config.tls) {
            fetchOptions.tls = {
                cert: this.config.tls.cert,
                key: this.config.tls.key,
                ca: this.config.tls.ca,
                rejectUnauthorized: this.config.tls.rejectUnauthorized !== undefined
                    ? this.config.tls.rejectUnauthorized
                    : true
            };
        } else if (authMode === 'mTLS') {
            // Fallback for HTTPS proxy even without mTLS if configured
            // we should still allow fetch to fail if cert is missing but mode is mTLS
            if (this.config.debug) console.warn("[Agent] mTLS requested but no TLS config provided.");
            // If proxy is HTTPS, we might still need rejectUnauthorized: false for self-signed
            fetchOptions.tls = { rejectUnauthorized: false };
        }

        return fetch(url, fetchOptions);
    }
}
