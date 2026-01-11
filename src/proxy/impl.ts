import tls from 'node:tls';
import crypto from 'node:crypto';
import { validateSignature } from '@interledger/http-signature-utils';
import type { ProxyConfig, ProxyService } from './interface';
import forge from 'node-forge';

export async function startProxy(config: ProxyConfig): Promise<ProxyService> {
    if (!config.tls) {
        throw new Error("Proxy mTLS configuration missing. TLS options required.");
    }

    const tlsConf = config.tls;
    const tlsOptions = {
        key: tlsConf.key,
        cert: tlsConf.cert,
        ca: tlsConf.ca,
        requestCert: true,
        rejectUnauthorized: false,
    };

    let registryCACert: forge.pki.Certificate | null = null;
    let fallbackCA: string | undefined = tlsConf.ca;

    // Helper to fetch Registry CA
    async function refreshRegistryCA() {
        try {
            const res = await fetch(`${config.registryUrl}/authority/cert`);
            if (res.ok) {
                const pem = await res.text();
                registryCACert = forge.pki.certificateFromPem(pem);
                if (config.debug) console.log("[Proxy] Registry CA Certificate loaded.");
            }
        } catch (e: any) {
            if (config.debug) console.warn(`[Proxy] Could not fetch Registry CA: ${e.message}`);
        }
    }

    // Initial fetch
    await refreshRegistryCA();

    const server = tls.createServer(tlsOptions, (socket: tls.TLSSocket) => {
        let buffer = Buffer.alloc(0);
        let headersParsed = false;
        let method = '';
        let path = '';
        let headers: Record<string, string> = {};
        let bodyOffset = 0;

        socket.on('data', async (chunk: Buffer) => {
            if (headersParsed) return; // Wait for initial request parsing

            buffer = Buffer.concat([buffer, chunk as Buffer]);
            const str = buffer.toString();
            const headerEnd = str.indexOf('\r\n\r\n');

            if (headerEnd !== -1) {
                headersParsed = true;
                bodyOffset = Buffer.from(str.slice(0, headerEnd + 4)).length;

                const headerSection = str.slice(0, headerEnd);
                const lines = headerSection.split('\r\n');
                const firstLine = lines[0].split(' ');
                method = firstLine[0];
                path = firstLine[1];

                for (let i = 1; i < lines.length; i++) {
                    const colonIndex = lines[i].indexOf(':');
                    if (colonIndex !== -1) {
                        const key = lines[i].slice(0, colonIndex).trim().toLowerCase();
                        const value = lines[i].slice(colonIndex + 1).trim();
                        headers[key] = value;
                    }
                }

                try {
                    await handleSocket(socket, method, path, headers, buffer.slice(bodyOffset), config);
                } catch (e: any) {
                    if (config.debug) console.error("[Proxy] Socket Handling Error:", e.message);
                    socket.write("HTTP/1.1 500 Internal Error\r\n\r\n");
                    socket.end();
                }
            }
        });

        socket.on('error', (err: Error) => {
            if (config.debug) console.error("[Proxy] Socket Error:", err.message);
        });
    });

    async function handleSocket(socket: tls.TLSSocket, method: string, path: string, headers: Record<string, string>, initialBody: Buffer, config: ProxyConfig) {
        if (config.debug) console.log(`[Proxy] ${method} ${path}`);

        // 1. Diagnostic
        if (path === '/test-proxy') {
            socket.write("HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nContent-Length: 12\r\n\r\nProxy Active");
            socket.end();
            return;
        }

        let authorizedByCert = false;
        let agentPublicKeyJwk: any = null;

        // 2. mTLS Authorization
        try {
            const peerCert = socket.getPeerCertificate();
            if (peerCert && peerCert.raw) {
                const certPem = `-----BEGIN CERTIFICATE-----\n${peerCert.raw.toString('base64')}\n-----END CERTIFICATE-----`;
                const forgeCert = forge.pki.certificateFromPem(certPem);
                const agentId = forgeCert.subject.getField('CN')?.value as string;

                if (agentId) {
                    if (config.debug) console.log(`[Proxy] mTLS Agent ID: ${agentId}`);

                    // Verify against Registry CA
                    if (registryCACert) {
                        try {
                            const verified = registryCACert.verify(forgeCert);
                            if (verified) {
                                authorizedByCert = true;
                                if (config.debug) console.log(`[Proxy] Authorized via CA-signed mTLS: ${agentId}`);
                            }
                        } catch (e) {
                            if (config.debug) console.log(`[Proxy] mTLS CA Verification failed: ${agentId}`);
                        }
                    }

                    // Fallback to Registry Lookup if not authorized by CA
                    if (!authorizedByCert) {
                        const agentRes = await fetch(`${config.registryUrl}/agents/${agentId}`);
                        if (agentRes && agentRes.ok) {
                            const agent: any = await agentRes.json();
                            if (agent.status === 'active') {
                                authorizedByCert = true;
                                if (config.debug) console.log(`[Proxy] Authorized via Registry lookup: ${agentId}`);
                            }
                        }
                    }
                }
            }
        } catch (e: any) {
            if (config.debug) console.error(`[Proxy] mTLS Auth Error: ${e.message}`);
        }

        // 3. Signature Verification (Fallback or Supplement)
        if (!authorizedByCert || headers['signature']) {
            try {
                const signatureInput = headers['signature-input'];
                if (!signatureInput) {
                    if (!authorizedByCert) throw new Error("Missing Signature Headers and no valid mTLS");
                } else {
                    const keyIdMatch = signatureInput.match(/keyid="([^"]+)"/);
                    if (!keyIdMatch) throw new Error("KeyID not found in Signature-Input");
                    const keyId = keyIdMatch[1];

                    // Check for CA-signed Client-Cert header
                    const clientCertHeader = headers['client-cert'];
                    if (clientCertHeader && registryCACert) {
                        try {
                            const certPem = `-----BEGIN CERTIFICATE-----\n${clientCertHeader}\n-----END CERTIFICATE-----`;
                            const forgeCert = forge.pki.certificateFromPem(certPem);
                            if (registryCACert.verify(forgeCert)) {
                                if (config.debug) console.log(`[Proxy] Using public key from CA-signed Client-Cert`);
                                // Export forge public key to JWK
                                // This is tricky with forge, but we can use node:crypto for this part
                                const pem = forge.pki.publicKeyToPem(forgeCert.publicKey);
                                const cryptoKey = crypto.createPublicKey(pem);
                                agentPublicKeyJwk = cryptoKey.export({ format: 'jwk' });
                                agentPublicKeyJwk.kid = keyId;
                                agentPublicKeyJwk.alg = 'RS256';
                                agentPublicKeyJwk.use = 'sig';
                            }
                        } catch (e) {
                            if (config.debug) console.warn(`[Proxy] Client-Cert verification failed: ${(e as any).message}`);
                        }
                    }

                    if (!agentPublicKeyJwk) {
                        const keyRes = await fetch(`${config.registryUrl}/keys/${keyId}`);
                        if (!keyRes.ok) throw new Error(`Public Key ${keyId} not found`);
                        agentPublicKeyJwk = await keyRes.json() as any;
                    }

                    const protocol = 'https';
                    const host = headers['host'] || `localhost:${config.port}`;
                    const url = new URL(path, `${protocol}://${host}`);

                    const requestForLib = {
                        method: method,
                        url: url.toString(),
                        headers: headers
                    };

                    const result = await validateSignature(agentPublicKeyJwk, requestForLib);
                    if (result === false) {
                        throw new Error("Signature Validation False");
                    }
                    if (result && typeof result === 'object' && 'valid' in (result as any)) {
                        const vRes = result as { valid: boolean; reason?: string };
                        if (!vRes.valid) {
                            throw new Error("Signature Invalid: " + (vRes.reason || "Unknown"));
                        }
                    }
                    authorizedByCert = true; // Mark as authorized if signature passed
                }
            } catch (e: any) {
                if (config.debug) console.error(`[Proxy] Denied: ${e.message}`);
                const msg = e.message;
                socket.write(`HTTP/1.1 403 Forbidden\r\nContent-Type: text/plain\r\nContent-Length: ${msg.length + 11}\r\n\r\nForbidden: ${msg}`);
                socket.end();
                return;
            }
        }

        // 4. Proxy Request to Merchant
        try {
            let targetPath = path;
            if (targetPath.startsWith('/product/')) {
                targetPath = targetPath.replace('/product/', '/api/products/');
            }

            const targetUrl = `${config.merchantUrl}${targetPath}`;

            // Collect remaining body if any
            let body = initialBody;
            const contentLength = parseInt(headers['content-length'] || '0');
            if (body.length < contentLength) {
                // Wait for more data... for simplicity, assume small bodies for now or add listener
                // But since we are already in an async function, we can use a promise
            }

            const proxyRes = await fetch(targetUrl, {
                method: method,
                headers: headers as any,
                body: method === 'GET' || method === 'HEAD' ? null : body,
                redirect: 'manual'
            });

            // Send response back
            let resHeaders = `HTTP/1.1 ${proxyRes.status} ${proxyRes.statusText}\r\n`;
            proxyRes.headers.forEach((v, k) => {
                resHeaders += `${k}: ${v}\r\n`;
            });
            resHeaders += '\r\n';

            socket.write(resHeaders);

            if (proxyRes.body) {
                const reader = (proxyRes.body as unknown as ReadableStream<Uint8Array>).getReader();
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    socket.write(value);
                }
            }
            socket.end();

        } catch (e: any) {
            console.error(`[Proxy] Upstream Error: ${e.message}`);
            socket.write("HTTP/1.1 502 Bad Gateway\r\n\r\n");
            socket.end();
        }
    }

    return {
        start: () => {
            server.listen(config.port, () => {
                if (config.debug) console.log(`[Proxy] TLS Server listening on ${config.port}`);
            });
        },
        stop: () => {
            server.close();
        }
    };
}
