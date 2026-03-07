'use client';

import { STORAGE_KEYS } from './constants';

export function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN) : null;
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

/**
 * Enhanced API client with better error handling
 */
class ApiClient {
  constructor(baseUrl = '/api') {
    this.baseUrl = baseUrl;
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    
    const response = await fetch(url, {
      ...options,
      headers: {
        ...getAuthHeaders(),
        ...options.headers,
      },
    });

    // Handle auth errors
    if (response.status === 401 || response.status === 403) {
      localStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
      window.location.href = '/login';
      throw new ApiError('Session expired. Please log in again.', response.status);
    }

    // Parse response
    const contentType = response.headers.get('content-type');
    let data;
    
    if (contentType?.includes('application/json')) {
      data = await response.json();
    } else if (contentType?.includes('text/csv')) {
      data = await response.text();
      return { success: true, data, isFile: true };
    } else {
      data = await response.text();
    }

    // Check for API errors
    if (!response.ok) {
      const errorMessage = data?.error?.message || data?.error || 'An error occurred';
      throw new ApiError(errorMessage, response.status, data?.error?.details);
    }

    return data;
  }

  async get(endpoint, params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const url = queryString ? `${endpoint}?${queryString}` : endpoint;
    return this.request(url, { method: 'GET' });
  }

  async post(endpoint, body) {
    return this.request(endpoint, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async put(endpoint, body) {
    return this.request(endpoint, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }

  async delete(endpoint, body = null) {
    return this.request(endpoint, {
      method: 'DELETE',
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  }

  // Upload FormData (for file uploads)
  async uploadFormData(endpoint, formData, method = 'POST') {
    const token = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN) : null;
    const url = `${this.baseUrl}${endpoint}`;
    
    const response = await fetch(url, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        // Don't set Content-Type - browser will set it with boundary for FormData
      },
      body: formData,
    });

    if (response.status === 401 || response.status === 403) {
      localStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
      window.location.href = '/login';
      throw new ApiError('Session expired. Please log in again.', response.status);
    }

    const data = await response.json();

    if (!response.ok) {
      const errorMessage = data?.error?.message || data?.error || 'An error occurred';
      throw new ApiError(errorMessage, response.status, data?.error?.details);
    }

    return data;
  }
}

// API Error class
export class ApiError extends Error {
  constructor(message, status, details = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

// Create singleton instance
export const api = new ApiClient();

// Legacy function for backward compatibility
export async function fetchApi(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...getAuthHeaders(),
      ...options.headers,
    },
  });

  if (response.status === 401 || response.status === 403) {
    localStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }

  return response;
}

// ===== API Service Functions =====

// Auth
export const authApi = {
  login: (username, password) => api.post('/auth/login', { username, password }),
  me: () => api.get('/auth/me'),
  changePassword: (data) => api.post('/auth/change-password', data),
  // data: { currentPassword, newPassword } - for own password
  // data: { userId, newPassword } - admin changing other user's password
};

// Contacts
export const contactsApi = {
  getAll: (params = {}) => api.get('/contacts', params),
  getOne: (id) => api.get(`/contacts/${id}`),
  create: (data) => api.post('/contacts', data),
  update: (id, data) => api.put(`/contacts/${id}`, data),
  delete: (id) => api.delete(`/contacts/${id}`),
  // File import with preview support
  previewImport: (file, sheetIndex = 0) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('sheetIndex', sheetIndex.toString());
    return api.uploadFormData('/contacts/import', formData, 'PUT');
  },
  importFile: (file, options = {}) => {
    const formData = new FormData();
    formData.append('file', file);
    if (options.areaId) formData.append('area_id', options.areaId);
    if (options.assignedTo) formData.append('assigned_to', options.assignedTo);
    if (options.columnMapping) formData.append('columnMapping', JSON.stringify(options.columnMapping));
    if (options.sheetIndex !== undefined) formData.append('sheetIndex', options.sheetIndex.toString());
    if (options.groupByCountry) formData.append('groupByCountry', 'true');
    return api.uploadFormData('/contacts/import', formData, 'POST');
  },
  import: (data) => api.post('/contacts/import', data), // Legacy
  export: (params = {}) => api.get('/contacts/export', params),
  bulkAssign: (contactIds, assignedTo) => api.post('/contacts/bulk-assign', { contactIds, assignedTo }),
  bulkAssignByCountry: (countryCode, assignedTo) => api.post('/contacts/bulk-assign', { countryCode, assignedTo }),
  bulkAssignByArea: (areaId, assignedTo) => api.post('/contacts/bulk-assign', { areaId, assignedTo }),
  getCountryGroups: () => api.get('/contacts/bulk-assign'),
  bulkDelete: (contactIds) => api.delete('/contacts/bulk', { contactIds }),
  bulkStatusUpdate: (contactIds, status, notes) => api.put('/contacts/bulk', { contactIds, status, notes }),
  getStats: (params = {}) => api.get('/contacts/stats', params),
  // Country recategorization
  previewRecategorize: (overwrite = false) => api.get(`/contacts/recategorize?overwrite=${overwrite}`),
  recategorize: (overwrite = false) => api.post('/contacts/recategorize', { overwrite }),
};

// Users
export const usersApi = {
  getAll: () => api.get('/users'),
  getOne: (id) => api.get(`/users/${id}`),
  create: (data) => api.post('/users', data),
  update: (id, data) => api.put(`/users/${id}`, data),
  delete: (id) => api.delete(`/users/${id}`),
};

// Areas
export const areasApi = {
  getAll: () => api.get('/areas'),
  create: (data) => api.post('/areas', data),
  update: (id, data) => api.put(`/areas/${id}`, data),
  delete: (id) => api.delete(`/areas/${id}`),
};

// Activity Logs
export const activityApi = {
  getAll: (params = {}) => api.get('/activity', params),
};

// Settings (Admin-controlled)
export const settingsApi = {
  getAll: () => api.get('/settings'),
  update: (settings) => api.put('/settings', settings), // { key: value, key2: value2 }
};

// Profile Picture Upload
export const uploadApi = {
  profilePicture: (file, userId = null) => {
    const formData = new FormData();
    formData.append('file', file);
    if (userId) formData.append('userId', userId);
    return api.uploadFormData('/upload', formData);
  },
  deleteProfilePicture: (userId = null) => {
    const params = userId ? `?userId=${userId}` : '';
    return api.delete(`/upload${params}`);
  },
};
