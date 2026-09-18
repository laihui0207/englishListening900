// 白板几何自检：包围盒 / 命中 / 移动缩放 / 视口变换
const assert = require('assert');
const G = require('../public/whiteboard-geom');

const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg}: ${a} != ${b}`);

// ---------- 包围盒 ----------

// 反向拖拽必须归一化
assert.deepStrictEqual(
  G.bbox({ type: 'rect', x: 100, y: 100, w: -60, h: -40 }),
  { x1: 40, y1: 60, x2: 100, y2: 100 }
);
// 自由曲线取极值
assert.deepStrictEqual(
  G.bbox({ type: 'pen', points: [[10, 50], [30, 20], [5, 35]] }),
  { x1: 5, y1: 20, x2: 30, y2: 50 }
);
assert.strictEqual(G.bbox({ type: 'pen', points: [] }), null);
// 文本向上延伸一个字号（y 是基线）
assert.deepStrictEqual(
  G.bbox({ type: 'text', x: 10, y: 100, text: 'abc', size: 20 }),
  { x1: 10, y1: 80, x2: 46, y2: 100 }
);
// 并集跳过无效图形
assert.deepStrictEqual(
  G.bboxAll([
    { type: 'rect', x: 0, y: 0, w: 10, h: 10 },
    { type: 'pen', points: [] },
    { type: 'rect', x: 50, y: -20, w: 10, h: 10 },
  ]),
  { x1: 0, y1: -20, x2: 60, y2: 10 }
);
assert.strictEqual(G.bboxAll([]), null);

// ---------- 命中 ----------

const two = [
  { type: 'rect', x: 0, y: 0, w: 50, h: 50 },
  { type: 'rect', x: 10, y: 10, w: 50, h: 50 },
];
assert.strictEqual(G.hitTest(two, 20, 20), 1, '重叠区取最上层');
assert.strictEqual(G.hitTest(two, 2, 2), 0, '只在下层范围内则取下层');
assert.strictEqual(G.hitTest(two, 300, 300), -1);
assert.strictEqual(G.hitTest([two[0]], 53, 25, 6), 0, '容差内贴边可选中');
assert.strictEqual(G.hitTest([two[0]], 80, 25, 6), -1, '超出容差不选中');

// ---------- 移动 ----------

assert.deepStrictEqual(
  G.translateShape({ type: 'pen', points: [[0, 0], [5, 5]] }, 10, -3).points,
  [[10, -3], [15, 2]]
);
const movedRect = G.translateShape({ type: 'rect', x: 1, y: 2, w: 8, h: 9 }, 10, 10);
assert.deepStrictEqual(
  [movedRect.x, movedRect.y, movedRect.w, movedRect.h],
  [11, 12, 8, 9],
  '移动不改变尺寸'
);

// ---------- 缩放 ----------

const oldB = { x1: 0, y1: 0, x2: 10, y2: 10 };
const newB = { x1: 0, y1: 0, x2: 20, y2: 30 };
// 矩形按两轴分别缩放
const rs = G.resizeShape({ type: 'rect', x: 0, y: 0, w: 10, h: 10 }, oldB, newB);
near(rs.w, 20, 'rect w');
near(rs.h, 30, 'rect h');
// 缩放后包围盒应贴合目标框
const rsb = G.bbox(rs);
near(rsb.x2, 20, 'rect 贴合右边');
near(rsb.y2, 30, 'rect 贴合下边');
// 曲线每个点都映射
const ps = G.resizeShape({ type: 'pen', points: [[0, 0], [10, 10], [5, 5]] }, oldB, newB);
assert.deepStrictEqual(ps.points, [[0, 0], [20, 30], [10, 15]]);
// 水平线：高度为 0 的轴不缩放也不产生 NaN
const flat = { type: 'line', x: 0, y: 5, w: 10, h: 0 };
const fs = G.resizeShape(flat, { x1: 0, y1: 5, x2: 10, y2: 5 }, { x1: 0, y1: 5, x2: 20, y2: 5 });
near(fs.w, 20, '水平线宽度翻倍');
near(fs.h, 0, '水平线高度保持 0');
assert.ok(!Number.isNaN(fs.y), '退化轴不产生 NaN');
// 文本按较小轴等比缩放，不拉伸
const ts = G.resizeShape({ type: 'text', x: 0, y: 10, text: 'ab', size: 10 }, oldB, newB);
near(ts.size, 20, '字号取 min(sx,sy)=2 倍');

// ---------- 公式（走 x/y/w/h 默认分支，几何模块无需为它加代码） ----------

const math = { type: 'math', tex: '\\frac{a}{b}', x: 10, y: 20, w: 60, h: 30 };
assert.deepStrictEqual(G.bbox(math), { x1: 10, y1: 20, x2: 70, y2: 50 }, '公式包围盒');
assert.strictEqual(G.hitTest([math], 40, 35), 0, '公式可点选');
assert.strictEqual(G.hitTest([math], 200, 35), -1);
// 移动保尺寸
const mv = G.translateShape(math, 5, -5);
assert.deepStrictEqual([mv.x, mv.y, mv.w, mv.h], [15, 15, 60, 30]);
// 缩放保留 tex，只改几何
const mz = G.resizeShape(math, G.bbox(math), { x1: 10, y1: 20, x2: 130, y2: 50 });
near(mz.w, 120, '公式宽度翻倍');
near(mz.h, 30, '公式高度不变');
assert.strictEqual(mz.tex, math.tex, '缩放不丢 LaTeX 源码');

// ---------- 框选 ----------

// 四个方向拖出的框都要归一化成同一个矩形
const want = { x1: 10, y1: 20, x2: 50, y2: 60 };
assert.deepStrictEqual(G.normBox(10, 20, 50, 60), want, '右下拖');
assert.deepStrictEqual(G.normBox(50, 60, 10, 20), want, '左上拖');
assert.deepStrictEqual(G.normBox(50, 20, 10, 60), want, '左下拖');
assert.deepStrictEqual(G.normBox(10, 60, 50, 20), want, '右上拖');

// 相交判定
const base = { x1: 0, y1: 0, x2: 10, y2: 10 };
assert.ok(G.boxesIntersect(base, { x1: 5, y1: 5, x2: 15, y2: 15 }), '部分重叠');
assert.ok(G.boxesIntersect(base, { x1: 2, y1: 2, x2: 8, y2: 8 }), '完全包含');
assert.ok(G.boxesIntersect(base, { x1: 10, y1: 10, x2: 20, y2: 20 }), '边缘接触算相交');
assert.ok(!G.boxesIntersect(base, { x1: 11, y1: 0, x2: 20, y2: 10 }), '右侧分离');
assert.ok(!G.boxesIntersect(base, { x1: 0, y1: 11, x2: 10, y2: 20 }), '下方分离');

// 点在框内：多选外框当拖动热区。
// 这是"整组拖不动"的修复点 —— 图形之间的空隙必须算在热区内
const hot = { x1: 0, y1: 0, x2: 100, y2: 50 };
assert.ok(G.pointInBox(hot, 50, 25), '正中命中');
assert.ok(G.pointInBox(hot, 0, 0), '左上角命中');
assert.ok(G.pointInBox(hot, 100, 50), '右下角命中');
assert.ok(!G.pointInBox(hot, 101, 25), '右侧外部不命中');
assert.ok(!G.pointInBox(hot, 50, -1), '上方外部不命中');
// 容差：贴边稍外也算，跟点选图形用同一套容差
assert.ok(G.pointInBox(hot, 104, 25, 6), '容差内命中');
assert.ok(!G.pointInBox(hot, 110, 25, 6), '超出容差不命中');
// 关键场景：两块文字之间的空隙，hitTest 落空但 pointInBox 命中
const gapScene = [
  { id: 1, type: 'text', x: 0, y: 20, text: 'A', size: 16 },
  { id: 2, type: 'text', x: 0, y: 90, text: 'B', size: 16 },
];
const gapBox = G.bboxAll(gapScene);
assert.strictEqual(G.hitTest(gapScene, 5, 55, 6), -1, '空隙处点不到任何图形');
assert.ok(G.pointInBox(gapBox, 5, 55, 6), '但落在整组外框内 → 应能拖动整组');

// 触碰即选：只压到一角也算选中
const scene = [
  { id: 1, type: 'rect', x: 0, y: 0, w: 20, h: 20 },
  { id: 2, type: 'rect', x: 100, y: 100, w: 20, h: 20 },
  { id: 3, type: 'text', x: 10, y: 40, text: 'ab', size: 10 },
  { id: 4, type: 'pen', points: [] }, // 无效图形，不能被选中也不能抛错
];
const picked = G.shapesInBox(scene, { x1: -5, y1: -5, x2: 30, y2: 45 }).map((s) => s.id);
assert.deepStrictEqual(picked, [1, 3], '框住 rect1 和 text，跳过无效图形');
assert.deepStrictEqual(G.shapesInBox(scene, { x1: 15, y1: 15, x2: 16, y2: 16 }).map((s) => s.id), [1],
  '只压到一角也选中');
assert.deepStrictEqual(G.shapesInBox(scene, { x1: 500, y1: 500, x2: 600, y2: 600 }), [], '空白区选不到');
assert.deepStrictEqual(G.shapesInBox([], { x1: 0, y1: 0, x2: 10, y2: 10 }), []);

// ---------- CJK 判定（决定折行时能否就地断字） ----------
// 用 \u 转义写断言：字面 CJK 字符会被某些编辑器/编码转换悄悄改坏
assert.ok(G.isCJK('中'), '中');
assert.ok(G.isCJK('国'), '国');
assert.ok(G.isCJK('あ'), 'あ 平假名');
assert.ok(G.isCJK('ア'), 'ア 片假名');
assert.ok(G.isCJK('　'), '全角空格');
assert.ok(G.isCJK('，'), '全角逗号');
assert.ok(G.isCJK('。'), '句号');
assert.ok(!G.isCJK('a'), '拉丁字母不可就地断');
assert.ok(!G.isCJK('Z'));
assert.ok(!G.isCJK('1'));
assert.ok(!G.isCJK(' '), '半角空格走空格分支');
assert.ok(!G.isCJK('-'));
assert.ok(!G.isCJK('('));

// ---------- 分栏流式排版 ----------

// 分节：keepWithNext 的条目与后一条绑在一起
assert.deepStrictEqual(
  G.groupSections([
    { id: 'h1', keepWithNext: true },
    { id: 't1' },
    { id: 't2' },
  ]).map((sec) => sec.map((i) => i.id)),
  [['h1', 't1'], ['t2']],
  '标题与紧随其后的正文同节'
);
// 连续多个 keepWithNext 串成一节
assert.deepStrictEqual(
  G.groupSections([
    { id: 'a', keepWithNext: true },
    { id: 'b', keepWithNext: true },
    { id: 'c' },
  ]).map((sec) => sec.map((i) => i.id)),
  [['a', 'b', 'c']]
);
// 末尾残留 keepWithNext（AI 可能把 heading 放最后）不能丢内容
assert.deepStrictEqual(
  G.groupSections([{ id: 'a' }, { id: 'b', keepWithNext: true }])
    .map((sec) => sec.map((i) => i.id)),
  [['a'], ['b']],
  '末尾孤立 keepWithNext 仍成节，内容不丢'
);
assert.deepStrictEqual(G.groupSections([]), []);

const flowOpts = { maxH: 100, colW: 200, colGap: 50, itemGap: 0 };

// 装满换栏：三个 40 高的块，栏高 100 → 前两个一栏，第三个换栏
const f1 = G.flowColumns([{ h: 40 }, { h: 40 }, { h: 40 }], flowOpts);
assert.strictEqual(f1.columns, 2, '装不下时开新栏');
assert.deepStrictEqual(f1.positions.map((p) => [p.x, p.y]), [[0, 0], [0, 40], [250, 0]]);
// 换栏后 x 前进一个栏宽+栏距，y 归零 —— 即"向下排满再向右"
assert.strictEqual(f1.positions[2].x, 200 + 50, '新栏 x = colW + colGap');
assert.strictEqual(f1.positions[2].y, 0, '新栏从顶部重新开始');

// 正好装满不该提前换栏
const f2 = G.flowColumns([{ h: 50 }, { h: 50 }], flowOpts);
assert.strictEqual(f2.columns, 1, '刚好等于栏高仍留在同一栏');

// 标题不孤行：h 装得下但整节装不下时，整节一起换栏
const f3 = G.flowColumns(
  [{ h: 60 }, { h: 30, keepWithNext: true, id: 'head' }, { h: 60, id: 'body' }],
  flowOpts
);
const head = f3.positions.find((p) => p.item.id === 'head');
const body = f3.positions.find((p) => p.item.id === 'body');
assert.strictEqual(head.x, body.x, '标题与正文同栏，标题不落在栏底');
assert.strictEqual(head.x, 250, '整节一起换到第二栏');

// 超高单节不能死循环，也不能被丢掉
const f4 = G.flowColumns([{ h: 500 }], flowOpts);
assert.strictEqual(f4.positions.length, 1, '超高块仍被放置');
assert.deepStrictEqual([f4.positions[0].x, f4.positions[0].y], [0, 0], '空栏时不换栏');
// 超高块之后的内容要换到下一栏
const f5 = G.flowColumns([{ h: 500 }, { h: 20 }], flowOpts);
assert.strictEqual(f5.positions[1].x, 250, '超高块后续内容换栏');

// itemGap 累加进 y
const f6 = G.flowColumns([{ h: 10 }, { h: 10 }], { ...flowOpts, itemGap: 5 });
assert.deepStrictEqual(f6.positions.map((p) => p.y), [0, 15], '块间距计入偏移');

// 无 maxH（默认无限高）时永远单栏
const f7 = G.flowColumns([{ h: 9999 }, { h: 9999 }], { colW: 200, colGap: 50 });
assert.strictEqual(f7.columns, 1, '未给 maxH 时不分栏');
assert.deepStrictEqual(G.flowColumns([], flowOpts), { positions: [], columns: 1 });

// ---------- 整组缩放：组内相对位置必须保持 ----------
// 这是多选缩放唯一会静默算错的地方：所有图形必须按同一对包围盒映射，
// 各自按自己的包围盒缩放会导致图形挤在一起或散开
const group = [
  { id: 1, type: 'rect', x: 0, y: 0, w: 10, h: 10 },
  { id: 2, type: 'rect', x: 20, y: 0, w: 10, h: 10 },
];
const gOld = G.bboxAll(group);
assert.deepStrictEqual(gOld, { x1: 0, y1: 0, x2: 30, y2: 10 });
const gNew = { x1: 0, y1: 0, x2: 60, y2: 20 }; // 宽高各翻倍
const scaled = group.map((s) => G.resizeShape(s, gOld, gNew));
// 缩放后整组包围盒应等于目标框
assert.deepStrictEqual(G.bboxAll(scaled), gNew, '整组包围盒贴合目标');
// 两图形间距同比放大：原本 10 (10→20)，现在应为 20 (20→40)
const gapBefore = G.bbox(group[1]).x1 - G.bbox(group[0]).x2;
const gapAfter = G.bbox(scaled[1]).x1 - G.bbox(scaled[0]).x2;
near(gapBefore, 10, '原始间距');
near(gapAfter, 20, '间距同比放大，组内相对位置保持');
// 各自尺寸也翻倍
near(scaled[0].w, 20, '成员宽度翻倍');
near(scaled[1].h, 20, '成员高度翻倍');

// ---------- 手柄 ----------

const hb = { x1: 0, y1: 0, x2: 100, y2: 50 };
assert.strictEqual(G.handleAt(hb, 0, 0, 8), 'nw');
assert.strictEqual(G.handleAt(hb, 100, 50, 8), 'se');
assert.strictEqual(G.handleAt(hb, 50, 25, 8), null, '中心不是手柄');
// 拖 se 角，nw 角固定
const h1 = G.applyHandle(hb, 'se', 200, 80);
assert.deepStrictEqual(h1, { x1: 0, y1: 0, x2: 200, y2: 80 });
// 拖 nw 角，se 角固定
assert.deepStrictEqual(G.applyHandle(hb, 'nw', -10, -10), { x1: -10, y1: -10, x2: 100, y2: 50 });
// 拖过对角后不塌成负尺寸
const crossed = G.applyHandle(hb, 'se', -50, -50, 4);
assert.ok(crossed.x2 - crossed.x1 >= 4 && crossed.y2 - crossed.y1 >= 4, '最小尺寸兜底');

// ---------- 视口 ----------

const v = { scale: 2, x: 100, y: 50 };
// 往返一致
const w1 = G.toWorld(v, 300, 250);
assert.deepStrictEqual(w1, { x: 100, y: 100 });
const s1 = G.toScreen(v, w1.x, w1.y);
assert.deepStrictEqual(s1, { x: 300, y: 250 });

// 焦点缩放：焦点下的世界坐标必须不动
const before = G.toWorld(v, 300, 250);
const zoomed = G.zoomAt(v, 1.5, 300, 250);
const after = G.toWorld(zoomed, 300, 250);
near(before.x, after.x, '缩放锚点 x 不动');
near(before.y, after.y, '缩放锚点 y 不动');
near(zoomed.scale, 3, '倍率相乘');

// 夹取上下限后锚点依然不动（k 用夹取后的实际倍率算）
const maxed = G.zoomAt({ scale: G.MAX_SCALE, x: 0, y: 0 }, 4, 200, 200);
assert.strictEqual(maxed.scale, G.MAX_SCALE, '不超过上限');
const mb = G.toWorld({ scale: G.MAX_SCALE, x: 0, y: 0 }, 200, 200);
const ma = G.toWorld(maxed, 200, 200);
near(mb.x, ma.x, '夹取时锚点仍不动');
const mined = G.zoomAt({ scale: G.MIN_SCALE, x: 0, y: 0 }, 0.1, 0, 0);
assert.strictEqual(mined.scale, G.MIN_SCALE, '不低于下限');

// 视口矩形 → 世界
assert.deepStrictEqual(
  G.viewportBox({ scale: 2, x: 0, y: 0 }, 400, 200),
  { x1: 0, y1: 0, x2: 200, y2: 100 }
);

// 居中：目标点落到画布中心
const c = G.centerOn({ scale: 2, x: 0, y: 0 }, 50, 50, 400, 300);
const cs = G.toScreen(c, 50, 50);
near(cs.x, 200, '居中 x');
near(cs.y, 150, '居中 y');

// fit：内容等比塞进窗口，取较紧的一轴
const ft = G.fitTransform({ x1: 0, y1: 0, x2: 100, y2: 50 }, 200, 200, 0);
near(ft.scale, 2, 'fit 取 min(200/100, 200/50)=2');
const p1 = G.toScreen({ scale: ft.scale, x: ft.x, y: ft.y }, 0, 0);
const p2 = G.toScreen({ scale: ft.scale, x: ft.x, y: ft.y }, 100, 50);
assert.ok(p1.x >= -0.01 && p1.y >= -0.01 && p2.x <= 200.01 && p2.y <= 200.01, 'fit 后内容不出界');
assert.deepStrictEqual(G.fitTransform(null, 100, 100), { scale: 1, x: 0, y: 0 });

console.log('whiteboard geometry: all assertions passed');
