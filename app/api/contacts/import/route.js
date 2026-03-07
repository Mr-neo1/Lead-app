import { NextResponse } from 'next/server';
import { db, initializeDatabase, schema, generateId, now } from '@/lib/turso';
import { requireAdmin } from '@/lib/auth';
import * as XLSX from 'xlsx';
import { eq } from 'drizzle-orm';
import { parsePhoneCountry, getCountryAreaName, getCountryInfo } from '@/lib/phone-utils';

// Supported file types
const SUPPORTED_EXTENSIONS = ['.csv', '.xlsx', '.xls', '.json', '.txt', '.tsv'];

// Parse CSV content
function parseCSV(content, delimiter = ',') {
  const lines = content.split(/\r?\n/).filter(line => line.trim());
  if (lines.length === 0) return { headers: [], rows: [] };

  const parseLine = (line) => {
    const result = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"' && (i === 0 || line[i-1] === delimiter)) {
        inQuotes = true;
      } else if (char === '"' && inQuotes) {
        if (line[i+1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else if (char === delimiter && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  };

  const headers = parseLine(lines[0]).map(h => h.replace(/^"|"$/g, '').trim());
  const rows = lines.slice(1).map(line => {
    const values = parseLine(line);
    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index]?.replace(/^"|"$/g, '').trim() || '';
    });
    return row;
  });

  return { headers, rows };
}

// Parse Excel file
function parseExcel(arrayBuffer, sheetIndex = 0) {
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  const sheetNames = workbook.SheetNames;
  const sheetName = sheetNames[sheetIndex] || sheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  
  const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
    header: 1, defval: '', blankrows: false 
  });
  
  if (jsonData.length === 0) return { headers: [], rows: [], sheetNames };
  
  const headers = jsonData[0].map(h => String(h || '').trim());
  const rows = jsonData.slice(1).map(row => {
    const obj = {};
    headers.forEach((header, index) => {
      obj[header] = row[index] !== undefined ? String(row[index]).trim() : '';
    });
    return obj;
  });
  
  return { headers, rows, sheetNames };
}

// Parse JSON file
function parseJSON(content) {
  const data = JSON.parse(content);
  
  if (Array.isArray(data) && data.length > 0) {
    const headers = [...new Set(data.flatMap(obj => Object.keys(obj)))];
    const rows = data.map(obj => {
      const row = {};
      headers.forEach(header => {
        row[header] = obj[header] !== undefined ? String(obj[header]) : '';
      });
      return row;
    });
    return { headers, rows };
  }
  
  if (typeof data === 'object' && data !== null) {
    const headers = Object.keys(data);
    return { headers, rows: [data] };
  }
  
  throw new Error('Invalid JSON format');
}

// Get file extension
function getFileExtension(filename) {
  const match = filename.match(/\.[^.]+$/);
  return match ? match[0].toLowerCase() : '';
}

// Import contacts from CSV, Excel, JSON, etc. (admin only)
export async function POST(request) {
  await initializeDatabase();
  const database = db();
  
  const auth = requireAdmin(request);
  if (auth.error) return auth.error;

  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const area_id = formData.get('area_id') || null;
    const assigned_to = formData.get('assigned_to') || null;
    const columnMapping = formData.get('columnMapping');
    const sheetIndex = parseInt(formData.get('sheetIndex') || '0', 10);
    const groupByCountry = formData.get('groupByCountry') === 'true';

    if (!file) {
      return NextResponse.json({ error: 'File required' }, { status: 400 });
    }

    const ext = getFileExtension(file.name);
    if (!SUPPORTED_EXTENSIONS.includes(ext)) {
      return NextResponse.json({ 
        error: `Unsupported file type: ${ext}. Supported: ${SUPPORTED_EXTENSIONS.join(', ')}` 
      }, { status: 400 });
    }

    let parseResult;

    // Parse based on file type
    if (['.xlsx', '.xls'].includes(ext)) {
      const arrayBuffer = await file.arrayBuffer();
      parseResult = parseExcel(arrayBuffer, sheetIndex);
    } else if (ext === '.json') {
      const content = await file.text();
      parseResult = parseJSON(content);
    } else if (ext === '.tsv') {
      const content = await file.text();
      parseResult = parseCSV(content, '\t');
    } else {
      // CSV or TXT
      const content = await file.text();
      parseResult = parseCSV(content);
    }

    const { headers, rows } = parseResult;

    if (rows.length === 0) {
      return NextResponse.json({ error: 'File must have at least one data row' }, { status: 400 });
    }

    // Parse column mapping if provided
    let mapping = {};
    if (columnMapping) {
      try {
        mapping = JSON.parse(columnMapping);
      } catch (e) {
        // If no mapping, try to auto-detect columns
      }
    }

    // Auto-detect columns if no mapping provided
    if (Object.keys(mapping).length === 0) {
      const normalizedHeaders = headers.map(h => h.toLowerCase().replace(/[_\s-]/g, ''));
      headers.forEach((header, index) => {
        const norm = normalizedHeaders[index];
        if (['name', 'fullname', 'contactname', 'firstname'].includes(norm)) {
          mapping[header] = 'name';
        } else if (['phone', 'tel', 'telephone', 'mobile', 'cell', 'phonenumber'].includes(norm)) {
          mapping[header] = 'phone';
        } else if (['email', 'mail', 'emailaddress', 'emailid'].includes(norm)) {
          mapping[header] = 'email';
        } else if (['address', 'addr', 'location', 'streetaddress'].includes(norm)) {
          mapping[header] = 'address';
        } else if (['notes', 'note', 'comment', 'comments', 'remark', 'remarks'].includes(norm)) {
          mapping[header] = 'notes';
        } else if (['tags', 'tag', 'label', 'labels', 'category'].includes(norm)) {
          mapping[header] = 'tags';
        }
      });
    }

    // Find the name column
    const nameColumn = Object.entries(mapping).find(([k, v]) => v === 'name')?.[0];
    if (!nameColumn) {
      return NextResponse.json({ 
        error: 'Could not find "name" column. Please ensure your file has a name column or provide column mapping.' 
      }, { status: 400 });
    }

    // Find phone column for country detection and duplicate checking
    const phoneColumn = Object.entries(mapping).find(([k, v]) => v === 'phone')?.[0];

    // Normalize phone number for comparison
    // Handles country codes: +52 722 549 3975 and 722 549 3975 should match
    const normalizePhone = (phone) => {
      if (!phone) return null;
      // Remove all non-digits
      let digits = phone.replace(/\D/g, '');
      if (!digits) return null;
      // If 10+ digits, extract last 10 as local number for comparison
      // This handles entries with/without country codes
      if (digits.length >= 10) {
        return digits.slice(-10);
      }
      return digits;
    };

    // Fetch all existing phone numbers from database for duplicate check
    const existingContacts = await database.select({ phone: schema.contacts.phone })
      .from(schema.contacts);
    const existingPhones = new Set(
      existingContacts
        .map(c => normalizePhone(c.phone))
        .filter(Boolean)
    );

    // Track phones being imported in this batch to avoid duplicates within file
    const importedPhones = new Set();

    // Cache for country areas (countryCode -> areaId)
    const countryAreaCache = {};
    
    // Helper function to get or create country area
    async function getOrCreateCountryArea(countryCode) {
      // Return from cache if exists
      if (countryAreaCache[countryCode]) {
        return countryAreaCache[countryCode];
      }

      const countryInfo = getCountryInfo(countryCode);
      const areaName = getCountryAreaName(countryCode);
      
      // Check if area already exists
      const existingAreas = await database.select().from(schema.areas);
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

    let imported = 0;
    let skipped = 0;
    let duplicates = 0;
    const countriesCreated = new Set();

    for (const row of rows) {
      const name = row[nameColumn]?.trim();
      
      if (!name) {
        skipped++;
        continue;
      }

      // Get phone from row using mapping
      let rawPhone = null;
      if (phoneColumn && row[phoneColumn]) {
        rawPhone = row[phoneColumn]?.trim();
      }
      const normalizedPhone = normalizePhone(rawPhone);

      // Check for duplicate phone number
      if (normalizedPhone) {
        if (existingPhones.has(normalizedPhone) || importedPhones.has(normalizedPhone)) {
          duplicates++;
          continue;
        }
        importedPhones.add(normalizedPhone);
      }

      const timestamp = now();
      const contactData = {
        id: generateId(),
        name,
        phone: rawPhone || null,
        email: null,
        address: null,
        notes: '',
        tags: null,
        areaId: area_id || null,
        assignedTo: assigned_to || null,
        status: 'pending',
        priority: 'normal',
        createdAt: timestamp,
        updatedAt: timestamp
      };

      // Apply column mapping (except phone which is already handled)
      Object.entries(mapping).forEach(([sourceCol, targetField]) => {
        if (targetField !== 'name' && targetField !== 'phone' && row[sourceCol] !== undefined) {
          const value = row[sourceCol]?.trim() || '';
          if (targetField === 'tags' && value) {
            contactData.tags = JSON.stringify(value.split(',').map(t => t.trim()).filter(Boolean));
          } else {
            contactData[targetField] = value || null;
          }
        }
      });

      // If groupByCountry is enabled and no area_id was provided, detect country from phone
      if (groupByCountry && !area_id && contactData.phone) {
        const countryInfo = parsePhoneCountry(contactData.phone);
        if (countryInfo && countryInfo.countryCode) {
          const countryAreaId = await getOrCreateCountryArea(countryInfo.countryCode);
          contactData.areaId = countryAreaId;
          countriesCreated.add(countryInfo.countryCode);
        }
      }

      await database.insert(schema.contacts).values(contactData);
      imported++;
    }

    return NextResponse.json({ 
      success: true, 
      imported, 
      skipped,
      duplicates,
      total: rows.length,
      fileType: ext,
      headers: headers,
      countriesCreated: Array.from(countriesCreated),
      groupedByCountry: groupByCountry,
      message: duplicates > 0 
        ? `Imported ${imported} contacts. ${duplicates} duplicates skipped (phone already exists).`
        : `Imported ${imported} contacts successfully.`
    });
  } catch (error) {
    console.error('Import contacts error:', error);
    return NextResponse.json({ error: `Failed to import contacts: ${error.message}` }, { status: 500 });
  }
}

// Preview file content (for UI to show data before importing)
export async function PUT(request) {
  const auth = requireAdmin(request);
  if (auth.error) return auth.error;

  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const sheetIndex = parseInt(formData.get('sheetIndex') || '0', 10);

    if (!file) {
      return NextResponse.json({ error: 'File required' }, { status: 400 });
    }

    const ext = getFileExtension(file.name);
    if (!SUPPORTED_EXTENSIONS.includes(ext)) {
      return NextResponse.json({ 
        error: `Unsupported file type: ${ext}. Supported: ${SUPPORTED_EXTENSIONS.join(', ')}` 
      }, { status: 400 });
    }

    let parseResult;

    if (['.xlsx', '.xls'].includes(ext)) {
      const arrayBuffer = await file.arrayBuffer();
      parseResult = parseExcel(arrayBuffer, sheetIndex);
    } else if (ext === '.json') {
      const content = await file.text();
      parseResult = parseJSON(content);
    } else if (ext === '.tsv') {
      const content = await file.text();
      parseResult = parseCSV(content, '\t');
    } else {
      const content = await file.text();
      parseResult = parseCSV(content);
    }

    const { headers, rows, sheetNames } = parseResult;

    // Auto-suggest column mappings
    const suggestedMapping = {};
    const targetFields = ['name', 'phone', 'email', 'address', 'notes', 'tags'];
    const aliases = {
      'tel': 'phone', 'telephone': 'phone', 'mobile': 'phone', 'cell': 'phone',
      'phonenumber': 'phone', 'fullname': 'name', 'contactname': 'name',
      'firstname': 'name', 'mail': 'email', 'emailaddress': 'email',
      'emailid': 'email', 'addr': 'address', 'location': 'address',
      'streetaddress': 'address', 'comment': 'notes', 'comments': 'notes',
      'remark': 'notes', 'remarks': 'notes', 'tag': 'tags', 'label': 'tags',
      'labels': 'tags', 'category': 'tags'
    };

    headers.forEach(header => {
      const normalized = header.toLowerCase().replace(/[_\s-]/g, '');
      
      if (targetFields.includes(normalized)) {
        suggestedMapping[header] = normalized;
      } else if (aliases[normalized]) {
        suggestedMapping[header] = aliases[normalized];
      }
    });

    // Return preview with first 10 rows
    return NextResponse.json({
      success: true,
      fileType: ext,
      fileName: file.name,
      headers,
      sheetNames: sheetNames || [],
      totalRows: rows.length,
      preview: rows.slice(0, 10),
      suggestedMapping,
      targetFields: ['name', 'phone', 'email', 'address', 'notes', 'tags']
    });
  } catch (error) {
    console.error('Preview file error:', error);
    return NextResponse.json({ error: `Failed to parse file: ${error.message}` }, { status: 500 });
  }
}
