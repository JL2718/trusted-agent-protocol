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
                domain: "https://agent.example.com",
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
     * Makes a signed request to the Proxy
     */
    public async fetch(path: string, options: RequestInit = {}) {
        if (!this.keyPair || !this.keyId) throw new Error("Not initialized");

        const method = options.method || 'GET';
        const url = `${this.config.proxyUrl}${path}`;

        // Parse URL to get host for signing
        const urlObj = new URL(url);

        if (this.config.debug) console.log(`[Agent] Requesting ${method} ${url}...`);

        // Prepare Request Options for Signing
        const requestToSign = {
            method,
            url,
            headers: {
                host: urlObj.host,
                ...options.headers
            }
        };

        // Generate Signatures
        // Note: passing the KeyObject (privateKey) as discovered in Proxy tests
        const signedHeaders = await createSignatureHeaders({
            request: requestToSign,
            privateKey: this.keyPair.privateKey,
            keyId: this.keyId
        });

        // Merge headers
        const headers = {
            ...options.headers,
            ...signedHeaders
        };

        // Execute Request
        return fetch(url, {
            ...options,
            headers
        });
    }
}
