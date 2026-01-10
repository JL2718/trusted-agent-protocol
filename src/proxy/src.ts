import { validateSignature } from '@interledger/http-signature-utils';
import { X509Certificate } from 'node:crypto'; // Use Node's native X509 support for Verification
import type { ProxyConfig, ProxyService } from './interface';

export async function startProxy(config: ProxyConfig): Promise<ProxyService> {

    // 1. Fetch Root CA from Authority
    console.log(`[Proxy] Fetching Root CA from ${config.authorityUrl}...`);
    let rootCaCert: X509Certificate;

    try {
        const caRes = await fetch(`${config.authorityUrl}/ca`);
        if (!caRes.ok) throw new Error(`Failed to fetch Root CA: ${caRes.status}`);
        const caData = await caRes.json() as any;
        // Load Root CA
        rootCaCert = new X509Certificate(caData.certificate);
        console.log(`[Proxy] Root CA Loaded. Subject: ${rootCaCert.subject}`);
    } catch (e: any) {
        console.error(`[Proxy] CRITICAL: Could not load Root CA: ${e.message}`);
        throw e;
    }

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

            // 3. Signature & Certificate Verification
            try {
                // A. Extract Client Certificate Header
                const clientCertHeader = req.headers.get('Client-Cert');
                if (!clientCertHeader) throw new Error("Missing Client-Cert Header");

                // RFC 9440: :<Base64>:
                const b64 = clientCertHeader.replace(/^:/, '').replace(/:$/, '');
                const certPem = `-----BEGIN CERTIFICATE-----\n${b64}\n-----END CERTIFICATE-----`;
                
                const clientCert = new X509Certificate(certPem);

                // B. Verify Certificate against Root CA
                if (!clientCert.verify(rootCaCert.publicKey)) {
                     throw new Error("Client Certificate validation failed (Signature Invalid)");
                }

                if (!clientCert.checkValidityNow()) {
                    throw new Error("Client Certificate Expired or Not Yet Valid");
                }

                if (config.debug) console.log(`[Proxy] Client Cert Verified. Subject: ${clientCert.subject}`);

                // C. Extract Public Key for Signature Verification
                const cryptoKey = clientCert.publicKey;
                const jwk = cryptoKey.export({ format: 'jwk' });
                
                // Hint usage for signature utils
                Object.assign(jwk, { use: 'sig' });
                
                // D. Verify HTTP Signature
                const requestForLib = {
                    method: req.method,
                    url: req.url,
                    headers: Object.fromEntries(req.headers.entries())
                };

                const verificationResult = await validateSignature(jwk as any, requestForLib);

                if (!verificationResult || (typeof verificationResult === 'object' && 'valid' in verificationResult && !verificationResult.valid)) {
                    throw new Error("HTTP Signature Invalid");
                }

                if (config.debug) console.log(`[Proxy] Signature Verified!`);

            } catch (e: any) {
                if (config.debug) console.error(`[Proxy] Verification Error: ${e.message}`);
                return new Response("Forbidden: " + e.message, { status: 403 });
            }

            // 4. Proxy Request
            try {
                let targetPath = url.pathname;
                if (targetPath.startsWith('/product/')) {
                    targetPath = targetPath.replace('/product/', '/api/products/');
                }

                const targetUrl = `${config.merchantUrl}${targetPath}${url.search}`;

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
        start: () => { },
        stop: () => { server.stop(); }
    };
}
