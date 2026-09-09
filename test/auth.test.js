// 认证 + 进度的最小自检。运行: node test/auth.test.js
// 使用内存数据库，不污染真实数据
const assert = require('assert');
process.env.DB_PATH = ':memory:';

const db = require('../db');

// 密码哈希与校验
const stored = db.hashPassword('secret123');
assert.ok(stored.includes(':'), 'hash 应包含 salt:hash');
assert.strictEqual(db.verifyPassword('secret123', stored), true, '正确密码应校验通过');
assert.strictEqual(db.verifyPassword('wrong', stored), false, '错误密码应校验失败');

// 创建用户 + 唯一约束
const userId = db.createUser('alice', 'secret123');
assert.ok(userId > 0, '应返回新用户 id');
assert.throws(() => db.createUser('alice', 'x'), '重复用户名应报错');

// 读取用户
const user = db.getUserByName('alice');
assert.strictEqual(user.username, 'alice');
assert.strictEqual(db.verifyPassword('secret123', user.password_hash), true);

// 进度保存与读取
db.saveProgress(userId, { currentIndex: 42, misunderstood: [1, 5, 9] });
const reloaded = db.getUserById(userId);
const progress = JSON.parse(reloaded.progress);
assert.strictEqual(progress.currentIndex, 42);
assert.deepStrictEqual(progress.misunderstood, [1, 5, 9]);

// 会话创建 / 读取 / 删除
const token = db.createSession(userId);
assert.ok(token.length >= 32, 'token 应足够长');
assert.strictEqual(db.getSession(token).user_id, userId);
db.deleteSession(token);
assert.strictEqual(db.getSession(token), undefined, '删除后 session 应不存在');

console.log('✓ 所有认证/进度自检通过');
