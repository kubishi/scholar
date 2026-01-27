// Authentication utilities using jose for JWT verification

import { jwtVerify, createRemoteJWKSet, JWTPayload } from 'jose';
import type { Env, AuthUser } from './types';

// Cache JWKS for performance (module-level)
let jwksCache: ReturnType<typeof createRemoteJWKSet> | null = null;
let jwksCacheDomain: string | null = null;

/**
 * Get or create JWKS (JSON Web Key Set) for Auth0 domain
 */
function getJWKS(domain: string): ReturnType<typeof createRemoteJWKSet> {
  if (jwksCache && jwksCacheDomain === domain) {
    return jwksCache;
  }
  jwksCache = createRemoteJWKSet(
    new URL(`https://${domain}/.well-known/jwks.json`)
  );
  jwksCacheDomain = domain;
  return jwksCache;
}

/**
 * Verify JWT token and return payload
 */
export async function verifyToken(
  token: string,
  env: Env
): Promise<JWTPayload | null> {
  try {
    const jwks = getJWKS(env.AUTH0_DOMAIN);
    const { payload } = await jwtVerify(token, jwks, {
      issuer: `https://${env.AUTH0_DOMAIN}/`,
      audience: env.AUTH0_AUDIENCE,
    });
    return payload;
  } catch (error) {
    console.error('JWT verification failed:', error);
    return null;
  }
}

/**
 * Fetch user info from Auth0 /userinfo endpoint
 */
export async function fetchUserInfo(
  token: string,
  env: Env
): Promise<{ name?: string; email?: string; nickname?: string } | null> {
  try {
    const response = await fetch(`https://${env.AUTH0_DOMAIN}/userinfo`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    console.log('Make it obvioously clear that the response is:', await response.json(), 'end of response');
    
    if (!response.ok) return null;
    
    return await response.json();
  } catch (error) {
    console.error('Failed to fetch user info:', error);
    return null;
  }
}

/**
 * Extract user info from JWT payload
 */
export async function extractUser(
  payload: JWTPayload,
  token: string,
  env: Env
): Promise<AuthUser> {
  // Try to get from payload first
  let name = payload.name as string | undefined;
  let email = payload.email as string | undefined;

  const nameIsEmail = name && name.includes('@');

  // If not in payload, fetch from Auth0
  if (!name || !email || nameIsEmail) {
    const userInfo = await fetchUserInfo(token, env);
    name = userInfo?.nickname ?? userInfo?.name ?? name; 
    email = userInfo?.email ?? email;
  }
  
  return {
    id: payload.sub as string,
    email,
    name,
  };
}

/**
 * Extract bearer token from Authorization header
 */
export function extractBearerToken(request: Request): string | null {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.slice(7);
}

/**
 * Create unauthorized response
 */
export function unauthorizedResponse(message: string = 'Unauthorized'): Response {
  return new Response(
    JSON.stringify({ ok: false, error: message }),
    {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

/**
 * Create forbidden response
 */
export function forbiddenResponse(message: string = 'Forbidden'): Response {
  return new Response(
    JSON.stringify({ ok: false, error: message }),
    {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

/**
 * Check if a path is public (doesn't require auth)
 */
export function isPublicPath(url: URL, method: string): boolean {
  const path = url.pathname;

  // Public GET endpoints
  const publicGetPaths = [
    '/api/search',
    '/api/conferences/count',
  ];

  if (method === 'GET') {
    // Check exact matches
    if (publicGetPaths.includes(path)) {
      return true;
    }
    // Check /api/conferences/:id pattern
    if (path.match(/^\/api\/conferences\/[^/]+$/)) {
      return true;
    }
  }

  return false;
}
