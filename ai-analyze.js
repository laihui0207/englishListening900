// AI 弱项分析：调用 DeepSeek，分析未听懂句子，给出知识弱项与练习建议
const ds = require('./llm');

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

const CACHE_SCOPE = 'analyze';
const RATE_LIMIT_MS = 30000;

// 把用户句子作为待分析数据传入（明确边界，降低提示注入影响）
function buildUserMessage(sentences) {
  const list = sentences.map((s, i) => `${i + 1}. ${s}`).join('\n');
  return `以下是用户听不懂的英语句子（共 ${sentences.length} 句），请分析：\n\n${list}`;
}

async function analyze(userId, sentences, cfg) {
  const key = `${userId}:${ds.hash(sentences.join('\n'))}`;
  const cache = ds.bucket(CACHE_SCOPE);
  if (cache.has(key)) return { ...cache.get(key), cached: true };

  ds.checkRate(CACHE_SCOPE, userId, RATE_LIMIT_MS);

  const content = await ds.chat({
    cfg,
    system: SYSTEM_PROMPT,
    user: buildUserMessage(sentences),
    json: true,
    temperature: 0.7,
  });

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
