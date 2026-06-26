import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getDb } from "../db.ts";
import { parseRankings } from "../../functions/lib/db.ts";

export function registerConferenceTools(server: McpServer) {
  server.registerTool(
    "search_conferences",
    {
      title: "Search conferences",
      description:
        "Full-text search over conference title, acronym, topics, city and country (FTS5 MATCH syntax).",
      inputSchema: {
        query: z.string().describe("FTS5 match query, e.g. 'machine learning' or 'NLP OR ACL'"),
        limit: z.number().int().min(1).max(50).default(10),
      },
    },
    async ({ query, limit }) => {
      const rows = getDb()
        .prepare(
          `
          SELECT c.*, GROUP_CONCAT(cr.ranking_source || ':' || cr.ranking_value) as rankings
          FROM conferences c
          LEFT JOIN conference_rankings cr ON c.id = cr.conference_id
          WHERE c.id IN (SELECT id FROM conferences_fts WHERE conferences_fts MATCH ?)
          GROUP BY c.id
          LIMIT ?
        `
        )
        .all(query, limit) as Array<Record<string, unknown>>;

      const results = rows.map((row) => ({
        ...row,
        core: parseRankings(row.rankings as string | null),
        rankings: undefined,
      }));

      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    }
  );

  server.registerTool(
    "get_conference",
    {
      title: "Get conference by ID",
      description: "Fetch a single conference record (with parsed CORE/ERA rankings) by its acronym/ID.",
      inputSchema: {
        id: z.string().describe("Conference ID, e.g. 'AAAI' or 'ACL'"),
      },
    },
    async ({ id }) => {
      const row = getDb()
        .prepare(
          `
          SELECT c.*, GROUP_CONCAT(cr.ranking_source || ':' || cr.ranking_value) as rankings
          FROM conferences c
          LEFT JOIN conference_rankings cr ON c.id = cr.conference_id
          WHERE c.id = ?
          GROUP BY c.id
        `
        )
        .get(id) as Record<string, unknown> | undefined;

      if (!row) {
        return { content: [{ type: "text", text: `No conference found with id "${id}"` }], isError: true };
      }

      const result = { ...row, core: parseRankings(row.rankings as string | null), rankings: undefined };
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );
}
