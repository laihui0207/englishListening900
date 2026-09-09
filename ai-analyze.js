// AI 弱项分析：调用 DeepSeek（OpenAI 兼容 API），分析未听懂句子，给出知识弱项与练习建议
// 无需外部依赖，用 Node 内置 fetch
const crypto = require('crypto');

const API_URL = process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/chat/completions';
const MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';

// 分析用的系统提示：语言教学视角，要求返回固定 JSON 结构
const SYSTEM_PROMPT = `你是一位经验丰富的英语听力教学专家。用户会提供一批他们"听不懂"的英语句子。
请从语言学习角度分析这些句子，找出用户可能存在的知识弱项（如：连读/弱读等语音现象、时态、特定语法结构、短语动词、习语、词汇难度、句型复杂度等），并给出针对性的练习建议。

请严格返回如下 JSON 格式（不要包含任何额外文字或 markdown）：
{
  "summary": "一句话总体评估",
  "weaknesses": [
    { "topic": "弱项名称", "detail": "具体说明，结合用户句子举例" }
  ],
  "suggestions": [
    "具体、可操作的练习建议"
  ]
}
weaknesses 给 3-5 项，suggestions 给 3-5 条。所有内容用中文，句子示例可保留英文。`;

// 把用户句子作为待分析数据传入（明确边界，降低提示注入影响）
function buildUserMessage(sentences) {
  const list = sentences.map((s, i) => `${i + 1}. ${s}`).join('\n');
  return `以下是用户听不懂的英语句子（共 ${sentences.length} 句），请分析：\n\n${list}`;
}

// 缓存：按用户 + 句子列表哈希，列表没变则不重复调用（省钱）
// ponytail: 进程内 Map，单实例够用；多实例部署再换 Redis
const cache = new Map();
// 限流：每用户 30 秒一次
const lastCall = new Map();
const RATE_LIMIT_MS = 30000;

function cacheKey(userId, sentences) {
  const hash = crypto.createHash('sha256')
    .update(sentences.join('\n'))
    .digest('hex');
  return `${userId}:${hash}`;
}

async function analyze(userId, sentences, apiKey) {
  // 优先用调用方传入的用户密钥，其次回退到环境变量（若配置了全局 key）
  apiKey = apiKey || process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    const err = new Error('尚未设置 DeepSeek API Key');
    err.code = 'NO_API_KEY';
    throw err;
  }

  // 命中缓存直接返回，不扣费
  const key = cacheKey(userId, sentences);
  if (cache.has(key)) {
    return { ...cache.get(key), cached: true };
  }

  // 限流
  const now = Date.now();
  const last = lastCall.get(userId) || 0;
  if (now - last < RATE_LIMIT_MS) {
    const wait = Math.ceil((RATE_LIMIT_MS - (now - last)) / 1000);
    const err = new Error(`分析太频繁，请 ${wait} 秒后再试`);
    err.code = 'RATE_LIMIT';
    throw err;
  }
  lastCall.set(userId, now);

  const body = {
    model: MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildUserMessage(sentences) },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.7,
  };

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.error(`DeepSeek API 错误 ${res.status}: ${text.slice(0, 200)}`);
    throw new Error('AI 分析服务暂时不可用');
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content || '';

  // 防御性解析：DeepSeek 非严格 schema，解析失败则兜底为纯文本
  let result;
  try {
    result = JSON.parse(content);
    if (!result || typeof result !== 'object') throw new Error('非对象');
  } catch (e) {
    result = { summary: '', weaknesses: [], suggestions: [], raw: content };
  }

  cache.set(key, result);
  return result;
}

module.exports = { analyze };
