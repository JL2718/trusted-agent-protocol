import forge from 'node-forge';

/**
 * Configuration for the Authority Service
 */
export interface AuthorityConfig {
    port: number;
    /** Directory to store CA keys/certs */
    dataDir: string;
}

/**
 * Key Pair structure
 */
export interface CAKeyPair {
    privateKey: string; // PEM
    certificate: string; // PEM
}

/**
 * Request body for signing a certificate
 */
export interface SignCsrRequest {
    csr: string; // PEM
}

/**
 * Response body for a signed certificate
 */
export interface SignCsrResponse {
    certificate: string; // PEM
    caCertificate: string; // PEM
}

/**
 * Service Interface
 */
export interface AuthorityService {
    /**
     * returns the Root CA Certificate in PEM format
     */
    getCaCert(): string;

    /**
     * Signs a CSR and returns the certificate
     */
    signCsr(csrPem: string): Promise<string>;
}
