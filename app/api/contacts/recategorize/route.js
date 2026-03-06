import { NextResponse } from 'next/server';
import { db, initializeDatabase, schema, generateId, now, eq } from '@/lib/turso';
import { requireAdmin } from '@/lib/auth';
import { parsePhoneCountry, getCountryAreaName, getCountryInfo, COUNTRIES } from '@/lib/phone-utils';

// Re-categorize existing contacts by country code
export async function POST(request) {
  await initializeDatabase();
  const database = db();
  
  const auth = requireAdmin(request);
  if (auth.error) return auth.error;

  try {
    const body = await request.json().catch(() => ({}));
    const overwrite = body.overwrite === true; // Whether to overwrite existing area assignments

    // Get all contacts
    const contacts = await database.select().from(schema.contacts);
    
    // Get existing areas
    const existingAreas = await database.select().from(schema.areas);
    
    // Cache for country areas (countryCode -> areaId)
    const countryAreaCache = {};
    
    // Pre-populate cache with existing country areas
    for (const area of existingAreas) {
      // Check if this is a country area (starts with flag emoji)
      // Flag emojis are regional indicator symbols - we check if name starts with one
      const startsWithFlag = area.name && /^.{1,4}\s/.test(area.name) && 
        Object.values(COUNTRIES).some(c => area.name.startsWith(c.flag));
      
      if (startsWithFlag) {
        // Extract country code by finding matching country
        for (const [code, info] of Object.entries(COUNTRIES)) {
          if (area.name.includes(info.name)) {
            countryAreaCache[code] = area.id;
            break;
          }
        }
      }
    }

    // Helper function to get or create country area
    async function getOrCreateCountryArea(countryCode) {
      if (countryAreaCache[countryCode]) {
        return countryAreaCache[countryCode];
      }

      const countryInfo = getCountryInfo(countryCode);
      const areaName = getCountryAreaName(countryCode);
      
      // Check if area already exists (in case cache missed it)
      const existingArea = existingAreas.find(a => a.name === areaName);
      if (existingArea) {
        countryAreaCache[countryCode] = existingArea.id;
        return existingArea.id;
      }

      // Create new country area
      const newAreaId = generateId();
      const timestamp = now();
      await database.insert(schema.areas).values({
        id: newAreaId,
        name: areaName,
        description: `Auto-created area for ${countryInfo?.name || countryCode} contacts`,
        color: countryInfo?.color || '#6B7280',
        isActive: true,
        createdAt: timestamp,
        updatedAt: timestamp,
      });

      countryAreaCache[countryCode] = newAreaId;
      return newAreaId;
    }

    let updated = 0;
    let skipped = 0;
    let noPhone = 0;
    let noCountry = 0;
    const countriesFound = {};

    for (const contact of contacts) {
      // Skip if no phone
      if (!contact.phone) {
        noPhone++;
        continue;
      }

      // Skip if already has area and overwrite is false
      if (contact.areaId && !overwrite) {
        skipped++;
        continue;
      }

      // Parse phone number
      const phoneInfo = parsePhoneCountry(contact.phone);
      
      if (!phoneInfo || !phoneInfo.countryCode) {
        noCountry++;
        continue;
      }

      // Get or create country area
      const countryAreaId = await getOrCreateCountryArea(phoneInfo.countryCode);
      
      // Update contact
      await database.update(schema.contacts)
        .set({ 
          areaId: countryAreaId,
          updatedAt: now()
        })
        .where(eq(schema.contacts.id, contact.id));

      updated++;
      
      // Track countries found
      if (!countriesFound[phoneInfo.countryCode]) {
        countriesFound[phoneInfo.countryCode] = {
          countryCode: phoneInfo.countryCode,
          countryName: phoneInfo.countryName,
          flag: phoneInfo.flag,
          count: 0
        };
      }
      countriesFound[phoneInfo.countryCode].count++;
    }

    return NextResponse.json({
      success: true,
      updated,
      skipped,
      noPhone,
      noCountry,
      totalContacts: contacts.length,
      countriesFound: Object.values(countriesFound).sort((a, b) => b.count - a.count),
      areasCreated: Object.keys(countryAreaCache).length
    });
  } catch (error) {
    console.error('Recategorize contacts error:', error);
    return NextResponse.json({ error: `Failed to recategorize contacts: ${error.message}` }, { status: 500 });
  }
}

// Get preview of what would be recategorized
export async function GET(request) {
  await initializeDatabase();
  const database = db();
  
  const auth = requireAdmin(request);
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const overwrite = searchParams.get('overwrite') === 'true';

    // Get all contacts
    const contacts = await database.select().from(schema.contacts);
    
    const countriesPreview = {};
    let wouldUpdate = 0;
    let wouldSkip = 0;
    let noPhone = 0;
    let noCountry = 0;

    for (const contact of contacts) {
      if (!contact.phone) {
        noPhone++;
        continue;
      }

      if (contact.areaId && !overwrite) {
        wouldSkip++;
        continue;
      }

      const phoneInfo = parsePhoneCountry(contact.phone);
      
      if (!phoneInfo || !phoneInfo.countryCode) {
        noCountry++;
        continue;
      }

      wouldUpdate++;
      
      if (!countriesPreview[phoneInfo.countryCode]) {
        countriesPreview[phoneInfo.countryCode] = {
          countryCode: phoneInfo.countryCode,
          countryName: phoneInfo.countryName,
          flag: phoneInfo.flag,
          color: phoneInfo.color,
          count: 0
        };
      }
      countriesPreview[phoneInfo.countryCode].count++;
    }

    return NextResponse.json({
      totalContacts: contacts.length,
      wouldUpdate,
      wouldSkip,
      noPhone,
      noCountry,
      countries: Object.values(countriesPreview).sort((a, b) => b.count - a.count)
    });
  } catch (error) {
    console.error('Preview recategorize error:', error);
    return NextResponse.json({ error: 'Failed to preview' }, { status: 500 });
  }
}
