import { parsePhoneNumber, isValidPhoneNumber } from 'libphonenumber-js';

// Country metadata (ISO code → name, flag, color)
export const COUNTRIES = {
  AF: { name: 'Afghanistan', flag: '🇦🇫', color: '#000000' },
  AL: { name: 'Albania', flag: '🇦🇱', color: '#E41E20' },
  DZ: { name: 'Algeria', flag: '🇩🇿', color: '#006633' },
  AR: { name: 'Argentina', flag: '🇦🇷', color: '#74ACDF' },
  AU: { name: 'Australia', flag: '🇦🇺', color: '#00008B' },
  AT: { name: 'Austria', flag: '🇦🇹', color: '#ED2939' },
  BD: { name: 'Bangladesh', flag: '🇧🇩', color: '#006A4E' },
  BE: { name: 'Belgium', flag: '🇧🇪', color: '#FDDA24' },
  BR: { name: 'Brazil', flag: '🇧🇷', color: '#009C3B' },
  CA: { name: 'Canada', flag: '🇨🇦', color: '#FF0000' },
  CL: { name: 'Chile', flag: '🇨🇱', color: '#D52B1E' },
  CN: { name: 'China', flag: '🇨🇳', color: '#DE2910' },
  CO: { name: 'Colombia', flag: '🇨🇴', color: '#FCD116' },
  CR: { name: 'Costa Rica', flag: '🇨🇷', color: '#002B7F' },
  CU: { name: 'Cuba', flag: '🇨🇺', color: '#002A8F' },
  CZ: { name: 'Czech Republic', flag: '🇨🇿', color: '#11457E' },
  DK: { name: 'Denmark', flag: '🇩🇰', color: '#C60C30' },
  DO: { name: 'Dominican Republic', flag: '🇩🇴', color: '#002D62' },
  EC: { name: 'Ecuador', flag: '🇪🇨', color: '#FFD100' },
  EG: { name: 'Egypt', flag: '🇪🇬', color: '#C8102E' },
  SV: { name: 'El Salvador', flag: '🇸🇻', color: '#0F47AF' },
  FI: { name: 'Finland', flag: '🇫🇮', color: '#003580' },
  FR: { name: 'France', flag: '🇫🇷', color: '#0055A4' },
  DE: { name: 'Germany', flag: '🇩🇪', color: '#DD0000' },
  GH: { name: 'Ghana', flag: '🇬🇭', color: '#006B3F' },
  GR: { name: 'Greece', flag: '🇬🇷', color: '#0D5EAF' },
  GT: { name: 'Guatemala', flag: '🇬🇹', color: '#4997D0' },
  HN: { name: 'Honduras', flag: '🇭🇳', color: '#0073CF' },
  HK: { name: 'Hong Kong', flag: '🇭🇰', color: '#DE2910' },
  HU: { name: 'Hungary', flag: '🇭🇺', color: '#436F4D' },
  IN: { name: 'India', flag: '🇮🇳', color: '#FF9933' },
  ID: { name: 'Indonesia', flag: '🇮🇩', color: '#FF0000' },
  IR: { name: 'Iran', flag: '🇮🇷', color: '#239F40' },
  IQ: { name: 'Iraq', flag: '🇮🇶', color: '#007A3D' },
  IE: { name: 'Ireland', flag: '🇮🇪', color: '#169B62' },
  IL: { name: 'Israel', flag: '🇮🇱', color: '#0038B8' },
  IT: { name: 'Italy', flag: '🇮🇹', color: '#009246' },
  JM: { name: 'Jamaica', flag: '🇯🇲', color: '#009B3A' },
  JP: { name: 'Japan', flag: '🇯🇵', color: '#BC002D' },
  JO: { name: 'Jordan', flag: '🇯🇴', color: '#007A3D' },
  KE: { name: 'Kenya', flag: '🇰🇪', color: '#006600' },
  KR: { name: 'South Korea', flag: '🇰🇷', color: '#003478' },
  KW: { name: 'Kuwait', flag: '🇰🇼', color: '#007A3D' },
  MY: { name: 'Malaysia', flag: '🇲🇾', color: '#010066' },
  MX: { name: 'Mexico', flag: '🇲🇽', color: '#006847' },
  MA: { name: 'Morocco', flag: '🇲🇦', color: '#C1272D' },
  NL: { name: 'Netherlands', flag: '🇳🇱', color: '#21468B' },
  NZ: { name: 'New Zealand', flag: '🇳🇿', color: '#00247D' },
  NG: { name: 'Nigeria', flag: '🇳🇬', color: '#008751' },
  NO: { name: 'Norway', flag: '🇳🇴', color: '#BA0C2F' },
  PK: { name: 'Pakistan', flag: '🇵🇰', color: '#01411C' },
  PA: { name: 'Panama', flag: '🇵🇦', color: '#005293' },
  PE: { name: 'Peru', flag: '🇵🇪', color: '#D91023' },
  PH: { name: 'Philippines', flag: '🇵🇭', color: '#0038A8' },
  PL: { name: 'Poland', flag: '🇵🇱', color: '#DC143C' },
  PT: { name: 'Portugal', flag: '🇵🇹', color: '#006600' },
  PR: { name: 'Puerto Rico', flag: '🇵🇷', color: '#3A5EAB' },
  QA: { name: 'Qatar', flag: '🇶🇦', color: '#8D1B3D' },
  RO: { name: 'Romania', flag: '🇷🇴', color: '#002B7F' },
  RU: { name: 'Russia', flag: '🇷🇺', color: '#0039A6' },
  SA: { name: 'Saudi Arabia', flag: '🇸🇦', color: '#006C35' },
  SG: { name: 'Singapore', flag: '🇸🇬', color: '#ED2939' },
  ZA: { name: 'South Africa', flag: '🇿🇦', color: '#007749' },
  ES: { name: 'Spain', flag: '🇪🇸', color: '#AA151B' },
  LK: { name: 'Sri Lanka', flag: '🇱🇰', color: '#8D153A' },
  SE: { name: 'Sweden', flag: '🇸🇪', color: '#006AA7' },
  CH: { name: 'Switzerland', flag: '🇨🇭', color: '#FF0000' },
  TW: { name: 'Taiwan', flag: '🇹🇼', color: '#FE0000' },
  TH: { name: 'Thailand', flag: '🇹🇭', color: '#2D2A4A' },
  TR: { name: 'Turkey', flag: '🇹🇷', color: '#E30A17' },
  UA: { name: 'Ukraine', flag: '🇺🇦', color: '#005BBB' },
  AE: { name: 'United Arab Emirates', flag: '🇦🇪', color: '#00732F' },
  GB: { name: 'United Kingdom', flag: '🇬🇧', color: '#012169' },
  US: { name: 'United States', flag: '🇺🇸', color: '#3C3B6E' },
  UY: { name: 'Uruguay', flag: '🇺🇾', color: '#0038A8' },
  VE: { name: 'Venezuela', flag: '🇻🇪', color: '#FFCC00' },
  VN: { name: 'Vietnam', flag: '🇻🇳', color: '#DA251D' },
};

/**
 * Parse a phone number and extract country information
 * @param {string} phone - Phone number string (with or without country code)
 * @returns {object|null} - { countryCode, countryName, flag, color, formattedPhone } or null
 */
export function parsePhoneCountry(phone) {
  if (!phone || typeof phone !== 'string') {
    return null;
  }

  // Clean the phone number
  const cleanPhone = phone.trim();
  
  try {
    // Try parsing the phone number
    const phoneNumber = parsePhoneNumber(cleanPhone);
    
    if (phoneNumber && phoneNumber.country) {
      const countryCode = phoneNumber.country;
      const countryInfo = COUNTRIES[countryCode];
      
      return {
        countryCode,
        countryName: countryInfo?.name || countryCode,
        flag: countryInfo?.flag || '🏳️',
        color: countryInfo?.color || '#6B7280',
        formattedPhone: phoneNumber.formatInternational(),
        isValid: phoneNumber.isValid(),
      };
    }
  } catch (error) {
    // If parsing fails, try to extract country code manually from common formats
  }

  // Try to detect country from +XX prefix
  const prefixMatch = cleanPhone.match(/^\+(\d{1,3})/);
  if (prefixMatch) {
    const prefix = prefixMatch[1];
    const countryCode = getCountryFromCallingCode(prefix);
    if (countryCode) {
      const countryInfo = COUNTRIES[countryCode];
      return {
        countryCode,
        countryName: countryInfo?.name || countryCode,
        flag: countryInfo?.flag || '🏳️',
        color: countryInfo?.color || '#6B7280',
        formattedPhone: cleanPhone,
        isValid: false, // Can't validate without full parsing
      };
    }
  }

  return null;
}

/**
 * Get country code from calling code prefix
 * @param {string} callingCode - e.g., "1", "91", "44"
 * @returns {string|null} - ISO country code or null
 */
function getCountryFromCallingCode(callingCode) {
  const callingCodeMap = {
    '1': 'US', // US/Canada (default to US)
    '7': 'RU',
    '20': 'EG',
    '27': 'ZA',
    '30': 'GR',
    '31': 'NL',
    '32': 'BE',
    '33': 'FR',
    '34': 'ES',
    '36': 'HU',
    '39': 'IT',
    '40': 'RO',
    '41': 'CH',
    '43': 'AT',
    '44': 'GB',
    '45': 'DK',
    '46': 'SE',
    '47': 'NO',
    '48': 'PL',
    '49': 'DE',
    '51': 'PE',
    '52': 'MX',
    '53': 'CU',
    '54': 'AR',
    '55': 'BR',
    '56': 'CL',
    '57': 'CO',
    '58': 'VE',
    '60': 'MY',
    '61': 'AU',
    '62': 'ID',
    '63': 'PH',
    '64': 'NZ',
    '65': 'SG',
    '66': 'TH',
    '81': 'JP',
    '82': 'KR',
    '84': 'VN',
    '86': 'CN',
    '90': 'TR',
    '91': 'IN',
    '92': 'PK',
    '93': 'AF',
    '94': 'LK',
    '95': 'MM',
    '98': 'IR',
    '212': 'MA',
    '213': 'DZ',
    '234': 'NG',
    '254': 'KE',
    '351': 'PT',
    '352': 'LU',
    '353': 'IE',
    '354': 'IS',
    '357': 'CY',
    '358': 'FI',
    '359': 'BG',
    '370': 'LT',
    '371': 'LV',
    '372': 'EE',
    '380': 'UA',
    '420': 'CZ',
    '421': 'SK',
    '503': 'SV',
    '504': 'HN',
    '505': 'NI',
    '506': 'CR',
    '507': 'PA',
    '509': 'HT',
    '852': 'HK',
    '853': 'MO',
    '886': 'TW',
    '962': 'JO',
    '964': 'IQ',
    '965': 'KW',
    '966': 'SA',
    '971': 'AE',
    '972': 'IL',
    '974': 'QA',
  };

  // Try exact match first
  if (callingCodeMap[callingCode]) {
    return callingCodeMap[callingCode];
  }

  // Try progressively shorter prefixes (for 3-digit codes)
  if (callingCode.length >= 3) {
    const threeDigit = callingCode.substring(0, 3);
    if (callingCodeMap[threeDigit]) return callingCodeMap[threeDigit];
  }
  if (callingCode.length >= 2) {
    const twoDigit = callingCode.substring(0, 2);
    if (callingCodeMap[twoDigit]) return callingCodeMap[twoDigit];
  }
  if (callingCode.length >= 1) {
    const oneDigit = callingCode.substring(0, 1);
    if (callingCodeMap[oneDigit]) return callingCodeMap[oneDigit];
  }

  return null;
}

/**
 * Get area name for a country code
 * @param {string} countryCode - ISO country code (e.g., "US", "IN")
 * @returns {string} - Area name with flag (e.g., "🇺🇸 United States")
 */
export function getCountryAreaName(countryCode) {
  const country = COUNTRIES[countryCode];
  if (country) {
    return `${country.flag} ${country.name}`;
  }
  return `🏳️ ${countryCode}`;
}

/**
 * Get country info by code
 * @param {string} countryCode - ISO country code
 * @returns {object|null} - Country info or null
 */
export function getCountryInfo(countryCode) {
  return COUNTRIES[countryCode] || null;
}

/**
 * Check if an area name represents a country area
 * @param {string} areaName - Area name to check
 * @returns {boolean} - True if it's a country area
 */
export function isCountryArea(areaName) {
  if (!areaName) return false;
  // Country areas start with a flag emoji - check if starts with any known flag
  return Object.values(COUNTRIES).some(c => areaName.startsWith(c.flag));
}

/**
 * Extract country code from area name
 * @param {string} areaName - Area name (e.g., "🇺🇸 United States")
 * @returns {string|null} - Country code or null
 */
export function getCountryCodeFromAreaName(areaName) {
  if (!isCountryArea(areaName)) return null;
  
  // Find the country by matching the name
  for (const [code, info] of Object.entries(COUNTRIES)) {
    if (areaName.includes(info.name)) {
      return code;
    }
  }
  return null;
}

/**
 * Get all supported countries as options for dropdown
 * @returns {Array} - Array of { value, label, flag, color }
 */
export function getCountryOptions() {
  return Object.entries(COUNTRIES)
    .map(([code, info]) => ({
      value: code,
      label: info.name,
      flag: info.flag,
      color: info.color,
      displayName: `${info.flag} ${info.name}`,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}
