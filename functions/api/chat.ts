import type { Env, AuthContext } from '../lib/types';
import { get_user_profile, get_user_papers, getUserFavorites, getConferencesByIds, get_scholarly_ids } from '../lib/db';
import { vectorSearch } from '../lib/vectorize';
import { getEmbedding } from '../lib/openai';
import { buildUserBlob } from '../lib/buildUserVector';
import { fetchSemanticScholarProfile, fetchDBLPProfile } from '../lib/buildUserVector';

type PagesFunction<E = Env> = (
  context: EventContext<E, string, AuthContext>
) => Response | Promise<Response>;

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'search_venues',
      description: 'Search the conference database for venues relevant to a research topic or query.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Research topic or natural language query' },
          topK: { type: 'integer', description: 'Number of results (default 5)' }
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

  // Pre-load all user context upfront
  const [profile, papers, favoriteIds, scholarlyIds] = await Promise.all([
    get_user_profile(env.DB, user.id),
    get_user_papers(env.DB, user.id),
    getUserFavorites(env.DB, user.id),
    get_scholarly_ids(env.DB, user.id),
  ]);

  const [semanticScholarProfile, dblpProfile, favoriteConferences] = await Promise.all([
    scholarlyIds.semantic_scholar_id ? fetchSemanticScholarProfile(scholarlyIds.semantic_scholar_id, env) : Promise.resolve([]),
    scholarlyIds.dblp_id ? fetchDBLPProfile(scholarlyIds.dblp_id) : Promise.resolve([]),
    favoriteIds.length ? getConferencesByIds(env.DB, favoriteIds) : Promise.resolve([]),
  ]);

  const userBlob = buildUserBlob(profile, papers, semanticScholarProfile, dblpProfile);
  const favoritesBlob = favoriteConferences.map(c => `${c.title} (${c.acronym})`).join(', ');



  const systemPrompt = `You are a helpful assistant that helps academics find the right conferences for their research.
    Here is the user's research profile:
    ${userBlob}
    ${favoritesBlob ? `Conferences they have favorited: ${favoritesBlob}` : ''}
    Use search_venues to find relevant conferences when needed. Be concise and specific.`;

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

    const data = await response.json() as any;
    const choice = data.choices[0];

    if (choice.finish_reason === 'stop') {
      return Response.json({ ok: true, reply: choice.message.content });
    }

    if (choice.finish_reason === 'tool_calls') {
      messages.push(choice.message);

      for (const toolCall of choice.message.tool_calls) {
        const args = JSON.parse(toolCall.function.arguments);
        const vector = await getEmbedding(args.query, env.OPENAI_API_KEY);
        const vecResults = await vectorSearch(env, vector, args.topK ?? 5);
        const conferences = await getConferencesByIds(env.DB, vecResults.map(r => r.id));

        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(conferences),
        });
      }
    }
  }

  return Response.json({ ok: false, error: 'Could not make a response for you. Try something else.' }, { status: 500 });
};
