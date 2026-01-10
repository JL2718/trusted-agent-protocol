export interface AgentConfig {
    /** Name of the agent */
    name: string;
    /** URL of the CDN Proxy */
    proxyUrl: string;
    /** URL of the Authority Service */
    authorityUrl: string;
    /** Enable debug logging */
    debug?: boolean;
}