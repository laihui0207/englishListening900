// 思维导图：纯函数，无 DOM 依赖，可在 node 下直接测试
// 「节点即图形」：每个节点是 shapes 里一个普通 {x,y,w,h} 图形，type = 'mind-node'
//   mapId    根节点 id，同一棵图的节点共享
//   parentId 父节点 id，根为 null
//   side     'right' | 'left'：挂在根的哪一侧；子节点继承父的 side，根为 null
//   order    同父兄弟的排列顺序（用字段而不用数组顺序：新节点只需尾部追加）
//   collapsed 折叠：整棵子树不显示、不参与点选，节点旁显示被折叠的后代数
//   label / labelSize / labelColor / color(描边=分支色=连线色) / width / fillColor
// 父子连线不落盘，渲染时按 parentId 派生
// 坐标一律世界坐标；文字测量函数 measureW(text, size, bold) 由调用方注入，保持本文件可测
// label 可以多行：显式换行用 \n，超过 STYLE.maxW 的行自动折行（wrapLabel）
// 整个文件包在 IIFE 里：浏览器下各 <script> 共享全局作用域，顶层 const 会和 whiteboard.js 的 G 等重名
(function () {

const MG = typeof require !== 'undefined' ? require('./whiteboard-geom') : window.GEOM;

const TYPE = 'mind-node';
const isNode = (s) => !!s && s.type === TYPE;

const STYLE = {
  // 按深度取样式，超出范围用最后一项
  depth: [
    { labelSize: 18, padX: 18, padY: 10, minW: 120, minH: 46, width: 1, fill: '#f3f3f7', stroke: '#d8d8e8', bold: true },
    { labelSize: 15, padX: 14, padY: 8, minW: 96, minH: 40, width: 2, fill: '#ffffff' },
    { labelSize: 14, padX: 12, padY: 8, minW: 88, minH: 38, width: 2, fill: '#ffffff' },
  ],
  maxW: 260,     // 节点最大宽度，文字超过就折行
  lineH: 1.4,    // 行高 = 字号 × lineH，绘制与编辑框共用
  hGap: 64,      // 父右缘到子左缘的水平距离
  vGap: 16,      // 兄弟子树之间的垂直间距
  minDx: 24,     // 连线控制点离端点的最小水平外伸
  textColor: '#2d3142',
  // 一级分支依次取色，子孙继承父色。对白底对比度 2.8~4.1:1，只用于描边与连线
  palette: ['#7c6fd6', '#5b7be0', '#2fa6a0', '#4f9d63', '#d9873f', '#c95c8c'],
  rootLabel: '中心主题',
};

const depthStyle = (depth) => STYLE.depth[Math.min(depth, STYLE.depth.length - 1)];

// ---------- 索引 ----------
// 一次遍历建好 byId / kids / roots / depth / hidden，之后的查询都是 O(1)
// roots 只含 parentId === null 的节点；父缺失或成环的节点拿不到 depth，交给 repair
// hidden 是所有折叠节点的后代（不含折叠节点自身）

function index(shapes) {
  const byId = new Map();
  for (const s of shapes) if (isNode(s)) byId.set(s.id, s);

  const kids = new Map();
  const roots = [];
  for (const s of byId.values()) {
    if (s.parentId == null) { roots.push(s.id); continue; }
    if (!byId.has(s.parentId)) continue;
    if (!kids.has(s.parentId)) kids.set(s.parentId, []);
    kids.get(s.parentId).push(s.id);
  }
  // order 相同时按 id 兜底，保证排序确定（id 由 addShapes 分配，恒为数字）
  const byOrder = (a, b) => ((byId.get(a).order || 0) - (byId.get(b).order || 0)) || (a - b);
  for (const list of kids.values()) list.sort(byOrder);

  // 一趟前序同时得到 depth 和 hidden：祖先链上有 collapsed 的就是隐藏节点
  const depth = new Map();
  const hidden = new Set();
  const stack = roots.map((id) => [id, 0, false]);
  while (stack.length) {
    const [id, d, hid] = stack.pop();
    if (depth.has(id)) continue;
    depth.set(id, d);
    if (hid) hidden.add(id);
    const under = hid || !!byId.get(id).collapsed;
    for (const c of kids.get(id) || []) stack.push([c, d + 1, under]);
  }
  return { byId, kids, roots, depth, hidden };
}

const children = (idx, id) => idx.kids.get(id) || [];
// 折叠的节点在布局 / 绘制里当叶子
const visibleChildren = (idx, id) => {
  const s = idx.byId.get(id);
  return !s || s.collapsed ? [] : children(idx, id);
};
const mapNodes = (shapes, mapId) => shapes.filter((s) => isNode(s) && s.mapId === mapId);
// 后代数量（不含自身），折叠徽标显示用
const descendantCount = (idx, id) => descendants(idx, [id]).size - 1;

// 含自身的后代集合；visited 防环
function descendants(idx, ids) {
  const out = new Set();
  const stack = [...ids];
  while (stack.length) {
    const id = stack.pop();
    if (out.has(id)) continue;
    out.add(id);
    for (const c of children(idx, id)) stack.push(c);
  }
  return out;
}

// ---------- 修复 ----------
// 加载旧数据 / 外部脚本改坏数据时兜底：
//   父缺失或成环 → 挂回同图的根末尾，没有根就自立为根
//   mapId 与所属根不一致 → 改成根 id；side 缺失 → 从父继承
//   x/y/w/h/label/labelSize/order 非法 → 给默认值
// 合法输入原样返回同一引用，调用方可用 === 判断是否改过

const applyPatch = (shapes, patch) =>
  shapes.map((s) => (patch.has(s.id) ? { ...s, ...patch.get(s.id) } : s));

function repair(shapes) {
  let idx = index(shapes);
  if (idx.byId.size === 0) return shapes;
  const patch = new Map();
  const set = (id, p) => patch.set(id, { ...(patch.get(id) || {}), ...p });

  // 挂回同图的根末尾；没有根就自立为根
  const reattach = (idx, s) => {
    const rid = idx.roots.find((r) => idx.byId.get(r).mapId === s.mapId);
    return rid != null && rid !== s.id
      ? { parentId: rid, order: (s.order || 0) + 1e6 } // 加大数排到所有正常兄弟之后
      : { parentId: null };
  };

  // 第一趟 a：父缺失的节点一批处理（彼此独立）
  for (const s of idx.byId.values()) {
    if (s.parentId != null && !idx.byId.has(s.parentId)) set(s.id, reattach(idx, s));
  }
  let out = patch.size ? applyPatch(shapes, patch) : shapes;
  patch.clear();

  // 第一趟 b：成环的节点从任何根都到不了。每次只断一个（取 id 最小者），
  // 其余环成员随之可达，不会被误提升为多个根。guard 只是防死循环的上限，
  // 正常数据一轮就退出；每轮重建索引所以坏数据最坏 O(n²)，可接受
  for (let guard = 0; guard < 1000; guard++) {
    idx = index(out);
    const stuck = [...idx.byId.values()]
      .filter((s) => s.parentId != null && !idx.depth.has(s.id))
      .sort((a, b) => a.id - b.id);
    if (!stuck.length) break;
    out = applyPatch(out, new Map([[stuck[0].id, reattach(idx, stuck[0])]]));
  }

  // 第二趟：从每个根向下统一 mapId / side，并校正字段
  idx = index(out);
  for (const rid of idx.roots) {
    const root = idx.byId.get(rid);
    // 根没有 side，也不能折叠（折叠根 = 整图消失且没有入口展开）
    if (root.mapId !== rid || root.side != null || root.collapsed) set(rid, { mapId: rid, side: null, collapsed: false });
    const stack = children(idx, rid).map((c) => [c, 1, null]);
    while (stack.length) {
      const [id, d, parentSide] = stack.pop();
      const s = idx.byId.get(id);
      const side = d === 1 ? (s.side === 'left' ? 'left' : 'right') : parentSide;
      const p = {};
      if (s.mapId !== rid) p.mapId = rid;
      if (s.side !== side) p.side = side;
      if (Object.keys(p).length) set(id, p);
      for (const c of children(idx, id)) stack.push([c, d + 1, side]);
    }
  }
  for (const s of idx.byId.values()) {
    const st = depthStyle(idx.depth.get(s.id) || 0);
    const p = {};
    if (!Number.isFinite(s.x)) p.x = 0;
    if (!Number.isFinite(s.y)) p.y = 0;
    if (!(s.w > 0)) p.w = st.minW;
    if (!(s.h > 0)) p.h = st.minH;
    if (typeof s.label !== 'string') p.label = '';
    if (!(s.labelSize > 0)) p.labelSize = st.labelSize;
    if (!Number.isFinite(s.order)) p.order = 0;
    if (Object.keys(p).length) set(s.id, p);
  }
  return patch.size ? applyPatch(out, patch) : out;
}

// ---------- 文字折行 ----------
// 一段文字按 maxTextW 折成若干行：中日韩字符可在任意处断，拉丁词回退到最后一个空格；
// 整行无空格时就地断（对应 CSS 的 overflow-wrap: break-word）。单个字符比行宽还宽时不再切分
function wrapParagraph(text, size, bold, maxTextW, measureW) {
  if (text === '') return [''];
  const lines = [];
  let line = '';
  let lastBreak = -1; // line 内最后一个可断点之后的位置
  for (const ch of text) {
    const next = line + ch;
    if (line !== '' && measureW(next, size, bold) > maxTextW) {
      if (ch === ' ') {
        // 撑爆的是空格本身：正好在词边界，整行保留、空格丢掉
        lines.push(line.trimEnd());
        line = '';
      } else if (MG.isCJK(ch) || lastBreak < 0) {
        lines.push(line);
        line = ch;
      } else {
        lines.push(line.slice(0, lastBreak).trimEnd());
        line = line.slice(lastBreak) + ch;
      }
      lastBreak = -1;
    } else {
      line = next;
    }
    if (ch === ' ' || MG.isCJK(ch)) lastBreak = line.length;
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

// 完整标签 → 行数组：先按显式换行切段，每段再按宽度折行。空标签返回 ['']
function wrapLabel(label, size, bold, maxTextW, measureW) {
  const paras = String(label == null ? '' : label).replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  for (const p of paras) out.push(...wrapParagraph(p, size, bold, maxTextW, measureW));
  return out;
}

// ---------- 尺寸与颜色 ----------

// 返回 { w, h, lines }：宽取最长行，高按行数；空标签占一行的高度
function nodeSize(label, depth, measureW) {
  const st = depthStyle(depth);
  const lines = wrapLabel(label, st.labelSize, !!st.bold, STYLE.maxW - 2 * st.padX, measureW);
  const textW = label ? Math.max(...lines.map((l) => measureW(l, st.labelSize, !!st.bold))) : 0;
  return {
    w: Math.max(st.minW, Math.ceil(textW + 2 * st.padX)),
    h: Math.max(st.minH, Math.ceil(lines.length * st.labelSize * STYLE.lineH + 2 * st.padY)),
    lines,
  };
}

// 一级分支按已有子节点数轮取色板，更深层继承父色
function branchColor(idx, parent) {
  if (parent.parentId != null) return parent.color;
  const n = children(idx, parent.id).length;
  return STYLE.palette[n % STYLE.palette.length];
}

// ---------- 结构编辑规划 ----------
// 只返回「该写什么」，不碰 shapes；id 由调用方的 addShapes 分配

function rootSpec(at, measureW) {
  const st = depthStyle(0);
  const { w, h } = nodeSize(STYLE.rootLabel, 0, measureW);
  return {
    type: TYPE, mapId: null, parentId: null, side: null, order: 0,
    label: STYLE.rootLabel, labelSize: st.labelSize, labelColor: STYLE.textColor,
    color: st.stroke, width: st.width, fillColor: st.fill,
    x: at.x - w / 2, y: at.y - h / 2, w, h,
  };
}

// 给 parentId 加一个末尾子节点。side 只对根有效，其他节点继承自己的 side
function childSpec(idx, parentId, side, measureW) {
  const parent = idx.byId.get(parentId);
  if (!parent) return null;
  const depth = (idx.depth.get(parentId) || 0) + 1;
  const st = depthStyle(depth);
  const sibs = children(idx, parentId);
  const isRoot = parent.parentId == null;
  const order = sibs.length ? Math.max(...sibs.map((id) => idx.byId.get(id).order || 0)) + 1 : 0;
  const { w, h } = nodeSize('', depth, measureW);
  return {
    type: TYPE, mapId: parent.mapId, parentId,
    side: isRoot ? (side === 'left' ? 'left' : 'right') : parent.side,
    order,
    label: '', labelSize: st.labelSize, labelColor: STYLE.textColor,
    color: branchColor(idx, parent), width: st.width, fillColor: st.fill,
    // 临时位置，layout 后会重排
    x: parent.x + parent.w + STYLE.hGap, y: parent.y, w, h,
  };
}

// 在 id 正下方插一个兄弟；后面的兄弟 order 依次 +1。对根调用等价于加子节点
function siblingSpec(idx, id, measureW) {
  const s = idx.byId.get(id);
  if (!s) return null;
  if (s.parentId == null) return { node: childSpec(idx, id, 'right', measureW), renumber: [] };
  const node = childSpec(idx, s.parentId, s.side, measureW);
  if (!node) return null;
  const sibs = children(idx, s.parentId);
  const pos = sibs.indexOf(id);
  const renumber = [];
  sibs.forEach((sid, i) => {
    const want = i <= pos ? i : i + 1;
    if ((idx.byId.get(sid).order || 0) !== want) renumber.push({ id: sid, order: want });
  });
  return { node: { ...node, side: s.side, color: s.color, order: pos + 1 }, renumber };
}

// ---------- 布局 ----------
// 「子树 band」两趟 DFS，O(n)：
//   第一趟（后序）算每棵子树独占的竖向高度 bandH，父节点居中于「首子顶 ~ 末子底」；
//   第二趟（前序）定位。根保持原位，左右两侧各自围着根的中心排。
// 返回 Map<id, {x, y}>（不含根）；只依赖 id/parentId/side/order/w/h。
// 输入应是同一 mapId 的节点（调用方用 mapNodes 过滤），多根时只排第一个根

// 尺寸非法（缺 w/h）按 0 处理，不让 NaN 污染整棵图
const sizeOf = (s) => ({ w: s.w > 0 ? s.w : 0, h: s.h > 0 ? s.h : 0 });

function layout(nodes, opts) {
  const o = opts || {};
  const idx = index(nodes);
  const out = new Map();
  if (!idx.roots.length) return out;
  const root = idx.byId.get(idx.roots[0]);
  const k = (root.labelSize || 18) / 18; // 间距随根字号等比
  const hGap = (o.hGap == null ? STYLE.hGap : o.hGap) * k;
  const vGap = (o.vGap == null ? STYLE.vGap : o.vGap) * k;

  const bands = new Map();
  // 一组兄弟依次堆叠后的总高，以及首子顶 / 末子底在块内的位置
  const stackInfo = (ks) => {
    const bs = ks.map((c) => bands.get(c));
    const kidsH = bs.reduce((sum, b) => sum + b.bandH, 0) + vGap * (ks.length - 1);
    const last = bs[bs.length - 1];
    return {
      kidsH,
      firstTop: bs[0].nodeY,
      lastBottom: kidsH - last.bandH + last.nodeY + sizeOf(idx.byId.get(ks[ks.length - 1])).h,
    };
  };
  const band = (id) => {
    const { h } = sizeOf(idx.byId.get(id));
    const ks = visibleChildren(idx, id);
    if (!ks.length) { bands.set(id, { bandH: h, nodeY: 0, kidsY: 0 }); return; }
    ks.forEach(band);
    const { kidsH, firstTop, lastBottom } = stackInfo(ks);
    let nodeY = (firstTop + lastBottom) / 2 - h / 2;
    // 父比子块还高时把子块下推，band 必须包住父
    const kidsY = Math.max(0, -nodeY);
    nodeY += kidsY;
    bands.set(id, { bandH: Math.max(kidsY + kidsH, nodeY + h), nodeY, kidsY });
  };
  const childX = (parent, child, side) =>
    (side === 'left' ? parent.x - hGap - sizeOf(child).w : parent.x + sizeOf(parent).w + hGap);
  const place = (id, x, top, side) => {
    const s = { ...idx.byId.get(id), x };
    const b = bands.get(id);
    out.set(id, { x, y: top + b.nodeY });
    let ky = top + b.kidsY;
    for (const c of visibleChildren(idx, id)) {
      place(c, childX(s, idx.byId.get(c), side), ky, side);
      ky += bands.get(c).bandH + vGap;
    }
  };

  const rootCy = (root.y || 0) + sizeOf(root).h / 2;
  for (const side of ['right', 'left']) {
    const ks = visibleChildren(idx, root.id).filter((c) => (idx.byId.get(c).side === 'left') === (side === 'left'));
    if (!ks.length) continue;
    ks.forEach(band);
    const { firstTop, lastBottom } = stackInfo(ks);
    let ky = rootCy - (firstTop + lastBottom) / 2;
    for (const c of ks) {
      place(c, childX(root, idx.byId.get(c), side), ky, side);
      ky += bands.get(c).bandH + vGap;
    }
  }

  // 被折叠的节点收进最近的可见祖先位置：包围盒不会被撑大，误命中时也落在折叠节点上。
  // 上溯步数以节点数为上限，坏数据成环也不会卡死
  for (const hid of idx.hidden) {
    let a = idx.byId.get(hid).parentId;
    for (let g = 0; a != null && idx.hidden.has(a) && g < idx.byId.size; g++) a = idx.byId.get(a).parentId;
    const anc = idx.byId.get(a);
    const pos = out.get(a) || (anc ? { x: anc.x, y: anc.y } : null);
    if (pos) out.set(hid, { x: pos.x, y: pos.y });
  }
  return out;
}

// ---------- 连线 ----------
// 父出口 → 子入口：两个控制点分别停在两端的水平线上，得到两端切线水平的 S 形；
// 同一高度时退化为直线。水平距离很短时控制点外伸 minDx 保持弧度

function edgePoints(parent, child) {
  const left = child.side === 'left';
  return {
    a: { x: left ? parent.x : parent.x + parent.w, y: parent.y + parent.h / 2 },
    b: { x: left ? child.x + child.w : child.x, y: child.y + child.h / 2 },
  };
}

function edgeCtrl(a, b) {
  const dx = b.x - a.x;
  const sgn = dx < 0 ? -1 : 1;
  const mx = Math.abs(dx) < 2 * STYLE.minDx ? a.x + sgn * STYLE.minDx : (a.x + b.x) / 2;
  return { c1: { x: mx, y: a.y }, c2: { x: mx, y: b.y } };
}

// ---------- 节点旁的小按钮 ----------
// 从节点朝外一侧的边缘往外依次排，r 是世界半径，第一个圆心离边缘 r + 4，相邻间距 2r + 6
//   根：两侧各一个 plus
//   有子节点未折叠：[minus] [plus]      折叠中：[badge]（带被折叠的后代数，点它展开）
//   叶子：[plus]

function nodeHandles(node, idx, r) {
  const cy = node.y + node.h / 2;
  const at = (side, i) => {
    const off = r + 4 + i * (2 * r + 6);
    return { side, x: side === 'left' ? node.x - off : node.x + node.w + off, y: cy };
  };
  if (node.parentId == null) return [{ kind: 'plus', ...at('right', 0) }, { kind: 'plus', ...at('left', 0) }];
  const side = node.side === 'left' ? 'left' : 'right';
  const kids = children(idx, node.id).length;
  if (kids && node.collapsed) return [{ kind: 'badge', count: descendantCount(idx, node.id), ...at(side, 0) }];
  if (kids) return [{ kind: 'minus', ...at(side, 0) }, { kind: 'plus', ...at(side, 1) }];
  return [{ kind: 'plus', ...at(side, 0) }];
}

// 点落在哪个按钮上，没有返回 null
function handleAt(handles, px, py, r) {
  return handles.find((h) => Math.hypot(px - h.x, py - h.y) <= r) || null;
}

// ---------- 拖动节点：落点判定与换父 ----------

// 点到矩形的距离，在内部为 0
function distToBox(p, s) {
  const dx = Math.max(s.x - p.x, 0, p.x - (s.x + s.w));
  const dy = Math.max(s.y - p.y, 0, p.y - (s.y + s.h));
  return Math.hypot(dx, dy);
}

// 同父同侧的兄弟（按 order），可排除某个 id。非根父节点不分侧
function siblingsOn(idx, parentId, side, excludeId) {
  const parent = idx.byId.get(parentId);
  if (!parent) return [];
  return children(idx, parentId).filter((id) =>
    id !== excludeId && (parent.parentId != null || (idx.byId.get(id).side === 'left') === (side === 'left')));
}

// 拖动 draggedId 时，指针在 p 处该落到哪：
//   指针在某个节点内 → 成为它的末尾子节点（根按左右半边分侧）
//   否则在「指针所在的那一列」里找最近的非根节点，按指针在它上方 / 下方插成它的兄弟。
//   只认同一列：否则手抖离开自己的框，最近的往往是父节点，会被算成「父的兄弟」而静默升级
//   自己的后代、被折叠的节点不算候选；列内没有节点或竖向距离超过 maxDist 返回 null
// indicator 供绘制：{kind:'node', id} 高亮目标节点，{kind:'line', x1, x2, y} 画插入线
// maxDist / 列宽余量都是世界单位，随缩放变化是刻意的：放大看细节时吸附范围也该放大
function dropTarget(idx, draggedId, p, opts) {
  const o = opts || {};
  const maxDist = o.maxDist == null ? 160 : o.maxDist;
  const dragged = idx.byId.get(draggedId);
  if (!dragged || dragged.parentId == null) return null;
  const banned = descendants(idx, [draggedId]);
  const cands = [...idx.byId.values()]
    .filter((s) => s.mapId === dragged.mapId && !banned.has(s.id) && !idx.hidden.has(s.id));

  const inside = cands.find((s) => distToBox(p, s) === 0);
  if (inside) {
    const side = inside.parentId == null
      ? (p.x < inside.x + inside.w / 2 ? 'left' : 'right')
      : inside.side;
    const n = siblingsOn(idx, inside.id, side, draggedId).length;
    return { parentId: inside.id, side, index: n, indicator: { kind: 'node', id: inside.id } };
  }

  const margin = STYLE.hGap / 2;
  const inColumn = (s) => p.x >= s.x - margin && p.x <= s.x + s.w + margin;
  let best = null, bestD = maxDist;
  for (const s of cands) {
    if (s.parentId == null || !inColumn(s)) continue;
    const d = distToBox(p, s);
    if (d < bestD) { bestD = d; best = s; }
  }
  if (!best) return null;
  const sibs = siblingsOn(idx, best.parentId, best.side, draggedId);
  const pos = sibs.indexOf(best.id);
  const after = p.y > best.y + best.h / 2;
  const nb = idx.byId.get(sibs[after ? pos + 1 : pos - 1]);
  // 插入线画在与邻居的中缝；没有邻居就贴在节点外侧半个 vGap 处
  const y = nb
    ? (after ? (best.y + best.h + nb.y) / 2 : (nb.y + nb.h + best.y) / 2)
    : (after ? best.y + best.h + STYLE.vGap / 2 : best.y - STYLE.vGap / 2);
  return {
    parentId: best.parentId, side: best.side, index: pos + (after ? 1 : 0),
    indicator: { kind: 'line', x1: best.x, x2: best.x + best.w, y },
  };
}

// 落点就是原位（同父、同侧、同序）→ 不用改
function samePlace(idx, draggedId, target) {
  const s = idx.byId.get(draggedId);
  if (!s || s.parentId !== target.parentId) return false;
  const parent = idx.byId.get(target.parentId);
  if (!parent) return false;
  const side = parent.parentId == null ? target.side : parent.side;
  if (s.side !== side) return false;
  return siblingsOn(idx, target.parentId, side, null).indexOf(draggedId) === target.index;
}

// 把 draggedId 挂到 target 下，返回 [{id, ...改动字段}]；挂到自己后代 / 父不存在返回 null
//   同父兄弟按新顺序重编 order；整支的 side 跟新位置；
//   换了父：新父不是根 → 整支改成新父的颜色；升到根下 → 按一级分支的规则领一个新色；
//   同父改序 / 换侧不改色；目标折叠着 → 顺手展开，让用户看到结果
function reparentPlan(idx, draggedId, target) {
  const dragged = idx.byId.get(draggedId);
  const parent = idx.byId.get(target.parentId);
  if (!dragged || !parent || dragged.parentId == null) return null;
  const sub = descendants(idx, [draggedId]);
  if (sub.has(target.parentId)) return null;

  const side = parent.parentId == null ? (target.side === 'left' ? 'left' : 'right') : parent.side;
  const sibs = siblingsOn(idx, target.parentId, side, draggedId);
  const i = Math.max(0, Math.min(target.index, sibs.length));
  const ordered = [...sibs.slice(0, i), draggedId, ...sibs.slice(i)];

  const patch = new Map();
  const set = (id, p) => patch.set(id, { ...(patch.get(id) || {}), ...p });
  ordered.forEach((id, k) => {
    if (id === draggedId || (idx.byId.get(id).order || 0) !== k) set(id, { order: k });
  });
  set(draggedId, { parentId: target.parentId });
  const parentChanged = target.parentId !== dragged.parentId;
  const color = !parentChanged ? null : (parent.parentId != null ? parent.color : branchColor(idx, parent));
  for (const id of sub) {
    const s = idx.byId.get(id);
    const p = {};
    if (s.side !== side) p.side = side;
    if (color && s.color !== color) p.color = color;
    if (Object.keys(p).length) set(id, p);
  }
  if (parent.collapsed) set(parent.id, { collapsed: false });
  return [...patch.entries()].map(([id, p]) => ({ id, ...p }));
}

// 整图包围盒
function mapBox(nodes) {
  return nodes.reduce((acc, s) => {
    const b = { x1: s.x, y1: s.y, x2: s.x + s.w, y2: s.y + s.h };
    if (!acc) return b;
    return {
      x1: Math.min(acc.x1, b.x1), y1: Math.min(acc.y1, b.y1),
      x2: Math.max(acc.x2, b.x2), y2: Math.max(acc.y2, b.y2),
    };
  }, null);
}

const MIND = {
  TYPE, isNode, STYLE, depthStyle,
  index, children, visibleChildren, mapNodes, descendants, descendantCount, repair,
  wrapLabel, nodeSize, branchColor, rootSpec, childSpec, siblingSpec,
  layout, edgePoints, edgeCtrl, nodeHandles, handleAt, mapBox,
  distToBox, dropTarget, samePlace, reparentPlan,
};

if (typeof module !== 'undefined' && module.exports) module.exports = MIND;
if (typeof window !== 'undefined') window.MIND = MIND;

})();
