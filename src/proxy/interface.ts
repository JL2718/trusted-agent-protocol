/**
 * Configuration for the CDN Proxy Service
 */
export interface ProxyConfig {
    /** Port to listen on */
    port: number;
    /** URL of the upstream Merchant Service */
    merchantUrl: string;
    /** URL of the Agent Registry Service */
    registryUrl: string;
    /** Enable debug logging */
    debug?: boolean;
}

/**
 * Interface for the Proxy Service
 */
export interface ProxyService {
    /**
     * Starts the proxy server
     * @returns The server instance
     */
    start(): void;

    /**
     * Stops the proxy server
     */
    stop(): void;
}
