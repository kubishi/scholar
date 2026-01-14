/**
 * MongoDB to D1 Migration Script
 *
 * This script migrates data from MongoDB Atlas to Cloudflare D1.
 * Run with: npx tsx scripts/migrate-mongo-to-d1.ts
 *
 * Required environment variables:
 * - MONGO_URI: MongoDB connection string
 * - CLOUDFLARE_ACCOUNT_ID: Your Cloudflare account ID
 * - CLOUDFLARE_API_TOKEN: API token with D1 write access
 * - D1_DATABASE_ID: The D1 database ID
 */

import { MongoClient } from 'mongodb';

const MONGO_URI = process.env.MONGO_URI!;
const CLOUDFLARE_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID!;
const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN!;
const D1_DATABASE_ID = process.env.D1_DATABASE_ID!;

if (!MONGO_URI || !CLOUDFLARE_ACCOUNT_ID || !CLOUDFLARE_API_TOKEN || !D1_DATABASE_ID) {
  console.error('Missing required environment variables');
  console.error('Required: MONGO_URI, CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, D1_DATABASE_ID');
  process.exit(1);
}

interface MongoConference {
  _id: string;
  title?: string;
  acronym?: string;
  city?: string;
  country?: string;
  deadline?: string;
  notification?: string;
  start?: string;
  end?: string;
  topics?: string;
  url?: string;
  h5_index?: number;
  h5_median?: number;
  core?: Record<string, string>;
  updated_at?: string;
}

interface MongoUser {
  _id: string;
  user_name?: string;
  user_email?: string;
  user_privilege?: string;
  favorites?: string[];
}

interface MongoSubmission {
  _id: string;
  conference_name: string;
  city?: string;
  country?: string;
  deadline?: string;
  start?: string;
  end?: string;
  topics?: string;
  url?: string;
  submitter_id: string;
  submitter_user_name?: string;
  submitter_user_email?: string;
  status?: string;
  edit_type?: string;
  time_submitted_at?: string;
  time_approved_at?: string;
}

/**
 * Execute a D1 SQL query via Cloudflare API
 */
async function executeD1(sql: string, params: unknown[] = []): Promise<void> {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/d1/database/${D1_DATABASE_ID}/query`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CLOUDFLARE_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sql, params }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`D1 query failed: ${error}`);
  }

  const result = await response.json();
  if (!result.success) {
    throw new Error(`D1 query error: ${JSON.stringify(result.errors)}`);
  }
}

/**
 * Migrate conferences collection
 */
async function migrateConferences(client: MongoClient): Promise<number> {
  console.log('\n📚 Migrating conferences...');

  const collection = client.db('kubishi-scholar').collection<MongoConference>('conferences');
  const conferences = await collection.find({}).toArray();

  console.log(`Found ${conferences.length} conferences`);

  let migrated = 0;
  for (const conf of conferences) {
    try {
      // Insert conference
      await executeD1(
        `INSERT OR REPLACE INTO conferences
         (id, title, acronym, city, country, deadline, notification, start_date, end_date, topics, url, h5_index, h5_median, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          conf._id,
          conf.title || conf._id,
          conf.acronym || conf._id,
          conf.city || null,
          conf.country || null,
          conf.deadline || null,
          conf.notification || null,
          conf.start || null,
          conf.end || null,
          conf.topics || null,
          conf.url || null,
          conf.h5_index || null,
          conf.h5_median || null,
          conf.updated_at || new Date().toISOString(),
        ]
      );

      // Insert rankings
      if (conf.core) {
        for (const [source, value] of Object.entries(conf.core)) {
          if (value) {
            await executeD1(
              `INSERT OR REPLACE INTO conference_rankings (conference_id, ranking_source, ranking_value)
               VALUES (?, ?, ?)`,
              [conf._id, source, value]
            );
          }
        }
      }

      migrated++;
      if (migrated % 50 === 0) {
        console.log(`  Migrated ${migrated}/${conferences.length} conferences`);
      }
    } catch (error) {
      console.error(`  Failed to migrate conference ${conf._id}:`, error);
    }
  }

  console.log(`✅ Migrated ${migrated}/${conferences.length} conferences`);
  return migrated;
}

/**
 * Migrate users collection
 */
async function migrateUsers(client: MongoClient): Promise<number> {
  console.log('\n👥 Migrating users...');

  const collection = client.db('kubishi-scholar').collection<MongoUser>('users');
  const users = await collection.find({}).toArray();

  console.log(`Found ${users.length} users`);

  let migrated = 0;
  for (const user of users) {
    try {
      // Insert user
      await executeD1(
        `INSERT OR REPLACE INTO users (id, name, email, privilege)
         VALUES (?, ?, ?, ?)`,
        [
          user._id,
          user.user_name || null,
          user.user_email || null,
          user.user_privilege || 'user',
        ]
      );

      // Insert favorites
      if (user.favorites && user.favorites.length > 0) {
        for (const confId of user.favorites) {
          try {
            await executeD1(
              `INSERT OR IGNORE INTO user_favorites (user_id, conference_id)
               VALUES (?, ?)`,
              [user._id, confId]
            );
          } catch {
            // Ignore foreign key errors for non-existent conferences
          }
        }
      }

      migrated++;
    } catch (error) {
      console.error(`  Failed to migrate user ${user._id}:`, error);
    }
  }

  console.log(`✅ Migrated ${migrated}/${users.length} users`);
  return migrated;
}

/**
 * Migrate user_submitted_conf collection
 */
async function migrateSubmissions(client: MongoClient): Promise<number> {
  console.log('\n📝 Migrating submissions...');

  const collection = client.db('kubishi-scholar').collection<MongoSubmission>('user_submitted_conf');
  const submissions = await collection.find({}).toArray();

  console.log(`Found ${submissions.length} submissions`);

  let migrated = 0;
  for (const sub of submissions) {
    try {
      await executeD1(
        `INSERT OR REPLACE INTO submitted_conferences
         (id, conference_name, city, country, deadline, start_date, end_date, topics, url,
          submitter_id, submitter_name, submitter_email, status, edit_type, submitted_at, approved_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          sub._id,
          sub.conference_name,
          sub.city || null,
          sub.country || null,
          sub.deadline || null,
          sub.start || null,
          sub.end || null,
          sub.topics || null,
          sub.url || null,
          sub.submitter_id,
          sub.submitter_user_name || null,
          sub.submitter_user_email || null,
          sub.status || 'waiting',
          sub.edit_type || 'new',
          sub.time_submitted_at || null,
          sub.time_approved_at || null,
        ]
      );

      migrated++;
    } catch (error) {
      console.error(`  Failed to migrate submission ${sub._id}:`, error);
    }
  }

  console.log(`✅ Migrated ${migrated}/${submissions.length} submissions`);
  return migrated;
}

/**
 * Main migration function
 */
async function main() {
  console.log('🚀 Starting MongoDB to D1 migration...\n');

  const client = new MongoClient(MONGO_URI);

  try {
    await client.connect();
    console.log('✅ Connected to MongoDB\n');

    const conferenceCount = await migrateConferences(client);
    const userCount = await migrateUsers(client);
    const submissionCount = await migrateSubmissions(client);

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 Migration Summary:');
    console.log(`   Conferences: ${conferenceCount}`);
    console.log(`   Users: ${userCount}`);
    console.log(`   Submissions: ${submissionCount}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('\n✅ Migration complete!');
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await client.close();
  }
}

main();
