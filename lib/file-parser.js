import * as XLSX from 'xlsx';

// Supported file types
export const SUPPORTED_FILE_TYPES = {
  CSV: ['.csv'],
  EXCEL: ['.xlsx', '.xls'],
  JSON: ['.json'],
  TEXT: ['.txt', '.tsv'],
};

export const SUPPORTED_EXTENSIONS = [
  ...SUPPORTED_FILE_TYPES.CSV,
  ...SUPPORTED_FILE_TYPES.EXCEL,
  ...SUPPORTED_FILE_TYPES.JSON,
  ...SUPPORTED_FILE_TYPES.TEXT,
];

export const SUPPORTED_MIME_TYPES = [
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/json',
  'text/plain',
  'text/tab-separated-values',
];

/**
 * Get file extension from filename
 */
export function getFileExtension(filename) {
  const match = filename.match(/\.[^.]+$/);
  return match ? match[0].toLowerCase() : '';
}

/**
 * Check if file type is supported
 */
export function isFileTypeSupported(filename) {
  const ext = getFileExtension(filename);
  return SUPPORTED_EXTENSIONS.includes(ext);
}

/**
 * Parse CSV content
 */
function parseCSV(content, delimiter = ',') {
  const lines = content.split(/\r?\n/).filter(line => line.trim());
  if (lines.length === 0) return { headers: [], rows: [] };

  // Handle quoted values with commas inside
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

/**
 * Parse TSV content
 */
function parseTSV(content) {
  return parseCSV(content, '\t');
}

/**
 * Parse Excel file (xlsx/xls)
 */
async function parseExcel(arrayBuffer, sheetIndex = 0) {
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  
  // Get sheet names for selection
  const sheetNames = workbook.SheetNames;
  
  // Use specified sheet or first sheet
  const sheetName = sheetNames[sheetIndex] || sheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  
  // Convert to JSON with headers
  const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
    header: 1,
    defval: '',
    blankrows: false 
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

/**
 * Parse JSON file
 */
function parseJSON(content) {
  const data = JSON.parse(content);
  
  // Handle array of objects
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
  
  // Handle single object
  if (typeof data === 'object' && data !== null) {
    const headers = Object.keys(data);
    return { headers, rows: [data] };
  }
  
  throw new Error('Invalid JSON format. Expected array of objects or object.');
}

/**
 * Parse text file (attempt to detect format)
 */
function parseText(content) {
  // Try to detect delimiter
  const firstLine = content.split(/\r?\n/)[0] || '';
  
  if (firstLine.includes('\t')) {
    return parseTSV(content);
  }
  
  if (firstLine.includes(',')) {
    return parseCSV(content);
  }
  
  // Try semicolon
  if (firstLine.includes(';')) {
    return parseCSV(content, ';');
  }
  
  // Default to CSV
  return parseCSV(content);
}

/**
 * Main file parser function
 * @param {File} file - The file to parse
 * @param {Object} options - Parser options
 * @returns {Promise<{headers: string[], rows: Object[], sheetNames?: string[]}>}
 */
export async function parseFile(file, options = {}) {
  const { sheetIndex = 0 } = options;
  const ext = getFileExtension(file.name);
  
  if (!isFileTypeSupported(file.name)) {
    throw new Error(`Unsupported file type: ${ext}. Supported: ${SUPPORTED_EXTENSIONS.join(', ')}`);
  }
  
  try {
    // Excel files
    if (SUPPORTED_FILE_TYPES.EXCEL.includes(ext)) {
      const arrayBuffer = await file.arrayBuffer();
      return await parseExcel(arrayBuffer, sheetIndex);
    }
    
    // Text-based files
    const content = await file.text();
    
    if (SUPPORTED_FILE_TYPES.CSV.includes(ext)) {
      return parseCSV(content);
    }
    
    if (SUPPORTED_FILE_TYPES.JSON.includes(ext)) {
      return parseJSON(content);
    }
    
    if (ext === '.tsv') {
      return parseTSV(content);
    }
    
    // Generic text files - try to detect format
    return parseText(content);
    
  } catch (error) {
    throw new Error(`Failed to parse file: ${error.message}`);
  }
}

/**
 * Validate and filter rows based on required fields
 */
export function filterValidRows(rows, requiredFields = []) {
  if (requiredFields.length === 0) return { validRows: rows, invalidRows: [] };
  
  const validRows = [];
  const invalidRows = [];
  
  rows.forEach((row, index) => {
    const hasRequired = requiredFields.every(field => {
      const value = row[field];
      return value !== undefined && value !== null && String(value).trim() !== '';
    });
    
    if (hasRequired) {
      validRows.push(row);
    } else {
      invalidRows.push({ row, index: index + 2 }); // +2 for header row and 1-based index
    }
  });
  
  return { validRows, invalidRows };
}

/**
 * Map columns from source to target fields
 */
export function mapColumns(rows, columnMapping) {
  return rows.map(row => {
    const mappedRow = {};
    Object.entries(columnMapping).forEach(([sourceCol, targetField]) => {
      if (sourceCol && targetField && row[sourceCol] !== undefined) {
        mappedRow[targetField] = row[sourceCol];
      }
    });
    return mappedRow;
  });
}

/**
 * Get suggested column mappings based on header names
 */
export function suggestColumnMappings(headers, targetFields) {
  const suggestions = {};
  const normalizedTargets = targetFields.map(f => ({
    original: f,
    normalized: f.toLowerCase().replace(/[_\s-]/g, ''),
  }));
  
  headers.forEach(header => {
    const normalizedHeader = header.toLowerCase().replace(/[_\s-]/g, '');
    
    // Exact match
    const exactMatch = normalizedTargets.find(t => t.normalized === normalizedHeader);
    if (exactMatch) {
      suggestions[header] = exactMatch.original;
      return;
    }
    
    // Partial match
    const partialMatch = normalizedTargets.find(t => 
      normalizedHeader.includes(t.normalized) || t.normalized.includes(normalizedHeader)
    );
    if (partialMatch) {
      suggestions[header] = partialMatch.original;
      return;
    }
    
    // Common aliases
    const aliases = {
      'tel': 'phone',
      'telephone': 'phone',
      'mobile': 'phone',
      'cell': 'phone',
      'contact': 'phone',
      'phonenumber': 'phone',
      'fullname': 'name',
      'contactname': 'name',
      'firstname': 'name',
      'lastname': 'name',
      'mail': 'email',
      'emailaddress': 'email',
      'emailid': 'email',
      'addr': 'address',
      'location': 'address',
      'city': 'address',
      'streetaddress': 'address',
      'comment': 'notes',
      'comments': 'notes',
      'remark': 'notes',
      'remarks': 'notes',
      'description': 'notes',
      'tag': 'tags',
      'label': 'tags',
      'labels': 'tags',
      'category': 'tags',
      'categories': 'tags',
    };
    
    const aliasMatch = aliases[normalizedHeader];
    if (aliasMatch) {
      const targetField = normalizedTargets.find(t => t.normalized === aliasMatch);
      if (targetField) {
        suggestions[header] = targetField.original;
      }
    }
  });
  
  return suggestions;
}

/**
 * Get file type display name
 */
export function getFileTypeLabel(filename) {
  const ext = getFileExtension(filename);
  const labels = {
    '.csv': 'CSV',
    '.xlsx': 'Excel (XLSX)',
    '.xls': 'Excel (XLS)',
    '.json': 'JSON',
    '.txt': 'Text',
    '.tsv': 'TSV',
  };
  return labels[ext] || 'Unknown';
}
