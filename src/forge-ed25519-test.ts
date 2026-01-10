
import forge from 'node-forge';

console.log("--- Testing Ed25519 Flow ---");

try {
    // 1. Generate Keys
    const keys = forge.pki.ed25519.generateKeyPair();
    console.log("Ed25519 Keys generated.");
    
    // 2. Create CSR
    // Note: Standard forge.pki.createCertificationRequest usually expects RSA/RSA-like objects.
    // We might need to manually construct the CSR for Ed25519 if the helper doesn't support it.
    
    const csr = forge.pki.createCertificationRequest();
    csr.publicKey = keys.publicKey;
    csr.setSubject([{ name: 'commonName', value: 'Ed25519 Test' }]);
    
    // Signing CSR with Ed25519 private key?
    // csr.sign(keys.privateKey) might fail if it defaults to RSA/SHA
    try {
        csr.sign(keys.privateKey); 
        console.log("CSR Signed.");
    } catch (e) {
        console.log("CSR Sign Failed (expected if not supported natively):", e.message);
        // If fail, we might need to manually sign or look for specific Ed25519 support in signature
    }
    
    // 3. CA Cert (RSA for now, as Authority is RSA)
    const caKeys = forge.pki.rsa.generateKeyPair(2048);
    const caCert = forge.pki.createCertificate();
    caCert.publicKey = caKeys.publicKey;
    caCert.sign(caKeys.privateKey);
    console.log("CA generated.");

    // 4. Sign CSR to Client Cert
    // If CSR creation failed, this step is moot, but let's see if we can construct a cert manually with the public key
    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = '01';
    cert.setSubject([{ name: 'commonName', value: 'Ed25519 Test' }]);
    cert.setIssuer(caCert.subject.attributes);
    
    // Sign with RSA CA
    cert.sign(caKeys.privateKey);
    console.log("Client Cert Signed by RSA CA.");
    
    const pem = forge.pki.certificateToPem(cert);
    console.log("PEM Generated:\n", pem);
    
} catch (e) {
    console.error("Test Failed:", e);
}
