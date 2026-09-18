// 思维导图纯函数自检：索引 / 修复 / 尺寸 / 规划 / 布局 / 连线 / 把手
const assert = require('assert');
const M = require('../public/whiteboard-mind');

const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg}: ${a} != ${b}`);
// 测量桩：每个字符 0.6em
const measure = (t, size) => t.length * size * 0.6;

// 快速造节点
let seq = 1;
const N = (over) => ({
  id: seq++, type: 'mind-node', mapId: 1, parentId: null, side: null, order: 0,
  label: '', labelSize: 14, color: '#000', width: 2, fillColor: '#fff',
  x: 0, y: 0, w: 88, h: 38, ...over,
});
// 用 childSpec 从根长出一棵树，返回 shapes（模拟 addShapes 分 id）
function grow(shapes, parentId, side) {
  const spec = M.childSpec(M.index(shapes), parentId, side, measure);
  const node = { ...spec, id: seq++ };
  return [...shapes, node];
}
function relayout(shapes) {
  const pos = M.layout(shapes);
  return shapes.map((s) => (pos.has(s.id) ? { ...s, ...pos.get(s.id) } : s));
}

// ---------- index ----------
{
  seq = 1;
  const root = N({ id: 1, mapId: 1 });
  const a = N({ id: 2, parentId: 1, side: 'right', order: 1 });
  const b = N({ id: 3, parentId: 1, side: 'right', order: 0 });
  const c = N({ id: 4, parentId: 2, side: 'right', order: 0 });
  const other = { id: 9, type: 'rect', x: 0, y: 0, w: 1, h: 1 };
  const idx = M.index([root, a, b, c, other]);
  assert.deepStrictEqual(idx.roots, [1]);
  assert.deepStrictEqual(M.children(idx, 1), [3, 2], '兄弟按 order 排序');
  assert.strictEqual(idx.depth.get(4), 2);
  assert.ok(!idx.byId.has(9), '非导图图形被忽略');
  assert.deepStrictEqual([...M.descendants(idx, [2])].sort(), [2, 4], '后代含自身');
  assert.deepStrictEqual([...M.descendants(idx, [1])].sort(), [1, 2, 3, 4]);
}

// ---------- descendants 防环 ----------
{
  const a = N({ id: 1, parentId: 2 });
  const b = N({ id: 2, parentId: 1 });
  const idx = M.index([a, b]);
  assert.deepStrictEqual(idx.roots, [], '互指成环没有根');
  assert.deepStrictEqual([...M.descendants(idx, [1])].sort(), [1, 2], '环不死循环');
}

// ---------- repair ----------
{
  // 合法输入返回同一引用
  const root = N({ id: 1, mapId: 1, label: '根', labelSize: 18, w: 120, h: 46 });
  const kid = N({ id: 2, parentId: 1, side: 'left', order: 0 });
  const ok = [root, kid];
  assert.strictEqual(M.repair(ok), ok);

  // 父缺失 → 挂回同图的根末尾
  const orphan = N({ id: 3, mapId: 1, parentId: 99, side: 'right', order: 0 });
  const r1 = M.repair([root, kid, orphan]);
  const fixed = r1.find((s) => s.id === 3);
  assert.strictEqual(fixed.parentId, 1);
  assert.ok(fixed.order > kid.order, '挂到末尾');

  // 根缺失 → 自立为根，后代 mapId 一并改
  const lone = N({ id: 5, mapId: 42, parentId: 42, side: 'right' });
  const loneKid = N({ id: 6, mapId: 42, parentId: 5, side: 'right' });
  const r2 = M.repair([lone, loneKid]);
  assert.strictEqual(r2.find((s) => s.id === 5).parentId, null);
  assert.strictEqual(r2.find((s) => s.id === 5).mapId, 5);
  assert.strictEqual(r2.find((s) => s.id === 6).mapId, 5, '后代 mapId 跟随新根');
  assert.strictEqual(r2.find((s) => s.id === 5).side, null, '根没有 side');

  // 环：只断 id 最小的一个挂回根，另一个跟着它变得可达
  const c1 = N({ id: 7, mapId: 1, parentId: 8 });
  const c2 = N({ id: 8, mapId: 1, parentId: 7 });
  const r3 = M.repair([root, c1, c2]);
  assert.strictEqual(r3.find((s) => s.id === 7).parentId, 1);
  assert.strictEqual(r3.find((s) => s.id === 8).parentId, 7, '环的其余成员保持原父');
  assert.strictEqual(M.index(r3).depth.size, 3, '修复后全部可达');

  // 无根的环：id 最小者自立为根，其余仍是它的后代
  const e1 = N({ id: 11, mapId: 77, parentId: 12 });
  const e2 = N({ id: 12, mapId: 77, parentId: 11 });
  const r5 = M.repair([e1, e2]);
  assert.strictEqual(r5.find((s) => s.id === 11).parentId, null);
  assert.strictEqual(r5.find((s) => s.id === 12).parentId, 11);
  assert.strictEqual(r5.find((s) => s.id === 12).mapId, 11);

  // side 继承、非法尺寸兜底
  const deep = N({ id: 9, mapId: 1, parentId: 2, side: 'right', w: NaN, h: 0, label: null, labelSize: 0 });
  const r4 = M.repair([root, kid, deep]);
  const d = r4.find((s) => s.id === 9);
  assert.strictEqual(d.side, 'left', '二级继承父的 side');
  assert.strictEqual(d.w, 88); assert.strictEqual(d.h, 38);
  assert.strictEqual(d.label, ''); assert.strictEqual(d.labelSize, 14);

  // 空数组 / 无导图图形
  const plain = [{ id: 1, type: 'rect' }];
  assert.strictEqual(M.repair(plain), plain);
  assert.deepStrictEqual(M.repair([]), []);
}

// ---------- nodeSize ----------
{
  const empty = M.nodeSize('', 1, measure);
  assert.deepStrictEqual([empty.w, empty.h, empty.lines], [96, 40, ['']], '空标签取最小尺寸、占一行');
  const s = M.nodeSize('十个字十个字十个字十', 1, measure); // 10 * 15 * 0.6 = 90
  assert.strictEqual(s.w, 90 + 28);
  assert.deepStrictEqual(s.lines, ['十个字十个字十个字十']);
  assert.strictEqual(M.nodeSize('x', 0, measure).h, 46, '根高 = max(46, ceil(18*1.4+20))');

  // 多行：显式换行 → 两行，高按行数；宽取最长行
  const two = M.nodeSize('短\n这一行长一些再长一些', 1, measure); // 第二行 10 字 = 90px，超过 minW
  assert.deepStrictEqual(two.lines, ['短', '这一行长一些再长一些']);
  assert.strictEqual(two.w, Math.ceil(10 * 15 * 0.6 + 28), '宽取最长行');
  assert.strictEqual(two.h, Math.ceil(2 * 15 * 1.4 + 16), '高按两行');
  // 自动折行：深度 1 行宽上限 260 - 28 = 232，每字 9px → 25 字一行
  const long = M.nodeSize('字'.repeat(60), 1, measure);
  assert.strictEqual(long.lines.length, 3, '60 字折成 3 行');
  assert.ok(long.lines.every((l) => l.length <= 25), '每行不超过行宽');
  assert.strictEqual(long.lines.join(''), '字'.repeat(60), '折行不丢字');
  assert.ok(long.w <= M.STYLE.maxW, '节点不超过最大宽');
  // 空行保留
  assert.deepStrictEqual(M.nodeSize('a\n\nb', 2, measure).lines, ['a', '', 'b']);
  // CRLF 归一
  assert.deepStrictEqual(M.wrapLabel('a\r\nb', 14, false, 200, measure), ['a', 'b']);
  // 拉丁词按空格回退
  const latin = M.wrapLabel('hello world foo', 10, false, 6 * 11, measure); // 每字 6px，行宽 66 = 11 字
  assert.deepStrictEqual(latin, ['hello world', 'foo']);
  // 整词过长就地断
  assert.deepStrictEqual(M.wrapLabel('abcdefghij', 10, false, 6 * 4, measure), ['abcd', 'efgh', 'ij']);
  // 中英混排：中文处可断
  assert.deepStrictEqual(M.wrapLabel('中文abc', 10, false, 6 * 3, measure), ['中文', 'abc']);
  // 单字比行宽还宽：不切分、不死循环
  assert.deepStrictEqual(M.wrapLabel('字', 10, false, 1, measure), ['字']);
  assert.deepStrictEqual(M.wrapLabel(null, 10, false, 100, measure), ['']);
  assert.strictEqual(M.depthStyle(0).labelSize, 18);
  assert.strictEqual(M.depthStyle(1).labelSize, 15);
  assert.strictEqual(M.depthStyle(5).labelSize, 14, '深层取最后一项');
  // 加粗标志传给测量函数
  let gotBold = null;
  M.nodeSize('a', 0, (t, size, bold) => { gotBold = bold; return 10; });
  assert.strictEqual(gotBold, true);
  M.nodeSize('a', 1, (t, size, bold) => { gotBold = bold; return 10; });
  assert.strictEqual(gotBold, false);
}

// ---------- rootSpec / childSpec / siblingSpec ----------
{
  seq = 10;
  const rs = M.rootSpec({ x: 400, y: 300 }, measure);
  near(rs.x + rs.w / 2, 400, '根中心 x'); near(rs.y + rs.h / 2, 300, '根中心 y');
  assert.strictEqual(rs.label, '中心主题');
  assert.strictEqual(rs.parentId, null);
  assert.strictEqual(rs.w, Math.max(120, Math.ceil(4 * 18 * 0.6 + 36)));

  let shapes = [{ ...rs, id: 1, mapId: 1 }];
  shapes = grow(shapes, 1, 'right');
  shapes = grow(shapes, 1, 'left');
  shapes = grow(shapes, 1, 'right');
  const [, k1, k2, k3] = shapes;
  assert.strictEqual(k1.side, 'right'); assert.strictEqual(k2.side, 'left');
  assert.deepStrictEqual([k1.order, k2.order, k3.order], [0, 1, 2], 'order 递增');
  assert.strictEqual(k1.color, M.STYLE.palette[0]);
  assert.strictEqual(k2.color, M.STYLE.palette[1]);
  assert.strictEqual(k3.color, M.STYLE.palette[2], '一级依次取色');
  assert.strictEqual(k1.labelSize, 15);
  assert.strictEqual(k1.mapId, 1);

  // 二级：继承 side 与颜色，side 参数被忽略
  shapes = grow(shapes, k2.id, 'right');
  const g = shapes[shapes.length - 1];
  assert.strictEqual(g.side, 'left', '继承父 side');
  assert.strictEqual(g.color, k2.color, '继承父色');
  assert.strictEqual(g.labelSize, 14);

  // 第 7 个一级回绕色板
  for (let i = 0; i < 4; i++) shapes = grow(shapes, 1, 'right');
  const seventh = shapes[shapes.length - 1];
  assert.strictEqual(seventh.color, M.STYLE.palette[0], '第 7 个一级回绕');

  // 父不存在
  assert.strictEqual(M.childSpec(M.index(shapes), 999, 'right', measure), null);

  // siblingSpec：在 k1(order 0) 后插入 → k2、k3 及之后顺延
  const sib = M.siblingSpec(M.index(shapes), k1.id, measure);
  assert.strictEqual(sib.node.order, 1);
  assert.strictEqual(sib.node.side, 'right');
  assert.strictEqual(sib.node.color, k1.color, '同级兄弟同色');
  assert.ok(sib.renumber.find((r) => r.id === k2.id && r.order === 2));
  assert.ok(sib.renumber.find((r) => r.id === k3.id && r.order === 3));
  assert.ok(!sib.renumber.find((r) => r.id === k1.id), '前面的不动');
  // 末尾插入不改动任何节点
  const lastSib = M.siblingSpec(M.index(shapes), seventh.id, measure);
  assert.deepStrictEqual(lastSib.renumber, []);
  // 对根 = 加右侧子节点
  const rootSib = M.siblingSpec(M.index(shapes), 1, measure);
  assert.strictEqual(rootSib.node.parentId, 1);
  assert.strictEqual(rootSib.node.side, 'right');
}

// ---------- layout ----------
const noOverlap = (shapes, msg) => {
  for (let i = 0; i < shapes.length; i++) {
    for (let j = i + 1; j < shapes.length; j++) {
      const a = shapes[i], b = shapes[j];
      const hit = a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
      assert.ok(!hit, `${msg}: 节点 ${a.id} 与 ${b.id} 重叠`);
    }
  }
};
const centeredOnKids = (shapes, msg) => {
  const idx = M.index(shapes);
  for (const s of shapes) {
    const ks = M.children(idx, s.id);
    if (!ks.length) continue;
    const bySide = {};
    for (const c of ks) { const cs = idx.byId.get(c); (bySide[cs.side] = bySide[cs.side] || []).push(cs); }
    for (const list of Object.values(bySide)) {
      const first = list[0], last = list[list.length - 1];
      near(s.y + s.h / 2, (first.y + last.y + last.h) / 2, `${msg}: 节点 ${s.id} 居中于子节点`);
      for (const c of list) {
        const expectX = c.side === 'left' ? s.x - M.STYLE.hGap - c.w : s.x + s.w + M.STYLE.hGap;
        near(c.x, expectX, `${msg}: 节点 ${c.id} 的 x`);
      }
    }
  }
};

{
  // 单根：无输出，根不动
  const root = N({ id: 1, mapId: 1, labelSize: 18, x: 100, y: 200, w: 120, h: 46 });
  assert.strictEqual(M.layout([root]).size, 0);
  assert.strictEqual(M.layout([]).size, 0);

  // 1 + 3 (右右左) + (2, 1, 0)
  seq = 2;
  let shapes = [root];
  shapes = grow(shapes, 1, 'right');
  shapes = grow(shapes, 1, 'right');
  shapes = grow(shapes, 1, 'left');
  const [, a, b, c] = shapes;
  shapes = grow(shapes, a.id); shapes = grow(shapes, a.id);
  shapes = grow(shapes, b.id);
  shapes = relayout(shapes);
  noOverlap(shapes, '模板树');
  centeredOnKids(shapes, '模板树');
  const root2 = shapes.find((s) => s.id === 1);
  assert.deepStrictEqual([root2.x, root2.y], [100, 200], '根不动');
  // 右侧两支中心对根中心对称
  const A = shapes.find((s) => s.id === a.id), B = shapes.find((s) => s.id === b.id);
  const C = shapes.find((s) => s.id === c.id);
  near((A.y + B.y + B.h) / 2, root2.y + root2.h / 2, '右侧首尾子节点围绕根中心');
  near(C.y + C.h / 2, root2.y + root2.h / 2, '左侧单子与根同高');
  assert.ok(C.x + C.w < root2.x, '左侧节点在根左边');
  // 相邻兄弟子树之间至少留 vGap（A 的子块底部到 B 的顶部）
  const aKidsBottom = Math.max(...shapes.filter((s) => s.parentId === a.id).map((s) => s.y + s.h));
  assert.ok(B.y - aKidsBottom >= M.STYLE.vGap - 1e-6, `兄弟间距 ${B.y - aKidsBottom} < vGap`);

  // 缺 w/h 的节点不产生 NaN
  const broken = shapes.map((s) => (s.id === c.id ? { ...s, w: undefined, h: NaN } : s));
  for (const [, p] of M.layout(broken)) assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y), '坐标必须有限');

  // 稳定性：同输入两次结果一致；输入未被修改
  const before = JSON.stringify(shapes);
  const p1 = M.layout(shapes), p2 = M.layout(shapes);
  assert.deepStrictEqual([...p1.entries()], [...p2.entries()]);
  assert.strictEqual(JSON.stringify(shapes), before, '输入不被修改');

  // 末支加叶子后其余节点 x 不变
  const grown = relayout(grow(shapes, c.id));
  for (const s of shapes) near(grown.find((g) => g.id === s.id).x, s.x, '加叶子不影响 x');
  noOverlap(grown, '加叶子');
}

// 父比子块高：子块下推、不重叠
{
  seq = 2;
  const root = N({ id: 1, mapId: 1, labelSize: 18, x: 0, y: 0, w: 120, h: 46 });
  let shapes = [root];
  shapes = grow(shapes, 1, 'right');
  const tall = { ...shapes[1], h: 200 }; // 一级节点很高
  shapes = [root, tall];
  shapes = grow(shapes, tall.id);
  shapes = relayout(shapes);
  noOverlap(shapes, '高父节点');
  centeredOnKids(shapes, '高父节点');
}

// 根字号翻倍 → 间距翻倍
{
  seq = 2;
  const root = N({ id: 1, mapId: 1, labelSize: 18, x: 0, y: 0, w: 120, h: 46 });
  let s1 = grow([root], 1, 'right');
  const p1 = M.layout(s1).get(s1[1].id);
  const s2 = [{ ...root, labelSize: 36 }, s1[1]];
  const p2 = M.layout(s2).get(s1[1].id);
  near(p2.x - (root.x + root.w), 2 * (p1.x - (root.x + root.w)), 'hGap 随根字号等比');
}

// 属性测试：随机树无重叠、父居中
{
  let state = 48271;
  const rnd = () => { state = (state * 48271) % 2147483647; return state / 2147483647; };
  for (let t = 0; t < 300; t++) {
    seq = 2;
    const root = N({ id: 1, mapId: 1, labelSize: 18, x: 0, y: 0, w: 120 + Math.floor(rnd() * 80), h: 46 });
    let shapes = [root];
    const n = 1 + Math.floor(rnd() * 25);
    for (let i = 0; i < n; i++) {
      const parent = shapes[Math.floor(rnd() * shapes.length)];
      shapes = grow(shapes, parent.id, rnd() < 0.4 ? 'left' : 'right');
      // 随机文字宽度
      const last = shapes[shapes.length - 1];
      shapes[shapes.length - 1] = { ...last, w: last.w + Math.floor(rnd() * 120), h: last.h + (rnd() < 0.2 ? 30 : 0) };
    }
    shapes = relayout(shapes);
    noOverlap(shapes, `随机树 #${t}`);
    centeredOnKids(shapes, `随机树 #${t}`);
  }
}

// ---------- 连线 ----------
{
  const a = { x: 0, y: 0 }, b = { x: 200, y: 100 };
  const k = M.edgeCtrl(a, b);
  near(k.c1.y, a.y, 'c1 在起点水平线'); near(k.c2.y, b.y, 'c2 在终点水平线');
  near(k.c1.x, 100, 'c1.x 取中点'); near(k.c2.x, 100, 'c2.x 取中点');
  const short = M.edgeCtrl(a, { x: 10, y: 50 });
  near(short.c1.x, M.STYLE.minDx, '短距离外伸 minDx');
  const back = M.edgeCtrl({ x: 100, y: 0 }, { x: 90, y: 50 });
  near(back.c1.x, 100 - M.STYLE.minDx, '向左外伸');
  const flat = M.edgeCtrl(a, { x: 200, y: 0 });
  near(flat.c1.y, flat.c2.y, '同高退化为直线');

  const parent = N({ id: 1, x: 0, y: 0, w: 100, h: 40 });
  const right = N({ id: 2, parentId: 1, side: 'right', x: 164, y: 0, w: 80, h: 40 });
  const left = N({ id: 3, parentId: 1, side: 'left', x: -144, y: 0, w: 80, h: 40 });
  const er = M.edgePoints(parent, right);
  assert.deepStrictEqual(er, { a: { x: 100, y: 20 }, b: { x: 164, y: 20 } }, '右侧：父右缘 → 子左缘');
  const el = M.edgePoints(parent, left);
  assert.deepStrictEqual(el, { a: { x: 0, y: 20 }, b: { x: -64, y: 20 } }, '左侧：父左缘 → 子右缘');
}

// ---------- 节点旁按钮 / 包围盒 ----------
{
  const root = N({ id: 1, x: 0, y: 0, w: 100, h: 40 });
  const kid = N({ id: 2, parentId: 1, side: 'left', x: -180, y: 0, w: 80, h: 40 });
  const grand = N({ id: 3, parentId: 2, side: 'left', x: -330, y: 0, w: 80, h: 40 });
  const leafR = N({ id: 4, parentId: 1, side: 'right', x: 164, y: 0, w: 80, h: 40 });
  const idx = M.index([root, kid, grand, leafR]);
  const r = 10;

  const hs = M.nodeHandles(root, idx, r);
  assert.deepStrictEqual(hs.map((h) => [h.kind, h.side]), [['plus', 'right'], ['plus', 'left']], '根两侧各一个 ＋');
  near(hs[0].x, 114, '右按钮圆心'); near(hs[1].x, -14, '左按钮圆心'); near(hs[0].y, 20, '按钮垂直居中');

  const kh = M.nodeHandles(kid, idx, r);
  assert.deepStrictEqual(kh.map((h) => h.kind), ['minus', 'plus'], '有子节点：－ 在前 ＋ 在后');
  near(kh[0].x, -180 - 14, '－ 紧贴外侧'); near(kh[1].x, -180 - 14 - 26, '＋ 再往外 2r+6');
  assert.ok(kh.every((h) => h.side === 'left'), '都在朝外一侧');

  assert.deepStrictEqual(M.nodeHandles(leafR, idx, r).map((h) => h.kind), ['plus'], '叶子只有 ＋');

  const idxC = M.index([root, { ...kid, collapsed: true }, grand, leafR]);
  const ch = M.nodeHandles({ ...kid, collapsed: true }, idxC, r);
  assert.deepStrictEqual(ch.map((h) => h.kind), ['badge'], '折叠中只有徽标');
  assert.strictEqual(ch[0].count, 1, '徽标数 = 后代数');
  const leafCollapsed = M.nodeHandles({ ...leafR, collapsed: true }, idxC, r);
  assert.deepStrictEqual(leafCollapsed.map((h) => h.kind), ['plus'], '没有子节点时 collapsed 标记无效');

  assert.strictEqual(M.handleAt(kh, -194, 20, r).kind, 'minus');
  assert.strictEqual(M.handleAt(kh, -220, 25, r).kind, 'plus');
  assert.strictEqual(M.handleAt(kh, -140, 20, r), null, '节点内部不是按钮');
  assert.strictEqual(M.handleAt([], 0, 0, r), null);

  assert.deepStrictEqual(M.mapBox([root, kid]), { x1: -180, y1: 0, x2: 100, y2: 40 });
  assert.strictEqual(M.mapBox([]), null);
}

// ---------- 折叠：hidden / descendantCount / 布局 ----------
{
  seq = 2;
  const root = N({ id: 1, mapId: 1, labelSize: 18, x: 0, y: 0, w: 120, h: 46 });
  let shapes = [root];
  shapes = grow(shapes, 1, 'right'); const a = shapes[1];
  shapes = grow(shapes, 1, 'right'); const b = shapes[2];
  shapes = grow(shapes, a.id); const c = shapes[3];
  shapes = grow(shapes, c.id); const d = shapes[4];
  shapes = grow(shapes, b.id); const e = shapes[5];
  const open = relayout(shapes);
  const idxOpen = M.index(open);
  assert.strictEqual(idxOpen.hidden.size, 0);
  assert.strictEqual(M.descendantCount(idxOpen, a.id), 2);
  assert.strictEqual(M.descendantCount(idxOpen, 1), 5);
  assert.strictEqual(M.descendantCount(idxOpen, d.id), 0);

  // 折叠 A：C、D 隐藏，B/E 不受影响；A 当叶子参与布局
  const folded = relayout(open.map((s) => (s.id === a.id ? { ...s, collapsed: true } : s)));
  const idx = M.index(folded);
  assert.deepStrictEqual([...idx.hidden].sort(), [c.id, d.id].sort(), '折叠节点的后代全部隐藏');
  assert.deepStrictEqual(M.visibleChildren(idx, a.id), [], '折叠节点在布局里当叶子');
  assert.deepStrictEqual(M.children(idx, a.id), [c.id], '真实子节点仍在');
  const A = folded.find((s) => s.id === a.id), C = folded.find((s) => s.id === c.id), D = folded.find((s) => s.id === d.id);
  assert.deepStrictEqual([C.x, C.y], [A.x, A.y], '隐藏节点收进最近可见祖先的位置');
  assert.deepStrictEqual([D.x, D.y], [A.x, A.y]);
  noOverlap(folded.filter((s) => !idx.hidden.has(s.id)), '折叠后可见节点');
  centeredOnKids(folded.filter((s) => !idx.hidden.has(s.id)), '折叠后可见节点');
  // A 和 B 现在都是"叶子"，它们围绕根居中
  const B = folded.find((s) => s.id === b.id);
  near((A.y + B.y + B.h) / 2, root.y + root.h / 2, '折叠后一级节点围绕根居中');

  // 展开后恢复原布局
  const reopened = relayout(folded.map((s) => (s.id === a.id ? { ...s, collapsed: false } : s)));
  for (const s of open) {
    const t = reopened.find((x) => x.id === s.id);
    near(t.x, s.x, `展开后 x 恢复 #${s.id}`); near(t.y, s.y, `展开后 y 恢复 #${s.id}`);
  }
  // 嵌套折叠：C 也折叠时 D 仍隐藏、C 本身隐藏
  const nested = M.index(folded.map((s) => (s.id === c.id ? { ...s, collapsed: true } : s)));
  assert.deepStrictEqual([...nested.hidden].sort(), [c.id, d.id].sort());
  void e;

  // 坏数据：互指成环且都折叠 → layout 必须返回（不能死循环）
  const cyc = [root, N({ id: 90, mapId: 1, parentId: 91, collapsed: true }), N({ id: 91, mapId: 1, parentId: 90, collapsed: true })];
  assert.ok(M.layout(cyc) instanceof Map, '成环折叠数据 layout 正常返回');
  // 根带 collapsed → repair 清掉
  const badRoot = M.repair([{ ...root, collapsed: true }, a]);
  assert.strictEqual(badRoot.find((s) => s.id === 1).collapsed, false, '根不允许折叠');
  assert.strictEqual(M.index(badRoot).hidden.size, 0);
}

// ---------- 拖动：dropTarget / samePlace / reparentPlan ----------
{
  // 根(0,0,120x46) → 右侧 A、B；A → C；左侧 L
  seq = 2;
  const root = N({ id: 1, mapId: 1, labelSize: 18, x: 0, y: 0, w: 120, h: 46 });
  let shapes = [root];
  shapes = grow(shapes, 1, 'right'); const a = shapes[1];
  shapes = grow(shapes, 1, 'right'); const b = shapes[2];
  shapes = grow(shapes, a.id); const c = shapes[3];
  shapes = grow(shapes, 1, 'left'); const l = shapes[4];
  shapes = relayout(shapes);
  const idx = M.index(shapes);
  const get = (id) => shapes.find((s) => s.id === id);
  const center = (s) => ({ x: s.x + s.w / 2, y: s.y + s.h / 2 });

  // 指针在 B 内 → 成为 B 的末尾子节点
  const intoB = M.dropTarget(idx, c.id, center(get(b.id)));
  assert.deepStrictEqual([intoB.parentId, intoB.side, intoB.index, intoB.indicator.kind], [b.id, 'right', 0, 'node']);
  // 指针在根的左半边 → 根的左侧子节点，排在 L 之后
  const R = get(1);
  const intoRootL = M.dropTarget(idx, c.id, { x: R.x + 10, y: R.y + 10 });
  assert.deepStrictEqual([intoRootL.parentId, intoRootL.side, intoRootL.index], [1, 'left', 1]);
  const intoRootR = M.dropTarget(idx, c.id, { x: R.x + R.w - 10, y: R.y + 10 });
  assert.deepStrictEqual([intoRootR.parentId, intoRootR.side, intoRootR.index], [1, 'right', 2], '右侧已有 A、B');
  // 自己的后代不算目标：把 A 拖到 C 里 → C 被排除，最近的是别的节点
  const ontoOwnChild = M.dropTarget(idx, a.id, center(get(c.id)));
  assert.ok(!ontoOwnChild || ontoOwnChild.parentId !== c.id, '不能挂到自己后代下');
  // 指针在 B 上方一点（B 外）→ 作为 B 的兄弟插在 B 前面（即 A 后 B 前）
  const Bn = get(b.id);
  const aboveB = M.dropTarget(idx, l.id, { x: Bn.x + 5, y: Bn.y - 6 });
  assert.deepStrictEqual([aboveB.parentId, aboveB.side, aboveB.index, aboveB.indicator.kind], [1, 'right', 1, 'line']);
  assert.ok(aboveB.indicator.y < Bn.y && aboveB.indicator.y > get(a.id).y + get(a.id).h, '插入线在 A、B 之间');
  const belowB = M.dropTarget(idx, l.id, { x: Bn.x + 5, y: Bn.y + Bn.h + 6 });
  assert.strictEqual(belowB.index, 2, '插到 B 之后');
  near(belowB.indicator.y, Bn.y + Bn.h + M.STYLE.vGap / 2, '末尾没有邻居：线贴在节点下方');
  // 太远 → 无目标
  assert.strictEqual(M.dropTarget(idx, l.id, { x: 5000, y: 5000 }), null);
  // 只认同一列：C（A 的独子）往下抖出自己的框，列里没有别的节点 → null，而不是变成 A 的兄弟
  const Cn = get(c.id);
  assert.strictEqual(M.dropTarget(idx, c.id, { x: Cn.x + 5, y: Cn.y + Cn.h + 30 }), null, '同列无候选不换层级');
  // 列内候选：把 L 拖到 A/B 那一列（在 B 下方）→ 插到 B 后
  assert.strictEqual(M.dropTarget(idx, l.id, { x: Bn.x + 5, y: Bn.y + Bn.h + 6 }).index, 2);
  // 根右缘与 A/B 列左余量之间的空隙（根外、列外）→ null
  const gapX = R.x + R.w + 16; // 列余量是 hGap/2 = 32，A.x = 根右缘 + 64，所以 +16 在两者之间
  assert.strictEqual(M.dropTarget(idx, l.id, { x: gapX, y: Bn.y + Bn.h / 2 }), null, '两列之间的空隙不算任何一列');
  // 根不能拖
  assert.strictEqual(M.dropTarget(idx, 1, center(get(b.id))), null);
  // 折叠节点的后代不是候选
  const idxFold = M.index(shapes.map((s) => (s.id === a.id ? { ...s, collapsed: true } : s)));
  const ontoHidden = M.dropTarget(idxFold, l.id, center(get(c.id)));
  assert.ok(!ontoHidden || ontoHidden.parentId !== c.id, '隐藏节点不是落点');

  // samePlace：把 B 放回"A 之后"就是原位
  assert.strictEqual(M.samePlace(idx, b.id, { parentId: 1, side: 'right', index: 1 }), true);
  assert.strictEqual(M.samePlace(idx, b.id, { parentId: 1, side: 'right', index: 0 }), false);
  assert.strictEqual(M.samePlace(idx, b.id, { parentId: 1, side: 'left', index: 1 }), false);
  assert.strictEqual(M.samePlace(idx, c.id, { parentId: a.id, side: 'right', index: 0 }), true);

  // reparentPlan：C 挂到 B 下 → parentId 改、颜色跟 B、order 0
  const planCB = M.reparentPlan(idx, c.id, intoB);
  const pc = planCB.find((p) => p.id === c.id);
  assert.strictEqual(pc.parentId, b.id);
  assert.strictEqual(pc.order, 0);
  assert.strictEqual(pc.color, get(b.id).color, '换到别的分支：跟新父同色');
  // L（左侧）插到 A、B 之间 → side 变 right，A/B 重编，颜色保留（同父只是换侧）
  const planL = M.reparentPlan(idx, l.id, aboveB);
  const pl = planL.find((p) => p.id === l.id);
  assert.deepStrictEqual([pl.parentId, pl.side, pl.order], [1, 'right', 1]);
  assert.strictEqual(pl.color, undefined, '同父换侧不改色');
  // C（A 的子）升到根下 → 按一级规则领新色（根已有 3 个一级 → palette[3]），不会和 A 同色
  const planCUp = M.reparentPlan(idx, c.id, { parentId: 1, side: 'right', index: 2 });
  const pcu = planCUp.find((p) => p.id === c.id);
  assert.strictEqual(pcu.color, M.STYLE.palette[3], '升到根下领一个新的一级分支色');
  assert.notStrictEqual(pcu.color, get(a.id).color);
  assert.ok(planL.find((p) => p.id === b.id && p.order === 2), 'B 顺延');
  assert.ok(!planL.find((p) => p.id === a.id), 'A 不动');
  // 同父纯改序：不改色
  const planReorder = M.reparentPlan(idx, b.id, { parentId: 1, side: 'right', index: 0 });
  assert.ok(!planReorder.find((p) => p.color != null), '同父改序不改色');
  assert.strictEqual(planReorder.find((p) => p.id === b.id).order, 0);
  assert.strictEqual(planReorder.find((p) => p.id === a.id).order, 1);
  // 整支 side 跟随：A（带 C）挂到根左侧 → A、C 都变 left
  const planALeft = M.reparentPlan(idx, a.id, { parentId: 1, side: 'left', index: 0 });
  assert.strictEqual(planALeft.find((p) => p.id === a.id).side, 'left');
  assert.strictEqual(planALeft.find((p) => p.id === c.id).side, 'left', '后代 side 一起改');
  // 挂到自己后代 → null；根 → null；父不存在 → null
  assert.strictEqual(M.reparentPlan(idx, a.id, { parentId: c.id, side: 'right', index: 0 }), null);
  assert.strictEqual(M.reparentPlan(idx, 1, { parentId: b.id, side: 'right', index: 0 }), null);
  assert.strictEqual(M.reparentPlan(idx, c.id, { parentId: 999, side: 'right', index: 0 }), null);
  // 目标折叠着 → 顺手展开
  const planIntoFolded = M.reparentPlan(idxFold, l.id, { parentId: a.id, side: 'right', index: 0 });
  assert.ok(planIntoFolded.find((p) => p.id === a.id && p.collapsed === false), '落到折叠节点上自动展开');
  // index 越界被夹取
  const planFar = M.reparentPlan(idx, l.id, { parentId: b.id, side: 'right', index: 99 });
  assert.strictEqual(planFar.find((p) => p.id === l.id).order, 0);
}

// ---------- mapNodes ----------
{
  const list = [N({ id: 1, mapId: 1 }), N({ id: 2, mapId: 2 }), { id: 3, type: 'rect', mapId: 1 }];
  assert.deepStrictEqual(M.mapNodes(list, 1).map((s) => s.id), [1], '按 mapId 过滤且只认导图节点');
}

console.log('whiteboard-mind: all assertions passed');
