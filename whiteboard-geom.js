// 白板几何：纯函数，无 DOM 依赖，可在 node 下直接测试
// 图形坐标一律是「世界坐标」，与画布缩放/平移无关
//   pen:  { points: [[x,y], ...] }
//   rect/ellipse/line: { x, y, w, h }   (w/h 可为负)
//   text: { x, y, text, size }          (x,y = 文本基线左端)

// ---------- 包围盒 ----------

// 统一返回 {x1,y1,x2,y2}，已归一化（x1<=x2）
function bbox(shape) {
  if (shape.type === 'pen') {
    if (!shape.points || shape.points.length === 0) return null;
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const [px, py] of shape.points) {
      if (px < x1) x1 = px;
      if (py < y1) y1 = py;
      if (px > x2) x2 = px;
      if (py > y2) y2 = py;
    }
    return { x1, y1, x2, y2 };
  }
  if (shape.type === 'text') {
    // 宽度按字号估算：中英文混排取 0.6em 均值，够点选和框选用
    const w = (shape.text ? shape.text.length : 0) * shape.size * 0.6;
    return { x1: shape.x, y1: shape.y - shape.size, x2: shape.x + w, y2: shape.y };
  }
  const x1 = Math.min(shape.x, shape.x + shape.w);
  const x2 = Math.max(shape.x, shape.x + shape.w);
  const y1 = Math.min(shape.y, shape.y + shape.h);
  const y2 = Math.max(shape.y, shape.y + shape.h);
  return { x1, y1, x2, y2 };
}

// 所有图形的并集包围盒，空数组返回 null
function bboxAll(shapes) {
  return shapes.reduce((acc, s) => {
    const b = bbox(s);
    if (!b) return acc;
    if (!acc) return b;
    return {
      x1: Math.min(acc.x1, b.x1), y1: Math.min(acc.y1, b.y1),
      x2: Math.max(acc.x2, b.x2), y2: Math.max(acc.y2, b.y2),
    };
  }, null);
}

function unionBox(a, b) {
  if (!a) return b;
  if (!b) return a;
  return {
    x1: Math.min(a.x1, b.x1), y1: Math.min(a.y1, b.y1),
    x2: Math.max(a.x2, b.x2), y2: Math.max(a.y2, b.y2),
  };
}

// ---------- 命中测试 ----------

function hitShape(shape, px, py, tol) {
  const b = bbox(shape);
  if (!b) return false;
  const t = tol == null ? 6 : tol;
  return px >= b.x1 - t && px <= b.x2 + t && py >= b.y1 - t && py <= b.y2 + t;
}

// 最上层命中的下标，无命中返回 -1
// ponytail: 包围盒判定，非逐点距离。空心矩形内部点击也算命中，够用
function hitTest(shapes, px, py, tol) {
  for (let i = shapes.length - 1; i >= 0; i--) {
    if (hitShape(shapes[i], px, py, tol)) return i;
  }
  return -1;
}

// ---------- 框选 ----------

// 归一化任意两点拉出的矩形（四个方向拖拽都要能用）
function normBox(x1, y1, x2, y2) {
  return {
    x1: Math.min(x1, x2), y1: Math.min(y1, y2),
    x2: Math.max(x1, x2), y2: Math.max(y1, y2),
  };
}

// 两矩形是否相交（含边缘接触）
function boxesIntersect(a, b) {
  return a.x1 <= b.x2 && a.x2 >= b.x1 && a.y1 <= b.y2 && a.y2 >= b.y1;
}

// 点是否落在矩形内（含容差）。选中外框当拖动热区时用
function pointInBox(box, px, py, tol) {
  const t = tol == null ? 0 : tol;
  return px >= box.x1 - t && px <= box.x2 + t && py >= box.y1 - t && py <= box.y2 + t;
}

// 框选命中：与选框相交即选中
// ponytail: 触碰即选（同 Figma/Excalidraw），非"完全包含"。
// 想改成完全包含就把 boxesIntersect 换成四边比较
function shapesInBox(shapes, box) {
  const out = [];
  for (const s of shapes) {
    const b = bbox(s);
    if (b && boxesIntersect(b, box)) out.push(s);
  }
  return out;
}

// ---------- 移动 / 缩放 ----------

function translateShape(s, dx, dy) {
  if (s.type === 'pen') {
    return { ...s, points: s.points.map(([x, y]) => [x + dx, y + dy]) };
  }
  return { ...s, x: s.x + dx, y: s.y + dy };
}

// 把图形从 oldB 映射到 newB。一个函数覆盖所有类型，省掉每类一套缩放逻辑
function resizeShape(s, oldB, newB) {
  const ow = oldB.x2 - oldB.x1;
  const oh = oldB.y2 - oldB.y1;
  // 退化维度（水平线、垂直线、单点）该轴不缩放，只跟随平移
  const sx = ow > 0.01 ? (newB.x2 - newB.x1) / ow : 1;
  const sy = oh > 0.01 ? (newB.y2 - newB.y1) / oh : 1;
  const mx = (x) => newB.x1 + (x - oldB.x1) * sx;
  const my = (y) => newB.y1 + (y - oldB.y1) * sy;

  if (s.type === 'pen') {
    return { ...s, points: s.points.map(([x, y]) => [mx(x), my(y)]) };
  }
  if (s.type === 'text') {
    // ponytail: 字号按较小轴等比缩放，避免拉伸变形；
    // 代价是非等比拖拽后文本包围盒不会精确贴合 newB，肉眼无感
    return { ...s, x: mx(s.x), y: my(s.y), size: Math.max(8, s.size * Math.min(sx, sy)) };
  }
  const x1 = mx(s.x);
  const y1 = my(s.y);
  return { ...s, x: x1, y: y1, w: mx(s.x + s.w) - x1, h: my(s.y + s.h) - y1 };
}

// ---------- 缩放手柄 ----------

const HANDLES = ['nw', 'ne', 'sw', 'se'];

function handlePoints(b) {
  return {
    nw: [b.x1, b.y1], ne: [b.x2, b.y1],
    sw: [b.x1, b.y2], se: [b.x2, b.y2],
  };
}

// 点落在哪个角手柄上，没有返回 null
function handleAt(b, px, py, tol) {
  const t = tol == null ? 8 : tol;
  const pts = handlePoints(b);
  for (const h of HANDLES) {
    const [hx, hy] = pts[h];
    if (Math.abs(px - hx) <= t && Math.abs(py - hy) <= t) return h;
  }
  return null;
}

// 拖某个角得到新包围盒，对角固定。min 防止缩到 0 后再也放不回来
function applyHandle(b, handle, px, py, min) {
  const m = min == null ? 4 : min;
  const ax = handle === 'nw' || handle === 'sw' ? px : b.x1;
  const bx = handle === 'ne' || handle === 'se' ? px : b.x2;
  const ay = handle === 'nw' || handle === 'ne' ? py : b.y1;
  const by = handle === 'sw' || handle === 'se' ? py : b.y2;
  const x1 = Math.min(ax, bx);
  const x2 = Math.max(ax, bx);
  const y1 = Math.min(ay, by);
  const y2 = Math.max(ay, by);
  return {
    x1, y1,
    x2: x2 - x1 < m ? x1 + m : x2,
    y2: y2 - y1 < m ? y1 + m : y2,
  };
}

// ---------- 分栏流式排版 ----------
// 参考报纸/CSS 多列布局：从左上开始向下排，排满一栏再向右开新栏。
// Excalidraw / tldraw 都没有原生自动排版，第三方靠 Graphviz/Sugiyama —— 那是图布局，
// 解决节点+连线；线性文档内容用分栏流才对。

// 中日韩字符：可在任意字符后断行，拉丁词必须在空格处断。
// 用转义码点而非字面字符写范围，避免编辑器/编码转换悄悄改坏它
const CJK_RE = /[　-〿぀-ヿ㐀-䶿一-鿿豈-﫿＀-￯]/;
const isCJK = (ch) => CJK_RE.test(ch);

// 把带 keepWithNext 标记的条目切成"节"：节内不允许分栏，
// 避免标题落在栏底、正文跑到下一栏（孤行）
function groupSections(items) {
  const sections = [];
  let cur = [];
  for (const it of items) {
    cur.push(it);
    if (!it.keepWithNext) { sections.push(cur); cur = []; }
  }
  if (cur.length) sections.push(cur); // 末尾仍标着 keepWithNext 的残余
  return sections;
}

// 贪心装箱：节按顺序塞进当前栏，装不下就开新栏。
// 返回每个条目的 {x, y}（相对起点），顺序与输入一致
// ponytail: 贪心而非最优装箱。最优（栏高均衡）要 DP，
// 而阅读顺序必须保持从上到下，重排反而读不通
function flowColumns(items, opts) {
  const o = opts || {};
  const maxH = o.maxH > 0 ? o.maxH : Infinity;
  const colW = o.colW || 0;
  const colGap = o.colGap == null ? 40 : o.colGap;
  const itemGap = o.itemGap == null ? 0 : o.itemGap;

  const out = [];
  let col = 0;
  let y = 0;

  for (const section of groupSections(items)) {
    // 节的总高（含节内间距）
    const secH = section.reduce((sum, it) => sum + it.h + itemGap, 0);
    // 装不下且当前栏非空 → 开新栏。空栏时不换，否则超高的节会永远换栏
    if (y > 0 && y + secH > maxH) { col += 1; y = 0; }
    for (const it of section) {
      out.push({ x: col * (colW + colGap), y, item: it });
      y += it.h + itemGap;
    }
  }
  return { positions: out, columns: col + 1 };
}

// ---------- 视口 ----------
// 世界 → 屏幕: s = w * scale + offset

const MIN_SCALE = 0.1;
const MAX_SCALE = 8;

function toWorld(view, sx, sy) {
  return { x: (sx - view.x) / view.scale, y: (sy - view.y) / view.scale };
}

function toScreen(view, wx, wy) {
  return { x: wx * view.scale + view.x, y: wy * view.scale + view.y };
}

// 以屏幕点 (sx,sy) 为焦点缩放，该点下的世界坐标保持不动
function zoomAt(view, factor, sx, sy) {
  const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, view.scale * factor));
  const k = scale / view.scale; // 夹取后的实际倍率
  return { scale, x: sx - (sx - view.x) * k, y: sy - (sy - view.y) * k };
}

// 当前视口对应的世界矩形
function viewportBox(view, w, h) {
  const a = toWorld(view, 0, 0);
  const b = toWorld(view, w, h);
  return { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
}

// 让世界点 (wx,wy) 落在画布中心
function centerOn(view, wx, wy, w, h) {
  return { scale: view.scale, x: w / 2 - wx * view.scale, y: h / 2 - wy * view.scale };
}

// 把 box 等比缩放居中塞进 w×h（小地图、适应窗口都用它）
function fitTransform(box, w, h, pad) {
  if (!box) return { scale: 1, x: 0, y: 0 };
  const p = pad == null ? 6 : pad;
  const cw = Math.max(box.x2 - box.x1, 1);
  const ch = Math.max(box.y2 - box.y1, 1);
  const iw = Math.max(w - p * 2, 1);
  const ih = Math.max(h - p * 2, 1);
  const scale = Math.min(iw / cw, ih / ch);
  return {
    scale,
    x: p - box.x1 * scale + (iw - cw * scale) / 2,
    y: p - box.y1 * scale + (ih - ch * scale) / 2,
  };
}

const GEOM = {
  bbox, bboxAll, unionBox, hitShape, hitTest,
  normBox, boxesIntersect, pointInBox, shapesInBox,
  isCJK, groupSections, flowColumns,
  translateShape, resizeShape,
  HANDLES, handlePoints, handleAt, applyHandle,
  MIN_SCALE, MAX_SCALE, toWorld, toScreen, zoomAt, viewportBox, centerOn, fitTransform,
};

if (typeof module !== 'undefined' && module.exports) module.exports = GEOM;
if (typeof window !== 'undefined') window.GEOM = GEOM; // 顶层 const 不会自动挂到 window
