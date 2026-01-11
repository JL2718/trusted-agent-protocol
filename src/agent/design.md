# TAP Agent Implementation Plan

## Goal
Implement a TAP Agent client that authenticates via RFC 9421 signatures and interacts with the Merchant via the CDN Proxy.

## Requirements
1.  **Runtime**: Bun.
2.  **Identity**: Manage Ed25519/RSA keys (JWK).
3.  **Registration**: Ability to register identity with the Agent Registry.
4.  **Interaction**: Sign HTTP requests targeting the CDN Proxy (`http://localhost:3001`).
5.  **Signature Spec**: Use `@interledger/http-signature-utils` to generate `Signature` and `Signature-Input` headers.

## Architecture
-   **Entry Point**: `module.ts` (CLI demo).
-   **Core Logic**: `src.ts` (`Agent` class).
-   **Interfaces**: `interface.ts`.
-   **Testing**: `test.ts`.

## Workflow (Demo)
1.  **Initialize**: Generate a new Ed25519 Key Pair (JWK).
2.  **Register**: Send public key to Agent Registry (`POST :9002/agents`).
3.  **Interact**:
    *   Construct request to Proxy (`GET :3001/product/1`).
    *   Sign request (add headers).
    *   Send request.
    *   Display response.

## Dependencies
-   `@interledger/http-signature-utils`
-   `bun` (native `fetch`, `crypto`)

## Steps
1.  Define `interface.ts`.
2.  Implement `src.ts` with key generation, registration, and signing logic.
3.  Write `test.ts` to verify header generation.
4.  Create `module.ts` to run the end-to-end scenario.
