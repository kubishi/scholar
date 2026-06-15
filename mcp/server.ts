#!/usr/bin/env npx tsx
// MCP server exposing read-only access to the local kubishi-scholar D1 database.
// Run via: npx tsx mcp/server.ts (registered with Claude Code in .mcp.json)

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerConferenceTools } from "./tools/conferences.ts";
import { registerSubmissionTools } from "./tools/submissions.ts";
import { registerStatsTools } from "./tools/stats.ts";

const server = new McpServer({ name: "scholar-mcp", version: "1.0.0" });

registerConferenceTools(server);
registerSubmissionTools(server);
registerStatsTools(server);

const transport = new StdioServerTransport();
await server.connect(transport);
