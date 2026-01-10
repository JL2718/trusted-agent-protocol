
import forge from 'node-forge';

console.log("Testing node-forge capabilities...");

try {
    console.log("\n--- Testing ECDSA (P-256) ---");
    const ecKeys = forge.pki.rsa.generateKeyPair(2048); // Placeholder, forge uses different API for EC
    // forge.pki.ed25519 is what we look for.
    // forge.pki.ecdsa ...?
    
    // Actually, let's just try to import and log what's available
    console.log("Keys on forge.pki:", Object.keys(forge.pki));
    if (forge.pki.ed25519) console.log("Ed25519 found on pki");
} catch (e) {
    console.error(e);
}

