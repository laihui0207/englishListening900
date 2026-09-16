// 英语听力练习 - 后端服务
// 提供：用户注册/登录/登出、学习进度同步；同时托管静态前端
const express = require('express');
const path = require('path');
const fs = require('fs');
const db = require('./db');
const audioGen = require('./audio-gen');
const aiAnalyze = require('./ai-analyze');
const aiTeacher = require('./ai-teacher');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '5mb' }));

// HTML 文件不缓存（JS/CSS 等静态资源仍走浏览器缓存）
// JS 文件用启动时间戳作为版本号，通过重写 HTML 里的 script src 实现缓存破坏
const BUILD_TS = Date.now();

app.use((req, res, next) => {
  if (req.path.endsWith('.html') || req.path === '/') {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  }
  next();
});

// 拦截 HTML 文件，动态注入版本戳到 .js 引用
const fs2 = fs;
app.get('*.html', (req, res, next) => {
  const file = path.join(__dirname, req.path);
  if (!fs2.existsSync(file)) return next();
  let html = fs2.readFileSync(file, 'utf8');
  html = html.replace(/(src="[^"]+\.js)(")/g, `$1?v=${BUILD_TS}$2`);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.send(html);
});

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

// AI 分析未听懂句子的知识弱项
app.post('/api/analyze', requireAuth, async (req, res) => {
  const { sentences } = req.body || {};
  if (!Array.isArray(sentences) || sentences.length === 0) {
    return res.status(400).json({ success: false, error: '请提供未听懂的句子' });
  }
  // 清洗 + 限量，避免超长请求
  const cleaned = sentences
    .map((s) => (typeof s === 'string' ? s.trim() : ''))
    .filter((s) => s.length > 0 && s.length <= 500)
    .slice(0, 100);
  if (cleaned.length === 0) {
    return res.status(400).json({ success: false, error: '没有有效的句子' });
  }

  try {
    const apiKey = db.getApiKey(req.userId);
    const llmCfg = { ...db.getLlmConfig(req.userId) };
    if (!llmCfg.apiKey) llmCfg.apiKey = apiKey;
    const result = await aiAnalyze.analyze(req.userId, cleaned, llmCfg);
    res.json({ success: true, data: result });
  } catch (error) {
    if (error.code === 'NO_API_KEY') {
      return res.status(400).json({ success: false, error: error.message, code: 'NO_API_KEY' });
    }
    if (error.code === 'RATE_LIMIT') {
      return res.status(429).json({ success: false, error: error.message });
    }
    console.error('AI 分析失败:', error.message);
    res.status(502).json({ success: false, error: error.message || 'AI 分析失败' });
  }
});

// AI 老师：回答问题，返回可直接画到白板的结构化块
app.post('/api/teach', requireAuth, async (req, res) => {
  const { question, history, attachments } = req.body || {};
  if (typeof question !== 'string' || question.trim().length === 0) {
    return res.status(400).json({ success: false, error: '请输入问题' });
  }
  const q = question.trim();
  if (q.length > 2000) {
    return res.status(400).json({ success: false, error: '问题请控制在 2000 字以内' });
  }
  if (history !== undefined && (!Array.isArray(history) || history.length > 40)) {
    return res.status(400).json({ success: false, error: '对话历史格式错误' });
  }
  // attachments: [{ type:'image', data:'base64...', mime:'image/png' } | { type:'text', name:'file.txt', content:'...' }]
  if (attachments !== undefined && (!Array.isArray(attachments) || attachments.length > 5)) {
    return res.status(400).json({ success: false, error: '附件格式错误或数量超限' });
  }

  try {
    const apiKey = db.getApiKey(req.userId);
    const llmCfg = { ...db.getLlmConfig(req.userId) };
    if (!llmCfg.apiKey) llmCfg.apiKey = apiKey;
    const result = await aiTeacher.ask(req.userId, q, llmCfg, history, attachments);
    res.json({ success: true, data: result });
  } catch (error) {
    if (error.code === 'NO_API_KEY') {
      return res.status(400).json({ success: false, error: error.message, code: 'NO_API_KEY' });
    }
    if (error.code === 'RATE_LIMIT') {
      return res.status(429).json({ success: false, error: error.message });
    }
    console.error('AI 讲解失败:', error.message);
    res.status(502).json({ success: false, error: error.message || 'AI 讲解失败' });
  }
});

// 判定简答题对错（选择题前端本地比对，不走这里）
app.post('/api/judge', requireAuth, async (req, res) => {
  const { question, answer, reply } = req.body || {};
  if (typeof question !== 'string' || question.trim().length === 0) {
    return res.status(400).json({ success: false, error: '缺少题目' });
  }
  if (typeof reply !== 'string' || reply.trim().length === 0) {
    return res.status(400).json({ success: false, error: '请先作答' });
  }
  if (reply.length > 1000) {
    return res.status(400).json({ success: false, error: '回答请控制在 1000 字以内' });
  }

  try {
    const apiKey = db.getApiKey(req.userId);
    const llmCfg = { ...db.getLlmConfig(req.userId) };
    if (!llmCfg.apiKey) llmCfg.apiKey = apiKey;
    const result = await aiTeacher.judge(req.userId, {
      question: question.trim().slice(0, 500),
      answer: typeof answer === 'string' ? answer.trim().slice(0, 500) : '',
      reply: reply.trim(),
    }, llmCfg);
    res.json({ success: true, data: result });
  } catch (error) {
    if (error.code === 'NO_API_KEY') {
      return res.status(400).json({ success: false, error: error.message, code: 'NO_API_KEY' });
    }
    if (error.code === 'RATE_LIMIT') {
      return res.status(429).json({ success: false, error: error.message });
    }
    console.error('判定失败:', error.message);
    res.status(502).json({ success: false, error: error.message || '判定失败' });
  }
});

// 获取 LLM 配置（脱敏返回 apiKey）
app.get('/api/settings/llm', requireAuth, (req, res) => {
  const cfg = db.getLlmConfig(req.userId);
  // 脱敏：只显示 key 的前6后4位
  const masked = cfg.apiKey && cfg.apiKey.length > 10
    ? `${cfg.apiKey.slice(0, 6)}...${cfg.apiKey.slice(-4)}`
    : (cfg.apiKey ? '******' : '');
  res.json({ success: true, data: { ...cfg, apiKey: masked, hasApiKey: !!cfg.apiKey } });
});

// 保存 LLM 配置
app.put('/api/settings/llm', requireAuth, (req, res) => {
  const { provider, baseUrl, model, apiKey } = req.body || {};
  const PROVIDERS = new Set(['openai', 'anthropic', 'ollama']);
  if (provider && !PROVIDERS.has(provider)) {
    return res.status(400).json({ success: false, error: '不支持的 provider' });
  }
  // 如果 apiKey 是脱敏占位符（含...）则保留旧值
  const existing = db.getLlmConfig(req.userId);
  const finalKey = (typeof apiKey === 'string' && apiKey.trim() && !apiKey.includes('...'))
    ? apiKey.trim()
    : existing.apiKey;
  db.setLlmConfig(req.userId, {
    provider: provider || existing.provider || 'openai',
    baseUrl: typeof baseUrl === 'string' ? baseUrl.trim() : (existing.baseUrl || ''),
    model: typeof model === 'string' ? model.trim() : (existing.model || ''),
    apiKey: finalKey || '',
  });
  res.json({ success: true });
});

// 获取当前用户设置（返回是否已设置 key + 脱敏预览，绝不返回明文）
app.get('/api/settings', requireAuth, (req, res) => {
  const key = db.getApiKey(req.userId);
  const hasApiKey = !!key;
  // 脱敏：只显示前 6 位和后 4 位
  const masked = hasApiKey && key.length > 10
    ? `${key.slice(0, 6)}...${key.slice(-4)}`
    : (hasApiKey ? '******' : '');
  res.json({ success: true, data: { hasApiKey, maskedApiKey: masked } });
});

// 保存/更新 DeepSeek API Key
app.put('/api/settings/apikey', requireAuth, (req, res) => {
  const { apiKey } = req.body || {};
  if (typeof apiKey !== 'string' || apiKey.trim().length < 8) {
    return res.status(400).json({ success: false, error: 'API Key 格式无效' });
  }
  db.setApiKey(req.userId, apiKey.trim());
  res.json({ success: true });
});

// 列出当前用户所有白板对话（只返回 id/title/updatedAt，不含内容）
app.get('/api/wb/sessions', requireAuth, (req, res) => {
  res.json({ success: true, data: db.listWbSessions(req.userId) });
});

// 新建对话
app.post('/api/wb/sessions', requireAuth, (req, res) => {
  const title = (typeof req.body.title === 'string' ? req.body.title.trim() : '') || '新对话';
  const id = db.createWbSession(req.userId, title.slice(0, 60));
  res.json({ success: true, data: { id, title } });
});

// 加载某个对话的完整数据
app.get('/api/wb/sessions/:id', requireAuth, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const data = db.getWbSession(id, req.userId);
  if (!data) return res.status(404).json({ success: false, error: '对话不存在' });
  res.json({ success: true, data });
});

// 保存（覆写）对话内容
app.put('/api/wb/sessions/:id', requireAuth, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { title, shapes, view, chatHistory, wrongBook } = req.body || {};
  if (!Array.isArray(shapes)) {
    return res.status(400).json({ success: false, error: '数据格式错误' });
  }
  const existing = db.getWbSession(id, req.userId);
  if (!existing) return res.status(404).json({ success: false, error: '对话不存在' });
  try {
    db.saveWbSession(id, req.userId, {
      title: (typeof title === 'string' ? title.trim().slice(0, 60) : null) || existing.title,
      shapes,
      view: view || { scale: 1, x: 0, y: 0 },
      chatHistory: chatHistory || [],
      wrongBook: wrongBook || [],
    });
    res.json({ success: true });
  } catch (error) {
    console.error('保存白板对话失败:', error);
    res.status(500).json({ success: false, error: '保存失败' });
  }
});

// 删除对话
app.delete('/api/wb/sessions/:id', requireAuth, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!db.getWbSession(id, req.userId)) {
    return res.status(404).json({ success: false, error: '对话不存在' });
  }
  db.deleteWbSession(id, req.userId);
  res.json({ success: true });
});

// 删除 API Key
app.delete('/api/settings/apikey', requireAuth, (req, res) => {
  db.setApiKey(req.userId, null);
  res.json({ success: true });
});

// 托管静态前端
app.use(express.static(path.join(__dirname)));

app.listen(PORT, () => {
  console.log(`服务已启动: http://localhost:${PORT}`);
  audioGen.resumePending(); // 补生成上次未完成的语音
});
