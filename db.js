// 数据库层 - SQLite（Node 内置 node:sqlite，无需编译原生模块）
const { DatabaseSync } = require('node:sqlite');
const crypto = require('crypto');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'app.db');

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL'); // 更好的并发读写

// 初始化表结构
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    progress TEXT NOT NULL DEFAULT '{}',
    deepseek_api_key TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS custom_sentences (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    text TEXT NOT NULL,
    audio_status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

// 迁移：给已存在的旧库补上 deepseek_api_key 列（CREATE TABLE IF NOT EXISTS 不会改已有表）
const userCols = db.prepare("PRAGMA table_info(users)").all();
if (!userCols.some((c) => c.name === 'deepseek_api_key')) {
  db.exec('ALTER TABLE users ADD COLUMN deepseek_api_key TEXT');
}

// 密码哈希：使用 Node 内置 scrypt（无需外部依赖），格式 salt:hash
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(password, salt, 64);
  const original = Buffer.from(hash, 'hex');
  // 长度不一致时 timingSafeEqual 会抛错，先判断
  if (candidate.length !== original.length) return false;
  return crypto.timingSafeEqual(candidate, original);
}

// 用户操作
const createUserStmt = db.prepare(
  'INSERT INTO users (username, password_hash) VALUES (?, ?)'
);
const getUserByNameStmt = db.prepare('SELECT * FROM users WHERE username = ?');
const getUserByIdStmt = db.prepare('SELECT * FROM users WHERE id = ?');
const updateProgressStmt = db.prepare(
  "UPDATE users SET progress = ?, updated_at = datetime('now') WHERE id = ?"
);

function createUser(username, password) {
  const info = createUserStmt.run(username, hashPassword(password));
  return info.lastInsertRowid;
}

function getUserByName(username) {
  return getUserByNameStmt.get(username);
}

function getUserById(id) {
  return getUserByIdStmt.get(id);
}

function saveProgress(userId, progressObj) {
  updateProgressStmt.run(JSON.stringify(progressObj), userId);
}

// DeepSeek API Key（按用户存储）
const setApiKeyStmt = db.prepare(
  "UPDATE users SET deepseek_api_key = ?, updated_at = datetime('now') WHERE id = ?"
);
const getApiKeyStmt = db.prepare('SELECT deepseek_api_key FROM users WHERE id = ?');

function setApiKey(userId, apiKey) {
  setApiKeyStmt.run(apiKey, userId);
}

function getApiKey(userId) {
  const row = getApiKeyStmt.get(userId);
  return row ? row.deepseek_api_key : null;
}

// 自定义句子操作（按用户隔离）
const insertCustomStmt = db.prepare(
  'INSERT INTO custom_sentences (user_id, text) VALUES (?, ?)'
);
const listCustomStmt = db.prepare(
  'SELECT id, text, audio_status FROM custom_sentences WHERE user_id = ? ORDER BY id'
);
const getCustomStmt = db.prepare(
  'SELECT * FROM custom_sentences WHERE id = ? AND user_id = ?'
);
const updateAudioStatusStmt = db.prepare(
  'UPDATE custom_sentences SET audio_status = ? WHERE id = ?'
);
const deleteCustomByUserStmt = db.prepare(
  'DELETE FROM custom_sentences WHERE user_id = ?'
);
const pendingCustomStmt = db.prepare(
  "SELECT id, user_id, text FROM custom_sentences WHERE audio_status = 'pending'"
);

function addCustomSentence(userId, text) {
  return insertCustomStmt.run(userId, text).lastInsertRowid;
}

function listCustomSentences(userId) {
  return listCustomStmt.all(userId);
}

function getCustomSentence(id, userId) {
  return getCustomStmt.get(id, userId);
}

function setAudioStatus(id, status) {
  updateAudioStatusStmt.run(status, id);
}

function deleteCustomSentences(userId) {
  deleteCustomByUserStmt.run(userId);
}

function getPendingSentences() {
  return pendingCustomStmt.all();
}

// 会话操作：随机 token 存库，可撤销
const createSessionStmt = db.prepare(
  'INSERT INTO sessions (token, user_id) VALUES (?, ?)'
);
const getSessionStmt = db.prepare('SELECT * FROM sessions WHERE token = ?');
const deleteSessionStmt = db.prepare('DELETE FROM sessions WHERE token = ?');

function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  createSessionStmt.run(token, userId);
  return token;
}

function getSession(token) {
  return getSessionStmt.get(token);
}

function deleteSession(token) {
  deleteSessionStmt.run(token);
}

module.exports = {
  db,
  hashPassword,
  verifyPassword,
  createUser,
  getUserByName,
  getUserById,
  saveProgress,
  setApiKey,
  getApiKey,
  createSession,
  getSession,
  deleteSession,
  addCustomSentence,
  listCustomSentences,
  getCustomSentence,
  setAudioStatus,
  deleteCustomSentences,
  getPendingSentences,
};
