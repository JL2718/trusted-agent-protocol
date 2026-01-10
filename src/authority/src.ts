import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import forge from 'node-forge';
import type { AuthorityService } from './interface';

export class CertificateAuthority implements AuthorityService {
    
    private caCertPem: string;
    private caKey: forge.pki.PrivateKey;
    private caCert: forge.pki.Certificate;

    constructor(caKeyPem: string, caCertPem: string) {
        this.caCertPem = caCertPem;
        this.caKey = forge.pki.privateKeyFromPem(caKeyPem);
        this.caCert = forge.pki.certificateFromPem(caCertPem);
    }

    static async loadOrGenerate(dataDir: string): Promise<CertificateAuthority> {
        const caKeyPath = join(dataDir, 'ca-key.pem');
        const caCertPath = join(dataDir, 'ca-cert.pem');

        if (!existsSync(dataDir)) {
            mkdirSync(dataDir, { recursive: true });
        }

        if (existsSync(caKeyPath) && existsSync(caCertPath)) {
            // console.log("Loading existing Root CA...");
            return new CertificateAuthority(
                readFileSync(caKeyPath, 'utf-8'),
                readFileSync(caCertPath, 'utf-8')
            );
        }

        // console.log("No Root CA found. Generating new one...");
        
        // 1. Generate Key
        const keys = forge.pki.rsa.generateKeyPair(2048);

        // 2. Self-Sign Cert
        const cert = forge.pki.createCertificate();
        cert.publicKey = keys.publicKey;
        cert.serialNumber = '01';
        cert.validity.notBefore = new Date();
        cert.validity.notAfter = new Date();
        cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 10);
        
        const attrs = [{
            name: 'commonName',
            value: 'TAP Root CA'
        }, {
            name: 'countryName',
            value: 'US'
        }, {
            shortName: 'ST',
            value: 'Virginia'
        }, {
            name: 'localityName',
            value: 'Blacksburg'
        }, {
            name: 'organizationName',
            value: 'Test Org'
        }, {
            shortName: 'OU',
            value: 'Test'
        }];
        
        cert.setSubject(attrs);
        cert.setIssuer(attrs);
        
        cert.setExtensions([
            {
                name: 'basicConstraints',
                cA: true,
                critical: true
            },
            {
                name: 'keyUsage',
                keyCertSign: true,
                cRLSign: true,
                critical: true
            }
        ]);

        // Self-sign
        cert.sign(keys.privateKey, forge.md.sha256.create());

        const keyPem = forge.pki.privateKeyToPem(keys.privateKey);
        const certPem = forge.pki.certificateToPem(cert);

        writeFileSync(caKeyPath, keyPem);
        writeFileSync(caCertPath, certPem);
        
        return new CertificateAuthority(keyPem, certPem);
    }

    getCaCert(): string {
        return this.caCertPem;
    }

    async signCsr(csrPem: string): Promise<string> {
        const csr = forge.pki.certificationRequestFromPem(csrPem);
        
        if (!csr.verify()) {
            throw new Error("Invalid CSR Signature");
        }

        const cert = forge.pki.createCertificate();
        cert.serialNumber = Date.now().toString(); // Simple serial
        cert.publicKey = csr.publicKey;
        cert.validity.notBefore = new Date();
        cert.validity.notAfter = new Date();
        cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);
        
        cert.setSubject(csr.subject.attributes);
        cert.setIssuer(this.caCert.subject.attributes);
        
        cert.setExtensions([
            {
                name: 'basicConstraints',
                cA: false
            },
            {
                name: 'keyUsage',
                digitalSignature: true,
                nonRepudiation: true,
                keyEncipherment: true,
                critical: true
            },
            {
                name: 'extKeyUsage',
                clientAuth: true,
                serverAuth: true
            }
        ]);

        cert.sign(this.caKey, forge.md.sha256.create());

        return forge.pki.certificateToPem(cert);
    }
}
