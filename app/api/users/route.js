import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { db, initializeDatabase, schema, eq, inArray, generateId, now } from '@/lib/turso';
import { requireAdmin } from '@/lib/auth';

// Get all partners (admin only)
export async function GET(request) {
  await initializeDatabase();
  const database = db();
  
  const auth = requireAdmin(request);
  if (auth.error) return auth.error;

  try {
    // Support both 'partner' and legacy 'worker' roles
    const users = await database.select().from(schema.users)
      .where(inArray(schema.users.role, ['partner', 'worker']));

    const usersWithAreas = await Promise.all(users.map(async (user) => {
      const userAreas = await database.select().from(schema.userAreas)
        .where(eq(schema.userAreas.userId, user.id));
      const areaIds = userAreas.map(ua => ua.areaId);
      const areas = areaIds.length > 0 
        ? await database.select().from(schema.areas).where(inArray(schema.areas.id, areaIds))
        : [];
      return {
        id: user.id,
        username: user.username,
        name: user.name,
        email: user.email,
        phone: user.phone,
        profilePicture: user.profilePicture,
        role: user.role,
        useDefaultMessages: user.useDefaultMessages ?? true,
        createdAt: user.createdAt,
        areas: areas.map(a => ({ id: a.id, name: a.name }))
      };
    }));

    return NextResponse.json(usersWithAreas);
  } catch (error) {
    console.error('Get users error:', error);
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
  }
}

// Create new partner (admin only)
export async function POST(request) {
  await initializeDatabase();
  const database = db();
  
  const auth = requireAdmin(request);
  if (auth.error) return auth.error;

  try {
    const { username, password, name, email, phone, role, useDefaultMessages, areaIds } = await request.json();

    if (!username || !password || !name) {
      return NextResponse.json({ error: 'Username, password, and name required' }, { status: 400 });
    }

    const [existing] = await database.select().from(schema.users)
      .where(eq(schema.users.username, username)).limit(1);
    if (existing) {
      return NextResponse.json({ error: 'Username already exists' }, { status: 400 });
    }

    const userId = generateId();
    const hashedPassword = bcrypt.hashSync(password, 10);
    const userRole = role === 'admin' ? 'admin' : 'partner';
    await database.insert(schema.users).values({
      id: userId,
      username,
      password: hashedPassword,
      name,
      email: email || null,
      phone: phone || null,
      role: userRole,
      useDefaultMessages: useDefaultMessages ?? true,
      createdAt: now(),
      updatedAt: now()
    });

    if (areaIds && areaIds.length > 0) {
      for (const areaId of areaIds) {
        await database.insert(schema.userAreas).values({
          id: generateId(),
          userId,
          areaId,
          createdAt: now()
        });
      }
    }

    return NextResponse.json({
      id: userId,
      username,
      name,
      role: userRole,
      areas: areaIds || []
    }, { status: 201 });
  } catch (error) {
    console.error('Create user error:', error);
    return NextResponse.json({ error: 'Failed to create user' }, { status: 500 });
  }
}
