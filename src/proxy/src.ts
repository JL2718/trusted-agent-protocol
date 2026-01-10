import { validateSignature } from '@interledger/http-signature-utils';
import { createPublicKey } from 'node:crypto';
import forge from 'node-forge';
import type { ProxyConfig, ProxyService } from './interface';

export async function startProxy(config: ProxyConfig): Promise<ProxyService> {

    // 1. Fetch Root CA from Authority
    console.log(`[Proxy] Fetching Root CA from ${config.authorityUrl}...`);
    let rootCaCert: forge.pki.Certificate;

    try {
        const caRes = await fetch(`${config.authorityUrl}/ca`);
        if (!caRes.ok) throw new Error(`Failed to fetch Root CA: ${caRes.status}`);
        const caData = await caRes.json() as any;
        rootCaCert = forge.pki.certificateFromPem(caData.certificate);
        console.log(`[Proxy] Root CA Loaded. Subject: ${rootCaCert.subject.attributes.find(a => a.name === 'commonName')?.value}`);
    } catch (e: any) {
        console.error(`[Proxy] CRITICAL: Could not load Root CA: ${e.message}`);
        // For demo stability, we might want to retry or exit. 
        // We'll throw to fail fast.
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
                // RFC 9440: Client-Cert: :Base64:
                const clientCertHeader = req.headers.get('Client-Cert');
                if (!clientCertHeader) throw new Error("Missing Client-Cert Header");

                // Parse Byte Sequence format (colon wrapped)
                const b64 = clientCertHeader.replace(/^:/, '').replace(/:$/, '');
                const der = forge.util.decode64(b64);
                const asn1 = forge.asn1.fromDer(der);
                const clientCert = forge.pki.certificateFromAsn1(asn1);

                // B. Verify Certificate against Root CA
                // note: verify() checks signature. We also should check validity period.
                const verified = rootCaCert.verify(clientCert);
                if (!verified) throw new Error("Client Certificate validation failed (Signature Invalid)");

                const now = new Date();
                if (now < clientCert.validity.notBefore || now > clientCert.validity.notAfter) {
                    throw new Error("Client Certificate Expired or Not Yet Valid");
                }

                if (config.debug) console.log(`[Proxy] Client Cert Verified. Subject: ${clientCert.subject.getField('CN')?.value}`);

                // C. Extract Public Key for Signature Verification
                const publicKeyPem = forge.pki.publicKeyToPem(clientCert.publicKey as forge.pki.PublicKey);
                const cryptoKey = createPublicKey(publicKeyPem);
                const jwk = cryptoKey.export({ format: 'jwk' });
                Object.assign(jwk, { alg: 'PS512', use: 'sig' });

                // D. Verify HTTP Signature
                const requestForLib = {
                    method: req.method,
                    url: req.url,
                    headers: Object.fromEntries(req.headers.entries())
                };

                // Pass JWK directly
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
        start: () => { },
        stop: () => { server.stop(); }
    };
}
