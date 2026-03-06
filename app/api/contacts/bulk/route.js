import { NextResponse } from 'next/server';
import { db, initializeDatabase, schema, eq, inArray, generateId, now } from '@/lib/turso';
import { verifyToken } from '@/lib/auth';
import {
  errorResponse,
  successResponse,
  validateBody,
  logActivity,
  logger,
  checkRateLimit,
} from '@/lib/api-utils';
import { bulkDeleteSchema, bulkStatusUpdateSchema } from '@/lib/validations';
import { HTTP_STATUS, ERROR_MESSAGES, ROLES, ACTIVITY_ACTIONS } from '@/lib/constants';

// Helper to authenticate request
async function authenticate(request) {
  const result = verifyToken(request);
  if (result.error) {
    return { error: errorResponse(result.error, result.status || HTTP_STATUS.UNAUTHORIZED) };
  }
  return { user: result.user };
}

// Bulk delete contacts
export async function DELETE(request) {
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
    const validation = await validateBody(request, bulkDeleteSchema);
    if (!validation.valid) return validation.error;

    const { contactIds } = validation.data;

    // Delete contact notes
    await database.delete(schema.notes)
      .where(inArray(schema.notes.contactId, contactIds));

    // Delete contacts
    await database.delete(schema.contacts)
      .where(inArray(schema.contacts.id, contactIds));

    const numDeleted = contactIds.length;

    // Log activity
    await logActivity(
      auth.user.id,
      ACTIVITY_ACTIONS.CONTACT_DELETED,
      { count: numDeleted, contactIds },
      null,
      'contact'
    );

    return successResponse({
      success: true,
      deleted: numDeleted,
      message: `Successfully deleted ${numDeleted} contacts`,
    });
  } catch (error) {
    logger.error('Bulk delete error', { error: error.message, stack: error.stack });
    return errorResponse(ERROR_MESSAGES.SERVER_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
}

// Bulk status update
export async function PUT(request) {
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
    const validation = await validateBody(request, bulkStatusUpdateSchema);
    if (!validation.valid) return validation.error;

    const { contactIds, status, notes } = validation.data;

    // Get contacts for history
    const contacts = await database.select().from(schema.contacts)
      .where(inArray(schema.contacts.id, contactIds));

    // Update contacts
    const updateData = { status, updatedAt: now() };
    if (notes) updateData.notes = notes;

    await database.update(schema.contacts)
      .set(updateData)
      .where(inArray(schema.contacts.id, contactIds));

    // Add history note for each contact with status change
    for (const contact of contacts) {
      if (contact.status !== status) {
        await database.insert(schema.notes).values({
          id: generateId(),
          contactId: contact.id,
          userId: auth.user.id,
          body: `Status changed from ${contact.status} to ${status}`,
          createdAt: now(),
          updatedAt: now(),
        });
      }
    }

    const numUpdated = contactIds.length;

    // Log activity
    await logActivity(
      auth.user.id,
      ACTIVITY_ACTIONS.CONTACT_STATUS_CHANGED,
      { count: numUpdated, newStatus: status, contactIds },
      null,
      'contact'
    );

    return successResponse({
      success: true,
      updated: numUpdated,
      message: `Successfully updated ${numUpdated} contacts to ${status}`,
    });
  } catch (error) {
    logger.error('Bulk status update error', { error: error.message, stack: error.stack });
    return errorResponse(ERROR_MESSAGES.SERVER_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
}
