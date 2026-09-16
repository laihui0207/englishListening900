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

// 白板对话（每用户多个，独立白板）
db.exec(`
  CREATE TABLE IF NOT EXISTS whiteboard_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL DEFAULT '新对话',
    shapes TEXT NOT NULL DEFAULT '[]',
    view TEXT NOT NULL DEFAULT '{"scale":1,"x":0,"y":0}',
    chat_history TEXT NOT NULL DEFAULT '[]',
    wrong_book TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

// 迁移：把旧 whiteboard_data 数据搬进 whiteboard_sessions
const oldTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='whiteboard_data'").get();
if (oldTable) {
  const rows = db.prepare('SELECT * FROM whiteboard_data').all();
  const ins = db.prepare(`INSERT OR IGNORE INTO whiteboard_sessions (user_id, title, shapes, view, chat_history, wrong_book, updated_at) VALUES (?, '默认对话', ?, ?, ?, ?, ?)`);
  for (const r of rows) {
    ins.run(r.user_id, r.shapes, r.view, r.chat_history, r.wrong_book, r.updated_at);
  }
  db.exec('DROP TABLE whiteboard_data');
}

// 迁移：给已存在的旧库补上 deepseek_api_key 和 llm_config 列
const userCols = db.prepare("PRAGMA table_info(users)").all();
if (!userCols.some((c) => c.name === 'deepseek_api_key')) {
  db.exec('ALTER TABLE users ADD COLUMN deepseek_api_key TEXT');
}
if (!userCols.some((c) => c.name === 'llm_config')) {
  db.exec("ALTER TABLE users ADD COLUMN llm_config TEXT NOT NULL DEFAULT '{}'");
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

// 白板对话操作
const listWbSessionsStmt = db.prepare(
  "SELECT id, title, updated_at FROM whiteboard_sessions WHERE user_id = ? ORDER BY updated_at DESC"
);
const getWbSessionStmt = db.prepare(
  'SELECT * FROM whiteboard_sessions WHERE id = ? AND user_id = ?'
);
const createWbSessionStmt = db.prepare(
  "INSERT INTO whiteboard_sessions (user_id, title) VALUES (?, ?)"
);
const updateWbSessionStmt = db.prepare(`
  UPDATE whiteboard_sessions SET
    title = ?, shapes = ?, view = ?, chat_history = ?, wrong_book = ?,
    updated_at = datetime('now')
  WHERE id = ? AND user_id = ?
`);
const deleteWbSessionStmt = db.prepare(
  'DELETE FROM whiteboard_sessions WHERE id = ? AND user_id = ?'
);

function listWbSessions(userId) {
  return listWbSessionsStmt.all(userId);
}

function getWbSession(id, userId) {
  const row = getWbSessionStmt.get(id, userId);
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    shapes: JSON.parse(row.shapes),
    view: JSON.parse(row.view),
    chatHistory: JSON.parse(row.chat_history),
    wrongBook: JSON.parse(row.wrong_book),
    updatedAt: row.updated_at,
  };
}

function createWbSession(userId, title) {
  return createWbSessionStmt.run(userId, title || '新对话').lastInsertRowid;
}

function saveWbSession(id, userId, { title, shapes, view, chatHistory, wrongBook }) {
  updateWbSessionStmt.run(
    title,
    JSON.stringify(shapes),
    JSON.stringify(view),
    JSON.stringify(chatHistory),
    JSON.stringify(wrongBook),
    id, userId
  );
}

function deleteWbSession(id, userId) {
  deleteWbSessionStmt.run(id, userId);
}

// LLM 配置（provider / baseUrl / model / apiKey，按用户存储）
const getLlmConfigStmt = db.prepare('SELECT llm_config FROM users WHERE id = ?');
const setLlmConfigStmt = db.prepare(
  "UPDATE users SET llm_config = ?, updated_at = datetime('now') WHERE id = ?"
);

function getLlmConfig(userId) {
  const row = getLlmConfigStmt.get(userId);
  if (!row) return {};
  try { return JSON.parse(row.llm_config) || {}; } catch { return {}; }
}

function setLlmConfig(userId, cfg) {
  setLlmConfigStmt.run(JSON.stringify(cfg), userId);
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
  listWbSessions,
  getWbSession,
  createWbSession,
  saveWbSession,
  deleteWbSession,
  getLlmConfig,
  setLlmConfig,
};
