#!/bin/bash

# Generate RSA keys
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out rsa_private.pem
openssl rsa -pubout -in rsa_private.pem -out rsa_public.pem

# Format RSA keys for .env (single line with \n)
RSA_PRIVATE_KEY=$(awk '{printf "%s\\n", $0}' rsa_private.pem | sed 's/\\n$//')
RSA_PUBLIC_KEY=$(awk '{printf "%s\\n", $0}' rsa_public.pem | sed 's/\\n$//')

# Generate Ed25519 keys
openssl genpkey -algorithm Ed25519 -out ed_private.pem
ED25519_PRIVATE_KEY=$(openssl pkey -in ed_private.pem -outform DER | tail -c 32 | base64)
ED25519_PUBLIC_KEY=$(openssl pkey -in ed_private.pem -pubout -outform DER | tail -c 32 | base64)

# Append to .env
cat << EOF >> .env

# RSA Keys (for RSA-PSS-SHA256 signatures)
RSA_PRIVATE_KEY="$RSA_PRIVATE_KEY"
RSA_PUBLIC_KEY="$RSA_PUBLIC_KEY"

# Ed25519 Keys (for Ed25519 signatures)
ED25519_PRIVATE_KEY="$ED25519_PRIVATE_KEY"
ED25519_PUBLIC_KEY="$ED25519_PUBLIC_KEY"
EOF

# Cleanup
rm rsa_private.pem rsa_public.pem ed_private.pem

echo "Keys generated and appended to .env"
