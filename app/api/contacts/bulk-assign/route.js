import { NextResponse } from 'next/server';
import { db, initializeDatabase, schema, eq, inArray, now } from '@/lib/turso';
import { requireAdmin } from '@/lib/auth';
import { parsePhoneCountry, getCountryAreaName } from '@/lib/phone-utils';

// Bulk assign contacts (admin only)
export async function POST(request) {
  await initializeDatabase();
  const database = db();
  
  const auth = requireAdmin(request);
  if (auth.error) return auth.error;

  try {
    // Accept both camelCase and snake_case for backwards compatibility
    const body = await request.json();
    const contactIds = body.contactIds || body.contact_ids;
    const assignedTo = body.assignedTo || body.assigned_to;
    const countryCode = body.countryCode; // New: filter by country code
    const areaId = body.areaId || body.area_id; // New: filter by area

    // If countryCode is provided, find all contacts from that country
    if (countryCode) {
      // Get all contacts with phone numbers
      const allContacts = await database.select().from(schema.contacts);
      
      // Filter contacts by country code
      const matchingContactIds = allContacts
        .filter(contact => {
          if (!contact.phone) return false;
          const phoneInfo = parsePhoneCountry(contact.phone);
          return phoneInfo && phoneInfo.countryCode === countryCode;
        })
        .map(c => c.id);

      if (matchingContactIds.length === 0) {
        return NextResponse.json({ 
          success: true, 
          updated: 0, 
          message: `No contacts found with country code ${countryCode}` 
        });
      }

      await database.update(schema.contacts)
        .set({ assignedTo: assignedTo || null, updatedAt: now() })
        .where(inArray(schema.contacts.id, matchingContactIds));

      return NextResponse.json({ 
        success: true, 
        updated: matchingContactIds.length,
        countryCode 
      });
    }

    // If areaId is provided, assign all contacts in that area
    if (areaId && !contactIds) {
      const areaContacts = await database.select()
        .from(schema.contacts)
        .where(eq(schema.contacts.areaId, areaId));

      const areaContactIds = areaContacts.map(c => c.id);

      if (areaContactIds.length === 0) {
        return NextResponse.json({ 
          success: true, 
          updated: 0, 
          message: 'No contacts found in this area' 
        });
      }

      await database.update(schema.contacts)
        .set({ assignedTo: assignedTo || null, updatedAt: now() })
        .where(inArray(schema.contacts.id, areaContactIds));

      return NextResponse.json({ 
        success: true, 
        updated: areaContactIds.length,
        areaId 
      });
    }

    // Original behavior: assign specific contact IDs
    if (!contactIds || !Array.isArray(contactIds) || contactIds.length === 0) {
      return NextResponse.json({ error: 'Contact IDs, countryCode, or areaId required' }, { status: 400 });
    }

    await database.update(schema.contacts)
      .set({ assignedTo: assignedTo || null, updatedAt: now() })
      .where(inArray(schema.contacts.id, contactIds));

    return NextResponse.json({ success: true, updated: contactIds.length });
  } catch (error) {
    console.error('Bulk assign error:', error);
    return NextResponse.json({ error: 'Failed to assign contacts' }, { status: 500 });
  }
}

// Get contacts grouped by country for bulk assignment UI
export async function GET(request) {
  await initializeDatabase();
  const database = db();
  
  const auth = requireAdmin(request);
  if (auth.error) return auth.error;

  try {
    const contacts = await database.select().from(schema.contacts);
    
    // Group contacts by country code
    const countryGroups = {};
    let noCountryCount = 0;

    for (const contact of contacts) {
      if (contact.phone) {
        const phoneInfo = parsePhoneCountry(contact.phone);
        if (phoneInfo && phoneInfo.countryCode) {
          if (!countryGroups[phoneInfo.countryCode]) {
            countryGroups[phoneInfo.countryCode] = {
              countryCode: phoneInfo.countryCode,
              countryName: phoneInfo.countryName,
              flag: phoneInfo.flag,
              color: phoneInfo.color,
              count: 0,
              assignedCount: 0,
              unassignedCount: 0
            };
          }
          countryGroups[phoneInfo.countryCode].count++;
          if (contact.assignedTo) {
            countryGroups[phoneInfo.countryCode].assignedCount++;
          } else {
            countryGroups[phoneInfo.countryCode].unassignedCount++;
          }
        } else {
          noCountryCount++;
        }
      } else {
        noCountryCount++;
      }
    }

    // Convert to array and sort by count
    const countries = Object.values(countryGroups).sort((a, b) => b.count - a.count);

    return NextResponse.json({
      countries,
      noCountryCount,
      totalContacts: contacts.length
    });
  } catch (error) {
    console.error('Get country groups error:', error);
    return NextResponse.json({ error: 'Failed to get country groups' }, { status: 500 });
  }
}
