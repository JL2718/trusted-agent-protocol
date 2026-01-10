# CDN Proxy Implementation Plan

## Goal
Implement a secure CDN Proxy service that intercepts HTTP traffic, enforces RFC 9421 HTTP Message Signatures using X.509 Client Certificates (RFC 9440), and proxies valid requests to an upstream Merchant Service.

## Requirements
1.  **Runtime**: Bun.
2.  **Port**: 3001 (Configurable).
3.  **Upstream**: Merchant Service at `http://localhost:3000`.
4.  **Trust Root**: Authority Service at `http://localhost:9003`.
5.  **Endpoints**:
    *   `GET /test-proxy`: Public diagnostic endpoint (200 OK).
    *   `/product/*`: Secure endpoint (Requires valid signature + valid certificate).
    *   `/*`: Default secure proxy.
6.  **Verification Flow**:
    *   **Startup**: Fetch and cache Root CA from Authority.
    *   **Per Request**:
        *   Extract `Client-Cert` header.
        *   Decode certificate.
        *   Verify certificate is signed by Root CA.
        *   Extract Public Key from certificate.
        *   Verify HTTP Signature using the extracted Public Key.
7.  **Signature Spec**:
    *   `Client-Cert`: Byte sequence (:`<Base64>`:).
    *   `Signature-Input`: Must cover `client-cert`.

## Architecture
-   **Entry Point**: `module.ts` (starts the server).
-   **Core Logic**: `src.ts` (handles request processing).
-   **Interfaces**: `interface.ts`.
-   **Testing**: `test.ts`.

## Dependencies
-   `@interledger/http-signature-utils`
-   `node-forge`
-   `bun`