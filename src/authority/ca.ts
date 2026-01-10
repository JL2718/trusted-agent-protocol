import forge from 'node-forge';

export interface CAKeyPair {
    privateKey: string;
    certificate: string;
}

export class CertificateAuthority {
    private caKey: forge.pki.PrivateKey;
    public caCert: forge.pki.Certificate;

    constructor(privateKeyPem: string, certificatePem: string) {
        this.caKey = forge.pki.privateKeyFromPem(privateKeyPem);
        this.caCert = forge.pki.certificateFromPem(certificatePem);
    }

    /**
     * Generates a self-signed Root CA Certificate
     */
    static generateRootCA(commonName: string = 'TAP Root CA'): CAKeyPair {
        console.log("Generating Root CA Key Pair (2048-bit RSA)...");
        const keys = forge.pki.rsa.generateKeyPair(2048);

        console.log("Creating Root CA Certificate...");
        const cert = forge.pki.createCertificate();
        cert.publicKey = keys.publicKey;
        cert.serialNumber = '01';
        cert.validity.notBefore = new Date();
        cert.validity.notAfter = new Date();
        cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 10);

        const attrs = [{ name: 'commonName', value: commonName }];
        cert.setSubject(attrs);
        cert.setIssuer(attrs);

        cert.setExtensions([
            { name: 'basicConstraints', cA: true, critical: true },
            { name: 'keyUsage', keyCertSign: true, cRLSign: true, critical: true },
            { name: 'subjectKeyIdentifier' }
        ]);

        // Sign with own private key
        cert.sign(keys.privateKey, forge.md.sha256.create());

        return {
            privateKey: forge.pki.privateKeyToPem(keys.privateKey),
            certificate: forge.pki.certificateToPem(cert)
        };
    }

    /**
     * Signs a CSR and issues a Client Certificate
     */
    signCSR(csrPem: string): string {
        const csr = forge.pki.certificationRequestFromPem(csrPem);

        if (!csr.verify()) {
            throw new Error("CSR Signature verification failed");
        }

        const cert = forge.pki.createCertificate();
        cert.publicKey = csr.publicKey as forge.pki.PublicKey;
        // Simple serial number generation
        cert.serialNumber = Date.now().toString();

        cert.validity.notBefore = new Date();
        cert.validity.notAfter = new Date();
        cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);

        cert.setSubject(csr.subject.attributes);
        cert.setIssuer(this.caCert.subject.attributes);

        cert.setExtensions([
            { name: 'basicConstraints', cA: false },
            { name: 'keyUsage', digitalSignature: true, nonRepudiation: true, keyEncipherment: true },
            { name: 'extKeyUsage', clientAuth: true }
        ]);

        cert.sign(this.caKey as any, forge.md.sha256.create());

        return forge.pki.certificateToPem(cert);
    }
}
