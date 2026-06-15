import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const STATUSES = ["waiting", "approved", "submitted", "rejected"] as const;

export function registerSubmissionTools(server: McpServer, db: D1Database) {
  server.registerTool(
    "list_submissions",
    {
      title: "List submitted conferences",
      description: "List user-submitted conferences (new or edits), optionally filtered by status.",
      inputSchema: {
        status: z.enum(STATUSES).optional().describe("Filter by status; omit to list all"),
        limit: z.number().int().min(1).max(100).default(20),
      },
    },
    async ({ status, limit }) => {
      const stmt = status
        ? db
            .prepare("SELECT * FROM submitted_conferences WHERE status = ? ORDER BY submitted_at DESC LIMIT ?")
            .bind(status, limit)
        : db.prepare("SELECT * FROM submitted_conferences ORDER BY submitted_at DESC LIMIT ?").bind(limit);

      const { results } = await stmt.all();
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    }
  );
}
