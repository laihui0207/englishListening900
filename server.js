// 英语听力练习 - 后端服务
// 提供：用户注册/登录/登出、学习进度同步；同时托管静态前端
const express = require('express');
const path = require('path');
const fs = require('fs');
const db = require('./db');
const audioGen = require('./audio-gen');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '1mb' }));

// 输入校验：用户名 3-32 位（字母数字下划线），密码 6-128 位
function validateCredentials(username, password) {
  if (typeof username !== 'string' || typeof password !== 'string') {
    return '用户名和密码不能为空';
  }
  if (!/^[a-zA-Z0-9_]{3,32}$/.test(username)) {
    return '用户名需为 3-32 位字母、数字或下划线';
  }
  if (password.length < 6 || password.length > 128) {
    return '密码长度需为 6-128 位';
  }
  return null;
}

// 认证中间件：从 Authorization: Bearer <token> 解析用户
function requireAuth(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) {
    return res.status(401).json({ success: false, error: '未登录' });
  }
  const session = db.getSession(token);
  if (!session) {
    return res.status(401).json({ success: false, error: '登录已失效，请重新登录' });
  }
  req.userId = session.user_id;
  req.token = token;
  next();
}

// 注册
app.post('/api/register', (req, res) => {
  const { username, password } = req.body || {};
  const err = validateCredentials(username, password);
  if (err) {
    return res.status(400).json({ success: false, error: err });
  }
  if (db.getUserByName(username)) {
    return res.status(409).json({ success: false, error: '用户名已存在' });
  }
  try {
    const userId = db.createUser(username, password);
    const token = db.createSession(userId);
    res.json({ success: true, data: { token, username } });
  } catch (error) {
    console.error('Register failed:', error);
    res.status(500).json({ success: false, error: '注册失败，请稍后重试' });
  }
});

// 登录
app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  if (typeof username !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ success: false, error: '用户名和密码不能为空' });
  }
  const user = db.getUserByName(username);
  // 用户不存在或密码错误统一返回，避免泄露用户是否存在
  if (!user || !db.verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ success: false, error: '用户名或密码错误' });
  }
  const token = db.createSession(user.id);
  res.json({
    success: true,
    data: { token, username: user.username, progress: JSON.parse(user.progress) },
  });
});

// 登出
app.post('/api/logout', requireAuth, (req, res) => {
  db.deleteSession(req.token);
  res.json({ success: true });
});

// 获取学习进度
app.get('/api/progress', requireAuth, (req, res) => {
  const user = db.getUserById(req.userId);
  if (!user) {
    return res.status(404).json({ success: false, error: '用户不存在' });
  }
  res.json({ success: true, data: JSON.parse(user.progress) });
});

// 保存学习进度（前端整体上传进度对象）
app.put('/api/progress', requireAuth, (req, res) => {
  const progress = req.body || {};
  if (typeof progress !== 'object' || Array.isArray(progress)) {
    return res.status(400).json({ success: false, error: '进度数据格式错误' });
  }
  try {
    db.saveProgress(req.userId, progress);
    res.json({ success: true });
  } catch (error) {
    console.error('Save progress failed:', error);
    res.status(500).json({ success: false, error: '保存失败' });
  }
});

// 获取当前用户的自定义句子列表（含语音生成状态）
app.get('/api/sentences', requireAuth, (req, res) => {
  const rows = db.listCustomSentences(req.userId);
  res.json({ success: true, data: rows });
});

// 导入自定义句子：入库后异步生成语音，立即返回
app.post('/api/sentences', requireAuth, (req, res) => {
  const { sentences } = req.body || {};
  if (!Array.isArray(sentences) || sentences.length === 0) {
    return res.status(400).json({ success: false, error: '请提供句子数组' });
  }
  // 过滤空行、限制长度，避免超长文本拖垮 TTS
  const cleaned = sentences
    .map((s) => (typeof s === 'string' ? s.trim() : ''))
    .filter((s) => s.length > 0 && s.length <= 500);
  if (cleaned.length === 0) {
    return res.status(400).json({ success: false, error: '没有有效的句子' });
  }
  if (cleaned.length > 100) {
    return res.status(400).json({ success: false, error: '一次最多导入 100 句' });
  }

  const created = [];
  for (const text of cleaned) {
    const id = db.addCustomSentence(req.userId, text);
    created.push({ id, text, audio_status: 'pending' });
    audioGen.enqueue(req.userId, id, text); // 异步排队生成，不 await
  }
  res.json({ success: true, data: created });
});

// 清空当前用户的自定义句子（含音频文件）
app.delete('/api/sentences', requireAuth, (req, res) => {
  db.deleteCustomSentences(req.userId);
  const dir = path.join(audioGen.AUDIO_ROOT, String(req.userId));
  fs.rm(dir, { recursive: true, force: true }, () => {});
  res.json({ success: true });
});

// 获取某条自定义句子的音频（<audio> 无法带 header，token 走查询参数）
app.get('/api/sentences/:id/audio', (req, res) => {
  const token = req.query.token;
  const session = token ? db.getSession(token) : null;
  if (!session) {
    return res.status(401).json({ success: false, error: '未登录' });
  }
  const id = parseInt(req.params.id, 10);
  const sentence = db.getCustomSentence(id, session.user_id);
  if (!sentence) {
    return res.status(404).json({ success: false, error: '句子不存在' });
  }
  if (sentence.audio_status !== 'ready') {
    return res.status(409).json({ success: false, error: '语音尚未生成', status: sentence.audio_status });
  }
  const file = audioGen.audioPath(session.user_id, id);
  if (!fs.existsSync(file)) {
    return res.status(404).json({ success: false, error: '音频文件丢失' });
  }
  res.type('audio/mpeg').sendFile(file);
});

// 托管静态前端
app.use(express.static(path.join(__dirname)));

app.listen(PORT, () => {
  console.log(`服务已启动: http://localhost:${PORT}`);
  audioGen.resumePending(); // 补生成上次未完成的语音
});
