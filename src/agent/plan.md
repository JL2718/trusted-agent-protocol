# TAP Agent Implementation Plan

## Goal
Implement a TAP Agent client that authenticates via X.509 Certificate-based Mutual Auth (Application Layer) and interacts with the Merchant via the CDN Proxy.

## Requirements
1.  **Runtime**: Bun.
2.  **Identity**: RSA 2048 Key Pair.
3.  **Onboarding**: Generate CSR, submit to Authority, receive Client Certificate.
4.  **Interaction**: Sign HTTP requests targeting the CDN Proxy using RFC 9421 and RFC 9440.
5.  **Signature Spec**:
    *   `Signature-Input`: Covers `client-cert` and other headers.
    *   `Client-Cert`: Contains the Base64 DER encoded certificate (RFC 9440).

## Architecture
-   **Entry Point**: `module.ts` (CLI demo).
-   **Core Logic**: `src.ts` (`Agent` class).
-   **Interfaces**: `interface.ts`.
-   **Testing**: `test.ts`.

## Workflow (Demo)
1.  **Initialize**: Generate RSA Key Pair.
2.  **Onboard**:
    *   Generate CSR.
    *   POST CSR to Authority (`:9003/sign`).
    *   Store signed Certificate.
3.  **Interact**:
    *   Construct request to Proxy (`GET :3001/product/1`).
    *   Add `Client-Cert` header.
    *   Sign request (including `Client-Cert`).
    *   Send request.
    *   Display response.

## Dependencies
-   `@interledger/http-signature-utils`
-   `node-forge`
-   `bun`