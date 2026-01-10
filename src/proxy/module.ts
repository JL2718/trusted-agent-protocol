import { startProxy } from './src';

// Environment Variables with Defaults
const PORT = parseInt(process.env.PORT || "3001");
const MERCHANT_URL = process.env.MERCHANT_BACKEND_URL || "http://localhost:3000";
const REGISTRY_URL = process.env.AGENT_REGISTRY_URL || "http://localhost:9002";
const DEBUG = process.env.DEBUG === "true";

console.log(`Starting CDN Proxy on port ${PORT}...`);
console.log(`Merchant URL: ${MERCHANT_URL}`);
console.log(`Registry URL: ${REGISTRY_URL}`);

startProxy({
    port: PORT,
    merchantUrl: MERCHANT_URL,
    registryUrl: REGISTRY_URL,
    debug: DEBUG
}).then(() => {
    console.log(`CDN Proxy listening on http://localhost:${PORT}`);
}).catch(err => {
    console.error("Failed to start proxy:", err);
    process.exit(1);
});
