import { NextResponse } from 'next/server';
import { db, initializeDatabase, schema, eq, desc, inArray } from '@/lib/turso';
import { verifyToken } from '@/lib/auth';
import {
  errorResponse,
  paginatedResponse,
  parseQueryParams,
  parsePaginationParams,
  logger,
  checkRateLimit,
} from '@/lib/api-utils';
import { HTTP_STATUS, ERROR_MESSAGES, ROLES } from '@/lib/constants';

// Helper to authenticate request
async function authenticate(request) {
  const result = verifyToken(request);
  if (result.error) {
    return { error: errorResponse(result.error, result.status || HTTP_STATUS.UNAUTHORIZED) };
  }
  return { user: result.user };
}

// Get activity logs (admin only)
export async function GET(request) {
  await initializeDatabase();
  const database = db();

  const rateLimitCheck = checkRateLimit(request);
  if (rateLimitCheck.exceeded) return rateLimitCheck.response;

  const auth = await authenticate(request);
  if (auth.error) return auth.error;

  // Admin only
  if (auth.user.role !== ROLES.ADMIN) {
    return errorResponse(ERROR_MESSAGES.FORBIDDEN, HTTP_STATUS.FORBIDDEN);
  }

  try {
    const params = parseQueryParams(request);
    const pagination = parsePaginationParams(params);

    // Build conditions
    const conditions = [];
    if (params.userId) conditions.push(eq(schema.activities.userId, params.userId));
    if (params.action) conditions.push(eq(schema.activities.action, params.action));
    if (params.resourceType) conditions.push(eq(schema.activities.targetType, params.resourceType));

    // Get count
    const allActivities = await database.select().from(schema.activities);
    const total = allActivities.length;

    // Get paginated results
    const offset = (pagination.page - 1) * pagination.limit;
    const activities = await database.select()
      .from(schema.activities)
      .orderBy(desc(schema.activities.createdAt))
      .limit(pagination.limit)
      .offset(offset);

    // Get user details
    const userIds = [...new Set(activities.map(a => a.userId).filter(Boolean))];
    const users = userIds.length > 0 
      ? await database.select().from(schema.users).where(inArray(schema.users.id, userIds))
      : [];
    const userMap = Object.fromEntries(users.map(u => [u.id, { id: u.id, name: u.name, username: u.username }]));

    // Transform for frontend
    const logs = activities.map(log => ({
      id: log.id,
      action: log.action,
      details: log.details ? JSON.parse(log.details) : {},
      resourceId: log.targetId,
      resourceType: log.targetType,
      user: userMap[log.userId] || null,
      userId: log.userId,
      createdAt: log.createdAt,
    }));

    const paginationMeta = {
      page: pagination.page,
      limit: pagination.limit,
      total,
      totalPages: Math.ceil(total / pagination.limit),
      hasMore: pagination.page * pagination.limit < total,
    };

    return paginatedResponse(logs, paginationMeta);
  } catch (error) {
    logger.error('Get activity logs error', { error: error.message, stack: error.stack });
    return errorResponse(ERROR_MESSAGES.SERVER_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
}
