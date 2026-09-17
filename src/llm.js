// 统一 LLM 调用层：支持 OpenAI 兼容接口（DeepSeek / OpenAI / Ollama）
const crypto = require('crypto');

function extractJson(raw) {
  if (!raw) return '';
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) return fenceMatch[1].trim();
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

const DEFAULTS = {
  baseUrl: process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/chat/completions',
  model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
};

// 构建用户消息：纯文本 or vision 数组（图片附件）
function buildUserContent(text, attachments) {
  if (!attachments || attachments.length === 0) return text;

  // 文本附件拼入问题文字
  const textAttachments = attachments.filter((a) => a.type === 'text');
  let fullText = text;
  if (textAttachments.length > 0) {
    const docs = textAttachments
      .map((a) => `【${a.name}】\n${a.content.slice(0, 8000)}`)
      .join('\n\n');
    fullText = `${text}\n\n以下是上传的文档内容，请结合文档回答：\n\n${docs}`;
  }

  const imgAttachments = attachments.filter((a) => a.type === 'image');
  if (imgAttachments.length === 0) return fullText;

  // 有图片时用 vision content 数组
  const parts = [{ type: 'text', text: fullText }];
  for (const a of imgAttachments) {
    parts.push({
      type: 'image_url',
      image_url: { url: `data:${a.mime};base64,${a.data}` },
    });
  }
  return parts;
}

// cfg: { provider, baseUrl, apiKey, model }
// attachments: [{type:'image', data:'base64', mime:'image/png'} | {type:'text', name, content}]
async function chat({ cfg, system, user, history, json, temperature, maxTokens, attachments }) {
  const apiKey = cfg?.apiKey || process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    const err = new Error('尚未设置 API Key，请在设置中配置');
    err.code = 'NO_API_KEY';
    throw err;
  }

  let url = cfg?.baseUrl || DEFAULTS.baseUrl;
  if (url && !url.endsWith('/completions')) {
    const base = url.replace(/\/$/, '');
    url = base.endsWith('/v1') ? base + '/chat/completions' : base + '/v1/chat/completions';
  }
  const model = cfg?.model || DEFAULTS.model;

  const body = {
    model,
    messages: [
      { role: 'system', content: system },
      ...(Array.isArray(history) ? history : []),
      { role: 'user', content: buildUserContent(user, attachments) },
    ],
    temperature: temperature ?? 0.7,
  };
  const supportsJsonMode = /deepseek-chat|gpt-|o1|o3/.test(model);
  if (json && supportsJsonMode) body.response_format = { type: 'json_object' };
  if (maxTokens) body.max_tokens = maxTokens;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
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

module.exports = { chat, bucket, hash, checkRate };
