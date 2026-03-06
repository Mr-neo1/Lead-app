import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { db, initializeDatabase, schema, eq, inArray } from '@/lib/turso';
import { createToken } from '@/lib/auth';

export async function POST(request) {
  await initializeDatabase();
  const database = db();
  
  try {
    const { username, password } = await request.json();

    if (!username || !password) {
      return NextResponse.json({ error: 'Username and password required' }, { status: 400 });
    }

    const [user] = await database.select().from(schema.users)
      .where(eq(schema.users.username, username)).limit(1);

    if (!user) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    const validPassword = bcrypt.compareSync(password, user.password);
    if (!validPassword) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    // Get user's assigned areas
    const userAreas = await database.select().from(schema.userAreas)
      .where(eq(schema.userAreas.userId, user.id));
    
    const areaIds = userAreas.map(ua => ua.areaId);
    const areas = areaIds.length > 0 
      ? await database.select().from(schema.areas).where(inArray(schema.areas.id, areaIds))
      : [];

    const token = createToken({
      id: user.id,
      username: user.username,
      role: user.role,
      name: user.name
    });

    return NextResponse.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role,
        areas: areas.map(a => ({ id: a.id, name: a.name }))
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json({ error: 'Login failed' }, { status: 500 });
  }
}
