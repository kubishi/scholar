import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getConferenceCount } from "../../../functions/lib/db.ts";

export function registerStatsTools(server: McpServer, db: D1Database) {
  server.registerTool(
    "get_stats",
    {
      title: "Database stats",
      description: "Summary counts: conferences, users, and submitted conferences by status.",
      inputSchema: {},
    },
    async () => {
      const conferences = await getConferenceCount(db);
      const users = await db.prepare("SELECT COUNT(*) as count FROM users").first<{ count: number }>();
      const submissionsByStatus = await db
        .prepare("SELECT status, COUNT(*) as count FROM submitted_conferences GROUP BY status")
        .all();

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { conferences, users, submissionsByStatus: submissionsByStatus.results },
              null,
              2
            ),
          },
        ],
      };
    }
  );
}
