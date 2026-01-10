export interface AgentConfig {
    /** Name of the agent */
    name: string;
    /** URL of the Agent Registry */
    registryUrl: string;
    /** URL of the CDN Proxy */
    proxyUrl: string;
    /** Enable debug logging */
    debug?: boolean;
}
