// 为 sentences_primary.json 补充中文翻译
// 使用项目现有的 deepseek.js LLM 客户端

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');

const API_KEY = process.env.DEEPSEEK_API_KEY;
if (!API_KEY) {
  console.error('DEEPSEEK_API_KEY not set');
  process.exit(1);
}

async function translateBatch(sentences) {
  const prompt = `请将下面的英语句子翻译成简洁的中文，每句一行，保持顺序：

${sentences.map((s, i) => `${i + 1}. ${s}`).join('\n')}

只返回翻译结果，每句一行，格式：
1. 翻译1
2. 翻译2`;

  try {
    const res = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: '你是一个英语翻译助手，将英文翻译为简洁中文。' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3,
      })
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`API error ${res.status}: ${text.slice(0, 100)}`);
    }

    const data = await res.json();
    const response = data.choices?.[0]?.message?.content || '';
    const lines = response.split('\n').filter(l => l.trim());
    return lines.map(l => l.replace(/^\d+\.\s*/, '').trim());
  } catch (err) {
    console.error('Translation error:', err.message);
    return sentences.map(() => '');
  }
}

async function main() {
  const dataPath = path.join(__dirname, '..', 'levels', 'primary', 'sentences.json');
  const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

  console.log(`Total sentences: ${data.length}`);

  const needTranslation = data.filter(s => !s.chinese || s.chinese.trim() === '');
  console.log(`Need translation: ${needTranslation.length}`);

  if (needTranslation.length === 0) {
    console.log('All sentences already have Chinese translations.');
    return;
  }

  // 批量翻译，每批20句
  const BATCH_SIZE = 20;
  let translated = 0;

  for (let i = 0; i < needTranslation.length; i += BATCH_SIZE) {
    const batch = needTranslation.slice(i, i + BATCH_SIZE);
    const englishTexts = batch.map(s => s.english);

    console.log(`Translating batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(needTranslation.length / BATCH_SIZE)}...`);

    const translations = await translateBatch(englishTexts);

    batch.forEach((sentence, idx) => {
      if (translations[idx]) {
        sentence.chinese = translations[idx];
        translated++;
      }
    });

    // 每批后保存一次
    fs.writeFileSync(dataPath, JSON.stringify(data, null, 2), 'utf8');

    // 延迟避免速率限制
    if (i + BATCH_SIZE < needTranslation.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  console.log(`\nDone! Translated ${translated} sentences.`);
  console.log('Updated file:', dataPath);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
