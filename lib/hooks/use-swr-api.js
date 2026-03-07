'use client';

/**
 * SWR-based API hooks for optimized data fetching with caching
 * Provides automatic caching, revalidation, and error handling
 */

import useSWR from 'swr';
import useSWRMutation from 'swr/mutation';
import { api } from '../api-client';

// Global SWR configuration
export const swrConfig = {
  revalidateOnFocus: false,
  revalidateOnReconnect: true,
  dedupingInterval: 5000, // Dedupe requests within 5 seconds
  errorRetryCount: 2,
  errorRetryInterval: 3000,
};

// Generic fetcher that uses our API client
const fetcher = (url) => api.get(url);

// ===== Contacts Hooks =====

/**
 * Fetch contacts with caching
 */
export function useContacts(params = {}) {
  const queryString = new URLSearchParams(params).toString();
  const key = queryString ? `/contacts?${queryString}` : '/contacts';
  
  const { data, error, isLoading, mutate } = useSWR(key, fetcher, {
    ...swrConfig,
    revalidateOnFocus: false,
    keepPreviousData: true, // Keep showing old data while fetching new
  });

  return {
    contacts: data?.data || [],
    pagination: data?.pagination || { page: 1, totalPages: 1, total: 0 },
    isLoading,
    isError: error,
    mutate,
  };
}

/**
 * Fetch single contact
 */
export function useContact(id) {
  const { data, error, isLoading, mutate } = useSWR(
    id ? `/contacts/${id}` : null, 
    fetcher,
    swrConfig
  );

  return {
    contact: data?.data || null,
    isLoading,
    isError: error,
    mutate,
  };
}

/**
 * Fetch contact stats
 */
export function useContactStats() {
  const { data, error, isLoading, mutate } = useSWR('/contacts/stats', fetcher, {
    ...swrConfig,
    refreshInterval: 30000, // Auto-refresh stats every 30 seconds
  });

  return {
    stats: data?.data || data || {},
    isLoading,
    isError: error,
    mutate,
  };
}

// ===== Users/Partners Hooks =====

/**
 * Fetch all users/partners
 */
export function useUsers() {
  const { data, error, isLoading, mutate } = useSWR('/users', fetcher, {
    ...swrConfig,
    revalidateOnFocus: false,
  });

  return {
    users: Array.isArray(data) ? data : (data?.data || []),
    isLoading,
    isError: error,
    mutate,
  };
}

// ===== Areas Hooks =====

/**
 * Fetch all areas
 */
export function useAreas() {
  const { data, error, isLoading, mutate } = useSWR('/areas', fetcher, {
    ...swrConfig,
    revalidateOnFocus: false,
    dedupingInterval: 60000, // Areas don't change often - dedupe for 1 minute
  });

  return {
    areas: Array.isArray(data) ? data : (data?.data || []),
    isLoading,
    isError: error,
    mutate,
  };
}

// ===== Activity Hooks =====

/**
 * Fetch activity logs
 */
export function useActivityLogs(params = {}) {
  const queryString = new URLSearchParams(params).toString();
  const key = queryString ? `/activity?${queryString}` : '/activity';
  
  const { data, error, isLoading, mutate } = useSWR(key, fetcher, {
    ...swrConfig,
    revalidateOnFocus: false,
  });

  return {
    activities: data?.data || [],
    isLoading,
    isError: error,
    mutate,
  };
}

// ===== Dashboard Hook (Batched) =====

/**
 * Fetch all dashboard data in one request
 * This reduces the number of API calls on initial page load
 */
export function useDashboard(userRole = 'admin') {
  const { data, error, isLoading, mutate } = useSWR(
    `/dashboard?role=${userRole}`,
    fetcher,
    {
      ...swrConfig,
      revalidateOnFocus: false,
      refreshInterval: 60000, // Refresh dashboard every minute
    }
  );

  return {
    contacts: data?.contacts || [],
    pagination: data?.pagination || { page: 1, totalPages: 1, total: 0 },
    users: data?.users || [],
    areas: data?.areas || [],
    stats: data?.stats || {},
    isLoading,
    isError: error,
    mutate,
  };
}

// ===== Mutation Helpers =====

/**
 * Helper to create a mutation function for POST/PUT/DELETE
 */
export function useApiMutation(endpoint, method = 'POST') {
  const mutationFn = async (url, { arg }) => {
    switch (method) {
      case 'POST':
        return api.post(url, arg);
      case 'PUT':
        return api.put(url, arg);
      case 'DELETE':
        return api.delete(url, arg);
      default:
        return api.post(url, arg);
    }
  };

  return useSWRMutation(endpoint, mutationFn);
}

// ===== Cache Invalidation Helpers =====

/**
 * Invalidate specific cache keys
 */
export function invalidateKeys(keys, mutate) {
  keys.forEach(key => {
    mutate(key);
  });
}

/**
 * Prefetch data for faster navigation
 */
export function prefetch(key) {
  return api.get(key).catch(() => {}); // Silently fail
}
