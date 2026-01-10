import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import forge from 'node-forge';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { CertificateAuthority } from './src';

const TEST_DIR = join(import.meta.dir, 'test-data');

describe("Authority Module", () => {
    
    beforeAll(() => {
        if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
    });

    afterAll(() => {
        if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
    });

    test("CertificateAuthority.loadOrGenerate creates new CA", () => {
        const ca = CertificateAuthority.loadOrGenerate(TEST_DIR);
        expect(ca).toBeDefined();
        expect(ca.getCaCert()).toContain("BEGIN CERTIFICATE");
        
        // Check if files were created
        expect(existsSync(join(TEST_DIR, 'ca-key.pem'))).toBe(true);
        expect(existsSync(join(TEST_DIR, 'ca-cert.pem'))).toBe(true);
    });

    test("CertificateAuthority loads existing CA", () => {
        const ca1 = CertificateAuthority.loadOrGenerate(TEST_DIR);
        const cert1 = ca1.getCaCert();

        const ca2 = CertificateAuthority.loadOrGenerate(TEST_DIR);
        const cert2 = ca2.getCaCert();

        expect(cert1).toEqual(cert2);
    });

    test("CertificateAuthority signs CSR", () => {
        const ca = CertificateAuthority.loadOrGenerate(TEST_DIR);

        // Generate a Key Pair and CSR for a client
        const keys = forge.pki.rsa.generateKeyPair(2048);
        const csr = forge.pki.createCertificationRequest();
        csr.publicKey = keys.publicKey;
        csr.setSubject([{ name: 'commonName', value: 'Test Agent' }]);
        csr.sign(keys.privateKey, forge.md.sha256.create());
        const csrPem = forge.pki.certificationRequestToPem(csr);

        // Sign it
        const certPem = ca.signCsr(csrPem);
        expect(certPem).toContain("BEGIN CERTIFICATE");

        // Verify the signed cert
        const cert = forge.pki.certificateFromPem(certPem);
        const caCert = forge.pki.certificateFromPem(ca.getCaCert());

        expect(caCert.verify(cert)).toBe(true);
        expect(cert.subject.getField('CN').value).toBe('Test Agent');
    });
});
