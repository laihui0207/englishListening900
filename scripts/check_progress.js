// 检查音频生成进度
const fs = require('fs');
const path = require('path');

const AUDIO_DIR = path.join(__dirname, '..', 'audio', 'primary');
const DATA_FILE = path.join(__dirname, '..', 'sentences_primary.json');

const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
const total = data.length;

let generated = 0;
let missing = [];

for (let i = 1; i <= total; i++) {
  const audioFile = path.join(AUDIO_DIR, `sentence_${String(i).padStart(3, '0')}.mp3`);
  if (fs.existsSync(audioFile)) {
    generated++;
  } else {
    missing.push(i);
  }
}

console.log(`\n📊 音频生成进度报告`);
console.log(`━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`总句子数: ${total}`);
console.log(`已完成: ${generated}`);
console.log(`未完成: ${total - generated}`);
console.log(`完成率: ${((generated / total) * 100).toFixed(2)}%`);
console.log(`━━━━━━━━━━━━━━━━━━━━━━\n`);

if (missing.length > 0 && missing.length <= 20) {
  console.log(`缺失的文件ID: ${missing.join(', ')}`);
}

// 估算剩余时间（假设每个文件2秒）
const remaining = total - generated;
const estimatedSeconds = remaining * 2;
const minutes = Math.floor(estimatedSeconds / 60);
console.log(`\n⏱️  预计剩余时间: ${minutes} 分钟\n`);
