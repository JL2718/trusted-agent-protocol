# Authority Submodule Plan

This submodule provides the Certificate Authority (CA) functionality for the Trusted Agent Protocol (TAP) Registry.

## Responsibilities
- **Root CA Management**: Generates and maintains the Root Certificate for the registry.
- **CSR Signing**: Processes Certificate Signing Requests (CSRs) from agents and issues X.509 certificates.
- **Public Key Distribution**: Exposes the Root CA certificate for public consumption.

## Interface
The `IAuthorityService` defines the core operations:
- `getCACertificatePem()`: Returns the CA certificate in PEM format.
- `signCSR(csrPem: string, agentId: string)`: Signs an agent's CSR.

## Implementation Details
- Uses `node-forge` for all cryptographic operations.
- Currently maintains CA state in-memory (to be persisted in production).
- Follows standard PKCS#10 and X.509 formats.
