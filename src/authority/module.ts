import forge from 'node-forge';
import type { IAuthorityService } from './interface';

export class AuthorityService implements IAuthorityService {
    private caCert: forge.pki.Certificate;
    private caKey: forge.pki.rsa.KeyPair;

    constructor() {
        const keys = forge.pki.rsa.generateKeyPair(2048);
        this.caKey = keys;

        const cert = forge.pki.createCertificate();
        cert.publicKey = keys.publicKey;
        cert.serialNumber = '01';
        cert.validity.notBefore = new Date();
        cert.validity.notAfter = new Date();
        cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 10);

        const attrs = [{
            name: 'commonName',
            value: 'Trusted Agent Protocol Root CA'
        }, {
            name: 'organizationName',
            value: 'TAP Registry'
        }];

        cert.setSubject(attrs);
        cert.setIssuer(attrs);
        cert.setExtensions([{
            name: 'basicConstraints',
            cA: true
        }, {
            name: 'keyUsage',
            keyCertSign: true,
            digitalSignature: true,
            nonRepudiation: true,
            keyEncipherment: true,
            dataEncipherment: true
        }]);

        cert.sign(keys.privateKey, forge.md.sha256.create());
        this.caCert = cert;
    }

    public getCACertificatePem(): string {
        return forge.pki.certificateToPem(this.caCert);
    }

    public signCSR(csrPem: string, agentId: string): string {
        try {
            const csr = forge.pki.certificationRequestFromPem(csrPem);

            if (!csr.verify()) {
                throw new Error("CSR signature verification failed");
            }

            const cert = forge.pki.createCertificate();
            cert.publicKey = csr.publicKey as forge.pki.PublicKey;
            cert.serialNumber = Math.floor(Math.random() * 1000000).toString();
            cert.validity.notBefore = new Date();
            cert.validity.notAfter = new Date();
            cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);

            const subject = [{
                name: 'commonName',
                value: agentId
            }];
            cert.setSubject(subject);
            cert.setIssuer(this.caCert.subject.attributes);

            cert.setExtensions([{
                name: 'basicConstraints',
                cA: false
            }, {
                name: 'keyUsage',
                digitalSignature: true,
                keyEncipherment: true
            }, {
                name: 'extKeyUsage',
                clientAuth: true
            }]);

            cert.sign(this.caKey.privateKey, forge.md.sha256.create());

            return forge.pki.certificateToPem(cert);
        } catch (e: any) {
            throw new Error(`Failed to sign CSR: ${e.message}`);
        }
    }
}

export function getAuthorityService(): IAuthorityService {
    return new AuthorityService();
}
