// 统一 LLM 调用层：支持 OpenAI 兼容接口（DeepSeek / OpenAI / Ollama）和 Anthropic Claude
const crypto = require('crypto');

// 从模型响应中提取 JSON 对象：处理 markdown 代码块和前置说明文字
function extractJson(raw) {
  if (!raw) return '';
  // 先尝试剥 markdown 代码块（```json ... ``` 或 ``` ... ```）
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) return fenceMatch[1].trim();
  // 没有代码块：截取第一个 { 到最后一个 }
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start !== -1 && end > start) return raw.slice(start, end + 1);
  return raw.trim();
}
const caches = new Map();
const lastCall = new Map();

function bucket(scope) {
  if (!caches.has(scope)) caches.set(scope, new Map());
  return caches.get(scope);
}

function hash(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function checkRate(scope, userId, windowMs) {
  const k = `${scope}:${userId}`;
  const now = Date.now();
  const last = lastCall.get(k) || 0;
  if (now - last < windowMs) {
    const wait = Math.ceil((windowMs - (now - last)) / 1000);
    const err = new Error(`请求太频繁，请 ${wait} 秒后再试`);
    err.code = 'RATE_LIMIT';
    throw err;
  }
  lastCall.set(k, now);
}

// 默认 provider 配置（向后兼容旧的 deepseek_api_key）
const DEFAULTS = {
  provider: 'openai',
  baseUrl: process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/chat/completions',
  model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
};

// cfg: { provider, baseUrl, apiKey, model } — 全部可选，缺省走 DEFAULTS
async function chat({ cfg, system, user, history, json, temperature, maxTokens }) {
  const provider = cfg?.provider || DEFAULTS.provider;
  const apiKey = cfg?.apiKey || process.env.DEEPSEEK_API_KEY;

  if (!apiKey) {
    const err = new Error('尚未设置 API Key，请在设置中配置');
    err.code = 'NO_API_KEY';
    throw err;
  }

  if (provider === 'anthropic') {
    return chatAnthropic({ cfg, system, user, history, json, temperature, maxTokens, apiKey });
  }
  return chatOpenAI({ cfg, system, user, history, json, temperature, maxTokens, apiKey });
}

// OpenAI 兼容（DeepSeek / OpenAI / Ollama 都走这里）
async function chatOpenAI({ cfg, system, user, history, json, temperature, maxTokens, apiKey }) {
  let url = cfg?.baseUrl || DEFAULTS.baseUrl;
  // ponytail: 用户常填域名忘了路径，自动补全
  if (url && !url.includes('/v') && !url.endsWith('/completions')) {
    url = url.replace(/\/$/, '') + '/chat/completions';
  }
  const model = cfg?.model || DEFAULTS.model;

  const body = {
    model,
    messages: [
      { role: 'system', content: system },
      ...(Array.isArray(history) ? history : []),
      { role: 'user', content: user },
    ],
    temperature: temperature ?? 0.7,
  };
  // ponytail: only send json_object for models known to support it; extractJson handles the rest
  const supportsJsonMode = !model || /deepseek-chat|gpt-|o1|o3/.test(model);
  if (json && supportsJsonMode) body.response_format = { type: 'json_object' };
  if (maxTokens) body.max_tokens = maxTokens;

  const res = await fetch(url, {    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.error(`LLM API 错误 ${res.status}: ${text.slice(0, 200)}`);
    if (res.status === 401) throw new Error('API Key 无效，请在设置中检查');
    if (res.status === 429) throw new Error('上游限流，请稍后再试');
    throw new Error('AI 服务暂时不可用');
  }

  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content || '';
  return extractJson(raw);
}

// Anthropic Claude（Messages API）
async function chatAnthropic({ cfg, system, user, history, json, temperature, maxTokens, apiKey }) {
  const baseUrl = cfg?.baseUrl || 'https://api.anthropic.com/v1/messages';
  const model = cfg?.model || 'claude-sonnet-4-5';

  // Anthropic 的 system 是顶层字段，不在 messages 里
  const messages = [
    ...(Array.isArray(history) ? history : []),
    { role: 'user', content: user },
  ];

  // json 模式：在 system prompt 末尾追加要求
  const systemFull = json
    ? system + '\n\n请严格只返回 JSON，不要包含任何 markdown 代码块或额外文字。'
    : system;

  const body = {
    model,
    max_tokens: maxTokens || 1600,
    temperature: temperature ?? 0.7,
    system: systemFull,
    messages,
  };

  const res = await fetch(baseUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.error(`Anthropic API 错误 ${res.status}: ${text.slice(0, 200)}`);
    if (res.status === 401) throw new Error('Anthropic API Key 无效，请在设置中检查');
    if (res.status === 429) throw new Error('上游限流，请稍后再试');
    throw new Error('AI 服务暂时不可用');
  }

  const data = await res.json();
  const raw = data.content?.[0]?.text || '';
  return extractJson(raw);
}

module.exports = { chat, bucket, hash, checkRate };
