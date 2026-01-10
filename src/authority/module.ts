import { join } from 'node:path';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { CertificateAuthority } from './ca';

const DATA_DIR = join(import.meta.dir, '../../data/authority');
const CA_KEY_PATH = join(DATA_DIR, 'ca-key.pem');
const CA_CERT_PATH = join(DATA_DIR, 'ca-cert.pem');

// Ensure data dir exists
if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
}

export interface AuthorityService {
    stop: () => void;
}

export function startAuthority(port: number = 9003): AuthorityService {
    let ca: CertificateAuthority;

    // Load or Generate Root CA
    // For tests, maybe we want strict isolation, but file persistence is fine for now if ports differ?
    // We will use the same files for simplicity in this demo.
    if (existsSync(CA_KEY_PATH) && existsSync(CA_CERT_PATH)) {
        console.log("Loading existing Root CA...");
        ca = new CertificateAuthority(
            readFileSync(CA_KEY_PATH, 'utf-8'),
            readFileSync(CA_CERT_PATH, 'utf-8')
        );
    } else {
        console.log("No Root CA found. Generating new one...");
        const { privateKey, certificate } = CertificateAuthority.generateRootCA();
        writeFileSync(CA_KEY_PATH, privateKey);
        writeFileSync(CA_CERT_PATH, certificate);
        ca = new CertificateAuthority(privateKey, certificate);
    }

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

            // 1. Get Root CA Cert
            if (req.method === 'GET' && url.pathname === '/ca') {
                return new Response(JSON.stringify({
                    certificate: readFileSync(CA_CERT_PATH, 'utf-8')
                }), {
                    headers: { 'Content-Type': 'application/json', ...corsHeaders }
                });
            }

            // 2. Sign CSR
            if (req.method === 'POST' && url.pathname === '/sign') {
                try {
                    const body = await req.json() as any;
                    if (!body.csr) return new Response("Missing 'csr' field", { status: 400, headers: corsHeaders });

                    console.log("Received CSR signing request...");
                    const clientCert = ca.signCSR(body.csr);

                    return new Response(JSON.stringify({
                        certificate: clientCert,
                        caCertificate: readFileSync(CA_CERT_PATH, 'utf-8') // Send chain
                    }), {
                        headers: { 'Content-Type': 'application/json', ...corsHeaders }
                    });

                } catch (e: any) {
                    console.error("Signing Error:", e.message);
                    return new Response(`Error: ${e.message}`, { status: 500, headers: corsHeaders });
                }
            }

            return new Response("Not Found", { status: 404, headers: corsHeaders });
        }
    });

    console.log(`Authority running at http://localhost:${port}`);

    return {
        stop: () => server.stop()
    };
}

if (import.meta.main) {
    startAuthority();
}
