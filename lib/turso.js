// Turso/Drizzle Database Module
// Provides a unified API for database operations

import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import { eq, and, or, like, desc, asc, sql, inArray, isNull } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import * as schema from '@/db/schema';

// Create client
const getClient = () => {
  const url = process.env.TURSO_DATABASE_URL || 'file:local.db';
  const authToken = process.env.TURSO_AUTH_TOKEN;
  
  return createClient({ url, authToken });
};

// Singleton database instance
let _db = null;
export function db() {
  if (!_db) {
    _db = drizzle(getClient(), { schema });
  }
  return _db;
}

// Generate unique ID
export function generateId() {
  return crypto.randomUUID ? crypto.randomUUID() : 
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
}

// Current timestamp
export function now() {
  return new Date();
}

// SQL for table creation
const createTablesSql = `
CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  profile_picture TEXT,
  role TEXT NOT NULL DEFAULT 'partner',
  org_id TEXT REFERENCES organizations(id),
  is_active INTEGER NOT NULL DEFAULT 1,
  use_default_messages INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS app_settings (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  value TEXT NOT NULL,
  description TEXT,
  org_id TEXT REFERENCES organizations(id),
  updated_by TEXT REFERENCES users(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS areas (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#3B82F6',
  org_id TEXT REFERENCES organizations(id),
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS user_areas (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  area_id TEXT NOT NULL REFERENCES areas(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS contacts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  address TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  priority TEXT DEFAULT 'normal',
  area_id TEXT REFERENCES areas(id),
  assigned_to TEXT REFERENCES users(id),
  org_id TEXT REFERENCES organizations(id),
  tags TEXT,
  notes TEXT,
  custom_fields TEXT,
  scheduled_follow_up INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS activities (
  id TEXT PRIMARY KEY,
  contact_id TEXT REFERENCES contacts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  details TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS follow_ups (
  id TEXT PRIMARY KEY,
  contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  due_at INTEGER NOT NULL,
  message TEXT,
  done INTEGER NOT NULL DEFAULT 0,
  completed_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_contacts_status ON contacts(status);
CREATE INDEX IF NOT EXISTS idx_contacts_area ON contacts(area_id);
CREATE INDEX IF NOT EXISTS idx_contacts_assigned ON contacts(assigned_to);
CREATE INDEX IF NOT EXISTS idx_contacts_phone ON contacts(phone);
CREATE INDEX IF NOT EXISTS idx_activities_contact ON activities(contact_id);
CREATE INDEX IF NOT EXISTS idx_activities_user ON activities(user_id);
CREATE INDEX IF NOT EXISTS idx_notes_contact ON notes(contact_id);
CREATE INDEX IF NOT EXISTS idx_follow_ups_user ON follow_ups(user_id);
CREATE INDEX IF NOT EXISTS idx_follow_ups_due ON follow_ups(due_at);
CREATE INDEX IF NOT EXISTS idx_user_areas_user ON user_areas(user_id);
CREATE INDEX IF NOT EXISTS idx_user_areas_area ON user_areas(area_id);
`;

// Initialization state
let initialized = false;
let initPromise = null;

// Initialize database
export async function initializeDatabase() {
  if (initialized) return;
  if (initPromise) {
    await initPromise;
    return;
  }

  initPromise = (async () => {
    const client = getClient();
    
    try {
      // Create tables
      const statements = createTablesSql.split(';').filter(s => s.trim());
      for (const stmt of statements) {
        if (stmt.trim()) {
          await client.execute(stmt);
        }
      }

      // Migration: Add new columns if they don't exist (for existing databases)
      // MUST run BEFORE any Drizzle queries that reference these columns
      const migrations = [
        'ALTER TABLE users ADD COLUMN phone TEXT',
        'ALTER TABLE users ADD COLUMN profile_picture TEXT',
        'ALTER TABLE users ADD COLUMN use_default_messages INTEGER DEFAULT 1',
      ];
      for (const migration of migrations) {
        try {
          await client.execute(migration);
        } catch (e) {
          // Column already exists, ignore
        }
      }

      const database = db();

      // Check if admin exists
      const existingAdmin = await database.select().from(schema.users)
        .where(eq(schema.users.role, 'admin')).limit(1);
      
      if (existingAdmin.length === 0) {
        const hashedPassword = await bcrypt.hash('admin123', 12);
        const timestamp = now();
        
        await database.insert(schema.users).values({
          id: generateId(),
          username: 'admin',
          password: hashedPassword,
          name: 'Administrator',
          role: 'admin',
          isActive: true,
          createdAt: timestamp,
          updatedAt: timestamp,
        });
        if (process.env.NODE_ENV === 'development') {
          console.log('Default admin created');
        }
      }

      // Check if areas exist
      const existingAreas = await database.select().from(schema.areas).limit(1);
      
      if (existingAreas.length === 0) {
        const timestamp = now();
        const defaultAreas = [
          { name: 'North Zone', color: '#3B82F6', description: 'Northern coverage area' },
          { name: 'South Zone', color: '#10B981', description: 'Southern coverage area' },
          { name: 'East Zone', color: '#F59E0B', description: 'Eastern coverage area' },
          { name: 'West Zone', color: '#EF4444', description: 'Western coverage area' },
          { name: 'Central', color: '#8B5CF6', description: 'Central coverage area' },
        ];
        
        for (const area of defaultAreas) {
          await database.insert(schema.areas).values({
            id: generateId(),
            name: area.name,
            color: area.color,
            description: area.description,
            isActive: true,
            createdAt: timestamp,
            updatedAt: timestamp,
          });
        }
        if (process.env.NODE_ENV === 'development') {
          console.log('Default areas created');
        }
      }

      // Initialize default settings if not exist
      const existingSettings = await database.select().from(schema.appSettings).limit(1);
      if (existingSettings.length === 0) {
        const timestamp = now();
        const defaultSettings = [
          {
            key: 'whatsapp_template',
            value: 'Hola {contact_name}, soy {partner_name}. Me gustaría hablar contigo sobre nuestros servicios. ¿Tienes un momento?',
            description: 'Default WhatsApp message template. Placeholders: {contact_name}, {partner_name}, {area}, {company}'
          },
          {
            key: 'email_subject_template',
            value: 'Seguimiento de {partner_name}',
            description: 'Default email subject template'
          },
          {
            key: 'email_body_template',
            value: 'Estimado/a {contact_name},\n\nEspero que se encuentre bien. Mi nombre es {partner_name} y me gustaría ponerme en contacto con usted.\n\nQuedo a su disposición.\n\nSaludos cordiales,\n{partner_name}',
            description: 'Default email body template'
          },
          {
            key: 'company_name',
            value: 'Mi Empresa',
            description: 'Company name used in templates'
          }
        ];
        
        for (const setting of defaultSettings) {
          await database.insert(schema.appSettings).values({
            id: generateId(),
            key: setting.key,
            value: setting.value,
            description: setting.description,
            createdAt: timestamp,
            updatedAt: timestamp,
          });
        }
        if (process.env.NODE_ENV === 'development') {
          console.log('Default settings created');
        }
      }

      initialized = true;
      if (process.env.NODE_ENV === 'development') {
        console.log('Database initialized successfully (Turso)');
      }
    } catch (error) {
      console.error('Database initialization error:', error);
      initPromise = null;
      throw error;
    }
  })();

  await initPromise;
}

// Re-export schema and operators
export { schema, eq, and, or, like, desc, asc, sql, inArray, isNull };
