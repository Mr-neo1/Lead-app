import { NextResponse } from 'next/server';
import { db, initializeDatabase, schema, eq, and, desc, inArray, isNull } from '@/lib/turso';
import { requireAuth } from '@/lib/auth';
import { ROLES } from '@/lib/constants';

// Node.js runtime (required for jsonwebtoken)
export const runtime = 'nodejs';

// Revalidate every 30 seconds
export const revalidate = 30;

/**
 * Batched Dashboard API
 * Returns contacts, users, areas, and stats in a single request
 * Reduces network round trips significantly
 */
export async function GET(request) {
  await initializeDatabase();
  const database = db();
  
  const auth = requireAuth(request);
  if (auth.error) return auth.error;

  const user = auth.user;
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = parseInt(url.searchParams.get('limit') || '20');
  const status = url.searchParams.get('status');
  const areaId = url.searchParams.get('areaId');
  const assignedTo = url.searchParams.get('assignedTo');

  try {
    // Build conditions for contacts
    const conditions = [];
    
    // Non-admins can only see their assigned contacts
    if (user.role !== ROLES.ADMIN) {
      conditions.push(eq(schema.contacts.assignedTo, user.id));
    }
    
    if (status && status !== 'all') {
      conditions.push(eq(schema.contacts.status, status));
    }
    
    if (areaId) {
      conditions.push(eq(schema.contacts.areaId, areaId));
    }
    
    if (assignedTo) {
      conditions.push(eq(schema.contacts.assignedTo, assignedTo));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Fetch all data in parallel
    const [contacts, allContacts, usersResult, areasResult] = await Promise.all([
      // Paginated contacts
      database.select()
        .from(schema.contacts)
        .where(whereClause)
        .orderBy(desc(schema.contacts.createdAt))
        .limit(limit)
        .offset((page - 1) * limit),
      
      // All contacts for stats (filtered by user role)
      user.role === ROLES.ADMIN
        ? database.select().from(schema.contacts)
        : database.select().from(schema.contacts).where(eq(schema.contacts.assignedTo, user.id)),
      
      // All users (admin only)
      user.role === ROLES.ADMIN
        ? database.select().from(schema.users).where(inArray(schema.users.role, ['partner', 'worker']))
        : Promise.resolve([]),
      
      // All areas
      database.select().from(schema.areas),
    ]);

    // Calculate stats
    const stats = {
      total: allContacts.length,
      pending: allContacts.filter(c => c.status === 'pending').length,
      accepted: allContacts.filter(c => c.status === 'accepted').length,
      rejected: allContacts.filter(c => c.status === 'rejected').length,
      followup: allContacts.filter(c => c.status === 'followup').length,
      converted: allContacts.filter(c => c.status === 'converted').length,
      unassigned: allContacts.filter(c => !c.assignedTo).length,
    };

    // Get area and user maps for contact enrichment
    const areaIds = [...new Set(contacts.map(c => c.areaId).filter(Boolean))];
    const userIds = [...new Set(contacts.map(c => c.assignedTo).filter(Boolean))];

    const [contactAreas, contactUsers] = await Promise.all([
      areaIds.length > 0 
        ? database.select().from(schema.areas).where(inArray(schema.areas.id, areaIds))
        : [],
      userIds.length > 0 
        ? database.select().from(schema.users).where(inArray(schema.users.id, userIds))
        : []
    ]);

    const areaMap = Object.fromEntries(contactAreas.map(a => [a.id, a]));
    const userMap = Object.fromEntries(contactUsers.map(u => [u.id, u]));

    // Transform contacts with enriched data
    const transformedContacts = contacts.map(c => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      email: c.email,
      address: c.address,
      areaId: c.areaId,
      assignedTo: c.assignedTo,
      status: c.status,
      priority: c.priority,
      notes: c.notes,
      tags: c.tags ? JSON.parse(c.tags) : [],
      areaName: areaMap[c.areaId]?.name || null,
      areaColor: areaMap[c.areaId]?.color || null,
      assignedToName: userMap[c.assignedTo]?.name || null,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }));

    // Format users response (secure - remove passwords)
    const formattedUsers = usersResult.map(u => ({
      id: u.id,
      username: u.username,
      name: u.name,
      role: u.role,
      createdAt: u.createdAt,
    }));

    // Format areas response
    const formattedAreas = areasResult.map(a => ({
      id: a.id,
      name: a.name,
      description: a.description,
      color: a.color,
    }));

    const response = NextResponse.json({
      success: true,
      contacts: transformedContacts,
      pagination: {
        page,
        limit,
        total: allContacts.length,
        totalPages: Math.ceil(allContacts.length / limit),
      },
      users: formattedUsers,
      areas: formattedAreas,
      stats,
    });

    // Add cache headers for Vercel Edge caching
    response.headers.set('Cache-Control', 's-maxage=10, stale-while-revalidate=30');
    
    return response;
  } catch (error) {
    console.error('Dashboard API error:', error);
    return NextResponse.json({ error: 'Failed to fetch dashboard data' }, { status: 500 });
  }
}
