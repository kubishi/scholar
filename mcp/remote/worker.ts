// Remote MCP server for kubishi-scholar, served over Streamable HTTP at /mcp.
// Backed by the real D1 database (binding "DB") via the existing query helpers
// in functions/lib/db.ts.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpAgent } from "agents/mcp";
import { registerConferenceTools } from "./tools/conferences.ts";
import { registerSubmissionTools } from "./tools/submissions.ts";
import { registerStatsTools } from "./tools/stats.ts";

export interface Env {
  DB: D1Database;
  ScholarMCP: DurableObjectNamespace;
}

export class ScholarMCP extends McpAgent<Env, {}, {}> {
  server = new McpServer({ name: "scholar-mcp", version: "1.0.0" });

  async init() {
    registerConferenceTools(this.server, this.env.DB);
    registerSubmissionTools(this.server, this.env.DB);
    registerStatsTools(this.server, this.env.DB);
  }
}

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/mcp")) {
      return ScholarMCP.serve("/mcp", { binding: "ScholarMCP" }).fetch(request, env, ctx);
    }

    return new Response("Not found", { status: 404 });
  },
};
