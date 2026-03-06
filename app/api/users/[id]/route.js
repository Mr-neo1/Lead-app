import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { db, initializeDatabase, schema, eq, generateId, now } from '@/lib/turso';
import { requireAdmin } from '@/lib/auth';

// Update user (admin only)
export async function PUT(request, { params }) {
  await initializeDatabase();
  const database = db();
  
  const auth = requireAdmin(request);
  if (auth.error) return auth.error;

  try {
    const { id } = params;
    const { name, password, areaIds } = await request.json();

    const [user] = await database.select().from(schema.users)
      .where(eq(schema.users.id, id)).limit(1);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Build update object
    const updateFields = { updatedAt: now() };
    
    if (name) {
      updateFields.name = name;
    }

    if (password) {
      const hashedPassword = bcrypt.hashSync(password, 12);
      updateFields.password = hashedPassword;
    }

    // Apply updates
    if (Object.keys(updateFields).length > 1) {
      await database.update(schema.users).set(updateFields)
        .where(eq(schema.users.id, id));
    }

    // Update areas only for partners/workers
    if ((user.role === 'partner' || user.role === 'worker') && areaIds !== undefined) {
      await database.delete(schema.userAreas).where(eq(schema.userAreas.userId, id));
      if (areaIds.length > 0) {
        for (const areaId of areaIds) {
          await database.insert(schema.userAreas).values({
            id: generateId(),
            userId: id,
            areaId,
            createdAt: now()
          });
        }
      }
    }

    return NextResponse.json({ success: true, message: 'User updated successfully' });
  } catch (error) {
    console.error('Update user error:', error);
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 });
  }
}

// Delete partner (admin only)
export async function DELETE(request, { params }) {
  await initializeDatabase();
  const database = db();
  
  const auth = requireAdmin(request);
  if (auth.error) return auth.error;

  try {
    const { id } = params;

    const [user] = await database.select().from(schema.users)
      .where(eq(schema.users.id, id)).limit(1);
    if (!user || (user.role !== 'partner' && user.role !== 'worker')) {
      return NextResponse.json({ error: 'Partner not found' }, { status: 404 });
    }

    // Unassign contacts
    await database.update(schema.contacts)
      .set({ assignedTo: null, updatedAt: now() })
      .where(eq(schema.contacts.assignedTo, id));
    
    // Remove user areas
    await database.delete(schema.userAreas).where(eq(schema.userAreas.userId, id));
    
    // Remove user
    await database.delete(schema.users).where(eq(schema.users.id, id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete user error:', error);
    return NextResponse.json({ error: 'Failed to delete user' }, { status: 500 });
  }
}
