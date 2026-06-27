import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { z } from "zod";

const PORT = Number(process.env.PORT || 3000);
const N8N_BASE_URL = process.env.N8N_BASE_URL || "http://n8n:5678";
const N8N_API_KEY = process.env.N8N_API_KEY || "";
const AUTH_TOKEN = process.env.MCP_AUTH_TOKEN || "";

if (!AUTH_TOKEN || /^(choose-a-|change-me|replace-with-)/i.test(AUTH_TOKEN)) {
  console.error("MCP_AUTH_TOKEN must be configured with a non-placeholder secret");
  process.exit(1);
}

function jsonResponse(text) {
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { raw: text };
  }
}

async function n8nRequest(method, path, body) {
  if (!N8N_API_KEY) {
    throw new Error("N8N_API_KEY is required for the MCP server");
  }

  const response = await fetch(`${N8N_BASE_URL}/api/v1${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-N8N-API-KEY": N8N_API_KEY,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`n8n ${method} ${path} failed with ${response.status}: ${text}`);
  }

  return jsonResponse(text);
}

function createServer() {
  const server = new McpServer({ name: "diplomatic-expression-mcp", version: "1.0.0" });

  server.tool("list_workflows", "List workflows in n8n", {}, async () => {
    const data = await n8nRequest("GET", "/workflows?limit=100");
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  });

  server.tool("get_workflow", "Fetch a workflow by id", {
    id: z.string(),
  }, async ({ id }) => {
    const data = await n8nRequest("GET", `/workflows/${id}`);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  });

  server.tool("create_workflow", "Create a workflow", {
    name: z.string(),
    nodes: z.array(z.any()),
    connections: z.record(z.any()),
    settings: z.record(z.any()).optional(),
  }, async ({ name, nodes, connections, settings }) => {
    const data = await n8nRequest("POST", "/workflows", {
      name,
      nodes,
      connections,
      settings: settings ?? {},
    });
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  });

  server.tool("update_workflow", "Update a workflow", {
    id: z.string(),
    name: z.string().optional(),
    nodes: z.array(z.any()).optional(),
    connections: z.record(z.any()).optional(),
    settings: z.record(z.any()).optional(),
  }, async ({ id, ...updates }) => {
    const current = await n8nRequest("GET", `/workflows/${id}`);
    const payload = {
      name: updates.name ?? current.name,
      nodes: updates.nodes ?? current.nodes,
      connections: updates.connections ?? current.connections,
      settings: updates.settings ?? current.settings ?? {},
    };
    const data = await n8nRequest("PUT", `/workflows/${id}`, payload);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  });

  server.tool("activate_workflow", "Activate a workflow", {
    id: z.string(),
  }, async ({ id }) => {
    const data = await n8nRequest("POST", `/workflows/${id}/activate`);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  });

  server.tool("deactivate_workflow", "Deactivate a workflow", {
    id: z.string(),
  }, async ({ id }) => {
    const data = await n8nRequest("POST", `/workflows/${id}/deactivate`);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  });

  server.tool("delete_workflow", "Delete a workflow", {
    id: z.string(),
  }, async ({ id }) => {
    await n8nRequest("DELETE", `/workflows/${id}`);
    return { content: [{ type: "text", text: `Workflow ${id} deleted.` }] };
  });

  server.tool("list_executions", "List executions", {
    workflowId: z.string().optional(),
    limit: z.number().int().positive().max(1000).default(20),
  }, async ({ workflowId, limit }) => {
    const qs = new URLSearchParams({ limit: String(limit) });
    if (workflowId) qs.set("workflowId", workflowId);
    const data = await n8nRequest("GET", `/executions?${qs}`);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  });

  server.tool("get_execution", "Get an execution by id", {
    id: z.string(),
  }, async ({ id }) => {
    const data = await n8nRequest("GET", `/executions/${id}`);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  });

  return server;
}

const app = express();
const transports = new Map();
const asyncRoute = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "diplomatic-expression-mcp" });
});

app.get("/ready", asyncRoute(async (_req, res) => {
  if (!N8N_API_KEY) {
    return res.status(503).json({
      ok: false,
      status: "configuration_required",
      reason: "N8N_API_KEY is not configured",
    });
  }

  try {
    await n8nRequest("GET", "/workflows?limit=1");
    return res.json({ ok: true, status: "ready" });
  } catch (error) {
    console.error("MCP readiness check failed:", error);
    return res.status(503).json({
      ok: false,
      status: "n8n_unavailable",
      reason: "n8n API is unavailable or rejected the configured API key",
    });
  }
}));

app.use((req, res, next) => {
  if (!AUTH_TOKEN) return next();
  const header = req.get("authorization");
  if (header !== `Bearer ${AUTH_TOKEN}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
});

app.get("/sse", asyncRoute(async (req, res) => {
  const transport = new SSEServerTransport("/messages", res);
  transports.set(transport.sessionId, transport);

  res.on("close", () => {
    transports.delete(transport.sessionId);
  });

  await createServer().connect(transport);
}));

app.post("/messages", express.json(), asyncRoute(async (req, res) => {
  const sessionId = String(req.query.sessionId || "");
  const transport = transports.get(sessionId);
  if (!transport) {
    return res.status(404).send("Session not found");
  }

  await transport.handlePostMessage(req, res, req.body);
}));

app.use((error, _req, res, next) => {
  console.error("MCP request failed:", error);
  if (res.headersSent) return next(error);
  return res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`diplomatic-expression MCP server listening on ${PORT}`);
});

