/**
 * Application Constants
 * Centralized configuration for the Contact Management System
 */

// User roles
export const ROLES = {
  ADMIN: 'admin',
  PARTNER: 'partner',
  WORKER: 'worker', // Deprecated, use PARTNER
};

// Contact statuses with metadata
export const CONTACT_STATUS = {
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  REJECTED: 'rejected',
  FOLLOWUP: 'followup',
  CONVERTED: 'converted',
  UNRESPONSIVE: 'unresponsive',
};

// Status configuration with colors and icons
export const STATUS_CONFIG = {
  [CONTACT_STATUS.PENDING]: {
    label: 'Pending',
    color: 'bg-yellow-100 text-yellow-800',
    bgClass: 'bg-yellow-500',
    icon: '⏳',
    description: 'Awaiting initial contact',
  },
  [CONTACT_STATUS.ACCEPTED]: {
    label: 'Accepted',
    color: 'bg-green-100 text-green-800',
    bgClass: 'bg-green-500',
    icon: '✅',
    description: 'Contact accepted and interested',
  },
  [CONTACT_STATUS.REJECTED]: {
    label: 'Rejected',
    color: 'bg-red-100 text-red-800',
    bgClass: 'bg-red-500',
    icon: '❌',
    description: 'Contact declined',
  },
  [CONTACT_STATUS.FOLLOWUP]: {
    label: 'Follow Up',
    color: 'bg-blue-100 text-blue-800',
    bgClass: 'bg-blue-500',
    icon: '🔄',
    description: 'Requires follow-up contact',
  },
  [CONTACT_STATUS.CONVERTED]: {
    label: 'Converted',
    color: 'bg-purple-100 text-purple-800',
    bgClass: 'bg-purple-500',
    icon: '🎉',
    description: 'Successfully converted',
  },
  [CONTACT_STATUS.UNRESPONSIVE]: {
    label: 'Unresponsive',
    color: 'bg-gray-100 text-gray-800',
    bgClass: 'bg-gray-500',
    icon: '📵',
    description: 'No response received',
  },
};

// Priority levels for contacts
export const PRIORITY = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  URGENT: 'urgent',
};

export const PRIORITY_CONFIG = {
  [PRIORITY.LOW]: {
    label: 'Low',
    color: 'bg-gray-100 text-gray-700',
    icon: '🔽',
  },
  [PRIORITY.MEDIUM]: {
    label: 'Medium',
    color: 'bg-blue-100 text-blue-700',
    icon: '➡️',
  },
  [PRIORITY.HIGH]: {
    label: 'High',
    color: 'bg-orange-100 text-orange-700',
    icon: '🔺',
  },
  [PRIORITY.URGENT]: {
    label: 'Urgent',
    color: 'bg-red-100 text-red-700',
    icon: '🔥',
  },
};

// API Configuration
export const API_CONFIG = {
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,
  RATE_LIMIT_WINDOW_MS: 15 * 60 * 1000, // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: 100,
  JWT_EXPIRY: '24h',
  REFRESH_TOKEN_EXPIRY: '7d',
};

// HTTP Status Codes
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
};

// Error messages
export const ERROR_MESSAGES = {
  UNAUTHORIZED: 'Authentication required. Please log in.',
  FORBIDDEN: 'You do not have permission to perform this action.',
  NOT_FOUND: 'The requested resource was not found.',
  INVALID_CREDENTIALS: 'Invalid username or password.',
  TOKEN_EXPIRED: 'Your session has expired. Please log in again.',
  VALIDATION_ERROR: 'Validation failed. Please check your input.',
  RATE_LIMIT_EXCEEDED: 'Too many requests. Please try again later.',
  SERVER_ERROR: 'An unexpected error occurred. Please try again.',
  DUPLICATE_ENTRY: 'A record with this information already exists.',
  CONTACT_NOT_FOUND: 'Contact not found.',
  USER_NOT_FOUND: 'User not found.',
  AREA_NOT_FOUND: 'Area not found.',
  AREA_HAS_CONTACTS: 'Cannot delete area with assigned contacts.',
  USER_HAS_CONTACTS: 'Cannot delete user with assigned contacts.',
};

// Success messages
export const SUCCESS_MESSAGES = {
  LOGIN_SUCCESS: 'Successfully logged in.',
  LOGOUT_SUCCESS: 'Successfully logged out.',
  CONTACT_CREATED: 'Contact created successfully.',
  CONTACT_UPDATED: 'Contact updated successfully.',
  CONTACT_DELETED: 'Contact deleted successfully.',
  CONTACTS_IMPORTED: 'Contacts imported successfully.',
  CONTACTS_EXPORTED: 'Contacts exported successfully.',
  CONTACTS_ASSIGNED: 'Contacts assigned successfully.',
  USER_CREATED: 'User created successfully.',
  USER_UPDATED: 'User updated successfully.',
  USER_DELETED: 'User deleted successfully.',
  AREA_CREATED: 'Area created successfully.',
  AREA_UPDATED: 'Area updated successfully.',
  AREA_DELETED: 'Area deleted successfully.',
};

// Validation patterns
export const VALIDATION_PATTERNS = {
  PHONE: /^[\d\s\-\+\(\)]+$/,
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  USERNAME: /^[a-zA-Z0-9_]{3,30}$/,
  PASSWORD_MIN_LENGTH: 6,
};

// Date formats
export const DATE_FORMATS = {
  DISPLAY: 'MMM dd, yyyy',
  DISPLAY_WITH_TIME: 'MMM dd, yyyy HH:mm',
  API: 'yyyy-MM-dd',
  FULL: 'EEEE, MMMM dd, yyyy',
};

// Export formats
export const EXPORT_FORMATS = {
  CSV: 'csv',
  EXCEL: 'xlsx',
  PDF: 'pdf',
  JSON: 'json',
};

// Sort options
export const SORT_OPTIONS = {
  CREATED_AT_DESC: { field: 'createdAt', order: 'desc', label: 'Newest First' },
  CREATED_AT_ASC: { field: 'createdAt', order: 'asc', label: 'Oldest First' },
  NAME_ASC: { field: 'name', order: 'asc', label: 'Name (A-Z)' },
  NAME_DESC: { field: 'name', order: 'desc', label: 'Name (Z-A)' },
  UPDATED_AT_DESC: { field: 'updatedAt', order: 'desc', label: 'Recently Updated' },
  PRIORITY_DESC: { field: 'priority', order: 'desc', label: 'Highest Priority' },
};

// Activity log action types
export const ACTIVITY_ACTIONS = {
  CONTACT_CREATED: 'contact_created',
  CONTACT_UPDATED: 'contact_updated',
  CONTACT_DELETED: 'contact_deleted',
  CONTACT_STATUS_CHANGED: 'contact_status_changed',
  CONTACT_ASSIGNED: 'contact_assigned',
  CONTACTS_IMPORTED: 'contacts_imported',
  CONTACTS_EXPORTED: 'contacts_exported',
  USER_LOGIN: 'user_login',
  USER_LOGOUT: 'user_logout',
  USER_CREATED: 'user_created',
  USER_UPDATED: 'user_updated',
  USER_DELETED: 'user_deleted',
  AREA_CREATED: 'area_created',
  AREA_UPDATED: 'area_updated',
  AREA_DELETED: 'area_deleted',
};

// Dashboard metrics configuration
export const DASHBOARD_METRICS = {
  QUICK_STATS: ['total', 'pending', 'accepted', 'converted'],
  CHART_COLORS: {
    pending: '#FCD34D',
    accepted: '#34D399',
    rejected: '#F87171',
    followup: '#60A5FA',
    converted: '#A78BFA',
    unresponsive: '#9CA3AF',
  },
};

// Local storage keys
export const STORAGE_KEYS = {
  AUTH_TOKEN: 'token',
  USER_PREFERENCES: 'user_preferences',
  THEME: 'theme',
  SIDEBAR_COLLAPSED: 'sidebar_collapsed',
};
