
import type { Env, UserProfile, UserPaper } from './types';
import { get_user_profile, get_user_papers, get_scholarly_ids } from './db';
import { getEmbedding } from './openai';
import { upsertFullUserProfile } from './vectorize';


export async function fetchSemanticScholarProfile(authorId: string, env: Env): Promise<string[]> {
    const apiKey = env.SEMANTIC_SCHOLAR_API_KEY;
    try {
        const url = `https://api.semanticscholar.org/graph/v1/author/${encodeURIComponent(authorId)}?fields=name,url,papers,papers.abstract`;
        const res = await fetch(url, {
            headers: apiKey ? { 'x-api-key': apiKey } : {},
        });
        if (!res.ok) return [];
        const json = await res.json<{ papers?: Array<{ title?: string; abstract?: string }> }>();
        return (json.papers ?? [])
            .map(p => [p.title, p.abstract].filter(Boolean).join(': '))
            .filter(s => s.length > 0);
    } catch {
        return [];
    }
}

export async function fetchDBLPProfile(dblpId: string): Promise<string[]> {
    try {
        const url = `https://dblp.org/search/publ/api?q=${encodeURIComponent(dblpId)}&format=json`;
        const res = await fetch(url);
        if (!res.ok) return [];
        const json = await res.json<{ result?: { hits?: { hit?: Array<{ info?: { title?: string } }> } } }>();
        return (json.result?.hits?.hit ?? [])
            .map(h => h.info?.title ?? '')
            .filter(t => t.length > 0);
    } catch {
        return [];
    }
}

export function buildUserBlob(
  profile: UserProfile | null,
  papers: UserPaper[],
  semanticScholarProfile: string[],
  dblpProfile: string[]
): string {
  const parts: string[] = [];

  if (profile?.name)       parts.push(`Name: ${profile.name}`);
  if (profile?.university) parts.push(`University: ${profile.university}`);
  if (profile?.interests)  parts.push(`Interests: ${profile.interests}`);
  if (profile?.website)    parts.push(`Website: ${profile.website}`);
  if (profile?.github)     parts.push(`GitHub: ${profile.github}`);
  if (profile?.linkedin)   parts.push(`LinkedIn: ${profile.linkedin}`);
  if (profile?.orcid)      parts.push(`ORCID: ${profile.orcid}`);

  if (papers?.length)
    parts.push(`Research: ${papers.map(p => p.paper_summary).join('. ')}`);

  if (semanticScholarProfile?.length)
    parts.push(`Semantic Scholar Publications: ${semanticScholarProfile.join(', ')}`);

  if (dblpProfile?.length)
    parts.push(`DBLP Publications: ${dblpProfile.join(', ')}`);

  return parts.join('\n');
}

export async function rebuildUserVector(userId: string, env: Env): Promise<void> {
    try {
        const profile = await get_user_profile(env.DB, userId);
        console.log(`Rebuilding vector for user ${userId} with profile:`, profile);
        const papers = await get_user_papers(env.DB, userId);
        console.log(`User ${userId} has ${papers.length} papers`);
        const { semantic_scholar_id, dblp_id } = await get_scholarly_ids(env.DB, userId);
        const semanticScholarProfile = semantic_scholar_id ? await fetchSemanticScholarProfile(semantic_scholar_id, env) : [];
        const dblpProfile = dblp_id ? await fetchDBLPProfile(dblp_id) : [];
        const userBlob = buildUserBlob(profile, papers, semanticScholarProfile, dblpProfile);
        if (userBlob.trim().length < 50) return;

        const vector = await getEmbedding(userBlob, env.OPENAI_API_KEY);
        await upsertFullUserProfile(env, userId, vector, profile?.name ?? '', profile?.email ?? '', profile?.slug ?? '');
        console.log(`Rebuilt vector for user ${userId}`);
    } catch (err) {
        console.error('rebuildUserVector failed (non-fatal):', err);
    }
}
