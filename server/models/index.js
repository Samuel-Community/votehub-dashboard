import mongoose from 'mongoose';
import { config } from '../lib/config.js';

let memory = null;

const schemas = {};

schemas.AdminUser = new mongoose.Schema({
  discordId: { type: String, unique: true, index: true },
  username: String,
  avatarUrl: String,
  role: { type: String, enum: ['owner', 'admin'], default: 'admin' },
  lastLoginAt: Date,
}, { timestamps: true });

schemas.ManagedBot = new mongoose.Schema({
  name: String,
  slug: { type: String, unique: true, index: true },
  botId: { type: String, unique: true, index: true },
  clientId: String,
  encryptedBotToken: String,
  avatarUrl: String,
  status: { type: String, enum: ['active', 'disabled', 'error'], default: 'active' },
  tokenHealth: { type: String, default: 'Not validated' },
  lastValidatedAt: Date,
}, { timestamps: true });

schemas.VoteListIntegration = new mongoose.Schema({
  managedBot: { type: mongoose.Schema.Types.ObjectId, ref: 'ManagedBot', index: true },
  name: String,
  slug: { type: String, index: true },
  authorizationToken: String,
  upvoteURL: String,
  iconURL: String,
  payloadUserField: { type: String, default: 'user' },
  notificationTarget: { type: mongoose.Schema.Types.ObjectId, ref: 'NotificationTarget' },
  enabled: { type: Boolean, default: true },
  votesReceived: { type: Number, default: 0 },
  lastVoteAt: Date,
}, { timestamps: true });
schemas.VoteListIntegration.index({ managedBot: 1, slug: 1 }, { unique: true });

schemas.NotificationTarget = new mongoose.Schema({
  managedBot: { type: mongoose.Schema.Types.ObjectId, ref: 'ManagedBot', index: true },
  name: String,
  discordWebhookId: String,
  encryptedDiscordWebhookToken: String,
  webhookAvatar: String,
  webhookUsername: String,
  isDefault: { type: Boolean, default: false },
  enabled: { type: Boolean, default: true },
}, { timestamps: true });

schemas.VoteLog = new mongoose.Schema({
  managedBot: { type: mongoose.Schema.Types.ObjectId, ref: 'ManagedBot', index: true },
  voteListIntegration: { type: mongoose.Schema.Types.ObjectId, ref: 'VoteListIntegration', index: true },
  notificationTarget: { type: mongoose.Schema.Types.ObjectId, ref: 'NotificationTarget' },
  userId: String,
  username: String,
  avatarURL: String,
  rawPayload: mongoose.Schema.Types.Mixed,
  status: { type: String, enum: ['success', 'failed', 'ignored', 'unauthorized'], default: 'success' },
  errorMessage: String,
  receivedAt: { type: Date, default: Date.now, index: true },
}, { timestamps: true });

schemas.AuditLog = new mongoose.Schema({
  adminDiscordId: String,
  adminUsername: String,
  action: String,
  targetType: String,
  targetId: String,
  targetName: String,
  oldValue: mongoose.Schema.Types.Mixed,
  newValue: mongoose.Schema.Types.Mixed,
  ip: String,
  userAgent: String,
}, { timestamps: true });

export async function connectDatabase(app) {
  if (!config.mongoUri) {
    app.log.warn('MONGO_URI is empty. Using in-memory storage for development only.');
    memory = createMemoryStore();
    return { mode: 'memory' };
  }
  await mongoose.connect(config.mongoUri);
  return { mode: 'mongo' };
}

export const models = new Proxy({}, {
  get(_, prop) {
    if (memory) return memory[prop];
    return mongoose.models[prop] || mongoose.model(prop, schemas[prop]);
  },
});

function createMemoryStore() {
  const store = {
    AdminUser: [], ManagedBot: [], VoteListIntegration: [], NotificationTarget: [], VoteLog: [], AuditLog: [],
  };
  const wrap = name => ({
    async find(query = {}) { return chain(store[name].filter(d => match(d, query))); },
    async findOne(query = {}) { return store[name].find(d => match(d, query)) || null; },
    async findById(id) { return store[name].find(d => d._id === id) || null; },
    async create(data) { const doc = { _id: randomId(), ...data, createdAt: new Date(), updatedAt: new Date() }; store[name].push(doc); return doc; },
    async findByIdAndUpdate(id, data, opts = {}) { const doc = store[name].find(d => d._id === id); if (!doc) return null; Object.assign(doc, data.$inc ? inc(data, doc) : data, { updatedAt: new Date() }); return opts.new ? doc : doc; },
    async findByIdAndDelete(id) { const i = store[name].findIndex(d => d._id === id); if (i === -1) return null; return store[name].splice(i, 1)[0]; },
    async deleteMany(query = {}) { const before = store[name].length; for (let i = store[name].length - 1; i >= 0; i--) if (match(store[name][i], query)) store[name].splice(i, 1); return { deletedCount: before - store[name].length }; },
    async countDocuments(query = {}) { return store[name].filter(d => match(d, query)).length; },
  });
  Object.keys(store).forEach(k => { store[k] = wrap(k); });
  return store;
}

function randomId() { return Math.random().toString(16).slice(2) + Date.now().toString(16); }
function valueOf(v) { return v?._id || v; }
function match(doc, query) {
  return Object.entries(query).every(([k, v]) => {
    if (v && typeof v === 'object' && '$gte' in v) return new Date(doc[k]) >= v.$gte;
    if (v && typeof v === 'object' && '$in' in v) return v.$in.includes(valueOf(doc[k]));
    return String(valueOf(doc[k])) === String(valueOf(v));
  });
}
function inc(data, doc) { const out = {}; for (const [k, v] of Object.entries(data.$inc || {})) out[k] = (doc[k] || 0) + v; return out; }
async function chain(arr) {
  arr.populate = () => arr;
  arr.sort = spec => { const [[k, dir]] = Object.entries(spec); return chain(arr.sort((a,b)=> (new Date(b[k])-new Date(a[k])) * (dir < 0 ? 1 : -1))); };
  arr.limit = n => chain(arr.slice(0,n));
  arr.lean = () => arr;
  return arr;
}
