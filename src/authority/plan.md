# Authority Service Plan

## Goal
Implement a Certificate Authority (CA) service that issues X.509 certificates to Agents via a CSR (Certificate Signing Request) mechanism. This enables mutual TLS or application-level certificate authentication (RFC 9440) without relying on a central registry for runtime key lookups.

## Requirements
1.  **Runtime**: Bun.
2.  **Cryptography**: RSA 2048 (via `node-forge`).
3.  **Persistence**: File-system based (stores Root CA key/cert).
4.  **Endpoints**:
    *   `GET /ca`: Retrieve the Root CA certificate (PEM).
    *   `POST /sign`: Submit a CSR (PEM) and receive a signed Client Certificate (PEM).
5.  **Output**:
    *   Root CA valid for 10 years.
    *   Client Certs valid for 1 year.

## Architecture
-   **Entry Point**: `module.ts` (Server setup).
-   **Core Logic**: `src.ts` (`CertificateAuthority` class).
-   **Interfaces**: `interface.ts`.
-   **Testing**: `test.ts`.

## Workflow
1.  **Startup**:
    *   Check for existing Root CA in `data/authority/`.
    *   If missing, generate a new Root CA (Key + Cert) and save to disk.
    *   Start HTTP Server.
2.  **Issuance**:
    *   Agent generates Key Pair & CSR.
    *   Agent POSTs CSR to `/sign`.
    *   Authority validates signature on CSR.
    *   Authority signs CSR with Root CA Key.
    *   Authority returns Client Certificate + Root CA Certificate.

## Dependencies
-   `node-forge`
-   `bun`
