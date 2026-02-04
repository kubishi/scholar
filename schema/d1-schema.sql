-- Kubishi Scholar D1 Database Schema
-- SQLite with FTS5 for full-text search

-- Main conferences table
CREATE TABLE IF NOT EXISTS conferences (
    id TEXT PRIMARY KEY,                    -- Acronym (e.g., "WSDM")
    title TEXT NOT NULL,
    acronym TEXT NOT NULL,
    city TEXT,
    country TEXT,
    deadline TEXT,                          -- ISO 8601 datetime
    notification TEXT,                      -- ISO 8601 datetime
    start_date TEXT,                        -- ISO 8601 datetime
    end_date TEXT,                          -- ISO 8601 datetime
    topics TEXT,                            -- Newline-separated topics
    url TEXT,
    h5_index INTEGER,
    h5_median INTEGER,
    updated_at TEXT DEFAULT (datetime('now')),
    created_at TEXT DEFAULT (datetime('now'))
);

-- CORE/ERA rankings (normalized, one row per conference per ranking source)
CREATE TABLE IF NOT EXISTS conference_rankings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conference_id TEXT NOT NULL,
    ranking_source TEXT NOT NULL,           -- e.g., "CORE2023", "ERA2010"
    ranking_value TEXT NOT NULL,            -- e.g., "A*", "A", "B", "C"
    FOREIGN KEY (conference_id) REFERENCES conferences(id) ON DELETE CASCADE,
    UNIQUE(conference_id, ranking_source)
);

-- Indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_rankings_conference ON conference_rankings(conference_id);
CREATE INDEX IF NOT EXISTS idx_rankings_source ON conference_rankings(ranking_source);
CREATE INDEX IF NOT EXISTS idx_conferences_deadline ON conferences(deadline);
CREATE INDEX IF NOT EXISTS idx_conferences_start ON conferences(start_date);

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,                    -- Auth0 user ID (e.g., "auth0|abc123")
    name TEXT,
    email TEXT,
    privilege TEXT DEFAULT 'user',          -- 'user' or 'admin'
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_conf_rating (
    user_id TEXT NOT NULL,
    conference_id TEXT NOT NULL,
    ratings TEXT NOT NULL, -- JSON array of ratings, e.g. [welcoming_score: 5, insightful_score: 4, networking_score: 5, interactivity_score: 4, overall_score: 4.5, caliber_score: 5, worthwhile_score: 4.5]
    updated_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, conference_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (conference_id) REFERENCES conferences(id) ON DELETE CASCADE
);

-- User favorites (junction table)
CREATE TABLE IF NOT EXISTS user_favorites (
    user_id TEXT NOT NULL,
    conference_id TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, conference_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (conference_id) REFERENCES conferences(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_favorites_user ON user_favorites(user_id);




-- User-submitted conferences (pending approval)
CREATE TABLE IF NOT EXISTS submitted_conferences (
    id TEXT PRIMARY KEY,                    -- Conference acronym/ID
    conference_name TEXT NOT NULL,
    city TEXT,
    country TEXT,
    deadline TEXT,
    start_date TEXT,
    end_date TEXT,
    topics TEXT,
    url TEXT,
    submitter_id TEXT NOT NULL,
    submitter_name TEXT,
    submitter_email TEXT,
    status TEXT DEFAULT 'waiting',          -- 'waiting', 'approved', 'submitted', 'rejected'
    edit_type TEXT DEFAULT 'new',           -- 'new' or 'edit'
    submitted_at TEXT DEFAULT (datetime('now')),
    approved_at TEXT,
    FOREIGN KEY (submitter_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_submitted_status ON submitted_conferences(status);
CREATE INDEX IF NOT EXISTS idx_submitted_submitter ON submitted_conferences(submitter_id);

-- Full-text search virtual table for conferences
-- Uses FTS5 with BM25 ranking
CREATE VIRTUAL TABLE IF NOT EXISTS conferences_fts USING fts5(
    id,
    title,
    acronym,
    topics,
    city,
    country,
    content='conferences',
    content_rowid='rowid'
);

-- Triggers to keep FTS index in sync with conferences table. In other words: sync normal db with fts table.
-- After Insert
CREATE TRIGGER IF NOT EXISTS conferences_ai AFTER INSERT ON conferences BEGIN
    INSERT INTO conferences_fts(rowid, id, title, acronym, topics, city, country)
    VALUES (new.rowid, new.id, new.title, new.acronym, new.topics, new.city, new.country);
END;

-- After Delete
CREATE TRIGGER IF NOT EXISTS conferences_ad AFTER DELETE ON conferences BEGIN
    INSERT INTO conferences_fts(conferences_fts, rowid, id, title, acronym, topics, city, country)
    VALUES ('delete', old.rowid, old.id, old.title, old.acronym, old.topics, old.city, old.country);
END;

-- After Update
CREATE TRIGGER IF NOT EXISTS conferences_au AFTER UPDATE ON conferences BEGIN
    INSERT INTO conferences_fts(conferences_fts, rowid, id, title, acronym, topics, city, country)
    VALUES ('delete', old.rowid, old.id, old.title, old.acronym, old.topics, old.city, old.country); --remove by rowid only
    INSERT INTO conferences_fts(rowid, id, title, acronym, topics, city, country)
    VALUES (new.rowid, new.id, new.title, new.acronym, new.topics, new.city, new.country);
END;
