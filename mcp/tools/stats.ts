import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getDb } from "../db.ts";

export function registerStatsTools(server: McpServer) {
  server.registerTool(
    "get_stats",
    {
      title: "Database stats",
      description: "Summary counts: conferences, users, and submitted conferences by status.",
      inputSchema: {},
    },
    async () => {
      const db = getDb();
      const conferences = db.prepare(`SELECT COUNT(*) as count FROM conferences`).get();
      const users = db.prepare(`SELECT COUNT(*) as count FROM users`).get();
      const submissionsByStatus = db
        .prepare(`SELECT status, COUNT(*) as count FROM submitted_conferences GROUP BY status`)
        .all();

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ conferences, users, submissionsByStatus }, null, 2),
          },
        ],
      };
    }
  );
}
