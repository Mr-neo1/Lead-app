import { NextResponse } from 'next/server';
import { db, initializeDatabase, schema, eq, desc, generateId, now, inArray } from '@/lib/turso';
import { verifyToken } from '@/lib/auth';
import {
  errorResponse,
  successResponse,
  validateBody,
  logActivity,
  logger,
  checkRateLimit,
} from '@/lib/api-utils';
import { updateContactSchema, workerUpdateContactSchema } from '@/lib/validations';
import { HTTP_STATUS, ERROR_MESSAGES, ROLES, ACTIVITY_ACTIONS } from '@/lib/constants';

// Helper to authenticate request
async function authenticate(request) {
  const result = verifyToken(request);
  if (result.error) {
    return { error: errorResponse(result.error, result.status || HTTP_STATUS.UNAUTHORIZED) };
  }
  return { user: result.user };
}

// Get single contact
export async function GET(request, { params }) {
  await initializeDatabase();
  const database = db();

  const rateLimitCheck = checkRateLimit(request);
  if (rateLimitCheck.exceeded) return rateLimitCheck.response;

  const auth = await authenticate(request);
  if (auth.error) return auth.error;

  try {
    const { id } = await params;
    const user = auth.user;

    const [contact] = await database.select().from(schema.contacts)
      .where(eq(schema.contacts.id, id)).limit(1);

    if (!contact) {
      return errorResponse(ERROR_MESSAGES.CONTACT_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
    }

    // Workers can only view their assigned contacts
    if (user.role !== ROLES.ADMIN && contact.assignedTo !== user.id) {
      return errorResponse(ERROR_MESSAGES.FORBIDDEN, HTTP_STATUS.FORBIDDEN);
    }

    // Get area and assigned user details
    let area = null;
    let assignedUser = null;

    if (contact.areaId) {
      const [areaResult] = await database.select().from(schema.areas)
        .where(eq(schema.areas.id, contact.areaId)).limit(1);
      area = areaResult;
    }

    if (contact.assignedTo) {
      const [userResult] = await database.select().from(schema.users)
        .where(eq(schema.users.id, contact.assignedTo)).limit(1);
      if (userResult) {
        assignedUser = { id: userResult.id, name: userResult.name, username: userResult.username };
      }
    }

    // Get contact notes
    const notes = await database.select().from(schema.notes)
      .where(eq(schema.notes.contactId, id))
      .orderBy(desc(schema.notes.createdAt));

    // Get user names for notes
    const noteUserIds = [...new Set(notes.map(n => n.userId).filter(Boolean))];
    const noteUsers = noteUserIds.length > 0 
      ? await database.select().from(schema.users).where(inArray(schema.users.id, noteUserIds))
      : [];
    const noteUserMap = Object.fromEntries(noteUsers.map(u => [u.id, u]));

    const history = notes.map(n => ({
      id: n.id,
      body: n.body,
      changedBy: n.userId,
      changedByUser: noteUserMap[n.userId] ? { name: noteUserMap[n.userId].name } : null,
      user_name: noteUserMap[n.userId]?.name || 'Unknown',
      changedAt: n.createdAt,
      created_at: n.createdAt,
    }));

    return successResponse({
      id: contact.id,
      name: contact.name,
      phone: contact.phone,
      email: contact.email,
      address: contact.address,
      areaId: contact.areaId,
      area_id: contact.areaId,
      assignedTo: contact.assignedTo,
      assigned_to: contact.assignedTo,
      status: contact.status,
      priority: contact.priority,
      notes: contact.notes,
      tags: contact.tags ? JSON.parse(contact.tags) : [],
      scheduledFollowUp: contact.scheduledFollowUp,
      area: area ? { id: area.id, name: area.name, color: area.color } : null,
      area_name: area?.name || null,
      areaName: area?.name || null,
      assignedUser,
      assigned_to_name: assignedUser?.name || null,
      assignedToName: assignedUser?.name || null,
      history,
      createdAt: contact.createdAt,
      updatedAt: contact.updatedAt,
      created_at: contact.createdAt,
      updated_at: contact.updatedAt,
    });
  } catch (error) {
    logger.error('Get contact error', { error: error.message, stack: error.stack });
    return errorResponse(ERROR_MESSAGES.SERVER_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
}

// Update contact (admin can update all, workers can only update status/notes)
export async function PUT(request, { params }) {
  await initializeDatabase();
  const database = db();

  const rateLimitCheck = checkRateLimit(request);
  if (rateLimitCheck.exceeded) return rateLimitCheck.response;

  const auth = await authenticate(request);
  if (auth.error) return auth.error;

  try {
    const { id } = await params;
    const user = auth.user;

    const [contact] = await database.select().from(schema.contacts)
      .where(eq(schema.contacts.id, id)).limit(1);
    
    if (!contact) {
      return errorResponse(ERROR_MESSAGES.CONTACT_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
    }

    // Workers can only update their own assigned contacts
    if (user.role !== ROLES.ADMIN && contact.assignedTo !== user.id) {
      return errorResponse(ERROR_MESSAGES.FORBIDDEN, HTTP_STATUS.FORBIDDEN);
    }

    // Validate based on role
    const validationSchema = user.role === ROLES.ADMIN ? updateContactSchema : workerUpdateContactSchema;
    const validation = await validateBody(request, validationSchema);
    if (!validation.valid) return validation.error;

    const data = validation.data;

    // Track what changed
    const changes = {};
    const updateData = { updatedAt: now() };
    
    if (user.role === ROLES.ADMIN) {
      // Admin can update everything
      if (data.name !== undefined && data.name !== contact.name) {
        updateData.name = data.name;
        changes.name = { from: contact.name, to: data.name };
      }
      if (data.phone !== undefined && data.phone !== contact.phone) {
        updateData.phone = data.phone;
        changes.phone = { from: contact.phone, to: data.phone };
      }
      if (data.email !== undefined && data.email !== contact.email) {
        updateData.email = data.email;
        changes.email = { from: contact.email, to: data.email };
      }
      if (data.address !== undefined && data.address !== contact.address) {
        updateData.address = data.address;
        changes.address = { from: contact.address, to: data.address };
      }
      if (data.areaId !== undefined && data.areaId !== contact.areaId) {
        updateData.areaId = data.areaId;
        changes.areaId = { from: contact.areaId, to: data.areaId };
      }
      if (data.assignedTo !== undefined && data.assignedTo !== contact.assignedTo) {
        updateData.assignedTo = data.assignedTo;
        changes.assignedTo = { from: contact.assignedTo, to: data.assignedTo };
      }
      if (data.status !== undefined && data.status !== contact.status) {
        updateData.status = data.status;
        changes.status = { from: contact.status, to: data.status };
      }
      if (data.priority !== undefined && data.priority !== contact.priority) {
        updateData.priority = data.priority;
        changes.priority = { from: contact.priority, to: data.priority };
      }
      if (data.notes !== undefined && data.notes !== contact.notes) {
        updateData.notes = data.notes;
        changes.notes = { from: contact.notes, to: data.notes };
      }
      if (data.tags !== undefined) {
        updateData.tags = JSON.stringify(data.tags);
        changes.tags = { from: contact.tags, to: data.tags };
      }
      if (data.scheduledFollowUp !== undefined) {
        updateData.scheduledFollowUp = data.scheduledFollowUp;
        changes.scheduledFollowUp = { from: contact.scheduledFollowUp, to: data.scheduledFollowUp };
      }
    } else {
      // Workers can only update status and notes
      if (data.status !== undefined && data.status !== contact.status) {
        updateData.status = data.status;
        changes.status = { from: contact.status, to: data.status };
      }
      if (data.notes !== undefined && data.notes !== contact.notes) {
        updateData.notes = data.notes;
        changes.notes = { from: contact.notes, to: data.notes };
      }
    }

    // Apply updates if there are changes
    if (Object.keys(changes).length > 0) {
      await database.update(schema.contacts).set(updateData)
        .where(eq(schema.contacts.id, id));

      // Add note for history tracking
      await database.insert(schema.notes).values({
        id: generateId(),
        contactId: id,
        userId: user.id,
        body: `Updated: ${Object.keys(changes).join(', ')}`,
        createdAt: now(),
        updatedAt: now(),
      });

      // Log activity
      await logActivity(
        user.id,
        changes.status ? ACTIVITY_ACTIONS.CONTACT_STATUS_CHANGED : ACTIVITY_ACTIONS.CONTACT_UPDATED,
        { contactId: id, contactName: contact.name, changes },
        id,
        'contact'
      );
    }

    return successResponse({ success: true, changes });
  } catch (error) {
    logger.error('Update contact error', { error: error.message, stack: error.stack });
    return errorResponse(ERROR_MESSAGES.SERVER_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
}

// Delete contact (admin only)
export async function DELETE(request, { params }) {
  await initializeDatabase();
  const database = db();

  const rateLimitCheck = checkRateLimit(request);
  if (rateLimitCheck.exceeded) return rateLimitCheck.response;

  const auth = await authenticate(request);
  if (auth.error) return auth.error;

  if (auth.user.role !== ROLES.ADMIN) {
    return errorResponse(ERROR_MESSAGES.FORBIDDEN, HTTP_STATUS.FORBIDDEN);
  }

  try {
    const { id } = await params;

    const [contact] = await database.select().from(schema.contacts)
      .where(eq(schema.contacts.id, id)).limit(1);
    
    if (!contact) {
      return errorResponse(ERROR_MESSAGES.CONTACT_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
    }

    // Delete contact notes
    await database.delete(schema.notes).where(eq(schema.notes.contactId, id));
    
    // Delete contact
    await database.delete(schema.contacts).where(eq(schema.contacts.id, id));

    // Log activity
    await logActivity(
      auth.user.id,
      ACTIVITY_ACTIONS.CONTACT_DELETED,
      { contactName: contact.name, phone: contact.phone },
      id,
      'contact'
    );

    return successResponse({ success: true, message: 'Contact deleted successfully' });
  } catch (error) {
    logger.error('Delete contact error', { error: error.message, stack: error.stack });
    return errorResponse(ERROR_MESSAGES.SERVER_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }
}
