# Merchant Service Implementation Plan

## Goal
Implement a lightweight Merchant Service that serves a product API and a VanJS-based UI.

## Requirements
1.  **Runtime**: Bun.
2.  **Port**: 3000.
3.  **Data**: In-memory static product list.
4.  **UI**: VanJS (No physical .html files).
5.  **Endpoints**:
    *   `GET /`: Serve HTML with VanJS.
    *   `GET /api/products`: JSON list of products.
    *   `GET /api/products/:id`: JSON product details.

## Architecture
-   **Entry Point**: `module.ts`.
-   **Core Logic**: `src.ts` (API handlers + UI serving).
-   **Interfaces**: `interface.ts`.
-   **UI Logic**: `ui.ts` (Generates the HTML shell and Client-side VanJS code).
-   **Testing**: `test.ts` (API verification).

## Data Model
```typescript
interface Product {
  id: string;
  name: string;
  price: number;
  description: string;
}
```

## Steps
1.  Define `interface.ts` with `Product` and `MerchantConfig`.
2.  Create `ui.ts` to export a function returning the HTML string.
    *   Include VanJS from CDN.
    *   Include client-side script to fetch `/api/products` and render list.
3.  Implement `src.ts` with `Bun.serve`.
    *   Handle API routes.
    *   Handle Root route (serve UI).
4.  Write `test.ts` for API endpoints.
5.  Create `module.ts` entry point.
