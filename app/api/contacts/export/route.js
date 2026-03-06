import { NextResponse } from 'next/server';
import { db, initializeDatabase, schema, eq, desc, inArray } from '@/lib/turso';
import { verifyToken } from '@/lib/auth';
import {
  errorResponse,
  logger,
  checkRateLimit,
  parseQueryParams,
  logActivity,
} from '@/lib/api-utils';
import { HTTP_STATUS, ERROR_MESSAGES, ROLES, ACTIVITY_ACTIONS, EXPORT_FORMATS } from '@/lib/constants';

// Helper to authenticate request
async function authenticate(request) {
  const result = verifyToken(request);
  if (result.error) {
    return { error: errorResponse(result.error, result.status || HTTP_STATUS.UNAUTHORIZED) };
  }
  return { user: result.user };
}

// Export contacts
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
    const format = params.format || EXPORT_FORMATS.CSV;

    // Build conditions
    const conditions = [];
    if (params.status) conditions.push(eq(schema.contacts.status, params.status));
    if (params.areaId) conditions.push(eq(schema.contacts.areaId, params.areaId));
    if (params.assignedTo) conditions.push(eq(schema.contacts.assignedTo, params.assignedTo));

    // Get all contacts
    let query = database.select().from(schema.contacts).orderBy(desc(schema.contacts.createdAt));
    if (conditions.length > 0) {
      const { and } = await import('@/lib/turso');
      query = database.select().from(schema.contacts)
        .where(and(...conditions))
        .orderBy(desc(schema.contacts.createdAt));
    }
    
    const contacts = await query;

    // Enrich with area and user names
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

    const areaMap = Object.fromEntries(areas.map(a => [a.id, a.name]));
    const userMap = Object.fromEntries(users.map(u => [u.id, u.name]));

    const enrichedContacts = contacts.map(c => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      email: c.email || '',
      address: c.address || '',
      area: areaMap[c.areaId] || '',
      assignedTo: userMap[c.assignedTo] || '',
      status: c.status,
      priority: c.priority || '',
      notes: c.notes || '',
      tags: c.tags ? JSON.parse(c.tags).join(', ') : '',
      createdAt: c.createdAt ? new Date(c.createdAt).toISOString() : '',
      updatedAt: c.updatedAt ? new Date(c.updatedAt).toISOString() : '',
    }));

    // Log activity
    await logActivity(
      auth.user.id,
      ACTIVITY_ACTIONS.CONTACTS_EXPORTED,
      { format, count: enrichedContacts.length },
      null,
      'export'
    );

    if (format === EXPORT_FORMATS.JSON) {
      return NextResponse.json({
        success: true,
        data: enrichedContacts,
        meta: {
          total: enrichedContacts.length,
          exportedAt: new Date().toISOString(),
        },
      });
    }

    // CSV format
    const headers = ['ID', 'Name', 'Phone', 'Email', 'Address', 'Area', 'Assigned To', 'Status', 'Priority', 'Notes', 'Tags', 'Created At', 'Updated At'];
    
    const csvRows = [
      headers.join(','),
      ...enrichedContacts.map(c => [
        `"${c.id}"`,
        `"${(c.name || '').replace(/"/g, '""')}"`,
        `"${c.phone}"`,
        `"${c.email}"`,
        `"${(c.address || '').replace(/"/g, '""')}"`,
        `"${c.area}"`,
        `"${c.assignedTo}"`,
        `"${c.status}"`,
        `"${c.priority}"`,
        `"${(c.notes || '').replace(/"/g, '""').replace(/\n/g, ' ')}"`,
        `"${c.tags}"`,
        `"${c.createdAt}"`,
        `"${c.updatedAt}"`,
      ].join(','))
    ];

    const csv = csvRows.join('\n');
    const filename = `contacts-export-${new Date().toISOString().split('T')[0]}.csv`;

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    logger.error('Export contacts error', { error: error.message, stack: error.stack });
    return errorResponse(ERROR_MESSAGES.SERVER_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
}
