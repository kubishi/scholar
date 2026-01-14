// OpenAI API utilities for embeddings and chat

const EMBEDDING_MODEL = 'text-embedding-3-small';
const CHAT_MODEL = 'gpt-4o-mini';

interface EmbeddingResponse {
  data: Array<{
    embedding: number[];
    index: number;
  }>;
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

interface ChatResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

/**
 * Generate embedding vector for text using OpenAI API
 */
export async function getEmbedding(text: string, apiKey: string): Promise<number[]> {
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      input: text,
      model: EMBEDDING_MODEL,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI embedding failed: ${error}`);
  }

  const data = await response.json<EmbeddingResponse>();
  return data.data[0].embedding;
}

/**
 * Generate embeddings for multiple texts in batch
 */
export async function getEmbeddings(texts: string[], apiKey: string): Promise<number[][]> {
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      input: texts,
      model: EMBEDDING_MODEL,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI batch embedding failed: ${error}`);
  }

  const data = await response.json<EmbeddingResponse>();
  // Sort by index to maintain order
  return data.data
    .sort((a, b) => a.index - b.index)
    .map(item => item.embedding);
}

/**
 * Summarize PDF text for search optimization
 */
export async function getPdfSummary(text: string, apiKey: string): Promise<string> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: CHAT_MODEL,
      messages: [
        {
          role: 'system',
          content: 'You are a helpful assistant that summarizes academic papers. Extract the key topics, research areas, and methodologies mentioned.',
        },
        {
          role: 'user',
          content: `Please provide a concise 2-3 sentence summary of this paper, optimized for semantic search indexing. Focus on the main research topics and methodologies:\n\n${text.slice(0, 8000)}`,
        },
      ],
      max_tokens: 300,
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI chat failed: ${error}`);
  }

  const data = await response.json<ChatResponse>();
  return data.choices[0].message.content.trim();
}
