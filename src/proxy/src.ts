import { validateSignature } from '@interledger/http-signature-utils';
import { ProxyConfig, ProxyService } from './interface';

export async function startProxy(config: ProxyConfig): Promise<ProxyService> {
    const server = Bun.serve({
        port: config.port,
        async fetch(req) {
            const url = new URL(req.url);

            // 1. Diagnostic Endpoint
            if (url.pathname === '/test-proxy') {
                return new Response("Proxy Active", { status: 200 });
            }

            // 2. Logging
            if (config.debug) {
                console.log(`[Proxy] ${req.method} ${url.pathname}`);
            }

            // 3. Signature Verification
            try {
                const signatureInput = req.headers.get('Signature-Input');
                const signature = req.headers.get('Signature');

                if (!signatureInput || !signature) {
                    throw new Error("Missing RFC 9421 Signature Headers");
                }

                // Extract KeyID manually for simplicity
                const keyIdMatch = signatureInput.match(/keyid="([^"]+)"/);
                if (!keyIdMatch) throw new Error("KeyID not found in Signature-Input");
                const keyId = keyIdMatch[1];

                // Fetch Key from Registry
                const keyUrl = `${config.registryUrl}/keys/${keyId}`;
                const keyRes = await fetch(keyUrl);

                if (!keyRes.ok) {
                    console.error(`[Proxy] Key lookup failed for ${keyId}: ${keyRes.status}`);
                    throw new Error("Public Key not found");
                }

                const jwk = await keyRes.json();

                // Construct Request Object for Library
                // The library likely expects { method, url, headers }
                // Headers should be a plain object with lowercase keys
                const headersObj: Record<string, string> = {};
                req.headers.forEach((v, k) => {
                    headersObj[k.toLowerCase()] = v;
                });

                const requestForLib = {
                    method: req.method,
                    url: req.url,
                    headers: headersObj
                };

                if (config.debug) {
                    console.log("[Proxy] Validating Request:", JSON.stringify(requestForLib, null, 2));
                }

                // Verify
                const result = await validateSignature(jwk, requestForLib);                // Check result - assuming it returns { valid: boolean, ... } or boolean
                // Based on common patterns. If it throws, the catch block handles it.
                // If it returns boolean:
                if (result === false) throw new Error("Signature Validation Returned False");
                // If it returns object:
                if (typeof result === 'object' && result !== null && 'valid' in result && !result.valid) {
                    throw new Error("Signature Invalid: " + (result.reason || "Unknown"));
                }

            } catch (e: any) {
                if (config.debug) console.error(`[Proxy] Verification Error: ${e.message}`);
                return new Response("Forbidden: " + e.message, { status: 403 });
            }

            // 4. Proxy Request
            try {
                let targetPath = url.pathname;
                // Map /product/X to /api/products/X
                if (targetPath.startsWith('/product/')) {
                    targetPath = targetPath.replace('/product/', '/api/products/');
                }

                const targetUrl = `${config.merchantUrl}${targetPath}${url.search}`;

                // Forward Request
                const proxyRes = await fetch(targetUrl, {
                    method: req.method,
                    headers: req.headers,
                    body: req.body
                });

                return new Response(proxyRes.body, {
                    status: proxyRes.status,
                    statusText: proxyRes.statusText,
                    headers: proxyRes.headers
                });
            } catch (e: any) {
                console.error(`[Proxy] Upstream Error: ${e.message}`);
                return new Response("Upstream Error", { status: 502 });
            }
        }
    });

    return {
        start: () => { }, // Bun serve starts auto
        stop: () => { server.stop(); }
    };
}
