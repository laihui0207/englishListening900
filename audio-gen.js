// 异步语音生成：调用 edge-tts CLI（与 Python 脚本同一声音），串行队列，不阻塞请求
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const db = require('./db');

const VOICE = 'en-US-AriaNeural';
const AUDIO_ROOT = process.env.AUDIO_ROOT || path.join(__dirname, 'data', 'audio');

// 音频文件路径：data/audio/<userId>/<sentenceId>.mp3
function audioPath(userId, sentenceId) {
  return path.join(AUDIO_ROOT, String(userId), `${sentenceId}.mp3`);
}

// 用单条 promise 链串行执行，避免同时开一堆 edge-tts 进程
let queue = Promise.resolve();

function enqueue(userId, sentenceId, text) {
  queue = queue.then(() => generateOne(userId, sentenceId, text));
  return queue;
}

function generateOne(userId, sentenceId, text) {
  return new Promise((resolve) => {
    const outFile = audioPath(userId, sentenceId);
    try {
      fs.mkdirSync(path.dirname(outFile), { recursive: true });
    } catch (e) {
      console.error('创建音频目录失败:', e.message);
      db.setAudioStatus(sentenceId, 'failed');
      return resolve();
    }

    // 用参数数组传入，避免 shell 注入
    const proc = spawn('edge-tts', [
      '--voice', VOICE,
      '--text', text,
      '--write-media', outFile,
    ]);

    let stderr = '';
    proc.stderr.on('data', (d) => (stderr += d));

    proc.on('error', (err) => {
      console.error(`edge-tts 启动失败 (句子 ${sentenceId}):`, err.message);
      db.setAudioStatus(sentenceId, 'failed');
      resolve();
    });

    proc.on('close', (code) => {
      if (code === 0 && fs.existsSync(outFile) && fs.statSync(outFile).size > 0) {
        db.setAudioStatus(sentenceId, 'ready');
      } else {
        console.error(`语音生成失败 (句子 ${sentenceId}), code=${code}: ${stderr.slice(0, 200)}`);
        db.setAudioStatus(sentenceId, 'failed');
      }
      resolve();
    });
  });
}

// 启动时把遗留的 pending 句子补生成（比如上次服务中途退出）
function resumePending() {
  const pending = db.getPendingSentences();
  if (pending.length > 0) {
    console.log(`恢复生成 ${pending.length} 条未完成的语音...`);
    pending.forEach((s) => enqueue(s.user_id, s.id, s.text));
  }
}

module.exports = { enqueue, resumePending, audioPath, AUDIO_ROOT };
