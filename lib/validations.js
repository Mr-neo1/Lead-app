/**
 * Validation Schemas using Zod
 * Centralized input validation for API endpoints
 */

import { z } from 'zod';
import { CONTACT_STATUS, PRIORITY, ROLES, VALIDATION_PATTERNS } from './constants';

// ===== Auth Schemas =====
export const loginSchema = z.object({
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(30, 'Username must be at most 30 characters')
    .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores'),
  password: z
    .string()
    .min(6, 'Password must be at least 6 characters'),
});

// ===== User Schemas =====
export const createUserSchema = z.object({
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(30, 'Username must be at most 30 characters')
    .regex(/^[a-zA-Z0-9_]+$/, 'Username must only contain letters, numbers, and underscores'),
  password: z
    .string()
    .min(6, 'Password must be at least 6 characters'),
  name: z
    .string()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name must be at most 100 characters'),
  role: z
    .enum([ROLES.ADMIN, ROLES.PARTNER, ROLES.WORKER], {
      errorMap: () => ({ message: 'Role must be admin, partner, or worker' }),
    })
    .default(ROLES.PARTNER),
  areaIds: z
    .array(z.string())
    .optional()
    .default([]),
  email: z
    .string()
    .email('Invalid email address')
    .optional()
    .nullable(),
  phone: z
    .string()
    .regex(VALIDATION_PATTERNS.PHONE, 'Invalid phone number')
    .optional()
    .nullable(),
  isActive: z
    .boolean()
    .default(true),
});

export const updateUserSchema = z.object({
  name: z
    .string()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name must be at most 100 characters')
    .optional(),
  password: z
    .string()
    .min(6, 'Password must be at least 6 characters')
    .optional()
    .nullable(),
  areaIds: z
    .array(z.string())
    .optional(),
  email: z
    .string()
    .email('Invalid email address')
    .optional()
    .nullable(),
  phone: z
    .string()
    .regex(VALIDATION_PATTERNS.PHONE, 'Invalid phone number')
    .optional()
    .nullable(),
  isActive: z
    .boolean()
    .optional(),
});

// ===== Contact Schemas =====
export const createContactSchema = z.object({
  name: z
    .string()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name must be at most 100 characters'),
  phone: z
    .string()
    .min(5, 'Phone number is required')
    .max(20, 'Phone number is too long')
    .regex(VALIDATION_PATTERNS.PHONE, 'Invalid phone number format'),
  email: z
    .string()
    .email('Invalid email address')
    .optional()
    .nullable()
    .or(z.literal('')),
  address: z
    .string()
    .max(500, 'Address is too long')
    .optional()
    .nullable(),
  areaId: z
    .string()
    .min(1, 'Area is required'),
  assignedTo: z
    .string()
    .optional()
    .nullable(),
  status: z
    .enum(Object.values(CONTACT_STATUS), {
      errorMap: () => ({ message: 'Invalid contact status' }),
    })
    .default(CONTACT_STATUS.PENDING),
  priority: z
    .enum(Object.values(PRIORITY), {
      errorMap: () => ({ message: 'Invalid priority level' }),
    })
    .default(PRIORITY.MEDIUM),
  notes: z
    .string()
    .max(2000, 'Notes are too long')
    .optional()
    .nullable(),
  tags: z
    .array(z.string().max(50))
    .max(10, 'Maximum 10 tags allowed')
    .optional()
    .default([]),
  source: z
    .string()
    .max(100, 'Source is too long')
    .optional()
    .nullable(),
  scheduledFollowUp: z
    .string()
    .datetime()
    .optional()
    .nullable(),
});

export const updateContactSchema = z.object({
  name: z
    .string()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name must be at most 100 characters')
    .optional(),
  phone: z
    .string()
    .min(5, 'Phone number is required')
    .max(20, 'Phone number is too long')
    .regex(VALIDATION_PATTERNS.PHONE, 'Invalid phone number format')
    .optional(),
  email: z
    .string()
    .email('Invalid email address')
    .optional()
    .nullable()
    .or(z.literal('')),
  address: z
    .string()
    .max(500, 'Address is too long')
    .optional()
    .nullable(),
  areaId: z
    .string()
    .optional()
    .nullable()
    .transform(v => v === '' ? null : v),
  assignedTo: z
    .string()
    .optional()
    .nullable()
    .transform(v => v === '' ? null : v),
  status: z
    .enum(Object.values(CONTACT_STATUS), {
      errorMap: () => ({ message: 'Invalid contact status' }),
    })
    .optional(),
  priority: z
    .enum(Object.values(PRIORITY), {
      errorMap: () => ({ message: 'Invalid priority level' }),
    })
    .optional(),
  notes: z
    .string()
    .max(2000, 'Notes are too long')
    .optional()
    .nullable(),
  tags: z
    .array(z.string().max(50))
    .max(10, 'Maximum 10 tags allowed')
    .optional(),
  scheduledFollowUp: z
    .string()
    .datetime()
    .optional()
    .nullable(),
});

// Worker-specific update schema (limited fields)
export const workerUpdateContactSchema = z.object({
  status: z
    .enum(Object.values(CONTACT_STATUS), {
      errorMap: () => ({ message: 'Invalid contact status' }),
    })
    .optional(),
  notes: z
    .string()
    .max(2000, 'Notes are too long')
    .optional()
    .nullable(),
});

// ===== Area Schemas =====
export const createAreaSchema = z.object({
  name: z
    .string()
    .min(2, 'Area name must be at least 2 characters')
    .max(100, 'Area name must be at most 100 characters'),
  description: z
    .string()
    .max(500, 'Description is too long')
    .optional()
    .nullable(),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid color format (use hex like #FF0000)')
    .optional()
    .nullable(),
  isActive: z
    .boolean()
    .default(true),
});

export const updateAreaSchema = z.object({
  name: z
    .string()
    .min(2, 'Area name must be at least 2 characters')
    .max(100, 'Area name must be at most 100 characters')
    .optional(),
  description: z
    .string()
    .max(500, 'Description is too long')
    .optional()
    .nullable(),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid color format (use hex like #FF0000)')
    .optional()
    .nullable(),
  isActive: z
    .boolean()
    .optional(),
});

// ===== Bulk Operation Schemas =====
export const bulkAssignSchema = z.object({
  contactIds: z
    .array(z.string())
    .min(1, 'At least one contact must be selected')
    .max(100, 'Cannot assign more than 100 contacts at once'),
  assignedTo: z
    .string()
    .min(1, 'Worker ID is required'),
});

export const bulkDeleteSchema = z.object({
  contactIds: z
    .array(z.string())
    .min(1, 'At least one contact must be selected')
    .max(100, 'Cannot delete more than 100 contacts at once'),
});

export const bulkStatusUpdateSchema = z.object({
  contactIds: z
    .array(z.string())
    .min(1, 'At least one contact must be selected')
    .max(100, 'Cannot update more than 100 contacts at once'),
  status: z
    .enum(Object.values(CONTACT_STATUS), {
      errorMap: () => ({ message: 'Invalid contact status' }),
    }),
  notes: z
    .string()
    .max(500, 'Notes are too long')
    .optional()
    .nullable(),
});

// ===== Import Schema =====
export const importContactSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  phone: z.string().min(1, 'Phone is required'),
  email: z.string().email().optional().nullable().or(z.literal('')),
  address: z.string().optional().nullable(),
  areaId: z.string().optional().nullable(),
  status: z.enum(Object.values(CONTACT_STATUS)).optional().default(CONTACT_STATUS.PENDING),
  notes: z.string().optional().nullable(),
  tags: z.union([z.string(), z.array(z.string())]).optional().transform(val => {
    if (typeof val === 'string') {
      return val.split(',').map(t => t.trim()).filter(Boolean);
    }
    return val || [];
  }),
});

// ===== Query Params Schemas =====
export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.string().default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const contactFilterSchema = z.object({
  status: z.enum(Object.values(CONTACT_STATUS)).optional(),
  areaId: z.string().optional(),
  assignedTo: z.string().optional(),
  priority: z.enum(Object.values(PRIORITY)).optional(),
  search: z.string().max(100).optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  tags: z.string().transform(val => val?.split(',')).optional(),
  unassigned: z.coerce.boolean().optional(),
});

export const exportSchema = z.object({
  format: z.enum(['csv', 'json', 'xlsx']).default('csv'),
  fields: z.array(z.string()).optional(),
  filters: contactFilterSchema.optional(),
});

// ===== Helper Functions =====

/**
 * Validate data against a schema and return formatted errors
 */
export function validateData(schema, data) {
  try {
    const result = schema.parse(data);
    return { success: true, data: result, errors: null };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errors = error.errors.map(err => ({
        field: err.path.join('.'),
        message: err.message,
      }));
      return { success: false, data: null, errors };
    }
    throw error;
  }
}

/**
 * Safe parse without throwing
 */
export function safeParse(schema, data) {
  return schema.safeParse(data);
}

/**
 * Validate and transform query parameters
 */
export function parseQueryParams(searchParams) {
  const params = {};
  for (const [key, value] of searchParams.entries()) {
    params[key] = value;
  }
  return params;
}
