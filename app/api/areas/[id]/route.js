import { NextResponse } from 'next/server';
import { db, initializeDatabase, schema, eq, now } from '@/lib/turso';
import { requireAdmin } from '@/lib/auth';

// Update area (admin only)
export async function PUT(request, { params }) {
  await initializeDatabase();
  const database = db();
  
  const auth = requireAdmin(request);
  if (auth.error) return auth.error;

  try {
    const { id } = params;
    const { name, description } = await request.json();

    const [area] = await database.select().from(schema.areas)
      .where(eq(schema.areas.id, id)).limit(1);
    if (!area) {
      return NextResponse.json({ error: 'Area not found' }, { status: 404 });
    }

    await database.update(schema.areas)
      .set({
        name: name || area.name,
        description: description !== undefined ? description : area.description,
        updatedAt: now()
      })
      .where(eq(schema.areas.id, id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Update area error:', error);
    return NextResponse.json({ error: 'Failed to update area' }, { status: 500 });
  }
}

// Delete area (admin only)
export async function DELETE(request, { params }) {
  await initializeDatabase();
  const database = db();
  
  const auth = requireAdmin(request);
  if (auth.error) return auth.error;

  try {
    const { id } = params;

    const [area] = await database.select().from(schema.areas)
      .where(eq(schema.areas.id, id)).limit(1);
    if (!area) {
      return NextResponse.json({ error: 'Area not found' }, { status: 404 });
    }

    // Unset area from contacts
    await database.update(schema.contacts)
      .set({ areaId: null, updatedAt: now() })
      .where(eq(schema.contacts.areaId, id));
    
    // Remove user area associations
    await database.delete(schema.userAreas).where(eq(schema.userAreas.areaId, id));
    
    // Remove area
    await database.delete(schema.areas).where(eq(schema.areas.id, id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete area error:', error);
    return NextResponse.json({ error: 'Failed to delete area' }, { status: 500 });
  }
}
