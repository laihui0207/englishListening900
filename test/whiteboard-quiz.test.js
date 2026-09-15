// 答题逻辑自检：判分、计时格式化、错题本
// 判分错了不会抛错，只会静默判错 —— 所以每条分支都要有断言
const assert = require('assert');
const Q = require('../whiteboard-quiz');

// ---------- 选择题判分 ----------

assert.deepStrictEqual(Q.gradeChoice(['C'], 'C'), { mine: 'C', correct: true });
assert.deepStrictEqual(Q.gradeChoice(['A'], 'C'), { mine: 'A', correct: false });
// 多选顺序无关
assert.deepStrictEqual(Q.gradeChoice(['C', 'A'], 'AC'), { mine: 'AC', correct: true }, '乱序应判对');
assert.deepStrictEqual(Q.gradeChoice(['A', 'C'], 'AC'), { mine: 'AC', correct: true });
// 重复点选去重（多选时点两次同一项）
assert.deepStrictEqual(Q.gradeChoice(['A', 'A', 'C'], 'AC'), { mine: 'AC', correct: true }, '重复去重');
// 少选、多选都算错
assert.deepStrictEqual(Q.gradeChoice(['A'], 'AC'), { mine: 'A', correct: false }, '少选算错');
assert.deepStrictEqual(Q.gradeChoice(['A', 'B', 'C'], 'AC'), { mine: 'ABC', correct: false }, '多选算错');
// 无标准答案 → correct 为 null（不能默认判错）
assert.deepStrictEqual(Q.gradeChoice(['A'], ''), { mine: 'A', correct: null }, '无答案不判对错');
assert.strictEqual(Q.gradeChoice(['A'], undefined).correct, null);
// 坏输入不抛错
assert.deepStrictEqual(Q.gradeChoice(null, 'C'), { mine: '', correct: false });
assert.deepStrictEqual(Q.gradeChoice([], 'C'), { mine: '', correct: false });

// ---------- 计时格式化 ----------

assert.strictEqual(Q.fmtDuration(0), '0:00');
assert.strictEqual(Q.fmtDuration(9000), '0:09', '个位秒补零');
assert.strictEqual(Q.fmtDuration(65000), '1:05');
assert.strictEqual(Q.fmtDuration(599000), '9:59');
assert.strictEqual(Q.fmtDuration(600000), '10:00');
assert.strictEqual(Q.fmtDuration(3600000), '1:00:00', '满一小时显示小时位');
assert.strictEqual(Q.fmtDuration(3665000), '1:01:05');
// 不足一秒向下取整，不显示负数
assert.strictEqual(Q.fmtDuration(999), '0:00');
assert.strictEqual(Q.fmtDuration(-5000), '0:00', '负数夹到 0');
assert.strictEqual(Q.fmtDuration(NaN), '0:00', 'NaN 不产生 NaN:NaN');
assert.strictEqual(Q.fmtDuration(undefined), '0:00');

// ---------- 错题本 ----------

const e1 = { question: '题一', kind: 'choice', answer: 'C', mine: 'A', ms: 1000 };
const e2 = { question: '题二', kind: 'choice', answer: 'B', mine: 'D', ms: 2000 };

// 新错题排在最前
let book = Q.addWrong([], e1);
book = Q.addWrong(book, e2);
assert.deepStrictEqual(book.map((e) => e.question), ['题二', '题一'], '最新的在最前');
assert.strictEqual(book[0].times, 1, '首次错 times=1');

// 同题再错：覆盖旧记录、次数累加、前移（不产生重复条目）
book = Q.addWrong(book, { ...e1, mine: 'B' });
assert.deepStrictEqual(book.map((e) => e.question), ['题一', '题二'], '重复错题前移');
assert.strictEqual(book.length, 2, '不产生重复条目');
assert.strictEqual(book[0].times, 2, '错题次数累加');
assert.strictEqual(book[0].mine, 'B', '记录最后一次的答案');

// 答对后移出
book = Q.removeWrong(book, '题一');
assert.deepStrictEqual(book.map((e) => e.question), ['题二']);
// 移除不存在的题不报错、不改变内容
assert.deepStrictEqual(Q.removeWrong(book, '不存在').map((e) => e.question), ['题二']);
assert.deepStrictEqual(Q.removeWrong(null, 'x'), []);

// 无题干不入库（否则错题本会出现空条目）
assert.deepStrictEqual(Q.addWrong([], { question: '' }), []);
assert.deepStrictEqual(Q.addWrong([], {}), []);
assert.deepStrictEqual(Q.addWrong([], null), []);

// 容量上限：超出丢最旧的
let big = [];
for (let i = 0; i < 60; i++) big = Q.addWrong(big, { question: 'q' + i });
assert.strictEqual(big.length, Q.WRONG_LIMIT, '不超过上限');
assert.strictEqual(big[0].question, 'q59', '保留最新');
assert.ok(!big.some((e) => e.question === 'q0'), '最旧的被挤出');

// ---------- 读回来的数据不可信（用户可改 localStorage） ----------

assert.deepStrictEqual(Q.cleanBook(null), []);
assert.deepStrictEqual(Q.cleanBook('oops'), []);
assert.deepStrictEqual(Q.cleanBook([null, {}, { question: '  ' }]), [], '坏条目全丢');

const restored = Q.cleanBook([{
  question: '题', kind: 'weird', answer: 'C', mine: 'A',
  options: [{ key: 'AA', text: 'x' }, { bad: 1 }, { key: 'B', text: 'y' }],
  explain: [{ type: 'text', text: 'e' }],
  ms: -5, at: 'nope', times: 0,
}]);
assert.strictEqual(restored.length, 1);
assert.strictEqual(restored[0].kind, 'choice', '未知 kind 归一成 choice');
assert.deepStrictEqual(restored[0].options, [{ key: 'A', text: 'x' }, { key: 'B', text: 'y' }],
  'key 截成一位、坏选项丢掉');
assert.strictEqual(restored[0].ms, 0, '负数耗时归零');
assert.strictEqual(restored[0].at, 0, '非数字时间戳归零');
assert.strictEqual(restored[0].times, 1, '次数至少 1');

// 数组字段被塞成对象时不能抛错
const weird = Q.cleanBook([{ question: '题', options: 'x', explain: 'y' }]);
assert.deepStrictEqual(weird[0].options, []);
assert.deepStrictEqual(weird[0].explain, []);

// 超长内容截断
const longQ = Q.cleanBook([{ question: 'x'.repeat(900), answer: 'y'.repeat(900) }]);
assert.strictEqual(longQ[0].question.length, 500);
assert.strictEqual(longQ[0].answer.length, 500);

// 存取往返：addWrong 产出的数据经 cleanBook 后关键字段不变
const round = Q.cleanBook(Q.addWrong([], {
  question: '往返题', kind: 'short', answer: '参考', mine: '我的',
  options: [], explain: [], ms: 1234, at: 1700000000000,
}));
assert.strictEqual(round[0].question, '往返题');
assert.strictEqual(round[0].kind, 'short');
assert.strictEqual(round[0].ms, 1234, '耗时往返不丢');
assert.strictEqual(round[0].times, 1);

console.log('whiteboard-quiz: all assertions passed');
