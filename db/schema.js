import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';

// ===== Organizations (Multi-tenant anchor) =====
export const organizations = sqliteTable('organizations', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

// ===== Users =====
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  username: text('username').notNull().unique(),
  password: text('password').notNull(),
  name: text('name').notNull(),
  email: text('email'),
  role: text('role', { enum: ['admin', 'partner', 'worker'] }).notNull().default('partner'),
  orgId: text('org_id').references(() => organizations.id),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

// ===== Areas =====
export const areas = sqliteTable('areas', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  color: text('color').default('#3B82F6'),
  orgId: text('org_id').references(() => organizations.id),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

// ===== User Areas (Junction table) =====
export const userAreas = sqliteTable('user_areas', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  areaId: text('area_id').notNull().references(() => areas.id, { onDelete: 'cascade' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

// ===== Contacts =====
export const contacts = sqliteTable('contacts', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  phone: text('phone'),
  email: text('email'),
  address: text('address'),
  status: text('status', { 
    enum: ['pending', 'accepted', 'rejected', 'followup', 'converted'] 
  }).notNull().default('pending'),
  priority: text('priority', { enum: ['low', 'normal', 'high', 'urgent'] }).default('normal'),
  areaId: text('area_id').references(() => areas.id),
  assignedTo: text('assigned_to').references(() => users.id),
  orgId: text('org_id').references(() => organizations.id),
  tags: text('tags'), // JSON array stored as string
  notes: text('notes'), // Contact notes
  customFields: text('custom_fields'), // JSON object for user-defined fields
  scheduledFollowUp: integer('scheduled_follow_up', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

// ===== Notes (Rich text per contact) =====
export const notes = sqliteTable('notes', {
  id: text('id').primaryKey(),
  contactId: text('contact_id').notNull().references(() => contacts.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id),
  body: text('body').notNull(), // Markdown content
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

// ===== Activity Log =====
export const activities = sqliteTable('activities', {
  id: text('id').primaryKey(),
  contactId: text('contact_id').references(() => contacts.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id),
  action: text('action').notNull(), // Action type like CONTACT_CREATED, STATUS_CHANGED, etc.
  targetType: text('target_type'), // Resource type: contact, user, area, etc.
  targetId: text('target_id'), // Resource ID
  details: text('details'), // JSON for extra data
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

// ===== Follow-ups (Scheduled reminders) =====
export const followUps = sqliteTable('follow_ups', {
  id: text('id').primaryKey(),
  contactId: text('contact_id').notNull().references(() => contacts.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id),
  dueAt: integer('due_at', { mode: 'timestamp' }).notNull(),
  message: text('message'),
  done: integer('done', { mode: 'boolean' }).notNull().default(false),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

// ===== Relations =====
export const usersRelations = relations(users, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [users.orgId],
    references: [organizations.id],
  }),
  userAreas: many(userAreas),
  contacts: many(contacts, { relationName: 'assignedContacts' }),
  notes: many(notes),
  activities: many(activities),
  followUps: many(followUps),
}));

export const areasRelations = relations(areas, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [areas.orgId],
    references: [organizations.id],
  }),
  userAreas: many(userAreas),
  contacts: many(contacts),
}));

export const userAreasRelations = relations(userAreas, ({ one }) => ({
  user: one(users, {
    fields: [userAreas.userId],
    references: [users.id],
  }),
  area: one(areas, {
    fields: [userAreas.areaId],
    references: [areas.id],
  }),
}));

export const contactsRelations = relations(contacts, ({ one, many }) => ({
  area: one(areas, {
    fields: [contacts.areaId],
    references: [areas.id],
  }),
  assignedUser: one(users, {
    fields: [contacts.assignedTo],
    references: [users.id],
    relationName: 'assignedContacts',
  }),
  organization: one(organizations, {
    fields: [contacts.orgId],
    references: [organizations.id],
  }),
  notes: many(notes),
  activities: many(activities),
  followUps: many(followUps),
}));

export const notesRelations = relations(notes, ({ one }) => ({
  contact: one(contacts, {
    fields: [notes.contactId],
    references: [contacts.id],
  }),
  user: one(users, {
    fields: [notes.userId],
    references: [users.id],
  }),
}));

export const activitiesRelations = relations(activities, ({ one }) => ({
  contact: one(contacts, {
    fields: [activities.contactId],
    references: [contacts.id],
  }),
  user: one(users, {
    fields: [activities.userId],
    references: [users.id],
  }),
}));

export const followUpsRelations = relations(followUps, ({ one }) => ({
  contact: one(contacts, {
    fields: [followUps.contactId],
    references: [contacts.id],
  }),
  user: one(users, {
    fields: [followUps.userId],
    references: [users.id],
  }),
}));
