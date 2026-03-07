import { NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { db, initializeDatabase, schema, eq, inArray } from '@/lib/turso';
import { JWT_SECRET } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  await initializeDatabase();
  const database = db();
  
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.split(' ')[1];

  if (!token) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const [user] = await database.select().from(schema.users)
      .where(eq(schema.users.id, decoded.id)).limit(1);
    
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const userAreas = await database.select().from(schema.userAreas)
      .where(eq(schema.userAreas.userId, user.id));
    const areaIds = userAreas.map(ua => ua.areaId);
    const areas = areaIds.length > 0 
      ? await database.select().from(schema.areas).where(inArray(schema.areas.id, areaIds))
      : [];

    return NextResponse.json({
      id: user.id,
      username: user.username,
      name: user.name,
      email: user.email,
      phone: user.phone,
      profilePicture: user.profilePicture,
      role: user.role,
      useDefaultMessages: user.useDefaultMessages ?? true,
      areas: areas.map(a => ({ id: a.id, name: a.name }))
    });
  } catch (error) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 403 });
  }
}
