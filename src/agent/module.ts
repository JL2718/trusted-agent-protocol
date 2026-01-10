import { Agent } from './src';

// Environment
const PROXY_URL = process.env.CDN_PROXY_URL || "http://localhost:3001";
const AUTHORITY_URL = process.env.AUTHORITY_URL || "http://localhost:9003";
const DEBUG = process.env.DEBUG === "true";

async function main() {
    console.log("=== TAP Agent Demo ===");
    console.log(`Proxy: ${PROXY_URL}`);
    console.log(`Authority: ${AUTHORITY_URL}`);

    const agent = new Agent({
        name: "Demo Agent " + Math.floor(Math.random() * 1000),
        proxyUrl: PROXY_URL,
        authorityUrl: AUTHORITY_URL,
        debug: DEBUG
    });

    try {
        // 1. Setup
        console.log("\n1. Generating Identity...");
        agent.generateKey();

        // 2. Register
        console.log("\n2. Onboarding with Authority...");
        await agent.register();

        // 3. Authenticated Request
        console.log("\n3. Accessing Secured Resource via Proxy...");
        const path = "/product/1";
        const res = await agent.fetch(path);

        console.log(`Response Status: ${res.status} ${res.statusText}`);

        if (res.ok) {
            const data = await res.json();
            console.log("\nSUCCESS! Secured Data Received:");
            console.log(JSON.stringify(data, null, 2));
        } else {
            console.error("\nFAILED! Response Body:");
            console.error(await res.text());
        }

    } catch (e: any) {
        console.error("\nERROR:", e.message);
        process.exit(1);
    }
}

main();