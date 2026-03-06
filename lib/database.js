import Datastore from 'nedb-promises';
import bcrypt from 'bcryptjs';
import path from 'path';
import fs from 'fs';
import { ROLES, CONTACT_STATUS, PRIORITY, ACTIVITY_ACTIONS, API_CONFIG } from './constants';

// Create data directory
const dataDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Initialize databases (singleton pattern for serverless)
const createDatabase = () => {
  return {
    users: Datastore.create({ filename: path.join(dataDir, 'users.db'), autoload: true }),
    areas: Datastore.create({ filename: path.join(dataDir, 'areas.db'), autoload: true }),
    userAreas: Datastore.create({ filename: path.join(dataDir, 'user_areas.db'), autoload: true }),
    contacts: Datastore.create({ filename: path.join(dataDir, 'contacts.db'), autoload: true }),
    contactHistory: Datastore.create({ filename: path.join(dataDir, 'contact_history.db'), autoload: true }),
    activityLogs: Datastore.create({ filename: path.join(dataDir, 'activity_logs.db'), autoload: true }),
  };
};

// Global database instance
let db;
export function getDb() {
  if (!db) {
    db = createDatabase();
  }
  return db;
}

// Initialize database with default data
let initialized = false;
let initializationPromise = null;

export async function initializeDatabase() {
  // Already initialized
  if (initialized) return;
  
  // Another request is initializing - wait for it
  if (initializationPromise) {
    await initializationPromise;
    return;
  }
  
  // Create a promise for this initialization
  initializationPromise = (async () => {
    const database = getDb();
    
    try {
      // Create indexes for better query performance
      await database.users.ensureIndex({ fieldName: 'username', unique: true });
      await database.contacts.ensureIndex({ fieldName: 'areaId' });
      await database.contacts.ensureIndex({ fieldName: 'assignedTo' });
      await database.contacts.ensureIndex({ fieldName: 'status' });
      await database.contacts.ensureIndex({ fieldName: 'phone' });
      await database.activityLogs.ensureIndex({ fieldName: 'userId' });
      await database.activityLogs.ensureIndex({ fieldName: 'action' });
      await database.activityLogs.ensureIndex({ fieldName: 'createdAt' });

    // Create default admin if not exists
    const adminExists = await database.users.findOne({ role: ROLES.ADMIN });
    if (!adminExists) {
      const hashedPassword = await bcrypt.hash('admin123', 12);
      await database.users.insert({
        username: 'admin',
        password: hashedPassword,
        name: 'Administrator',
        role: ROLES.ADMIN,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      console.log('Default admin created: username=admin, password=admin123');
    }

    // Create default areas if none exist
    const areasCount = await database.areas.count({});
    if (areasCount === 0) {
      const defaultAreas = [
        { name: 'North Zone', color: '#3B82F6', description: 'Northern coverage area' },
        { name: 'South Zone', color: '#10B981', description: 'Southern coverage area' },
        { name: 'East Zone', color: '#F59E0B', description: 'Eastern coverage area' },
        { name: 'West Zone', color: '#EF4444', description: 'Western coverage area' },
        { name: 'Central', color: '#8B5CF6', description: 'Central coverage area' },
      ];
      for (const area of defaultAreas) {
        await database.areas.insert({
          ...area,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
      console.log('Default areas created');
    }

    initialized = true;
    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Database initialization error:', error);
    // Reset so another attempt can be made
    initializationPromise = null;
    throw error;
  }
  })();
  
  // Wait for initialization
  await initializationPromise;
}

// ===== Repository Pattern Implementation =====

/**
 * Base Repository with common CRUD operations
 */
class BaseRepository {
  constructor(collection) {
    this.collection = collection;
  }

  async findById(id) {
    return await this.collection.findOne({ _id: id });
  }

  async findOne(query) {
    return await this.collection.findOne(query);
  }

  async findAll(query = {}) {
    return await this.collection.find(query);
  }

  async findPaginated(query = {}, options = {}) {
    const { page = 1, limit = API_CONFIG.DEFAULT_PAGE_SIZE, sortBy = 'createdAt', sortOrder = 'desc' } = options;
    const skip = (page - 1) * limit;
    const sort = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };

    const [items, total] = await Promise.all([
      this.collection.find(query).sort(sort).skip(skip).limit(limit),
      this.collection.count(query),
    ]);

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: page * limit < total,
      },
    };
  }

  async create(data) {
    const now = new Date();
    return await this.collection.insert({
      ...data,
      createdAt: now,
      updatedAt: now,
    });
  }

  async update(id, data) {
    return await this.collection.update(
      { _id: id },
      { $set: { ...data, updatedAt: new Date() } },
      { returnUpdatedDocs: true }
    );
  }

  async delete(id) {
    return await this.collection.remove({ _id: id });
  }

  async count(query = {}) {
    return await this.collection.count(query);
  }

  async bulkCreate(items) {
    const now = new Date();
    const itemsWithTimestamp = items.map(item => ({
      ...item,
      createdAt: now,
      updatedAt: now,
    }));
    return await this.collection.insert(itemsWithTimestamp);
  }

  async bulkUpdate(ids, data) {
    return await this.collection.update(
      { _id: { $in: ids } },
      { $set: { ...data, updatedAt: new Date() } },
      { multi: true }
    );
  }

  async bulkDelete(ids) {
    return await this.collection.remove({ _id: { $in: ids } }, { multi: true });
  }
}

/**
 * Contacts Repository with specialized methods
 */
export class ContactsRepository extends BaseRepository {
  constructor() {
    super(getDb().contacts);
  }

  async findWithDetails(query = {}, options = {}) {
    const result = await this.findPaginated(query, options);
    const db = getDb();

    // Enrich contacts with area and user names
    const areaIds = [...new Set(result.items.map(c => c.areaId).filter(Boolean))];
    const userIds = [...new Set(result.items.map(c => c.assignedTo).filter(Boolean))];

    const [areas, users] = await Promise.all([
      db.areas.find({ _id: { $in: areaIds } }),
      db.users.find({ _id: { $in: userIds } }),
    ]);

    const areaMap = Object.fromEntries(areas.map(a => [a._id, a]));
    const userMap = Object.fromEntries(users.map(u => [u._id, u]));

    result.items = result.items.map(contact => ({
      ...contact,
      area: areaMap[contact.areaId] || null,
      assignedUser: userMap[contact.assignedTo] || null,
    }));

    return result;
  }

  async getStats(query = {}) {
    const contacts = await this.findAll(query);
    const stats = {
      total: contacts.length,
      byStatus: {},
      byPriority: {},
      byArea: {},
      unassigned: 0,
      recentlyUpdated: 0,
    };

    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    for (const contact of contacts) {
      // By status
      stats.byStatus[contact.status] = (stats.byStatus[contact.status] || 0) + 1;
      
      // By priority
      if (contact.priority) {
        stats.byPriority[contact.priority] = (stats.byPriority[contact.priority] || 0) + 1;
      }
      
      // By area
      if (contact.areaId) {
        stats.byArea[contact.areaId] = (stats.byArea[contact.areaId] || 0) + 1;
      }
      
      // Unassigned
      if (!contact.assignedTo) {
        stats.unassigned++;
      }
      
      // Recently updated
      if (contact.updatedAt && new Date(contact.updatedAt) >= oneDayAgo) {
        stats.recentlyUpdated++;
      }
    }

    return stats;
  }

  async getHistory(contactId) {
    const db = getDb();
    const history = await db.contactHistory.find({ contactId }).sort({ changedAt: -1 });
    
    // Enrich with user names
    const userIds = [...new Set(history.map(h => h.changedBy).filter(Boolean))];
    const users = await db.users.find({ _id: { $in: userIds } });
    const userMap = Object.fromEntries(users.map(u => [u._id, { name: u.name, username: u.username }]));

    return history.map(h => ({
      ...h,
      changedByUser: userMap[h.changedBy] || null,
    }));
  }

  async addHistory(contactId, userId, changes, previousState = {}) {
    const db = getDb();
    return await db.contactHistory.insert({
      contactId,
      changedBy: userId,
      changes,
      previousState,
      changedAt: new Date(),
    });
  }

  async search(searchTerm, query = {}, options = {}) {
    const regex = new RegExp(searchTerm, 'i');
    const searchQuery = {
      ...query,
      $or: [
        { name: regex },
        { phone: regex },
        { email: regex },
        { address: regex },
        { notes: regex },
      ],
    };
    return await this.findWithDetails(searchQuery, options);
  }

  async findDuplicates(phone) {
    return await this.findAll({ phone });
  }
}

/**
 * Users Repository with specialized methods
 */
export class UsersRepository extends BaseRepository {
  constructor() {
    super(getDb().users);
  }

  async findByUsername(username) {
    return await this.findOne({ username });
  }

  async findWithAreas(query = {}) {
    const users = await this.findAll(query);
    const db = getDb();

    // Get area assignments
    const userIds = users.map(u => u._id);
    const userAreas = await db.userAreas.find({ userId: { $in: userIds } });

    // Get all areas
    const areaIds = [...new Set(userAreas.map(ua => ua.areaId))];
    const areas = await db.areas.find({ _id: { $in: areaIds } });
    const areaMap = Object.fromEntries(areas.map(a => [a._id, a]));

    // Group areas by user
    const userAreaMap = {};
    for (const ua of userAreas) {
      if (!userAreaMap[ua.userId]) userAreaMap[ua.userId] = [];
      if (areaMap[ua.areaId]) {
        userAreaMap[ua.userId].push(areaMap[ua.areaId]);
      }
    }

    return users.map(user => ({
      ...user,
      password: undefined, // Never expose password
      areas: userAreaMap[user._id] || [],
    }));
  }

  async getWorkerStats(userId) {
    const contacts = await getDb().contacts.find({ assignedTo: userId });
    return {
      total: contacts.length,
      byStatus: contacts.reduce((acc, c) => {
        acc[c.status] = (acc[c.status] || 0) + 1;
        return acc;
      }, {}),
    };
  }

  async setAreas(userId, areaIds) {
    const db = getDb();
    await db.userAreas.remove({ userId }, { multi: true });
    
    if (areaIds.length > 0) {
      const assignments = areaIds.map(areaId => ({
        userId,
        areaId,
        createdAt: new Date(),
      }));
      await db.userAreas.insert(assignments);
    }
  }
}

/**
 * Areas Repository with specialized methods
 */
export class AreasRepository extends BaseRepository {
  constructor() {
    super(getDb().areas);
  }

  async findWithStats() {
    const areas = await this.findAll();
    const db = getDb();

    // Get contact counts for each area
    const contacts = await db.contacts.find({});
    const contactsByArea = contacts.reduce((acc, c) => {
      if (c.areaId) {
        acc[c.areaId] = (acc[c.areaId] || 0) + 1;
      }
      return acc;
    }, {});

    // Get user assignments
    const userAreas = await db.userAreas.find({});
    const usersByArea = userAreas.reduce((acc, ua) => {
      acc[ua.areaId] = (acc[ua.areaId] || 0) + 1;
      return acc;
    }, {});

    return areas.map(area => ({
      ...area,
      contactCount: contactsByArea[area._id] || 0,
      workerCount: usersByArea[area._id] || 0,
    }));
  }

  async canDelete(areaId) {
    const contactCount = await getDb().contacts.count({ areaId });
    return contactCount === 0;
  }
}

/**
 * Activity Logs Repository
 */
export class ActivityLogsRepository extends BaseRepository {
  constructor() {
    super(getDb().activityLogs);
  }

  async log(userId, action, details = {}, resourceId = null, resourceType = null) {
    return await this.create({
      userId,
      action,
      details,
      resourceId,
      resourceType,
      ipAddress: details.ipAddress || null,
      userAgent: details.userAgent || null,
    });
  }

  async getActivityFeed(options = {}) {
    const { page = 1, limit = 50, userId, action, resourceType, dateFrom, dateTo } = options;

    const query = {};
    if (userId) query.userId = userId;
    if (action) query.action = action;
    if (resourceType) query.resourceType = resourceType;
    if (dateFrom || dateTo) {
      query.createdAt = {};
      if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
      if (dateTo) query.createdAt.$lte = new Date(dateTo);
    }

    const result = await this.findPaginated(query, { page, limit, sortBy: 'createdAt', sortOrder: 'desc' });

    // Enrich with user names
    const userIds = [...new Set(result.items.map(l => l.userId).filter(Boolean))];
    const users = await getDb().users.find({ _id: { $in: userIds } });
    const userMap = Object.fromEntries(users.map(u => [u._id, { name: u.name, username: u.username }]));

    result.items = result.items.map(log => ({
      ...log,
      user: userMap[log.userId] || null,
    }));

    return result;
  }
}

// Export repository instances
export const contactsRepo = new ContactsRepository();
export const usersRepo = new UsersRepository();
export const areasRepo = new AreasRepository();
export const activityLogsRepo = new ActivityLogsRepository();

export { db };
