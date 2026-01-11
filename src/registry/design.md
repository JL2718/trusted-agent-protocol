# Agent Registry Service Plan

## Goal
Implement a Registry Service for TAP agents using Bun's native Redis client for persistence.
The service manages Agents and their public keys (JWKs), supporting the Trusted Agent Protocol.

## Architecture

*   **Runtime**: Bun
*   **Database**: Redis (via `import { redis } from "bun"`)
*   **Key Format**: JWK (JSON Web Key)
*   **API**: HTTP (Bun.serve)

## Data Model (Redis)

We will use the following Redis key patterns:

1.  **Global Counters**
    *   `registry:ids:agent` -> Incrementing Integer (Next Agent ID)

2.  **Agents**
    *   `registry:agent:{id}` -> Hash
        *   `id`: string
        *   `name`: string
        *   `domain`: string (Unique)
        *   `status`: "active" | "inactive"
        *   `created_at`: timestamp
        *   `updated_at`: timestamp
    *   `registry:lookup:domain:{domain}` -> String (Stores `agent_id`)

3.  **Keys**
    *   `registry:key:{kid}` -> String (JSON serialized JWK + metadata)
        *   *Note*: Storing as JSON string allows easy retrieval of the full JWK object.
        *   Includes `agent_id` in the stored object for reverse lookup if needed.
    *   `registry:agent:{id}:keys` -> Set (Stores `kid`s)

## Module Structure

*   `interface.ts`: Types for `Agent`, `RegistryKey`, `ServiceError`.
*   `src.ts`: Implementation of CRUD logic using `bun.redis`.
*   `module.ts`: HTTP Server setup (`Bun.serve`) mapping routes to `src.ts`.
*   `test.ts`: Integration tests (Mocked Redis or Real if available).

## API Endpoints

*   `GET /agents`: List all agents (scan `registry:agent:*`)
*   `POST /agents`: Create Agent + Initial Key
*   `GET /agents/:id`: Get Agent details
*   `PUT /agents/:id`: Update Agent
*   `DELETE /agents/:id`: Deactivate Agent
*   `POST /agents/:id/keys`: Add Key
*   `GET /agents/:id/keys/:kid`: Get Key
*   `GET /keys/:kid`: Global Key Lookup

## Implementation Steps

1.  **Define Interfaces**: `interface.ts`
2.  **Implement Logic**: `src.ts` (Redis interactions)
3.  **Setup Server**: `module.ts`
4.  **Testing**: `test.ts`
