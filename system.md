# System Architecture & Protocol Description

## System Overview
The Trusted Agent Protocol (TAP) system consists of four main components designed to facilitate secure, authenticated interactions between AI Agents and Merchant systems using RFC 9421 HTTP Message Signatures. The architecture enforces identity verification at the edge (CDN Proxy) before traffic reaches the Merchant application.

**Tech Stack:**
- **Runtime:** Bun
- **Language:** TypeScript
- **UI:** VanJS (No .html files)
- **Signatures:** Standard HTTP Signatures via `@interledger/http-signature-utils` with JWK.

## Components

### 1. TAP Agent (Client)
- **Role**: The end-user acting as an autonomous agent.
- **Technology**: Bun, TypeScript.
- **Functionality**:
  - Uses cryptographic keys (Ed25519, RSA-PSS) stored as JWKs.
  - Generates RFC 9421 `Signature` and `Signature-Input` headers using `@interledger/http-signature-utils`.
  - Interact with the Merchant via signed HTTP requests.

### 2. CDN Proxy (Edge Security)
- **Port**: `3001`
- **Technology**: Bun, TypeScript.
- **Role**: Gatekeeper / Reverse Proxy.
- **Logic**:
  - Intercepts **all** incoming traffic.
  - Parses RFC 9421 headers.
  - Queries **Agent Registry** to fetch the public key (JWK) associated with the `keyId`.
  - Verifies digital signatures using `@interledger/http-signature-utils`.
  - Checks for replay attacks (Nonce cache) and expiration.
  - Forwards valid requests to **Merchant Frontend** or **Merchant Backend**.
  - Rejects invalid requests (403 Forbidden).

### 3. Agent Registry (Identity Provider)
- **Port**: `9002`
- **Technology**: Bun, TypeScript.
- **Role**: Storage for Agent Identities and Public Keys.
- **Logic**:
  - Exposes API for Agent registration.
  - Provides public API for the CDN Proxy to retrieve keys (JWKs) for verification.

### 4. Merchant Backend (Application)
- **Port**: `8000`
- **Technology**: Bun, TypeScript.
- **Role**: Minimal Resource Server.
- **Logic**:
  - Provides a read-only list of products.
  - No database (In-memory static data).
  - Receives traffic via the CDN Proxy (`/api/*`).

### 5. Merchant Frontend
- **Port**: `3000`
- **Technology**: Bun, VanJS.
- **Role**: Simple Display UI.
- **Logic**:
  - Single page application.
  - Fetches and displays product data from the Backend.
  - Served via CDN Proxy root (`/`).

---

## API Reference

### Agent Registry (Port 9002)
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/` | Health check |
| `POST` | `/agents/register` | Register or update an agent |
| `GET` | `/agents/{agent_id}` | Get agent details |
| `GET` | `/agents` | List all agents |
| `DELETE` | `/agents/{agent_id}` | Deactivate an agent |
| `GET` | `/keys/{key_id}` | **Critical**: Direct public key lookup by ID (Used by Proxy) |
| `POST` | `/agents/{agent_id}/keys` | Add a key to an agent |
| `GET` | `/agents/{agent_id}/keys/{key_id}` | Get specific key details |

### CDN Proxy (Port 3001)
*Acts as a middleware. Routes not matching `/api` are forwarded to Port 3000.*
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/test-proxy` | Diagnostic endpoint (Bypasses signature check) |
| `REQ` | `/product/*` | **Secured**: Enforces Signature Verification |
| `*` | `/api/*` | Proxies to Merchant Backend (8000) |
| `*` | `/*` | Proxies to Merchant Frontend (3000) |

### Merchant Backend (Port 8000)
*Prefix: /api*
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/products` | List all products (Static) |
| `GET` | `/products/{id}` | Get product details (Static) |

---

### Protocol Flows

#### 1. Authenticated Browse (Active Flow)
*The primary flow verifying the Trusted Agent Protocol.*

1.  **Agent (Bun/TS)**:
    -   Loads Keys from JWK.
    -   Generates headers:
        -   `Signature-Input`: `sig1=("@method" "@target-uri" "content-digest" "content-length" "content-type" "authorization");created=1618884473;keyid="test-key-rsa-pss"`
        -   `Signature`: `sig1=:...:`
    -   Navigates to `http://localhost:3001/product/1`.

2.  **CDN Proxy (Edge)**:
    -   Intercepts request to `/product/1`.
    -   Extracts `keyId`.
    -   Fetches Public Key (JWK) from **Agent Registry** (`GET /keys/{keyId}`).
    -   Verifies Signature & Nonce using `@interledger/http-signature-utils`.
    -   *If Valid*: Forwards request to **Merchant Frontend** (`localhost:3000`).
    -   **Merchant Frontend** calls **Merchant Backend** (`/api/products/1`).
    -   **CDN Proxy** forwards API request.

## System Diagrams

### Active Runtime Flow

```mermaid
sequenceDiagram
    participant A as TAP Agent (Bun/TS)
    participant C as CDN Proxy (3001)
    participant R as Agent Registry (9002)
    participant F as Merchant Frontend (3000)
    participant B as Merchant Backend (8000)
    
    Note over A, R: Prerequisite: Keys provisioned via JWK
    
    rect rgba(0, 0, 0, 0)
    Note right of A: Authenticated View
    A->>A: Sign Request (@authority, @path)
    A->>C: GET /product/1 (Headers: Signature)
    C->>R: GET /keys/{keyId}
    R-->>C: 200 OK (Public Key JWK)
    C->>C: Verify Signature
    C->>F: Forward Request
    F->>B: GET /api/products/1
    B-->>F: Product Data
    F-->>A: Render Page
    end
```

## Internal Architecture

```mermaid
graph TD
    subgraph "Client Side"
        Agent["TAP Agent (Bun/TS)"]
        Agent -->|Generates Sig| Agent
    end

    subgraph "Infrastructure Layer"
        Proxy["CDN Proxy (Bun/TS) :3001"]
        Registry["Agent Registry (Bun/TS) :9002"]
        DB_Reg[(Registry DB)]
        
        Proxy -->|1. Fetch Key| Registry
        Registry --> DB_Reg
    end

    subgraph "Merchant System"
        Backend["Merchant Backend (Bun/TS) :8000"]
        Frontend["Merchant Frontend (VanJS) :3000"]
        
    end

    Agent -->|2. Signed Request| Proxy
    Proxy -->|3a. Proxy API| Backend
    Proxy -->|3b. Proxy UI| Frontend
```
