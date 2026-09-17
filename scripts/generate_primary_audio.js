// 为小学级别句子生成 TTS 音频
// 使用 edge-tts 生成 levels/primary/audio/sentence_NNN.mp3

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const VOICE = 'en-US-AriaNeural';
const OUTPUT_DIR = path.join(__dirname, '..', 'audio', 'primary');
const DATA_FILE = path.join(__dirname, '..', 'levels', 'primary', 'sentences.json');

// 串行生成队列
let queue = Promise.resolve();

function generateOne(id, text) {
  return new Promise((resolve) => {
    const outFile = path.join(OUTPUT_DIR, `sentence_${String(id).padStart(3, '0')}.mp3`);

    // 跳过已存在的
    if (fs.existsSync(outFile)) {
      console.log(`[${id}] Skip (exists)`);
      return resolve();
    }

    console.log(`[${id}] Generating: ${text.slice(0, 50)}...`);

    const proc = spawn('edge-tts', [
      '--voice', VOICE,
      '--text', text,
      '--write-media', outFile,
    ]);

    let stderr = '';
    proc.stderr.on('data', (d) => (stderr += d));

    proc.on('error', (err) => {
      console.error(`[${id}] edge-tts failed:`, err.message);
      resolve();
    });

    proc.on('close', (code) => {
      if (code === 0 && fs.existsSync(outFile) && fs.statSync(outFile).size > 0) {
        console.log(`[${id}] ✓ OK`);
      } else {
        console.error(`[${id}] Failed (code=${code}):`, stderr.slice(0, 100));
      }
      resolve();
    });
  });
}

async function main() {
  // 确保目录存在
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // 读取数据
  const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  console.log(`Total sentences: ${data.length}\n`);

  // 过滤需要生成的
  const toGenerate = data.filter(s => {
    const outFile = path.join(OUTPUT_DIR, `sentence_${String(s.id).padStart(3, '0')}.mp3`);
    return !fs.existsSync(outFile);
  });

  console.log(`Need to generate: ${toGenerate.length}\n`);

  if (toGenerate.length === 0) {
    console.log('All audio files already exist.');
    return;
  }

  // 串行生成
  for (const sentence of toGenerate) {
    await generateOne(sentence.id, sentence.english);
    // 延迟避免过快
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('\n✓ Done!');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
