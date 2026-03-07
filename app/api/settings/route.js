import { NextResponse } from 'next/server';
import { db, initializeDatabase, schema, eq, generateId, now } from '@/lib/turso';
import { requireAuth, requireAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Get all settings (authenticated users can read)
export async function GET(request) {
  await initializeDatabase();
  const database = db();
  
  const auth = requireAuth(request);
  if (auth.error) return auth.error;

  try {
    const settings = await database.select().from(schema.appSettings);
    
    // Convert to key-value object for easier client use
    const settingsObj = {};
    settings.forEach(s => {
      settingsObj[s.key] = {
        value: s.value,
        description: s.description,
        updatedAt: s.updatedAt,
      };
    });

    return NextResponse.json(settingsObj, {
      headers: {
        'Cache-Control': 'private, max-age=60', // Cache for 1 minute
      },
    });
  } catch (error) {
    console.error('Get settings error:', error);
    return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
  }
}

// Update settings (admin only)
export async function PUT(request) {
  await initializeDatabase();
  const database = db();
  
  const auth = requireAdmin(request);
  if (auth.error) return auth.error;

  try {
    const updates = await request.json();
    // updates: { key: value, key2: value2, ... }
    
    const timestamp = now();
    const results = [];

    for (const [key, value] of Object.entries(updates)) {
      // Check if setting exists
      const [existing] = await database.select()
        .from(schema.appSettings)
        .where(eq(schema.appSettings.key, key))
        .limit(1);

      if (existing) {
        // Update existing
        await database.update(schema.appSettings)
          .set({ 
            value: typeof value === 'string' ? value : JSON.stringify(value), 
            updatedBy: auth.user.id,
            updatedAt: timestamp 
          })
          .where(eq(schema.appSettings.key, key));
        results.push({ key, action: 'updated' });
      } else {
        // Create new
        await database.insert(schema.appSettings).values({
          id: generateId(),
          key,
          value: typeof value === 'string' ? value : JSON.stringify(value),
          updatedBy: auth.user.id,
          createdAt: timestamp,
          updatedAt: timestamp,
        });
        results.push({ key, action: 'created' });
      }
    }

    return NextResponse.json({ success: true, results });
  } catch (error) {
    console.error('Update settings error:', error);
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
  }
}
