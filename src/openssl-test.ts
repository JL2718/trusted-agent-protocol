
import { createPublicKey } from 'node:crypto';
import { readFileSync } from 'node:fs';

try {
    const certPem = readFileSync('cert.pem', 'utf-8');
    console.log("Cert loaded.");
    
    const key = createPublicKey(certPem);
    console.log("Key extracted via node:crypto:", key.asymmetricKeyType);
    
} catch (e) {
    console.error("Failed:", e);
}
