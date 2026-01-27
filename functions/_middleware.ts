// Authentication middleware for Cloudflare Pages Functions
// Entry point for all API requests

import type { Env, AuthUser, AuthContext } from './lib/types';
import {
  verifyToken,
  extractUser,
  extractBearerToken,
  unauthorizedResponse,
  isPublicPath,
} from './lib/auth';

type PagesFunction<E = Env> = (
  context: EventContext<E, string, AuthContext>
) => Response | Promise<Response>;

// onRequest comes from the Pages Functions API in the Cloudflare dashboard
export const onRequest: PagesFunction = async (context) => {
  const { request, env, next, data } = context;
  const url = new URL(request.url);

  // Only apply auth middleware to /api/ routes
  if (!url.pathname.startsWith('/api/')) {
    return next();
  }

  // Allow public API paths without authentication
  if (isPublicPath(url, request.method)) {
    return next();
  }

  // For protected API paths, verify JWT token
  const token = extractBearerToken(request);
  if (!token) {
    return unauthorizedResponse('Missing authorization token');
  }

  const payload = await verifyToken(token, env);
  if (!payload) {
    return unauthorizedResponse('Invalid or expired token');
  }

  // Attach user info to context data for downstream handlers
  data.user = await extractUser(payload, token, env); 

  return next();
};
