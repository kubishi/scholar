import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getConferenceById, getConferencesByIds, lexicalSearch } from "../../../functions/lib/db.ts";

export function registerConferenceTools(server: McpServer, db: D1Database) {
  server.registerTool(
    "search_conferences",
    {
      title: "Search conferences",
      description: "Full-text search over conference title, acronym, topics, city and country.",
      inputSchema: {
        query: z.string().describe("Search query, e.g. 'machine learning' or 'NLP'"),
        limit: z.number().int().min(1).max(50).default(10),
      },
    },
    async ({ query, limit }) => {
      const hits = await lexicalSearch(db, query, limit);
      const results = await getConferencesByIds(db, hits.map((h) => h.id));
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
      const conf = await getConferenceById(db, id);
      if (!conf) {
        return { content: [{ type: "text", text: `No conference found with id "${id}"` }], isError: true };
      }
      return { content: [{ type: "text", text: JSON.stringify(conf, null, 2) }] };
    }
  );
}
