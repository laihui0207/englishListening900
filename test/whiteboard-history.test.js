// 撤销栈自检
const assert = require('assert');
const H = require('../public/whiteboard-history');

const s0 = [], s1 = [1], s2 = [1, 2], s3 = [1, 2, 3];

let h = H.create(3);
assert.strictEqual(H.canUndo(h), false);
assert.strictEqual(H.undo(h, s0), null, '空栈不可撤销');
assert.strictEqual(H.redo(h, s0), null);

h = H.push(h, s0);
assert.strictEqual(H.push(h, s0), h, '同引用不重复入栈');
h = H.push(h, s1);
h = H.push(h, s2);
assert.strictEqual(h.past.length, 3);
h = H.push(h, s3);
assert.strictEqual(h.past.length, 3, '超过上限丢最老的');
assert.strictEqual(h.past[0], s1);

// 撤销 / 重做往返
const cur = [1, 2, 3, 4];
let r = H.undo(h, cur);
assert.strictEqual(r.state, s3);
assert.strictEqual(r.hist.future[0], cur, '当前状态进 future');
assert.strictEqual(H.canRedo(r.hist), true);
let r2 = H.redo(r.hist, r.state);
assert.strictEqual(r2.state, cur);
assert.strictEqual(r2.hist.past[r2.hist.past.length - 1], s3, '重做把状态放回 past');
assert.strictEqual(r2.hist.future.length, 0);

// 撤销后新写入清空 future
r = H.undo(h, cur);
const h2 = H.push(r.hist, r.state);
assert.strictEqual(h2.future.length, 0);
assert.strictEqual(H.redo(h2, s0), null);

// 输入不被修改
const frozen = H.create(5);
Object.freeze(frozen); Object.freeze(frozen.past); Object.freeze(frozen.future);
const pushed = H.push(frozen, s0);
assert.strictEqual(frozen.past.length, 0);
assert.strictEqual(pushed.past.length, 1);

// cap=1 也要受限
let one = H.create(1);
one = H.push(one, s0); one = H.push(one, s1); one = H.push(one, s2);
assert.strictEqual(one.past.length, 1);
assert.strictEqual(one.past[0], s2);

// 默认上限
assert.strictEqual(H.create().cap, 100);
assert.strictEqual(H.create(-1).cap, 100);

console.log('whiteboard-history: all assertions passed');
