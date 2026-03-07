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

// Normalize phone number for comparison
// Handles country codes: +52 722 549 3975 and 722 549 3975 should match
function normalizePhoneForComparison(phone) {
  if (!phone) return null;
  // Remove all non-digits
  let digits = phone.replace(/\D/g, '');
  // If starts with country code (10+ digits), extract last 10 digits as local number
  // This handles cases where some entries have country code and some don't
  if (digits.length > 10) {
    // Keep both full and local versions for matching
    return {
      full: digits,
      local: digits.slice(-10),
    };
  }
  return { full: digits, local: digits };
}

// GET: Preview duplicates
export async function GET(request) {
  await initializeDatabase();
  const database = db();

  const auth = await authenticate(request);
  if (auth.error) return auth.error;

  if (auth.user.role !== ROLES.ADMIN) {
    return errorResponse(ERROR_MESSAGES.FORBIDDEN, HTTP_STATUS.FORBIDDEN);
  }

  try {
    // Get all contacts
    const allContacts = await database.select().from(schema.contacts);
    
    // Group by normalized phone
    const phoneGroups = {};
    
    for (const contact of allContacts) {
      const normalized = normalizePhoneForComparison(contact.phone);
      if (!normalized) continue;
      
      // Use local number as key for grouping (handles country code variations)
      const key = normalized.local;
      if (!phoneGroups[key]) {
        phoneGroups[key] = [];
      }
      phoneGroups[key].push(contact);
    }
    
    // Find groups with more than one contact (duplicates)
    const duplicateGroups = Object.entries(phoneGroups)
      .filter(([key, contacts]) => contacts.length > 1)
      .map(([phone, contacts]) => ({
        phone,
        count: contacts.length,
        contacts: contacts.map(c => ({
          id: c.id,
          name: c.name,
          phone: c.phone,
          email: c.email,
          status: c.status,
          createdAt: c.createdAt,
        })),
        // Keep the oldest one (first created)
        keepId: contacts.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))[0].id,
        removeIds: contacts.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)).slice(1).map(c => c.id),
      }));
    
    const totalDuplicates = duplicateGroups.reduce((sum, g) => sum + g.count - 1, 0);
    
    return successResponse({
      duplicateGroups: duplicateGroups.length,
      totalDuplicates,
      groups: duplicateGroups.slice(0, 50), // Limit preview to 50 groups
      message: `Found ${totalDuplicates} duplicate contacts in ${duplicateGroups.length} phone number groups`,
    });
  } catch (error) {
    logger.error('Find duplicates error', { error: error.message });
    return errorResponse(ERROR_MESSAGES.SERVER_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
}

// POST: Remove duplicates (keeps oldest entry for each phone number)
export async function POST(request) {
  await initializeDatabase();
  const database = db();

  const auth = await authenticate(request);
  if (auth.error) return auth.error;

  if (auth.user.role !== ROLES.ADMIN) {
    return errorResponse(ERROR_MESSAGES.FORBIDDEN, HTTP_STATUS.FORBIDDEN);
  }

  try {
    const body = await request.json().catch(() => ({}));
    const dryRun = body.dryRun === true;
    
    // Get all contacts
    const allContacts = await database.select().from(schema.contacts);
    
    // Group by normalized phone (local number to handle country code differences)
    const phoneGroups = {};
    
    for (const contact of allContacts) {
      const normalized = normalizePhoneForComparison(contact.phone);
      if (!normalized) continue;
      
      const key = normalized.local;
      if (!phoneGroups[key]) {
        phoneGroups[key] = [];
      }
      phoneGroups[key].push(contact);
    }
    
    // Find all IDs to remove (keep oldest, remove rest)
    const idsToRemove = [];
    
    for (const [phone, contacts] of Object.entries(phoneGroups)) {
      if (contacts.length > 1) {
        // Sort by createdAt, keep first (oldest)
        const sorted = contacts.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
        // Add all except first to removal list
        for (let i = 1; i < sorted.length; i++) {
          idsToRemove.push(sorted[i].id);
        }
      }
    }
    
    if (idsToRemove.length === 0) {
      return successResponse({
        removed: 0,
        message: 'No duplicate contacts found',
      });
    }
    
    if (dryRun) {
      return successResponse({
        dryRun: true,
        wouldRemove: idsToRemove.length,
        message: `Would remove ${idsToRemove.length} duplicate contacts`,
      });
    }
    
    // Delete notes for these contacts first
    await database.delete(schema.notes)
      .where(inArray(schema.notes.contactId, idsToRemove));
    
    // Delete the duplicate contacts
    await database.delete(schema.contacts)
      .where(inArray(schema.contacts.id, idsToRemove));
    
    // Log activity
    await logActivity(
      auth.user.id,
      ACTIVITY_ACTIONS.CONTACT_DELETED,
      { count: idsToRemove.length, reason: 'duplicate_removal' },
      null,
      'contact'
    );
    
    return successResponse({
      removed: idsToRemove.length,
      message: `Successfully removed ${idsToRemove.length} duplicate contacts`,
    });
  } catch (error) {
    logger.error('Remove duplicates error', { error: error.message });
    return errorResponse(ERROR_MESSAGES.SERVER_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
}
