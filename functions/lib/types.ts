// Environment bindings for Cloudflare Workers
export interface Env {
  DB: D1Database;
  VECTORIZE_INDEX: VectorizeIndex;
  AUTH0_DOMAIN: string;
  AUTH0_CLIENT_ID: string;
  AUTH0_AUDIENCE: string;
  OPENAI_API_KEY: string;
  ENVIRONMENT: string;
}

// User from JWT token
export interface AuthUser {
  id: string;
  email?: string;
  name?: string;
}

// Extended context with user data
export interface AuthContext {
  user?: AuthUser;
}

// Conference from D1
export interface Conference {
  id: string;
  title: string;
  acronym: string;
  city?: string;
  country?: string;
  deadline?: string;
  notification?: string;
  start_date?: string;
  end_date?: string;
  topics?: string;
  url?: string;
  h5_index?: number;
  h5_median?: number;
  updated_at?: string;
  created_at?: string;
  // Joined from conference_rankings
  rankings?: string;
  core?: Record<string, string>;
  // Search score (from FTS5 or Vectorize)
  score?: number;
}

// Conference ranking
export interface ConferenceRanking {
  id: number;
  conference_id: string;
  ranking_source: string;
  ranking_value: string;
}

// User from D1
export interface User {
  id: string;
  name?: string;
  email?: string;
  privilege: string;
  created_at?: string;
  updated_at?: string;
}

// User favorite
export interface UserFavorite {
  user_id: string;
  conference_id: string;
  created_at?: string;
}

// Submitted conference
export interface SubmittedConference {
  id: string;
  conference_name: string;
  city?: string;
  country?: string;
  deadline?: string;
  start_date?: string;
  end_date?: string;
  topics?: string;
  url?: string;
  submitter_id: string;
  submitter_name?: string;
  submitter_email?: string;
  status: 'waiting' | 'approved' | 'submitted' | 'rejected';
  edit_type: 'new' | 'edit';
  submitted_at?: string;
  approved_at?: string;
}

// Vector metadata stored in Vectorize
export interface ConferenceVectorMetadata {
  id: string;
  title: string;
  acronym: string;
  city?: string;
  country?: string;
  deadline?: string;
  start_date?: string;
  end_date?: string;
}

// Search parameters
export interface SearchParams {
  query: string;
  search_type: 'semantic' | 'lexical' | 'hybrid';
  num_results: number;
  location?: string;
  ranking_source?: string;
  ranking_score?: string;
  date_span_first?: string;
  date_span_second?: string;
  deadline_first?: string;
  deadline_second?: string;
}

// API response types
export interface ApiResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

export interface SearchResponse {
  results: Conference[];
  count: number;
}

export interface UserResponse {
  user: User;
  favorites: string[];
}

export interface FavoriteResponse {
  ok: boolean;
  status: 'added' | 'removed';
}

export interface UserRatingOptions {
  welcoming: number;
  insightful: number;
  networking: number;
  interactivity: number;
  overall: number;
  caliber: number;
  worthwhile: number;
}

export interface UserProfile {
  given_name: string;
  phone: string;
  email: string;
  birthday: string;
  university: string;
  interests: string;
  website: string;
  github: string;
  linkedin: string;
  orcid: string;
}