// 答题相关的纯逻辑：判分、错题本、计时格式化
// 单独成文件是为了能在 node 下测试 —— 判分错了不会报错，只会静默判错

// ---------- 判分 ----------

// 选择题本地判分。多选顺序无关、重复选项去重
// 返回 { mine, correct }；answer 为空表示无标准答案，correct 为 null
function gradeChoice(picked, answer) {
  const mine = [...new Set(Array.isArray(picked) ? picked : [])].sort().join('');
  if (!answer) return { mine, correct: null };
  return { mine, correct: mine === answer };
}

// ---------- 计时 ----------

// 毫秒 → "1:05" / "0:09"。超过一小时才显示小时位
function fmtDuration(ms) {
  const total = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

// ---------- 错题本 ----------

const WRONG_LIMIT = 50;

// 加一条错题：同题目覆盖旧记录并前移，最新的在最前面。
// ponytail: 按题干文本去重。同一道题反复答错只留最后一次，
// 想看历史趟数就得存数组，错题本不需要
function addWrong(book, entry, limit) {
  const list = Array.isArray(book) ? book : [];
  const cap = limit || WRONG_LIMIT;
  const q = (entry && entry.question) || '';
  if (!q) return list;
  const times = (list.find((e) => e.question === q) || {}).times || 0;
  return [
    { ...entry, times: times + 1 },
    ...list.filter((e) => e.question !== q),
  ].slice(0, cap);
}

// 移除一条（答对后从错题本里划掉）
function removeWrong(book, question) {
  return (Array.isArray(book) ? book : []).filter((e) => e.question !== question);
}

// 读回来的数据可能是任意 JSON（用户改过 localStorage、跨版本残留），逐条校验
function cleanBook(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const e of raw) {
    if (!e || typeof e !== 'object') continue;
    const question = typeof e.question === 'string' ? e.question.trim() : '';
    if (!question) continue;
    out.push({
      question: question.slice(0, 500),
      kind: e.kind === 'short' ? 'short' : 'choice',
      answer: typeof e.answer === 'string' ? e.answer.slice(0, 500) : '',
      mine: typeof e.mine === 'string' ? e.mine.slice(0, 500) : '',
      options: Array.isArray(e.options)
        ? e.options
          .filter((o) => o && typeof o.key === 'string' && typeof o.text === 'string')
          .slice(0, 6)
          .map((o) => ({ key: o.key.slice(0, 1), text: o.text.slice(0, 200) }))
        : [],
      explain: Array.isArray(e.explain) ? e.explain.slice(0, 8) : [],
      ms: Number.isFinite(e.ms) && e.ms >= 0 ? e.ms : 0,
      at: Number.isFinite(e.at) ? e.at : 0,
      times: Number.isFinite(e.times) && e.times > 0 ? e.times : 1,
    });
    if (out.length >= WRONG_LIMIT) break;
  }
  return out;
}

const QUIZ = { gradeChoice, fmtDuration, addWrong, removeWrong, cleanBook, WRONG_LIMIT };

if (typeof module !== 'undefined' && module.exports) module.exports = QUIZ;
if (typeof window !== 'undefined') window.QUIZ = QUIZ; // 顶层 const 不会自动挂到 window
