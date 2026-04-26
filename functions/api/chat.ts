import type { Env, AuthContext } from '../lib/types';
import { get_user_profile, get_user_papers, getUserFavorites, getConferencesByIds, get_scholarly_ids } from '../lib/db';
import { vectorSearch } from '../lib/vectorize';
import { getEmbedding } from '../lib/openai';
import { fetchSemanticScholarProfile, fetchDBLPProfile } from '../lib/buildUserVector';

type PagesFunction<E = Env> = (
  context: EventContext<E, string, AuthContext>
) => Response | Promise<Response>;

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'get_profile',
      description: "Get the user's research profile including name, university, interests.",
      parameters: { type: 'object', properties: {}, required: [] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_papers',
      description: "Get the user's uploaded research paper summaries.",
      parameters: { type: 'object', properties: {}, required: [] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_favorites',
      description: "Get conferences the user has favorited.",
      parameters: { type: 'object', properties: {}, required: [] }
    }
  },
  {
  type: 'function',
  function: {
    name: 'get_publications',
    description: "Get the user's publications from Semantic Scholar and DBLP.",
    parameters: { type: 'object', properties: {}, required: [] }
  }
  },
  {
    type: 'function',
    function: {
      name: 'search_venues',
      description: 'Search the conference database for venues relevant to a research topic.', // Ok so this allows the ai model to modify your query so that it may make its own optimizations to what user wants
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          topK: { type: 'integer' }
        },
        required: ['query']
      }
    }
  }
];


export const onRequestPost: PagesFunction = async (context) => {
  const { env, data, request } = context;
  const user = data.user;

  if (!user) return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const { message } = await request.json() as { message: string };
  if (!message?.trim()) return Response.json({ ok: false, error: 'No message provided' }, { status: 400 });

  const systemPrompt = `You are a helpful assistant that helps academics find the right conferences for their research.
    Use your tools to get the user's profile, papers, publications, and favorites as needed.
    Use search_venues to find relevant conferences. Be concise and specific.`;

  const messages: any[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: message },
  ];

  // Agentic loop (max 5 iterations)
  for (let i = 0; i < 5; i++) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-4o-mini', messages, tools: TOOLS, tool_choice: 'auto', max_tokens: 800 }),
    });

    const completion = await response.json() as any;
    const choice = completion.choices[0];

    if (choice.finish_reason === 'stop') {
      return Response.json({ ok: true, reply: choice.message.content });
    }

    if (choice.finish_reason === 'tool_calls') {
      messages.push(choice.message);
      console.log(`[chat] iteration ${i} tool_calls:`, choice.message.tool_calls.map((t: any) => t.function.name));

      for (const toolCall of choice.message.tool_calls) {
        let result = '';

        if (toolCall.function.name === 'get_profile') {
          const profile = await get_user_profile(env.DB, user.id);
          result = JSON.stringify(profile);

        } else if (toolCall.function.name === 'get_papers') {
          const papers = await get_user_papers(env.DB, user.id);
          result = JSON.stringify(papers);

        } else if (toolCall.function.name === 'get_favorites') {
          const ids = await getUserFavorites(env.DB, user.id);
          const confs = await getConferencesByIds(env.DB, ids);
          result = JSON.stringify(confs);

        } else if (toolCall.function.name === 'get_publications') {
          const { semantic_scholar_id, dblp_id } = await get_scholarly_ids(env.DB, user.id);

          const [ssProfile, dblpProfile] = await Promise.all([
            semantic_scholar_id ? fetchSemanticScholarProfile(semantic_scholar_id, env) : Promise.resolve([]),
            dblp_id ? fetchDBLPProfile(dblp_id) : Promise.resolve([]),
          ]);

          result = JSON.stringify({ semantic_scholar: ssProfile, dblp: dblpProfile });

        } else if (toolCall.function.name === 'search_venues') {
          const args = JSON.parse(toolCall.function.arguments);
          const vector = await getEmbedding(args.query, env.OPENAI_API_KEY);
          const vecResults = await vectorSearch(env, vector, args.topK ?? 5);
          result = JSON.stringify(await getConferencesByIds(env.DB, vecResults.map(r => r.id)));
        }

        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: result,
        });
      }
    }
  }

  return Response.json({ ok: false, error: 'Could not make a response for you. Try something else.' }, { status: 500 });
};
