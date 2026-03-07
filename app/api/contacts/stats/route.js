import { NextResponse } from 'next/server';
import { db, initializeDatabase, schema, eq } from '@/lib/turso';
import { requireAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Get contact stats
export async function GET(request) {
  await initializeDatabase();
  const database = db();
  
  const auth = requireAuth(request);
  if (auth.error) return auth.error;

  try {
    const user = auth.user;
    let contacts;

    if (user.role !== 'admin') {
      contacts = await database.select().from(schema.contacts)
        .where(eq(schema.contacts.assignedTo, user.id));
    } else {
      contacts = await database.select().from(schema.contacts);
    }

    const stats = {
      total: contacts.length,
      pending: contacts.filter(c => c.status === 'pending').length,
      accepted: contacts.filter(c => c.status === 'accepted').length,
      rejected: contacts.filter(c => c.status === 'rejected').length,
      followup: contacts.filter(c => c.status === 'followup').length
    };

    const response = NextResponse.json(stats);
    // Cache for 30 seconds, allow stale for 2 minutes
    response.headers.set('Cache-Control', 'private, s-maxage=30, stale-while-revalidate=120');
    return response;
  } catch (error) {
    console.error('Get stats error:', error);
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
  }
}
