/**
 * Agent Registry Interface Definitions
 */

/**
 * Standard JSON Web Key interface (simplified/compatible with RFC 7517)
 */
export interface JWK {
    kty: string;
    kid?: string;
    use?: string;
    alg?: string;
    n?: string;
    e?: string;
    x?: string;
    y?: string;
    crv?: string;
    [key: string]: unknown;
}

/**
 * Extended Key object stored in Registry
 */
export interface RegistryKey extends JWK {
    kid: string; // kid is required for Registry keys
    agent_id: string;
    created_at: number;
    status: 'active' | 'revoked';
}

/**
 * Agent entity
 */
export interface Agent {
    id: string;
    name: string;
    domain: string;
    status: 'active' | 'inactive';
    created_at: number;
    updated_at: number;
}

/**
 * Request DTO for registering a new Agent
 */
export interface RegisterAgentRequest {
    name: string;
    domain: string;
    jwk: JWK;
}

/**
 * Request DTO for adding a key
 */
export interface AddKeyRequest {
    jwk: JWK;
}

/**
 * Service Contract for the Registry
 */
export interface RegistryService {
    listAgents(): Promise<Agent[]>;
    getAgent(id: string): Promise<Agent | null>;
    getAgentByDomain(domain: string): Promise<Agent | null>;
    createAgent(req: RegisterAgentRequest): Promise<Agent>;
    updateAgent(id: string, updates: Partial<Pick<Agent, 'name' | 'status'>>): Promise<Agent>;
    deleteAgent(id: string): Promise<void>;

    addKey(agentId: string, req: AddKeyRequest): Promise<RegistryKey>;
    getKey(kid: string): Promise<RegistryKey | null>;
    getAgentKeys(agentId: string): Promise<RegistryKey[]>;
}

export class RegistryError extends Error {
    constructor(public code: string, message: string, public status: number = 500) {
        super(message);
        this.name = 'RegistryError';
    }
}
