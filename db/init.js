import { db, generateId, now, users, areas, organizations } from './index';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';

// SQL to create all tables
const createTablesSql = `
-- Organizations
CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Users
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  role TEXT NOT NULL DEFAULT 'partner' CHECK(role IN ('admin', 'partner', 'worker')),
  org_id TEXT REFERENCES organizations(id),
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Areas
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

-- User Areas (Junction)
CREATE TABLE IF NOT EXISTS user_areas (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  area_id TEXT NOT NULL REFERENCES areas(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL
);

-- Contacts
CREATE TABLE IF NOT EXISTS contacts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  address TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'accepted', 'rejected', 'followup', 'converted')),
  priority TEXT DEFAULT 'normal' CHECK(priority IN ('low', 'normal', 'high', 'urgent')),
  area_id TEXT REFERENCES areas(id),
  assigned_to TEXT REFERENCES users(id),
  org_id TEXT REFERENCES organizations(id),
  tags TEXT,
  custom_fields TEXT,
  scheduled_follow_up INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Notes
CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Activities
CREATE TABLE IF NOT EXISTS activities (
  id TEXT PRIMARY KEY,
  contact_id TEXT REFERENCES contacts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  type TEXT NOT NULL CHECK(type IN ('status_change', 'note_added', 'call', 'email', 'meeting', 'whatsapp', 'assigned', 'created', 'updated', 'imported')),
  description TEXT,
  metadata TEXT,
  created_at INTEGER NOT NULL
);

-- Follow-ups
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

-- Indexes
CREATE INDEX IF NOT EXISTS idx_contacts_status ON contacts(status);
CREATE INDEX IF NOT EXISTS idx_contacts_area ON contacts(area_id);
CREATE INDEX IF NOT EXISTS idx_contacts_assigned ON contacts(assigned_to);
CREATE INDEX IF NOT EXISTS idx_contacts_org ON contacts(org_id);
CREATE INDEX IF NOT EXISTS idx_activities_contact ON activities(contact_id);
CREATE INDEX IF NOT EXISTS idx_activities_user ON activities(user_id);
CREATE INDEX IF NOT EXISTS idx_notes_contact ON notes(contact_id);
CREATE INDEX IF NOT EXISTS idx_follow_ups_user ON follow_ups(user_id);
CREATE INDEX IF NOT EXISTS idx_follow_ups_due ON follow_ups(due_at);
CREATE INDEX IF NOT EXISTS idx_user_areas_user ON user_areas(user_id);
CREATE INDEX IF NOT EXISTS idx_user_areas_area ON user_areas(area_id);
`;

let initialized = false;
let initPromise = null;

export async function initializeDatabase() {
  if (initialized) return;
  if (initPromise) {
    await initPromise;
    return;
  }

  initPromise = (async () => {
    try {
      // Create tables
      const statements = createTablesSql.split(';').filter(s => s.trim());
      for (const stmt of statements) {
        if (stmt.trim()) {
          await db.run(stmt);
        }
      }

      // Check if admin exists
      const existingAdmin = await db.select().from(users).where(eq(users.role, 'admin')).limit(1);
      
      if (existingAdmin.length === 0) {
        // Create default admin
        const hashedPassword = await bcrypt.hash('admin123', 12);
        const timestamp = now();
        
        await db.insert(users).values({
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

      // Check if default areas exist
      const existingAreas = await db.select().from(areas).limit(1);
      
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
          await db.insert(areas).values({
            id: generateId(),
            ...area,
            isActive: true,
            createdAt: timestamp,
            updatedAt: timestamp,
          });
        }
        if (process.env.NODE_ENV === 'development') {
          console.log('Default areas created');
        }
      }

      initialized = true;
      if (process.env.NODE_ENV === 'development') {
        console.log('Database initialized successfully');
      }
    } catch (error) {
      console.error('Database initialization error:', error);
      initPromise = null;
      throw error;
    }
  })();

  await initPromise;
}
