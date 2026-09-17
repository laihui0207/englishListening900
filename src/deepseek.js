// DeepSeek（OpenAI 兼容）调用的共用部分：密钥解析、限流、缓存、HTTP。
// ai-analyze.js 和 ai-teacher.js 共用，避免两处各写一遍 fetch 和错误处理。
const crypto = require('crypto');

const API_URL = process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/chat/completions';
const MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';

// ponytail: 进程内 Map，单实例够用；多实例部署再换 Redis
const caches = new Map();   // scope -> Map(key -> result)
const lastCall = new Map(); // `scope:userId` -> timestamp

function bucket(scope) {
  if (!caches.has(scope)) caches.set(scope, new Map());
  return caches.get(scope);
}

function hash(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

// 每用户每场景限流，超出抛 RATE_LIMIT
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

function resolveKey(apiKey) {
  const key = apiKey || process.env.DEEPSEEK_API_KEY;
  if (!key) {
    const err = new Error('尚未设置 DeepSeek API Key');
    err.code = 'NO_API_KEY';
    throw err;
  }
  return key;
}

// 发一次对话请求，返回 message.content 字符串
// history: [{role:'user'|'assistant', content}]，插在 system 和本轮 user 之间
async function chat({ apiKey, system, user, history, json, temperature, maxTokens }) {
  const key = resolveKey(apiKey);
  const body = {
    model: MODEL,
    messages: [
      { role: 'system', content: system },
      ...(Array.isArray(history) ? history : []),
      { role: 'user', content: user },
    ],
    temperature: temperature == null ? 0.7 : temperature,
  };
  if (json) body.response_format = { type: 'json_object' };
  if (maxTokens) body.max_tokens = maxTokens;

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    // 详情只进服务端日志，不回传给客户端，避免泄露上游信息
    console.error(`DeepSeek API 错误 ${res.status}: ${text.slice(0, 200)}`);
    if (res.status === 401) throw new Error('API Key 无效，请在设置中检查');
    if (res.status === 429) throw new Error('上游限流，请稍后再试');
    throw new Error('AI 服务暂时不可用');
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

module.exports = { chat, bucket, hash, checkRate, MODEL, API_URL };
