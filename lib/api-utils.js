/**
 * API Utilities for Next.js App Router
 * Middleware patterns, error handling, rate limiting, logging
 */

import { NextResponse } from 'next/server';
import { HTTP_STATUS, ERROR_MESSAGES, API_CONFIG } from './constants';
import { verifyToken } from './auth';
import { db, schema, generateId, now } from './turso';

// ===== Error Handling =====

/**
 * Custom API Error class
 */
export class ApiError extends Error {
  constructor(message, statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    this.name = 'ApiError';
  }
}

/**
 * Create standardized error response
 */
export function errorResponse(message, statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR, details = null) {
  return NextResponse.json(
    {
      success: false,
      error: {
        message,
        code: statusCode,
        details,
        timestamp: new Date().toISOString(),
      },
    },
    { status: statusCode }
  );
}

/**
 * Create standardized success response
 * @param {any} data - Response data
 * @param {number} statusCode - HTTP status code
 * @param {object} meta - Additional metadata
 * @param {object} cacheOptions - Cache control options
 */
export function successResponse(data, statusCode = HTTP_STATUS.OK, meta = {}, cacheOptions = {}) {
  const response = NextResponse.json(
    {
      success: true,
      data,
      meta: {
        ...meta,
        timestamp: new Date().toISOString(),
      },
    },
    { status: statusCode }
  );
  
  // Add cache headers if specified
  if (cacheOptions.maxAge || cacheOptions.sMaxAge) {
    const cacheControl = [];
    if (cacheOptions.public) cacheControl.push('public');
    if (cacheOptions.private) cacheControl.push('private');
    if (cacheOptions.maxAge) cacheControl.push(`max-age=${cacheOptions.maxAge}`);
    if (cacheOptions.sMaxAge) cacheControl.push(`s-maxage=${cacheOptions.sMaxAge}`);
    if (cacheOptions.staleWhileRevalidate) {
      cacheControl.push(`stale-while-revalidate=${cacheOptions.staleWhileRevalidate}`);
    }
    response.headers.set('Cache-Control', cacheControl.join(', '));
  }
  
  return response;
}

/**
 * Create paginated response with optional caching
 */
export function paginatedResponse(items, pagination, meta = {}, cacheOptions = {}) {
  const response = NextResponse.json(
    {
      success: true,
      data: items,
      pagination,
      meta: {
        ...meta,
        timestamp: new Date().toISOString(),
      },
    },
    { status: HTTP_STATUS.OK }
  );
  
  // Add cache headers for Vercel Edge caching
  if (cacheOptions.maxAge || cacheOptions.sMaxAge) {
    const cacheControl = [];
    if (cacheOptions.public) cacheControl.push('public');
    if (cacheOptions.maxAge) cacheControl.push(`max-age=${cacheOptions.maxAge}`);
    if (cacheOptions.sMaxAge) cacheControl.push(`s-maxage=${cacheOptions.sMaxAge}`);
    if (cacheOptions.staleWhileRevalidate) {
      cacheControl.push(`stale-while-revalidate=${cacheOptions.staleWhileRevalidate}`);
    }
    response.headers.set('Cache-Control', cacheControl.join(', '));
  }
  
  return response;
}

// ===== Rate Limiting (In-Memory for Development) =====

const rateLimitStore = new Map();

/**
 * Clean up expired rate limit entries
 */
function cleanupRateLimitStore() {
  const now = Date.now();
  for (const [key, data] of rateLimitStore.entries()) {
    if (data.resetTime < now) {
      rateLimitStore.delete(key);
    }
  }
}

// Run cleanup every 5 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(cleanupRateLimitStore, 5 * 60 * 1000);
}

/**
 * Rate limiter middleware
 */
export function rateLimit(identifier, options = {}) {
  const {
    windowMs = API_CONFIG.RATE_LIMIT_WINDOW_MS,
    maxRequests = API_CONFIG.RATE_LIMIT_MAX_REQUESTS,
  } = options;

  const now = Date.now();
  const key = identifier;
  
  let record = rateLimitStore.get(key);

  if (!record || record.resetTime < now) {
    record = {
      count: 1,
      resetTime: now + windowMs,
    };
    rateLimitStore.set(key, record);
    return { allowed: true, remaining: maxRequests - 1, resetTime: record.resetTime };
  }

  record.count++;

  if (record.count > maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetTime: record.resetTime,
      retryAfter: Math.ceil((record.resetTime - now) / 1000),
    };
  }

  return {
    allowed: true,
    remaining: maxRequests - record.count,
    resetTime: record.resetTime,
  };
}

/**
 * Apply rate limit and return error response if exceeded
 */
export function checkRateLimit(request, identifier = null) {
  const id = identifier || getClientIdentifier(request);
  const result = rateLimit(id);

  if (!result.allowed) {
    return {
      exceeded: true,
      response: NextResponse.json(
        {
          success: false,
          error: {
            message: ERROR_MESSAGES.RATE_LIMIT_EXCEEDED,
            code: HTTP_STATUS.TOO_MANY_REQUESTS,
            retryAfter: result.retryAfter,
          },
        },
        {
          status: HTTP_STATUS.TOO_MANY_REQUESTS,
          headers: {
            'Retry-After': String(result.retryAfter),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(result.resetTime),
          },
        }
      ),
    };
  }

  return { exceeded: false, remaining: result.remaining };
}

// ===== Authentication Helpers =====

/**
 * Get client identifier for rate limiting
 */
export function getClientIdentifier(request) {
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0].trim() : 'unknown';
  return ip;
}

/**
 * Extract and verify auth token from request
 */
export async function authenticateRequest(request) {
  const authHeader = request.headers.get('authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return {
      authenticated: false,
      error: errorResponse(ERROR_MESSAGES.UNAUTHORIZED, HTTP_STATUS.UNAUTHORIZED),
    };
  }

  const token = authHeader.replace('Bearer ', '');
  const user = verifyToken(token);

  if (!user) {
    return {
      authenticated: false,
      error: errorResponse(ERROR_MESSAGES.TOKEN_EXPIRED, HTTP_STATUS.UNAUTHORIZED),
    };
  }

  return { authenticated: true, user };
}

/**
 * Require admin role
 */
export function requireAdmin(user) {
  if (user.role !== 'admin') {
    return {
      authorized: false,
      error: errorResponse(ERROR_MESSAGES.FORBIDDEN, HTTP_STATUS.FORBIDDEN),
    };
  }
  return { authorized: true };
}

/**
 * Require partner role (supports both 'partner' and legacy 'worker' roles)
 */
export function requirePartner(user) {
  if (user.role !== 'partner' && user.role !== 'worker' && user.role !== 'admin') {
    return {
      authorized: false,
      error: errorResponse(ERROR_MESSAGES.FORBIDDEN, HTTP_STATUS.FORBIDDEN),
    };
  }
  return { authorized: true };
}

// Alias for backward compatibility
export const requireWorker = requirePartner;

// ===== Logging =====

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

const currentLogLevel = process.env.LOG_LEVEL ? LOG_LEVELS[process.env.LOG_LEVEL.toUpperCase()] : LOG_LEVELS.INFO;

/**
 * Logger utility
 */
export const logger = {
  debug(message, data = {}) {
    if (currentLogLevel <= LOG_LEVELS.DEBUG) {
      console.log(JSON.stringify({ level: 'DEBUG', message, data, timestamp: new Date().toISOString() }));
    }
  },
  info(message, data = {}) {
    if (currentLogLevel <= LOG_LEVELS.INFO) {
      console.log(JSON.stringify({ level: 'INFO', message, data, timestamp: new Date().toISOString() }));
    }
  },
  warn(message, data = {}) {
    if (currentLogLevel <= LOG_LEVELS.WARN) {
      console.warn(JSON.stringify({ level: 'WARN', message, data, timestamp: new Date().toISOString() }));
    }
  },
  error(message, data = {}) {
    if (currentLogLevel <= LOG_LEVELS.ERROR) {
      console.error(JSON.stringify({ level: 'ERROR', message, data, timestamp: new Date().toISOString() }));
    }
  },
};

/**
 * Log API request
 */
export function logRequest(request, context = {}) {
  logger.info('API Request', {
    method: request.method,
    url: request.url,
    userAgent: request.headers.get('user-agent'),
    ...context,
  });
}

/**
 * Log activity to database
 */
export async function logActivity(userId, action, details = {}, resourceId = null, resourceType = null) {
  try {
    await db().insert(schema.activities).values({
      id: generateId(),
      userId,
      action,
      targetType: resourceType,
      targetId: resourceId,
      details: JSON.stringify(details),
      createdAt: now(),
    });
  } catch (error) {
    logger.error('Failed to log activity', { error: error.message, action, userId });
  }
}

// ===== Query Parsing =====

/**
 * Parse query parameters from URL
 */
export function parseQueryParams(request) {
  const { searchParams } = new URL(request.url);
  const params = {};
  
  for (const [key, value] of searchParams.entries()) {
    params[key] = value;
  }
  
  return params;
}

/**
 * Parse pagination parameters
 */
export function parsePaginationParams(params) {
  return {
    page: Math.max(1, parseInt(params.page) || 1),
    limit: Math.min(API_CONFIG.MAX_PAGE_SIZE, Math.max(1, parseInt(params.limit) || API_CONFIG.DEFAULT_PAGE_SIZE)),
    sortBy: params.sortBy || 'createdAt',
    sortOrder: params.sortOrder === 'asc' ? 'asc' : 'desc',
  };
}

/**
 * Build filter query from params
 */
export function buildFilterQuery(params, allowedFilters = []) {
  const query = {};
  
  for (const filter of allowedFilters) {
    if (params[filter] !== undefined && params[filter] !== '') {
      query[filter] = params[filter];
    }
  }
  
  return query;
}

// ===== Request Handler Wrapper =====

/**
 * Wrap API handler with common middleware
 */
export function withMiddleware(handler, options = {}) {
  return async (request, context) => {
    const { requireAuth = true, requireRole = null, rateLimit: enableRateLimit = true } = options;

    try {
      // Log request
      logRequest(request);

      // Rate limiting
      if (enableRateLimit) {
        const rateLimitResult = checkRateLimit(request);
        if (rateLimitResult.exceeded) {
          return rateLimitResult.response;
        }
      }

      // Authentication
      let user = null;
      if (requireAuth) {
        const authResult = await authenticateRequest(request);
        if (!authResult.authenticated) {
          return authResult.error;
        }
        user = authResult.user;

        // Role check
        if (requireRole === 'admin') {
          const adminCheck = requireAdmin(user);
          if (!adminCheck.authorized) {
            return adminCheck.error;
          }
        }
      }

      // Call the actual handler
      return await handler(request, { ...context, user });
    } catch (error) {
      logger.error('API Error', {
        message: error.message,
        stack: error.stack,
        url: request.url,
        method: request.method,
      });

      if (error instanceof ApiError) {
        return errorResponse(error.message, error.statusCode, error.details);
      }

      return errorResponse(ERROR_MESSAGES.SERVER_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
  };
}

// ===== Validation Helper =====

/**
 * Validate request body with Zod schema
 */
export async function validateBody(request, schema) {
  try {
    // Clone request to safely read body
    const text = await request.text();
    
    if (!text || text.trim() === '') {
      return {
        valid: false,
        error: errorResponse('Request body is empty', HTTP_STATUS.BAD_REQUEST),
      };
    }
    
    let body;
    try {
      body = JSON.parse(text);
    } catch (parseError) {
      logger.error('JSON parse error', { error: parseError.message, text: text.substring(0, 200) });
      return {
        valid: false,
        error: errorResponse('Invalid JSON body: ' + parseError.message, HTTP_STATUS.BAD_REQUEST),
      };
    }
    
    const result = schema.safeParse(body);
    
    if (!result.success) {
      const errors = result.error.errors.map(err => ({
        field: err.path.join('.'),
        message: err.message,
      }));
      logger.warn('Validation failed', { errors });
      return {
        valid: false,
        error: errorResponse(ERROR_MESSAGES.VALIDATION_ERROR, HTTP_STATUS.BAD_REQUEST, errors),
      };
    }
    
    return { valid: true, data: result.data };
  } catch (error) {
    logger.error('validateBody error', { error: error.message });
    return {
      valid: false,
      error: errorResponse('Failed to process request body: ' + error.message, HTTP_STATUS.BAD_REQUEST),
    };
  }
}

// ===== CORS Headers =====

/**
 * Add CORS headers to response
 */
export function withCors(response, methods = ['GET', 'POST', 'PUT', 'DELETE']) {
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
  headers.set('Access-Control-Allow-Methods', methods.join(', '));
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  headers.set('Access-Control-Max-Age', '86400');
  
  return new NextResponse(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

// ===== Caching =====

const cache = new Map();

/**
 * Simple in-memory cache
 */
export const cacheUtil = {
  get(key) {
    const item = cache.get(key);
    if (!item) return null;
    if (item.expiresAt && item.expiresAt < Date.now()) {
      cache.delete(key);
      return null;
    }
    return item.value;
  },
  
  set(key, value, ttlMs = 60000) {
    cache.set(key, {
      value,
      expiresAt: Date.now() + ttlMs,
    });
  },
  
  delete(key) {
    cache.delete(key);
  },
  
  clear() {
    cache.clear();
  },
  
  invalidatePattern(pattern) {
    const regex = new RegExp(pattern);
    for (const key of cache.keys()) {
      if (regex.test(key)) {
        cache.delete(key);
      }
    }
  },
};
