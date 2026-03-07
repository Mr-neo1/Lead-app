import { NextResponse } from 'next/server';
import { db, initializeDatabase, schema, eq, generateId, now } from '@/lib/turso';
import { requireAuth, requireAdmin } from '@/lib/auth';

// Revalidate areas every 60 seconds (they don't change often)
export const revalidate = 60;

// Get all areas
export async function GET(request) {
  await initializeDatabase();
  const database = db();
  
  const auth = requireAuth(request);
  if (auth.error) return auth.error;

  try {
    const areas = await database.select().from(schema.areas);
    const sortedAreas = areas.sort((a, b) => a.name.localeCompare(b.name));
    
    const response = NextResponse.json(sortedAreas.map(a => ({ id: a.id, name: a.name, description: a.description })));
    // Cache for 60 seconds on Vercel Edge, allow stale for 5 minutes
    response.headers.set('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
    return response;
  } catch (error) {
    console.error('Get areas error:', error);
    return NextResponse.json({ error: 'Failed to fetch areas' }, { status: 500 });
  }
}

// Create new area (admin only)
export async function POST(request) {
  await initializeDatabase();
  const database = db();
  
  const auth = requireAdmin(request);
  if (auth.error) return auth.error;

  try {
    const { name, description } = await request.json();

    if (!name) {
      return NextResponse.json({ error: 'Area name required' }, { status: 400 });
    }

    const [existing] = await database.select().from(schema.areas)
      .where(eq(schema.areas.name, name)).limit(1);
    if (existing) {
      return NextResponse.json({ error: 'Area already exists' }, { status: 400 });
    }

    const areaId = generateId();
    await database.insert(schema.areas).values({
      id: areaId,
      name,
      description: description || '',
      createdAt: now(),
      updatedAt: now()
    });

    return NextResponse.json({
      id: areaId,
      name,
      description: description || ''
    }, { status: 201 });
  } catch (error) {
    console.error('Create area error:', error);
    return NextResponse.json({ error: 'Failed to create area' }, { status: 500 });
  }
}
