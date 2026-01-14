// Authentication middleware for Cloudflare Pages Functions

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

export const onRequest: PagesFunction = async (context) => {
  const { request, env, next, data } = context;
  const url = new URL(request.url);

  // Allow public paths without authentication
  if (isPublicPath(url, request.method)) {
    return next();
  }

  // For protected paths, verify JWT token
  const token = extractBearerToken(request);
  if (!token) {
    return unauthorizedResponse('Missing authorization token');
  }

  const payload = await verifyToken(token, env);
  if (!payload) {
    return unauthorizedResponse('Invalid or expired token');
  }

  // Attach user info to context data for downstream handlers
  data.user = extractUser(payload);

  return next();
};
