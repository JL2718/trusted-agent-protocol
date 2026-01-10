import forge from 'node-forge';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AuthorityService, CAKeyPair } from './interface';

export class CertificateAuthority implements AuthorityService {
    private caKey: forge.pki.PrivateKey;
    public caCert: forge.pki.Certificate;

    constructor(privateKeyPem: string, certificatePem: string) {
        this.caKey = forge.pki.privateKeyFromPem(privateKeyPem);
        this.caCert = forge.pki.certificateFromPem(certificatePem);
    }

    /**
     * Initializes the Authority, loading or generating the Root CA.
     * @param dataDir Directory where keys are stored.
     */
    static loadOrGenerate(dataDir: string): CertificateAuthority {
        const caKeyPath = join(dataDir, 'ca-key.pem');
        const caCertPath = join(dataDir, 'ca-cert.pem');

        if (!existsSync(dataDir)) {
            mkdirSync(dataDir, { recursive: true });
        }

        if (existsSync(caKeyPath) && existsSync(caCertPath)) {
            console.log("Loading existing Root CA...");
            return new CertificateAuthority(
                readFileSync(caKeyPath, 'utf-8'),
                readFileSync(caCertPath, 'utf-8')
            );
        }

        console.log("No Root CA found. Generating new one...");
        const { privateKey, certificate } = CertificateAuthority.generateRootCA();
        writeFileSync(caKeyPath, privateKey);
        writeFileSync(caCertPath, certificate);
        
        return new CertificateAuthority(privateKey, certificate);
    }

    /**
     * Generates a self-signed Root CA Certificate
     */
    private static generateRootCA(commonName: string = 'TAP Root CA'): CAKeyPair {
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

    // Interface Implementation
    getCaCert(): string {
        return forge.pki.certificateToPem(this.caCert);
    }

    signCsr(csrPem: string): string {
        return this.signCSR(csrPem);
    }
}
