import { NextResponse } from 'next/server';
import { db, initializeDatabase, schema, eq, and, or, like, desc, asc, inArray, isNull, generateId, now } from '@/lib/turso';
import { verifyToken } from '@/lib/auth';
import {
  errorResponse,
  paginatedResponse,
  successResponse,
  parseQueryParams,
  parsePaginationParams,
  validateBody,
  logActivity,
  logger,
  checkRateLimit,
} from '@/lib/api-utils';
import { createContactSchema } from '@/lib/validations';
import { HTTP_STATUS, ERROR_MESSAGES, ROLES, ACTIVITY_ACTIONS, CONTACT_STATUS } from '@/lib/constants';

// Helper to authenticate request
async function authenticate(request) {
  const result = verifyToken(request);
  if (result.error) {
    return { error: errorResponse(result.error, result.status || HTTP_STATUS.UNAUTHORIZED) };
  }
  return { user: result.user };
}

// Get contacts - admin sees all, workers see only assigned
export async function GET(request) {
  await initializeDatabase();
  const database = db();

  // Rate limiting
  const rateLimitCheck = checkRateLimit(request);
  if (rateLimitCheck.exceeded) return rateLimitCheck.response;

  // Authentication
  const auth = await authenticate(request);
  if (auth.error) return auth.error;

  try {
    const params = parseQueryParams(request);
    const pagination = parsePaginationParams(params);
    const user = auth.user;
    
    // Build conditions array
    const conditions = [];

    // Workers can only see contacts assigned to them
    if (user.role !== ROLES.ADMIN) {
      conditions.push(eq(schema.contacts.assignedTo, user.id));
    }

    // Filter by status
    if (params.status && params.status !== 'all') {
      conditions.push(eq(schema.contacts.status, params.status));
    }

    // Filter by area
    if (params.areaId) {
      conditions.push(eq(schema.contacts.areaId, params.areaId));
    }

    // Filter by assigned user
    if (params.assignedTo) {
      conditions.push(eq(schema.contacts.assignedTo, params.assignedTo));
    }

    // Filter by priority
    if (params.priority) {
      conditions.push(eq(schema.contacts.priority, params.priority));
    }

    // Filter unassigned
    if (params.unassigned === 'true') {
      conditions.push(isNull(schema.contacts.assignedTo));
    }

    // Search functionality
    if (params.search) {
      const searchPattern = `%${params.search}%`;
      conditions.push(
        or(
          like(schema.contacts.name, searchPattern),
          like(schema.contacts.phone, searchPattern),
          like(schema.contacts.email, searchPattern),
          like(schema.contacts.address, searchPattern)
        )
      );
    }

    // Build where clause
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Count total
    const countResult = await database.select({ count: schema.contacts.id })
      .from(schema.contacts)
      .where(whereClause);
    const total = countResult.length;

    // Get paginated results
    const offset = (pagination.page - 1) * pagination.limit;
    const sortField = schema.contacts[pagination.sortBy] || schema.contacts.createdAt;
    const sortOrder = pagination.sortOrder === 'asc' ? asc(sortField) : desc(sortField);

    const contacts = await database.select()
      .from(schema.contacts)
      .where(whereClause)
      .orderBy(sortOrder)
      .limit(pagination.limit)
      .offset(offset);

    // Get area and user details
    const areaIds = [...new Set(contacts.map(c => c.areaId).filter(Boolean))];
    const userIds = [...new Set(contacts.map(c => c.assignedTo).filter(Boolean))];

    const [areas, users] = await Promise.all([
      areaIds.length > 0 
        ? database.select().from(schema.areas).where(inArray(schema.areas.id, areaIds))
        : [],
      userIds.length > 0 
        ? database.select().from(schema.users).where(inArray(schema.users.id, userIds))
        : []
    ]);

    const areaMap = Object.fromEntries(areas.map(a => [a.id, a]));
    const userMap = Object.fromEntries(users.map(u => [u.id, u]));

    // Transform contacts
    const transformedContacts = contacts.map(c => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      email: c.email,
      address: c.address,
      areaId: c.areaId,
      area_id: c.areaId,
      assignedTo: c.assignedTo,
      assigned_to: c.assignedTo,
      status: c.status,
      priority: c.priority,
      notes: c.notes,
      tags: c.tags ? JSON.parse(c.tags) : [],
      scheduledFollowUp: c.scheduledFollowUp,
      area_name: areaMap[c.areaId]?.name || null,
      areaName: areaMap[c.areaId]?.name || null,
      areaColor: areaMap[c.areaId]?.color || null,
      assigned_to_name: userMap[c.assignedTo]?.name || null,
      assignedToName: userMap[c.assignedTo]?.name || null,
      created_at: c.createdAt,
      createdAt: c.createdAt,
      updated_at: c.updatedAt,
      updatedAt: c.updatedAt,
    }));

    const paginationMeta = {
      page: pagination.page,
      limit: pagination.limit,
      total,
      totalPages: Math.ceil(total / pagination.limit),
      hasMore: pagination.page * pagination.limit < total,
    };

    return paginatedResponse(transformedContacts, paginationMeta);
  } catch (error) {
    logger.error('Get contacts error', { error: error.message, stack: error.stack });
    return errorResponse(ERROR_MESSAGES.SERVER_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
}

// Create contact (admin only)
export async function POST(request) {
  await initializeDatabase();
  const database = db();

  // Rate limiting
  const rateLimitCheck = checkRateLimit(request);
  if (rateLimitCheck.exceeded) return rateLimitCheck.response;

  // Authentication
  const auth = await authenticate(request);
  if (auth.error) return auth.error;

  // Admin only
  if (auth.user.role !== ROLES.ADMIN) {
    return errorResponse(ERROR_MESSAGES.FORBIDDEN, HTTP_STATUS.FORBIDDEN);
  }

  try {
    // Validate request body
    const validation = await validateBody(request, createContactSchema);
    if (!validation.valid) return validation.error;

    const data = validation.data;

    // Check for duplicate phone numbers
    if (data.phone) {
      const existingContacts = await database.select()
        .from(schema.contacts)
        .where(eq(schema.contacts.phone, data.phone));
      
      if (existingContacts.length > 0) {
        return errorResponse(
          'A contact with this phone number already exists',
          HTTP_STATUS.CONFLICT,
          { duplicates: existingContacts.map(c => ({ id: c.id, name: c.name })) }
        );
      }
    }

    // Create contact
    const contactId = generateId();
    const timestamp = now();
    
    await database.insert(schema.contacts).values({
      id: contactId,
      name: data.name,
      phone: data.phone || null,
      email: data.email || null,
      address: data.address || null,
      areaId: data.areaId || null,
      assignedTo: data.assignedTo || null,
      status: data.status || CONTACT_STATUS.PENDING,
      priority: data.priority || 'normal',
      notes: data.notes || '',
      tags: data.tags ? JSON.stringify(data.tags) : null,
      scheduledFollowUp: data.scheduledFollowUp || null,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    // Log activity
    await logActivity(
      auth.user.id,
      ACTIVITY_ACTIONS.CONTACT_CREATED,
      { contactName: data.name, phone: data.phone },
      contactId,
      'contact'
    );

    return successResponse(
      {
        id: contactId,
        ...data,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      HTTP_STATUS.CREATED
    );
  } catch (error) {
    logger.error('Create contact error', { error: error.message, stack: error.stack });
    return errorResponse(ERROR_MESSAGES.SERVER_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
}
