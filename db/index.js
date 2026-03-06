import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import * as schema from './schema';

// Environment variables for Turso connection
const url = process.env.TURSO_DATABASE_URL || 'file:local.db';
const authToken = process.env.TURSO_AUTH_TOKEN;

// Create libsql client
const client = createClient({
  url,
  authToken,
});

// Create drizzle database instance with schema
export const db = drizzle(client, { schema });

// Export schema for convenience
export * from './schema';

// Generate unique IDs
export function generateId() {
  return crypto.randomUUID ? crypto.randomUUID() : 
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
}

// Helper to get current timestamp
export function now() {
  return new Date();
}
