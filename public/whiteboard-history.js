// 撤销 / 重做：不可变快照栈，纯函数，可在 node 下直接测试
// 快照就是整份 shapes 数组的引用；shapes 全程不可变更新，存引用零成本
//   past   [旧 → 新] 可撤销的历史状态
//   future [新 → 旧] 撤销后可重做的状态，任何新写入都会清空它

function create(cap) {
  return { past: [], future: [], cap: cap > 0 ? cap : 100 };
}

// 记录一份「变更前」的状态。超过上限丢最老的
function push(h, snapshot) {
  if (h.past.length && h.past[h.past.length - 1] === snapshot) return h; // 同引用不重复入栈
  // cap=1 时 slice(-0) 会返回整个数组，单独处理
  const keep = h.cap > 1 ? h.past.slice(-(h.cap - 1)) : [];
  return { ...h, past: [...keep, snapshot], future: [] };
}

// 返回 { hist, state }，没有可撤销的历史返回 null。current 是当前状态，进 future 供重做
function undo(h, current) {
  if (!h.past.length) return null;
  return {
    hist: { ...h, past: h.past.slice(0, -1), future: [...h.future, current] },
    state: h.past[h.past.length - 1],
  };
}

function redo(h, current) {
  if (!h.future.length) return null;
  return {
    hist: { ...h, past: [...h.past, current], future: h.future.slice(0, -1) },
    state: h.future[h.future.length - 1],
  };
}

const canUndo = (h) => h.past.length > 0;
const canRedo = (h) => h.future.length > 0;

const WBHistory = { create, push, undo, redo, canUndo, canRedo };

if (typeof module !== 'undefined' && module.exports) module.exports = WBHistory;
if (typeof window !== 'undefined') window.WBHistory = WBHistory;
