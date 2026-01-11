# CDN Proxy Implementation Plan

## Goal
Implement a secure CDN Proxy service that intercepts HTTP traffic, enforces RFC 9421 HTTP Message Signatures, and proxies valid requests to an upstream Merchant Service.

## Requirements
1.  **Runtime**: Bun.
2.  **Port**: 3001 (Configurable).
3.  **Upstream**: Merchant Service at `http://localhost:3000`.
4.  **Key Registry**: Agent Registry at `http://localhost:9002`.
5.  **Endpoints**:
    *   `GET /test-proxy`: Public diagnostic endpoint (200 OK).
    *   `/product/*`: Secure endpoint (Requires valid signature).
    *   `/*`: Default proxy behavior (System spec implies everything not bypassed should be secured or just proxied). *Decision*: We will enforce signatures on everything except explicit bypasses (like `/test-proxy`) to act as a true "Edge Security" component, aligning with the "Rejects invalid requests" behavior described in system.md.
6.  **Signature Verification**:
    *   Headers: `Signature`, `Signature-Input`.
    *   Algorithm: Ed25519, RSA-PSS-SHA256 (via `@interledger/http-signature-utils`).
    *   Key Retrieval: Fetch JWK from Registry using `keyId`.

## Architecture
-   **Entry Point**: `module.ts` (starts the server).
-   **Core Logic**: `src.ts` (handles request processing).
-   **Interfaces**: `interface.ts` (config and type definitions).
-   **Testing**: `test.ts` (end-to-end tests with mocked upstream/registry).

## Workflow
1.  **Server**: Use `Bun.serve`.
2.  **Middleware Pipeline**:
    *   **Logger**: Log incoming requests (method, url).
    *   **Router**:
        *   If `path === '/test-proxy'`, return 200 "Proxy Active".
    *   **Verifier**:
        *   Check for `Signature` and `Signature-Input` headers.
        *   Parse headers using `@interledger/http-signature-utils`.
        *   Extract `keyId`.
        *   Fetch JWK from `${AGENT_REGISTRY_URL}/keys/${keyId}`.
        *   Verify signature.
        *   If invalid/missing -> Return 401/403.
    *   **Proxy**:
        *   Construct upstream URL (`MERCHANT_BACKEND_URL + path`).
        *   Forward request (method, headers, body).
        *   Return upstream response.

## Dependencies
-   `@interledger/http-signature-utils`
-   `bun` (built-in `serve`, `fetch`, `test`)

## Steps
1.  Define interfaces in `interface.ts`.
2.  Write tests in `test.ts` mocking Registry and Merchant.
3.  Implement logic in `src.ts`.
4.  Wire up entry point in `module.ts`.
