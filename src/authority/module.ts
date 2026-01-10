import { join } from 'node:path';
import { CertificateAuthority } from './src';
import type { SignCsrRequest } from './interface';

// Default Data Directory
const DATA_DIR = join(import.meta.dir, '../../data/authority');

export function startAuthority(port: number = 9003, dataDir: string = DATA_DIR) {
    const ca = CertificateAuthority.loadOrGenerate(dataDir);

    console.log(`Authority Service starting on port ${port}...`);

    const server = Bun.serve({
        port: port,
        async fetch(req) {
            const url = new URL(req.url);

            // CORS Config
            const corsHeaders = {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type'
            };

            if (req.method === 'OPTIONS') {
                return new Response(null, { headers: corsHeaders });
            }

            try {
                // 1. Get Root CA Cert
                if (req.method === 'GET' && url.pathname === '/ca') {
                    return new Response(JSON.stringify({
                        certificate: ca.getCaCert()
                    }), {
                        headers: { 'Content-Type': 'application/json', ...corsHeaders }
                    });
                }

                // 2. Sign CSR
                if (req.method === 'POST' && url.pathname === '/sign') {
                    const body = await req.json() as SignCsrRequest;
                    if (!body.csr) return new Response("Missing 'csr' field", { status: 400, headers: corsHeaders });

                    console.log("Received CSR signing request...");
                    const clientCert = ca.signCsr(body.csr);

                    return new Response(JSON.stringify({
                        certificate: clientCert,
                        caCertificate: ca.getCaCert() // Send chain
                    }), {
                        headers: { 'Content-Type': 'application/json', ...corsHeaders }
                    });
                }
            } catch (e: any) {
                console.error("Authority Error:", e.message);
                return new Response(`Error: ${e.message}`, { status: 500, headers: corsHeaders });
            }

            return new Response("Not Found", { status: 404, headers: corsHeaders });
        }
    });

    console.log(`Authority running at http://localhost:${port}`);

    return server;
}

if (import.meta.main) {
    const port = parseInt(process.env.PORT || '9003');
    startAuthority(port);
}