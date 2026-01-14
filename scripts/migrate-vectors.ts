/**
 * MongoDB Vectors to Cloudflare Vectorize Migration Script
 *
 * This script migrates vector embeddings from MongoDB to Cloudflare Vectorize.
 * Run with: npx tsx scripts/migrate-vectors.ts
 *
 * Required environment variables:
 * - MONGO_URI: MongoDB connection string
 * - CLOUDFLARE_ACCOUNT_ID: Your Cloudflare account ID
 * - CLOUDFLARE_API_TOKEN: API token with Vectorize write access
 * - VECTORIZE_INDEX_NAME: The Vectorize index name (default: kubishi-conferences)
 */

import { MongoClient } from 'mongodb';

const MONGO_URI = process.env.MONGO_URI!;
const CLOUDFLARE_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID!;
const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN!;
const VECTORIZE_INDEX_NAME = process.env.VECTORIZE_INDEX_NAME || 'kubishi-conferences';

if (!MONGO_URI || !CLOUDFLARE_ACCOUNT_ID || !CLOUDFLARE_API_TOKEN) {
  console.error('Missing required environment variables');
  console.error('Required: MONGO_URI, CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN');
  process.exit(1);
}

interface MongoConference {
  _id: string;
  title?: string;
  acronym?: string;
  city?: string;
  country?: string;
  deadline?: string;
  start?: string;
  end?: string;
  embedding?: number[];
}

interface VectorizeVector {
  id: string;
  values: number[];
  metadata: {
    id: string;
    title: string;
    acronym: string;
    city?: string;
    country?: string;
    deadline?: string;
    start_date?: string;
    end_date?: string;
  };
}

/**
 * Upsert vectors to Cloudflare Vectorize
 */
async function upsertVectors(vectors: VectorizeVector[]): Promise<void> {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/vectorize/v2/indexes/${VECTORIZE_INDEX_NAME}/upsert`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CLOUDFLARE_API_TOKEN}`,
        'Content-Type': 'application/x-ndjson',
      },
      body: vectors.map(v => JSON.stringify(v)).join('\n'),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Vectorize upsert failed: ${error}`);
  }

  const result = await response.json();
  if (!result.success) {
    throw new Error(`Vectorize error: ${JSON.stringify(result.errors)}`);
  }
}

/**
 * Main migration function
 */
async function main() {
  console.log('🚀 Starting vector migration to Cloudflare Vectorize...\n');
  console.log(`📍 Target index: ${VECTORIZE_INDEX_NAME}\n`);

  const client = new MongoClient(MONGO_URI);

  try {
    await client.connect();
    console.log('✅ Connected to MongoDB\n');

    const collection = client.db('kubishi-scholar').collection<MongoConference>('conferences');

    // Find all documents with embeddings
    const conferences = await collection
      .find({ embedding: { $exists: true, $ne: null } })
      .toArray();

    console.log(`Found ${conferences.length} conferences with embeddings\n`);

    if (conferences.length === 0) {
      console.log('No embeddings to migrate.');
      return;
    }

    // Check embedding dimensions
    const sampleEmbedding = conferences[0].embedding;
    console.log(`📐 Embedding dimensions: ${sampleEmbedding?.length || 'unknown'}\n`);

    // Batch upsert (Vectorize supports up to 1000 vectors per request)
    const batchSize = 100; // Using smaller batches for stability
    let migrated = 0;
    let failed = 0;

    for (let i = 0; i < conferences.length; i += batchSize) {
      const batch = conferences.slice(i, i + batchSize);

      const vectors: VectorizeVector[] = batch
        .filter(conf => conf.embedding && conf.embedding.length > 0)
        .map(conf => ({
          id: conf._id,
          values: conf.embedding!,
          metadata: {
            id: conf._id,
            title: conf.title || conf._id,
            acronym: conf.acronym || conf._id,
            city: conf.city,
            country: conf.country,
            deadline: conf.deadline,
            start_date: conf.start,
            end_date: conf.end,
          },
        }));

      if (vectors.length === 0) continue;

      try {
        await upsertVectors(vectors);
        migrated += vectors.length;
        console.log(`  ✅ Migrated ${migrated}/${conferences.length} vectors`);
      } catch (error) {
        failed += vectors.length;
        console.error(`  ❌ Failed batch ${i / batchSize + 1}:`, error);
      }

      // Small delay to avoid rate limiting
      if (i + batchSize < conferences.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 Migration Summary:');
    console.log(`   Total conferences: ${conferences.length}`);
    console.log(`   Successfully migrated: ${migrated}`);
    console.log(`   Failed: ${failed}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('\n✅ Vector migration complete!');
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await client.close();
  }
}

main();
