import { RegistryServiceImpl } from "./src";
import { RegistryError } from "./interface";

export * from "./interface";
export * from "./src";

const service = new RegistryServiceImpl();

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
};

async function handleRequest(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    // CORS Preflight
    if (method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        // API Routes

        // GET /agents
        if (method === "GET" && path === "/agents") {
            const agents = await service.listAgents();
            return Response.json(agents, { headers: corsHeaders });
        }

        // POST /agents
        if (method === "POST" && path === "/agents") {
            const body = await req.json();
            const agent = await service.createAgent(body);
            return Response.json(agent, { status: 201, headers: corsHeaders });
        }

        // GET /keys/:kid (Global Lookup)
        // Match /keys/([^/]+)
        const keyMatch = path.match(/^\/keys\/([^\/]+)$/);
        if (method === "GET" && keyMatch) {
            const kid = keyMatch[1];
            const key = await service.getKey(kid);
            if (!key) return new Response("Key not found", { status: 404, headers: corsHeaders });
            return Response.json(key, { headers: corsHeaders });
        }

        // Agent Specific Routes
        // Match /agents/([^/]+)/...
        const agentMatch = path.match(/^\/agents\/([^\/]+)(.*)$/);
        if (agentMatch) {
            const agentId = agentMatch[1];
            const subPath = agentMatch[2];

            // GET /agents/:id
            if (method === "GET" && (subPath === "" || subPath === "/")) {
                const agent = await service.getAgent(agentId);
                if (!agent) return new Response("Agent not found", { status: 404, headers: corsHeaders });
                return Response.json(agent, { headers: corsHeaders });
            }

            // PUT /agents/:id
            if (method === "PUT" && (subPath === "" || subPath === "/")) {
                const updates = await req.json();
                const agent = await service.updateAgent(agentId, updates);
                return Response.json(agent, { headers: corsHeaders });
            }

            // DELETE /agents/:id
            if (method === "DELETE" && (subPath === "" || subPath === "/")) {
                await service.deleteAgent(agentId);
                return new Response(null, { status: 204, headers: corsHeaders });
            }

            // Keys Sub-resource
            // POST /agents/:id/keys
            if (method === "POST" && subPath === "/keys") {
                const body = await req.json();
                const key = await service.addKey(agentId, body);
                return Response.json(key, { status: 201, headers: corsHeaders });
            }

            // GET /agents/:id/keys/:kid
            const keySubMatch = subPath.match(/^\/keys\/([^\/]+)$/);
            if (method === "GET" && keySubMatch) {
                const kid = keySubMatch[1];
                // Validate it belongs to agent?
                const key = await service.getKey(kid);
                if (!key || key.agent_id !== agentId) {
                    return new Response("Key not found for agent", { status: 404, headers: corsHeaders });
                }
                return Response.json(key, { headers: corsHeaders });
            }

            // GET /agents/:id/keys (List keys - bonus)
            if (method === "GET" && subPath === "/keys") {
                const keys = await service.getAgentKeys(agentId);
                return Response.json(keys, { headers: corsHeaders });
            }
        }

        return new Response("Not Found", { status: 404, headers: corsHeaders });

    } catch (error) {
        console.error(error);
        if (error instanceof RegistryError) {
            return new Response(JSON.stringify({ error: error.message }), {
                status: error.status,
                headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
        }
        return new Response(JSON.stringify({ error: "Internal Server Error" }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
    }
}

if (import.meta.main) {
    const port = process.env.PORT || 3000;
    console.log(`Registry Service listening on port ${port}`);
    Bun.serve({
        port,
        fetch: handleRequest,
    });
}
