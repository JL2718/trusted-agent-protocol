import { MerchantConfig, MerchantService, Product } from './interface';
import { renderHomePage } from './ui';

// In-memory data
const PRODUCTS: Product[] = [
    { id: "1", name: "Premium Coffee", price: 12.99, description: "Ethically sourced, medium roast." },
    { id: "2", name: "Wireless Headphones", price: 89.99, description: "Noise cancelling with long battery life." },
    { id: "3", name: "Ergonomic Mouse", price: 45.00, description: "Reduces strain during long work sessions." },
    { id: "4", name: "Mechanical Keyboard", price: 120.50, description: "Tactile switches for satisfying typing." }
];

export function startMerchant(config: MerchantConfig): MerchantService {
    const server = Bun.serve({
        port: config.port,
        async fetch(req) {
            const url = new URL(req.url);

            // Logging
            if (config.debug) {
                console.log(`[Merchant] ${req.method} ${url.pathname}`);
            }

            // API: List Products
            if (url.pathname === '/api/products' && req.method === 'GET') {
                return new Response(JSON.stringify(PRODUCTS), {
                    headers: { "Content-Type": "application/json" }
                });
            }

            // API: Get Product Detail
            // Match /api/products/:id
            const productMatch = url.pathname.match(/^\/api\/products\/([^\/]+)$/);
            if (productMatch && req.method === 'GET') {
                const id = productMatch[1];
                const product = PRODUCTS.find(p => p.id === id);

                if (product) {
                    return new Response(JSON.stringify(product), {
                        headers: { "Content-Type": "application/json" }
                    });
                } else {
                    return new Response(JSON.stringify({ error: "Product not found" }), {
                        status: 404,
                        headers: { "Content-Type": "application/json" }
                    });
                }
            }

            // UI: Home Page
            if (url.pathname === '/' || url.pathname === '/index.html') {
                return new Response(renderHomePage(), {
                    headers: { "Content-Type": "text/html" }
                });
            }

            // Default 404
            return new Response("Not Found", { status: 404 });
        }
    });

    return {
        start: () => { },
        stop: () => server.stop()
    };
}
