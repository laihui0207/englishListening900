// 白板：图形对象数组 + 视口变换 + 全量重绘
// 图形坐标一律世界坐标，绘制前用 ctx.setTransform 套上视口
const G = typeof require !== 'undefined' ? require('./whiteboard-geom') : window.GEOM;

if (typeof window !== 'undefined') {
  const canvas = document.getElementById('board');
  const ctx = canvas.getContext('2d');
  const mini = document.getElementById('minimap');
  const mctx = mini.getContext('2d');
  const textInput = document.getElementById('textInput');
  const hint = document.getElementById('hint');
  const zoomLabel = document.getElementById('zoomLabel');

  let shapes = [];
  let tool = 'select';
  let color = '#333333';
  let width = 3;
  let view = { scale: 1, x: 0, y: 0 };

  // 选中集用 id 而非下标：删除图形后失效 id 自然不匹配，
  // 不需要像下标那样在每次删除后重映射整个选中集
  let sel = [];             // 选中的 shape id 数组
  let nextId = 1;
  let draft = null;        // 拖拽中的新图形，未落盘
  let drag = null;         // {mode:'draw'|'move'|'resize'|'pan'|'marquee', ...}
  let marquee = null;      // 框选矩形（世界坐标）
  let pendingText = null;
  let pendingMath = null;
  let MIND_UI = null;      // 思维导图交互层，闭包末尾创建（见「思维导图」一节）

  // 所有图形都经此落盘，id 只在这一处分配
  // link 可选：拿到真实 id 后再补引用字段（导图根的 mapId = 自己的 id）
  function addShapes(list, link) {
    let withIds = list.map((s) => ({ ...s, id: nextId++ }));
    if (link) withIds = link(withIds);
    shapes = [...shapes, ...withIds];
    markDirty();
    return withIds;
  }

  // 橡皮擦：pen 路径按点切割成多段，其他图形整体删除
  // 返回替换后的 shapes 数组（不直接赋值，方便调用方判断是否有变化）
  function applyEraser(p, radius) {
    let changed = false;
    const next = [];
    // 擦到导图节点时它的整棵子树一起走：否则折叠着的后代会在松手前弹出来闪一下
    const cascade = new Set();

    for (const s of shapes) {
      // 折叠起来的导图节点看不见，橡皮擦不到
      if (s.type === 'mind-node' && MIND_UI && MIND_UI.isHidden(s.id)) { next.push(s); continue; }
      if (s.type === 'pen') {
        // 把笔迹按"在圆内"的点切断，产生 0 到多条新笔迹
        const segs = splitPenByEraser(s.points, p, radius);
        if (segs === null) {
          next.push(s); // 完全没碰到
        } else {
          changed = true;
          for (const pts of segs) {
            if (pts.length >= 1) {
              // 分配新 id，保留原笔迹其他属性
              next.push({ ...s, id: nextId++, points: pts });
            }
          }
        }
      } else {
        // 非笔迹：用圆与包围盒的重叠判断
        const b = G.bbox(s);
        if (b && circleHitsBox(p, radius, b)) {
          changed = true;
          sel = sel.filter((id) => id !== s.id);
          if (s.type === 'mind-node' && MIND_UI) for (const id of MIND_UI.branchIds([s.id])) cascade.add(id);
        } else {
          next.push(s);
        }
      }
    }

    if (!changed) return null;
    if (!cascade.size) return next;
    sel = sel.filter((id) => !cascade.has(id));
    return next.filter((s) => !cascade.has(s.id));
  }

  // 把 pen points 切成若干段，圆内的点丢弃。
  // 返回 null 表示完全没接触；返回数组（可能为空）表示有变化
  function splitPenByEraser(points, p, radius) {
    const r2 = radius * radius;
    const inside = points.map(([x, y]) => {
      const dx = x - p.x, dy = y - p.y;
      return dx * dx + dy * dy <= r2;
    });

    // 全都在外面：没变化
    if (inside.every((v) => !v)) return null;

    const segs = [];
    let cur = [];
    for (let i = 0; i < points.length; i++) {
      if (inside[i]) {
        if (cur.length > 0) { segs.push(cur); cur = []; }
      } else {
        cur.push(points[i]);
      }
    }
    if (cur.length > 0) segs.push(cur);
    return segs;
  }

  // 圆心 p、半径 r 是否与轴对齐矩形 b 相交
  function circleHitsBox(p, r, b) {
    const cx = Math.max(b.x1, Math.min(p.x, b.x2));
    const cy = Math.max(b.y1, Math.min(p.y, b.y2));
    const dx = p.x - cx, dy = p.y - cy;
    return dx * dx + dy * dy <= r * r;
  }

  // 当前橡皮圆的世界坐标（onMove 时更新，redraw 时画出来）
  let eraserPos = null;
  const ERASER_R_PX = 14; // 屏幕像素半径
  let snapHint = null; // { x, y, shapeId, anchor } — live snap target while drawing arrow

  const ARROW_TOOL_TYPES = new Set(['line','arrow','arrow2','curve-arrow']);
  const SNAP_RADIUS_PX = 20; // screen pixels

  // returns nearest anchor within snap radius, or null
  function findSnap(px, py, excludeId) {
    const r = SNAP_RADIUS_PX / view.scale;
    let best = null, bestD = r;
    for (const s of visibleShapes()) {
      if (s.id === excludeId) continue;
      for (const a of G.anchorPoints(s)) {
        const d = Math.hypot(a.x - px, a.y - py);
        if (d < bestD) { bestD = d; best = { x: a.x, y: a.y, shapeId: s.id, anchor: a.name }; }
      }
    }
    return best;
  }

  // resolve anchor position from shape id + anchor name (for connected arrows)
  function anchorPos(shapeId, anchorName) {
    const s = shapes.find((x) => x.id === shapeId);
    if (!s) return null;
    return G.anchorPoints(s).find((a) => a.name === anchorName) || null;
  }

  // update endpoints of arrows connected to the given shape ids
  function updateConnectedArrows(movedIds) {
    const set = new Set(movedIds);
    shapes = shapes.map((s) => {
      if (!ARROW_TOOL_TYPES.has(s.type)) return s;
      let updated = s;
      if (s.fromId && set.has(s.fromId)) {
        const p = anchorPos(s.fromId, s.fromAnchor);
        if (p) updated = { ...updated, x: p.x, y: p.y, w: updated.x + updated.w - p.x, h: updated.y + updated.h - p.y };
      }
      if (s.toId && set.has(s.toId)) {
        const p = anchorPos(s.toId, s.toAnchor);
        if (p) updated = { ...updated, w: p.x - updated.x, h: p.y - updated.y };
      }
      return updated;
    });
  }

  function eraseAt(p) {
    const r = ERASER_R_PX / view.scale;
    const next = applyEraser(p, r);
    if (next !== null) {
      shapes = next;
      drag.erased = true;
    }
    eraserPos = p;
    redraw();
  }

  const isSel = (s) => sel.includes(s.id);
  const selShapes = () => shapes.filter(isSel);
  const selBox = () => G.bboxAll(selShapes());
  // 拖动用的选中组：选中导图节点时把整棵图带上
  const groupShapes = () => (MIND_UI ? MIND_UI.selGroup() : selShapes());
  // 点选 / 框选 / 包围盒只看得见的图形：折叠起来的导图节点不参与
  const visibleShapes = () => (MIND_UI ? MIND_UI.visibleShapes() : shapes);

  // 选中数量提示 + 删除按钮的可用状态
  function updateSelInfo() {
    const n = sel.length;
    selInfo.textContent = n > 0 ? `已选中 ${n} 个` : '';
    btnDelSel.disabled = n === 0;
    if (typeof syncPropsPanel === 'function') syncPropsPanel();
  }
  // 删除选中：导图节点连带整棵子树（由 MIND_UI 处理），其他图形整组删除
  function removeSelected() {
    if (sel.length === 0) return;
    if (MIND_UI) { MIND_UI.removeShapes(sel); return; }
    shapes = shapes.filter((s) => !isSel(s));
    sel = [];
    updateSelInfo();
    markDirty();
    redraw();
  }

  const mathBox = document.getElementById('mathBox');
  const mathField = document.getElementById('mathField');
  const mathError = document.getElementById('mathError');
  const selInfo = document.getElementById('selInfo');
  const btnDelSel = document.getElementById('btnDelSel');

  // 答题窗口的节点：keydown 处理器要用 quizReply，
  // 必须在它之前声明（const 不提升，晚声明会触发 TDZ 报错）
  const quizBox = document.getElementById('quizBox');
  const quizKind = document.getElementById('quizKind');
  const quizQuestion = document.getElementById('quizQuestion');
  const quizOptions = document.getElementById('quizOptions');
  const quizReply = document.getElementById('quizReply');
  const quizResult = document.getElementById('quizResult');
  const quizTip = document.getElementById('quizTip');
  const quizExplain = document.getElementById('quizExplain');
  const quizProgress = document.getElementById('quizProgress');
  const quizTimer = document.getElementById('quizTimer');
  const btnQuizSubmit = document.getElementById('btnQuizSubmit');
  const btnQuizSkip = document.getElementById('btnQuizSkip');
  const btnQuizNext = document.getElementById('btnQuizNext');
  const btnQuizPrev = document.getElementById('btnQuizPrev');
  const wrongBox = document.getElementById('wrongBox');
  const wrongList = document.getElementById('wrongList');
  const wrongCount = document.getElementById('wrongCount');

  const dpr = () => window.devicePixelRatio || 1;

  // ---------- 数学公式 ----------
  // MathJax 输出 SVG，转成 Image 后 drawImage 到画布。
  // 公式用 x/y/w/h 存储，因此 bbox / resizeShape 的默认分支直接适用，几何模块无需改动。

  const SVGNS = 'http://www.w3.org/2000/svg';
  const EX_PX = 8; // MathJax 默认 ex 单位对应的像素数
  // SVG 输出依赖的样式必须内联，否则分数线、根号、边框在画布上不显示
  const SVG_CSS = [
    '[data-mml-node="merror"]>g{fill:red;stroke:red}',
    '[data-frame],[data-line]{stroke-width:70px;fill:none}',
    '.mjx-dashed{stroke-dasharray:140}',
    '.mjx-dotted{stroke-linecap:round;stroke-dasharray:0,140}',
    'use[data-c]{stroke-width:3px}',
  ].join('');

  const mathReady = () => !!(window.MathJax && window.MathJax.tex2svgPromise);

  // TeX → {img, w, h}。失败时抛错，由调用方提示用户
  async function renderMath(tex, col, scale) {
    if (!mathReady()) throw new Error('公式引擎尚未加载完成，请稍候重试');
    const node = await window.MathJax.tex2svgPromise(tex, { display: true });
    const svg = node.querySelector('svg');
    if (!svg) throw new Error('公式渲染失败');
    if (svg.querySelector('[data-mml-node="merror"]')) throw new Error('公式语法有误');

    // width/height 是 ex 单位，Image 解析不了，必须换成像素
    const w = (parseFloat(svg.getAttribute('width')) || 2) * EX_PX * scale;
    const h = (parseFloat(svg.getAttribute('height')) || 2) * EX_PX * scale;
    // 位图按 2 倍渲染再缩回来，放大时不至于立刻发虚
    svg.setAttribute('width', w * 2);
    svg.setAttribute('height', h * 2);
    svg.setAttribute('xmlns', SVGNS);
    const g = svg.querySelector('g');
    if (g) { g.setAttribute('fill', col); g.setAttribute('stroke', col); }
    const style = document.createElementNS(SVGNS, 'style');
    style.textContent = SVG_CSS;
    svg.insertBefore(style, svg.firstChild);

    // encodeURIComponent 而非 btoa：公式含非 ASCII 字符时 btoa 会抛错
    const src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg.outerHTML);
    const img = new Image();
    await new Promise((ok, fail) => {
      img.onload = ok;
      img.onerror = () => fail(new Error('公式图像加载失败'));
      img.src = src;
    });
    return { img, w, h };
  }

  // 重新渲染已存在的公式（改颜色/粗细时用）
  function reRenderMath(id) {
    const s = shapes.find((x) => x.id === id);
    if (!s || s.type !== 'math') return;
    renderMath(s.tex, s.color, s.width / 3)
      .then(({ img }) => {
        // 保持用户已调整过的尺寸，只换贴图。换贴图不算一次编辑：
        // 直接赋值并同步撤销基线，不经 patch/markDirty
        const same = shapes === committed;
        shapes = shapes.map((x) => (x.id === id ? { ...x, img } : x));
        if (same) committed = shapes;
        redraw();
      })
      .catch((err) => { hint.textContent = '⚠️ ' + err.message; });
  }

  function resize() {
    if (MIND_UI) MIND_UI.syncNodeEditorBox(); // 窗口变化时编辑框跟着节点
    const r = dpr();
    canvas.width = Math.round(canvas.clientWidth * r);
    canvas.height = Math.round(canvas.clientHeight * r);
    mini.width = Math.round(mini.clientWidth * r);
    mini.height = Math.round(mini.clientHeight * r);
    redraw();
  }

  // ---------- 绘制 ----------

  function drawShape(c, s) {
    c.strokeStyle = s.color;
    c.fillStyle = s.color;   // text/pen use this; shape fill overridden per-branch
    c.lineWidth = s.width;
    c.lineCap = 'round';
    c.lineJoin = 'round';

    if (s.angle) {
      const ub = G.bboxUnrotated(s);
      if (ub) {
        const cx = (ub.x1 + ub.x2) / 2, cy = (ub.y1 + ub.y2) / 2;
        c.save();
        c.translate(cx, cy);
        c.rotate(s.angle);
        c.translate(-cx, -cy);
      }
    }

    if (s.type === 'pen') {
      if (!s.points || s.points.length === 0) return;
      c.beginPath();
      c.moveTo(s.points[0][0], s.points[0][1]);
      for (let i = 1; i < s.points.length; i++) c.lineTo(s.points[i][0], s.points[i][1]);
      if (s.points.length === 1) c.lineTo(s.points[0][0] + 0.1, s.points[0][1]);
      c.stroke();
    } else if (s.type === 'rect') {
      if (s.fillColor) { c.fillStyle = s.fillColor; c.fillRect(s.x, s.y, s.w, s.h); }
      c.strokeRect(s.x, s.y, s.w, s.h);
      drawShapeLabel(c, s, G.bboxUnrotated(s));
    } else if (s.type === 'ellipse') {
      const b = G.bboxUnrotated(s);
      const rx = (b.x2 - b.x1) / 2;
      const ry = (b.y2 - b.y1) / 2;
      if (rx < 0.5 || ry < 0.5) return;
      c.beginPath();
      c.ellipse(b.x1 + rx, b.y1 + ry, rx, ry, 0, 0, Math.PI * 2);
      if (s.fillColor) { c.fillStyle = s.fillColor; c.fill(); }
      c.stroke();
      drawShapeLabel(c, s, b);
    } else if (s.type === 'wide-ellipse') {
      const b = G.bboxUnrotated(s);
      const rx = (b.x2 - b.x1) / 2;
      const ry = (b.y2 - b.y1) / 2;
      if (rx < 0.5 || ry < 0.5) return;
      c.beginPath();
      c.ellipse(b.x1 + rx, b.y1 + ry, rx, ry, 0, 0, Math.PI * 2);
      if (s.fillColor) { c.fillStyle = s.fillColor; c.fill(); }
      c.stroke();
      drawShapeLabel(c, s, b);
    } else if (s.type === 'line' || s.type === 'arrow' || s.type === 'arrow2' || s.type === 'curve-arrow') {
      const x1 = s.x, y1 = s.y, x2 = s.x + s.w, y2 = s.y + s.h;
      const ah = Math.max(10, s.width * 3.5); // arrowhead size scales with line width
      c.beginPath();
      if (s.type === 'curve-arrow') {
        // control point: perpendicular offset at midpoint
        const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
        const dx = x2 - x1, dy = y2 - y1;
        const len = Math.hypot(dx, dy) || 1;
        const cx = mx - dy / len * len * 0.25;
        const cy = my + dx / len * len * 0.25;
        c.moveTo(x1, y1);
        c.quadraticCurveTo(cx, cy, x2, y2);
        c.stroke();
        // arrowhead tangent from quadratic at t=1: direction = end - control
        drawArrow(c, cx, cy, x2, y2, ah);
      } else {
        c.moveTo(x1, y1);
        c.lineTo(x2, y2);
        c.stroke();
        if (s.type === 'arrow' || s.type === 'arrow2') drawArrow(c, x1, y1, x2, y2, ah);
        if (s.type === 'arrow2') drawArrow(c, x2, y2, x1, y1, ah);
      }
    } else if (s.type === 'triangle') {
      const b = G.bboxUnrotated(s);
      c.beginPath();
      c.moveTo((b.x1 + b.x2) / 2, b.y1);
      c.lineTo(b.x2, b.y2);
      c.lineTo(b.x1, b.y2);
      c.closePath();
      if (s.fillColor) { c.fillStyle = s.fillColor; c.fill(); }
      c.stroke();
      drawShapeLabel(c, s, b);
    } else if (s.type === 'diamond') {
      const b = G.bboxUnrotated(s);
      const mx = (b.x1 + b.x2) / 2, my = (b.y1 + b.y2) / 2;
      c.beginPath();
      c.moveTo(mx, b.y1);
      c.lineTo(b.x2, my);
      c.lineTo(mx, b.y2);
      c.lineTo(b.x1, my);
      c.closePath();
      if (s.fillColor) { c.fillStyle = s.fillColor; c.fill(); }
      c.stroke();
      drawShapeLabel(c, s, b);
    } else if (s.type === 'parallelogram') {
      const b = G.bboxUnrotated(s);
      const off = (b.x2 - b.x1) * 0.2;
      c.beginPath();
      c.moveTo(b.x1 + off, b.y1);
      c.lineTo(b.x2, b.y1);
      c.lineTo(b.x2 - off, b.y2);
      c.lineTo(b.x1, b.y2);
      c.closePath();
      if (s.fillColor) { c.fillStyle = s.fillColor; c.fill(); }
      c.stroke();
      drawShapeLabel(c, s, b);
    } else if (s.type === 'round-rect' || s.type === 'mind-node') {
      const isMind = s.type === 'mind-node';
      // 折叠起来的节点整棵不画（连它的入边一起）；主画布 / 小地图 / 导出三处循环都走这里
      if (isMind && MIND_UI && MIND_UI.isHidden(s.id)) return;
      // 导图节点先画到父节点的入边：颜色 / 线宽已在上面按 s.color / s.width 设好
      if (isMind && MIND_UI) MIND_UI.drawEdge(c, s);
      const b = G.bboxUnrotated(s);
      const bh = b.y2 - b.y1;
      // 导图：根是胶囊形，分支圆角 10；普通圆角矩形按比例
      const r = isMind
        ? (s.parentId == null ? bh / 2 : Math.min(10, bh / 2))
        : Math.min((b.x2 - b.x1) * 0.15, bh * 0.15, 18);
      c.beginPath();
      c.roundRect(b.x1, b.y1, b.x2 - b.x1, bh, r);
      const fill = isMind ? (s.fillColor || '#fff') : s.fillColor;
      if (fill) { c.fillStyle = fill; c.fill(); }
      c.stroke();
      drawShapeLabel(c, s, b);
    } else if (s.type === 'text') {
      c.font = s.size + 'px -apple-system, "Microsoft YaHei", sans-serif';
      c.textBaseline = 'alphabetic';
      c.fillText(s.text, s.x, s.y);
    } else if (s.type === 'math') {
      const b = G.bboxUnrotated(s);
      if (s.img) {
        c.drawImage(s.img, b.x1, b.y1, b.x2 - b.x1, b.y2 - b.y1);
      } else {
        c.save();
        c.strokeStyle = '#bbb';
        c.setLineDash([4, 3]);
        c.strokeRect(b.x1, b.y1, b.x2 - b.x1, b.y2 - b.y1);
        c.restore();
      }
    } else if (s.type === 'plot') {
      drawPlot(c, s);
    }

    if (s.angle) c.restore();
  }

  function drawShapeLabel(c, s, b) {
    if (!s.label) return;
    const cx = (b.x1 + b.x2) / 2, cy = (b.y1 + b.y2) / 2;
    // 导图节点字号固定（labelSize），普通图形随高度缩放
    const fontSize = s.labelSize || Math.max(12, Math.min((b.y2 - b.y1) * 0.28, 20));
    const bold = s.type === 'mind-node' && s.parentId == null ? 'bold ' : '';
    c.save();
    c.fillStyle = s.labelColor || s.color;
    c.font = `${bold}${fontSize}px -apple-system, "Microsoft YaHei", sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(s.label, cx, cy);
    c.restore();
  }

  // draws a filled arrowhead at (tx,ty) pointing away from (fx,fy)
  function drawArrow(c, fx, fy, tx, ty, size) {
    const angle = Math.atan2(ty - fy, tx - fx);
    const a = Math.PI / 6; // half-angle of arrowhead
    c.beginPath();
    c.moveTo(tx, ty);
    c.lineTo(tx - size * Math.cos(angle - a), ty - size * Math.sin(angle - a));
    c.lineTo(tx - size * Math.cos(angle + a), ty - size * Math.sin(angle + a));
    c.closePath();
    c.fillStyle = c.strokeStyle;
    c.fill();
  }

  function drawPlot(c, s) {
    const b = G.bbox(s);
    const pw = b.x2 - b.x1;
    const ph = b.y2 - b.y1;
    if (pw < 4 || ph < 4) return;

    const xMin = s.xMin ?? -5;
    const xMax = s.xMax ?? 5;
    const yMin = s.yMin ?? -5;
    const yMax = s.yMax ?? 5;

    // 世界坐标 → 图形内像素
    const px = (wx) => b.x1 + (wx - xMin) / (xMax - xMin) * pw;
    const py = (wy) => b.y1 + (1 - (wy - yMin) / (yMax - yMin)) * ph;

    c.save();
    c.rect(b.x1, b.y1, pw, ph);
    c.clip();

    // 背景
    c.fillStyle = '#fafafa';
    c.fillRect(b.x1, b.y1, pw, ph);

    // 网格
    c.strokeStyle = '#e8e8e8';
    c.lineWidth = 0.5 / (c.getTransform ? c.getTransform().a || 1 : 1);
    c.setLineDash([]);
    const step = (xMax - xMin) / 10;
    for (let xi = Math.ceil(xMin / step) * step; xi <= xMax + 1e-9; xi += step) {
      c.beginPath(); c.moveTo(px(xi), b.y1); c.lineTo(px(xi), b.y2); c.stroke();
    }
    const ystep = (yMax - yMin) / 10;
    for (let yi = Math.ceil(yMin / ystep) * ystep; yi <= yMax + 1e-9; yi += ystep) {
      c.beginPath(); c.moveTo(b.x1, py(yi)); c.lineTo(b.x2, py(yi)); c.stroke();
    }

    // 坐标轴
    c.strokeStyle = '#aaa';
    c.lineWidth = 1;
    if (xMin <= 0 && 0 <= xMax) {
      c.beginPath(); c.moveTo(px(0), b.y1); c.lineTo(px(0), b.y2); c.stroke();
    }
    if (yMin <= 0 && 0 <= yMax) {
      c.beginPath(); c.moveTo(b.x1, py(0)); c.lineTo(b.x2, py(0)); c.stroke();
    }

    // 刻度标签
    c.fillStyle = '#999';
    c.font = `${Math.max(9, Math.min(12, pw / 30))}px sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'top';
    const labelStep = Math.ceil((xMax - xMin) / 8);
    for (let xi = Math.ceil(xMin); xi <= xMax; xi += labelStep || 1) {
      if (Math.abs(xi) < 1e-9) continue;
      c.fillText(xi, px(xi), py(0) + 2);
    }
    c.textAlign = 'right';
    c.textBaseline = 'middle';
    for (let yi = Math.ceil(yMin); yi <= yMax; yi += labelStep || 1) {
      if (Math.abs(yi) < 1e-9) continue;
      c.fillText(yi, px(0) - 3, py(yi));
    }

    // 曲线（每条独立颜色）
    const CURVE_COLORS = ['#e53935', '#1e88e5', '#43a047', '#fb8c00', '#8e24aa'];
    const exprs = Array.isArray(s.exprs) ? s.exprs : (s.expr ? [s.expr] : []);
    const samples = Math.min(Math.ceil(pw * 2), 800);
    exprs.forEach((expr, ei) => {
      let fn;
      try { fn = new Function('x', `"use strict"; return (${expr})`); } catch { return; }
      c.strokeStyle = CURVE_COLORS[ei % CURVE_COLORS.length];
      c.lineWidth = s.width || 2;
      c.setLineDash([]);
      c.beginPath();
      let penDown = false;
      for (let i = 0; i <= samples; i++) {
        const wx = xMin + (xMax - xMin) * i / samples;
        let wy;
        try { wy = fn(wx); } catch { penDown = false; continue; }
        if (!isFinite(wy) || Math.abs(wy) > (yMax - yMin) * 10) { penDown = false; continue; }
        if (!penDown) { c.moveTo(px(wx), py(wy)); penDown = true; }
        else c.lineTo(px(wx), py(wy));
      }
      c.stroke();
    });

    // 外框
    c.strokeStyle = '#ccc';
    c.lineWidth = 1;
    c.strokeRect(b.x1, b.y1, pw, ph);

    c.restore();
  }

  // 选中态：每个选中图形一圈细虚线，整组共用一个带手柄的外框。
  // 线宽/虚线/手柄一律反向除以 scale，缩放时视觉尺寸恒定
  function drawSelection() {
    const picked = selShapes();
    if (picked.length === 0) return;
    const k = 1 / view.scale;
    ctx.save();
    ctx.strokeStyle = '#667eea';

    // 多选时逐个描边，让用户看清选中了哪些
    if (picked.length > 1) {
      ctx.lineWidth = 1 * k;
      ctx.setLineDash([3 * k, 3 * k]);
      for (const s of picked) {
        const b = G.bbox(s);
        if (b) ctx.strokeRect(b.x1, b.y1, b.x2 - b.x1, b.y2 - b.y1);
      }
    }

    // 含导图节点的选中组：尺寸由文字决定，不给缩放手柄；高亮由 MIND_UI.drawOverlay 画
    if (MIND_UI && MIND_UI.hasMindSel()) { ctx.restore(); return; }

    const box = G.bboxAll(picked);
    if (!box) { ctx.restore(); return; }
    ctx.lineWidth = 1.5 * k;
    ctx.setLineDash([5 * k, 4 * k]);
    ctx.strokeRect(box.x1, box.y1, box.x2 - box.x1, box.y2 - box.y1);
    ctx.setLineDash([]);

    const hs = 5 * k;
    const pts = G.handlePoints(box);
    ctx.fillStyle = '#fff';
    for (const h of G.HANDLES) {
      const [hx, hy] = pts[h];
      ctx.beginPath();
      ctx.rect(hx - hs, hy - hs, hs * 2, hs * 2);
      ctx.fill();
      ctx.stroke();
    }

    // rotate handle: circle above top-center, only when single shape supports rotation
    if (sel.length === 1 && canRotate(selShapes()[0])) {
      const rx = (box.x1 + box.x2) / 2;
      const ry = box.y1 - 20 * k;
      ctx.setLineDash([]);
      ctx.strokeStyle = '#667eea';
      ctx.lineWidth = 1.5 * k;
      // stem line
      ctx.beginPath();
      ctx.moveTo(rx, box.y1);
      ctx.lineTo(rx, ry + 6 * k);
      ctx.stroke();
      // circle
      ctx.beginPath();
      ctx.arc(rx, ry, 6 * k, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  // 框选中的矩形
  function drawMarquee(box) {
    const k = 1 / view.scale;
    ctx.save();
    ctx.strokeStyle = '#667eea';
    ctx.fillStyle = 'rgba(102,126,234,0.10)';
    ctx.lineWidth = 1 * k;
    ctx.setLineDash([4 * k, 3 * k]);
    ctx.fillRect(box.x1, box.y1, box.x2 - box.x1, box.y2 - box.y1);
    ctx.strokeRect(box.x1, box.y1, box.x2 - box.x1, box.y2 - box.y1);
    ctx.restore();
  }

  function redraw() {
    const r = dpr();
    ctx.setTransform(r, 0, 0, r, 0, 0);
    ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    ctx.setTransform(view.scale * r, 0, 0, view.scale * r, view.x * r, view.y * r);
    for (const s of shapes) drawShape(ctx, s);
    if (draft) drawShape(ctx, draft);
    if (!draft) drawSelection();
    if (!draft && MIND_UI) MIND_UI.drawOverlay(ctx); // 导图选中高亮 / 悬停「+」把手
    if (marquee) drawMarquee(marquee);
    // 橡皮圆预览
    if (tool === 'eraser' && eraserPos) {
      const er = ERASER_R_PX / view.scale;
      ctx.save();
      ctx.beginPath();
      ctx.arc(eraserPos.x, eraserPos.y, er, 0, Math.PI * 2);
      ctx.strokeStyle = '#555';
      ctx.lineWidth = 1.5 / view.scale;
      ctx.setLineDash([3 / view.scale, 2 / view.scale]);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fill();
      ctx.restore();
    }
    // snap hint: green circle on anchor + alignment guides
    if (snapHint) {
      const k = 1 / view.scale;
      ctx.save();
      ctx.strokeStyle = '#22c55e';
      ctx.fillStyle = 'rgba(34,197,94,0.18)';
      ctx.lineWidth = 2 * k;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(snapHint.x, snapHint.y, 8 * k, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // crosshair lines through anchor
      ctx.strokeStyle = 'rgba(34,197,94,0.5)';
      ctx.lineWidth = 1 * k;
      ctx.setLineDash([4 * k, 3 * k]);
      ctx.beginPath();
      ctx.moveTo(snapHint.x - 24 * k, snapHint.y); ctx.lineTo(snapHint.x + 24 * k, snapHint.y);
      ctx.moveTo(snapHint.x, snapHint.y - 24 * k); ctx.lineTo(snapHint.x, snapHint.y + 24 * k);
      ctx.stroke();
      ctx.restore();
    }
    drawMinimap();
    zoomLabel.textContent = Math.round(view.scale * 100) + '%';
    if (typeof syncPropsPanel === 'function') syncPropsPanel();
  }

  // 小地图：所有图形 + 当前视口框，都塞进小窗
  function drawMinimap() {
    const r = dpr();
    const w = mini.clientWidth;
    const h = mini.clientHeight;
    mctx.setTransform(r, 0, 0, r, 0, 0);
    mctx.clearRect(0, 0, w, h);

    const vp = G.viewportBox(view, canvas.clientWidth, canvas.clientHeight);
    // 内容和视口一起 fit，否则画面移出内容区后小地图就没有参照物了
    const box = G.unionBox(G.bboxAll(visibleShapes()), vp);
    if (!box) return;
    const t = G.fitTransform(box, w, h, 6);

    mctx.setTransform(t.scale * r, 0, 0, t.scale * r, t.x * r, t.y * r);
    for (const s of shapes) drawShape(mctx, s);

    // 视口框：线宽同样反向补偿
    mctx.strokeStyle = '#667eea';
    mctx.lineWidth = 1.5 / t.scale;
    mctx.strokeRect(vp.x1, vp.y1, vp.x2 - vp.x1, vp.y2 - vp.y1);
    mctx.fillStyle = 'rgba(102,126,234,0.12)';
    mctx.fillRect(vp.x1, vp.y1, vp.x2 - vp.x1, vp.y2 - vp.y1);
    mini._t = t; // 点击小地图跳转时复用
  }

  // ---------- 坐标 ----------

  function screenPos(e) {
    const r = canvas.getBoundingClientRect();
    const src = e.touches && e.touches.length ? e.touches[0] : e;
    return { x: src.clientX - r.left, y: src.clientY - r.top };
  }

  const worldPos = (e) => {
    const p = screenPos(e);
    return G.toWorld(view, p.x, p.y);
  };

  // ---------- 交互 ----------

  // ponytail: pen/text/math/plot don't need rotation; all {x,y,w,h} shapes do
  const canRotate = (s) => s && !['pen','text','math','plot','mind-node'].includes(s.type);

  function rotateHandlePos(box, k) {
    return { x: (box.x1 + box.x2) / 2, y: box.y1 - 20 * (k || 1) };
  }

  function onDown(e) {
    // 输入中再次点击画布：先提交当前文本，再按这次点击继续处理
    if (pendingText) commitText();
    if (MIND_UI && MIND_UI.isEditing()) MIND_UI.commitNodeEditor(); // 节点编辑同理：先提交再处理这次点击
    if (pendingMath) return; // 公式框是模态的，点画布不误触
    if (pendingPlot) return; // 曲线框同上
    // 阻止默认聚焦，否则焦点跑到 body，刚 focus 的 textInput 立刻 blur
    if (e.preventDefault) e.preventDefault();
    const sp = screenPos(e);
    const p = G.toWorld(view, sp.x, sp.y);
    const tol = 8 / view.scale; // 容差按屏幕像素恒定

    // 空格拖拽 / 中键 / 双指 → 平移
    if (e.button === 1 || spaceDown || (e.touches && e.touches.length === 2)) {
      drag = { mode: 'pan', sx: sp.x, sy: sp.y, ox: view.x, oy: view.y };
      return;
    }

    if (tool === 'erase') {
      const vis = visibleShapes();
      const i = G.hitTest(vis, p.x, p.y, tol);
      if (i >= 0 && vis[i].type === 'mind-node' && MIND_UI) {
        MIND_UI.removeShapes([vis[i].id], { selectParent: false }); // 连带子树
        return;
      }
      if (i >= 0) {
        const gone = vis[i].id;
        shapes = shapes.filter((s) => s.id !== gone);
        sel = sel.filter((id) => id !== gone);
        markDirty();
        redraw();
      }
      return;
    }

    if (tool === 'eraser') {
      drag = { mode: 'eraser', erased: false, prev: shapes }; // prev：松手后找出被擦掉的导图节点
      eraseAt(p);
      return;
    }

    if (tool === 'text') { openTextInput(p, sp); return; }
    if (tool === 'math') { openMathInput(p, sp); return; }
    if (tool === 'plot') { openPlotInput(p); return; }
    if (tool === 'mindmap') {
      // 点哪里放哪里：中心主题落在点击处，然后回到选择工具继续编辑
      setTool('select', document.querySelector('[data-tool="select"]'));
      if (MIND_UI) MIND_UI.placeRoot(p);
      return;
    }

    if (tool === 'select') {
      // 导图节点旁的小按钮优先：＋ 加下一级、－ 折叠、徽标展开
      const hd = MIND_UI && MIND_UI.handleAt(p);
      if (hd) { MIND_UI.clickHandle(hd); return; }
      // 手柄优先于图形本体：整组外框的角。含导图节点的组不缩放
      const box = selBox();
      const h = box && !(MIND_UI && MIND_UI.hasMindSel()) && G.handleAt(box, p.x, p.y, tol);
      if (h) {
        drag = {
          mode: 'resize', handle: h, startBox: box,
          orig: selShapes(),
        };
        return;
      }

      // rotate handle hit (single rotatable shape only)
      if (sel.length === 1 && canRotate(selShapes()[0]) && box) {
        const k = 1 / view.scale;
        const rh = rotateHandlePos(box, k);
        if (Math.hypot(p.x - rh.x, p.y - rh.y) <= 8 * k) {
          const s = selShapes()[0];
          const ub = G.bboxUnrotated(s);
          drag = {
            mode: 'rotate', id: s.id,
            cx: (ub.x1 + ub.x2) / 2, cy: (ub.y1 + ub.y2) / 2,
            startAngle: s.angle || 0,
            startMouseAngle: Math.atan2(p.y - (ub.y1 + ub.y2) / 2, p.x - (ub.x1 + ub.x2) / 2),
          };
          canvas.style.cursor = 'crosshair';
          return;
        }
      }

      const vis = visibleShapes();
      const i = G.hitTest(vis, p.x, p.y, tol);
      if (i < 0) {
        // 多选时外框内部（图形之间的行距/段距/栏距）也算拖动热区。
        // 否则点在空隙上会被当成"点空白"去平移画布，整组就拖不动了
        if (!e.shiftKey && sel.length > 1 && box && G.pointInBox(box, p.x, p.y, tol)) {
          drag = { mode: 'move', px: p.x, py: p.y, orig: groupShapes(), before: shapes };
          canvas.style.cursor = 'move';
          return;
        }
        if (e.shiftKey) {
          // Shift + 拖拽 → 框选（空白拖动已让给平移）
          drag = { mode: 'marquee', sx: p.x, sy: p.y, add: false, base: sel };
          marquee = G.normBox(p.x, p.y, p.x, p.y);
        } else {
          // 空白处按住 → 平移画布。
          // moved 用来区分单击和拖动：没动过就是单击，onUp 时取消选中
          drag = {
            mode: 'pan', sx: sp.x, sy: sp.y, ox: view.x, oy: view.y,
            fromEmpty: true, moved: false,
          };
          canvas.style.cursor = 'grabbing';
        }
        return;
      }

      const hitId = vis[i].id;
      if (e.shiftKey) {
        // Shift 点击：加入/移出选中集
        sel = sel.includes(hitId) ? sel.filter((id) => id !== hitId) : [...sel, hitId];
      } else if (!sel.includes(hitId)) {
        sel = [hitId]; // 点未选中的图形：换成它
      }
      // 单选一个非根导图节点：拖它是换位置 / 换层级，不是搬整图（搬整图拖中心主题）
      if (!e.shiftKey && MIND_UI && MIND_UI.canDragNode(vis[i]) && sel.length === 1 && sel[0] === hitId) {
        drag = { mode: 'mind-drag', id: hitId, px: p.x, py: p.y, before: shapes, orig: MIND_UI.beginDrag(hitId), moved: false };
        redraw();
        return;
      }
      // 点已选中的图形不改选中集，直接整组拖走
      if (sel.length > 0) drag = { mode: 'move', px: p.x, py: p.y, orig: groupShapes(), before: shapes };
      redraw();
      return;
    }

    // 画图工具
    drag = { mode: 'draw' };
    draft = tool === 'pen'
      ? { type: 'pen', color, width, points: [[p.x, p.y]] }
      : { type: tool, color, width, x: p.x, y: p.y, w: 0, h: 0 };
    redraw();
  }

  function onMove(e) {
    if (!drag) {
      snapHint = null; // clear snap hint when not dragging
      // 橡皮工具：实时更新圆圈预览位置
      if (tool === 'eraser') {
        eraserPos = worldPos(e);
        redraw();
        return;
      }
      // select 模式下悬停手柄给个方向光标
      if (tool === 'select' && !spaceDown) {
        const p = worldPos(e);
        const tol = 8 / view.scale;
        // 导图：悬停节点显示「+」把手，停在把手上给手型光标
        if (MIND_UI && MIND_UI.updateHover(p, tol)) redraw();
        if (MIND_UI && MIND_UI.handleAt(p)) { canvas.style.cursor = 'pointer'; return; }
        const box = selBox();
        const h = box && !(MIND_UI && MIND_UI.hasMindSel()) && G.handleAt(box, p.x, p.y, tol);
        // 光标要跟拖动热区一致：外框内部也是 move，否则看着是抓手却在移动图形
        const inGroup = sel.length > 1 && box && G.pointInBox(box, p.x, p.y, tol);
        canvas.style.cursor = h
          ? (h === 'nw' || h === 'se' ? 'nwse-resize' : 'nesw-resize')
          : (inGroup || G.hitTest(visibleShapes(), p.x, p.y, tol) >= 0 ? 'move' : 'grab');
      }
      return;
    }
    e.preventDefault();

    if (drag.mode === 'pan') {
      const sp = screenPos(e);
      const dx = sp.x - drag.sx;
      const dy = sp.y - drag.sy;
      // 超过 3px 才算拖动，避免手抖把单击吃掉
      if (!drag.moved && Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
      view = { ...view, x: drag.ox + dx, y: drag.oy + dy };
      redraw();
      return;
    }

    const p = worldPos(e);

    if (drag.mode === 'draw') {
      if (draft.type === 'pen') {
        draft = { ...draft, points: [...draft.points, [p.x, p.y]] };
      } else if (ARROW_TOOL_TYPES.has(draft.type)) {
        // snap end point to nearby anchor
        const snap = findSnap(p.x, p.y, null);
        snapHint = snap;
        const ex = snap ? snap.x : p.x;
        const ey = snap ? snap.y : p.y;
        draft = { ...draft, w: ex - draft.x, h: ey - draft.y };
      } else {
        draft = { ...draft, w: p.x - draft.x, h: p.y - draft.y };
      }
    } else if (drag.mode === 'eraser') {
      eraseAt(p);
    } else if (drag.mode === 'marquee') {
      marquee = G.normBox(drag.sx, drag.sy, p.x, p.y);
      // 实时反馈选中结果，松手前就能看到会选中什么
      const inBox = G.shapesInBox(visibleShapes(), marquee).map((s) => s.id);
      sel = drag.add ? [...new Set([...drag.base, ...inBox])] : inBox;
    } else if (drag.mode === 'move') {
      // 整组平移：每个图形都从快照重算，不累积误差
      const dx = p.x - drag.px;
      const dy = p.y - drag.py;
      const moved = new Map(drag.orig.map((s) => [s.id, G.translateShape(s, dx, dy)]));
      shapes = shapes.map((s) => moved.get(s.id) || s);
      updateConnectedArrows(drag.orig.map((s) => s.id));
    } else if (drag.mode === 'mind-drag') {
      // 拖导图节点：整棵子树跟着指针走，同时实时算落点
      const dx = p.x - drag.px;
      const dy = p.y - drag.py;
      if (!drag.moved && Math.hypot(dx, dy) > MIND_UI.DRAG_START_PX / view.scale) {
        drag.moved = true;
        canvas.style.cursor = 'grabbing';
      }
      if (drag.moved) {
        const moved = new Map(drag.orig.map((s) => [s.id, G.translateShape(s, dx, dy)]));
        shapes = shapes.map((s) => moved.get(s.id) || s);
        updateConnectedArrows(drag.orig.map((s) => s.id));
        MIND_UI.dragUpdate(drag.id, p);
      }
    } else if (drag.mode === 'resize') {
      // 整组缩放：所有图形按同一对包围盒映射，组内相对位置保持不变
      const nb = G.applyHandle(drag.startBox, drag.handle, p.x, p.y, 4 / view.scale);
      const sized = new Map(drag.orig.map((s) => [s.id, G.resizeShape(s, drag.startBox, nb)]));
      shapes = shapes.map((s) => sized.get(s.id) || s);
      updateConnectedArrows(drag.orig.map((s) => s.id));
    } else if (drag.mode === 'rotate') {
      const mouseAngle = Math.atan2(p.y - drag.cy, p.x - drag.cx);
      const delta = mouseAngle - drag.startMouseAngle;
      let angle = drag.startAngle + delta;
      // snap to 15° increments when Shift held
      if (e.shiftKey) angle = Math.round(angle / (Math.PI / 12)) * (Math.PI / 12);
      shapes = shapes.map((s) => s.id === drag.id ? { ...s, angle } : s);
    }
    redraw();
  }

  function onUp() {
    if (!drag) return;
    if (drag.mode === 'draw' && draft) {
      const b = G.bbox(draft);
      const tiny = b && (b.x2 - b.x1) < 2 && (b.y2 - b.y1) < 2;
      if (!(tiny && draft.type !== 'pen')) {
        // store snap connection on arrow end point
        let finalDraft = draft;
        if (ARROW_TOOL_TYPES.has(draft.type) && snapHint) {
          finalDraft = { ...draft, toId: snapHint.shapeId, toAnchor: snapHint.anchor };
        }
        const added = addShapes([finalDraft]);
        sel = added.map((s) => s.id);
        updateSelInfo();
        setTool('select', document.querySelector('[data-tool="select"]'));
      }
      draft = null;
      snapHint = null;
    }
    if (drag.mode === 'marquee') {
      // 没拖出框（单击空白）就是清空选中集
      if (!marquee || (marquee.x2 - marquee.x1 < 2 && marquee.y2 - marquee.y1 < 2)) {
        sel = drag.add ? drag.base : [];
      }
      marquee = null;
    }
    if (drag.mode === 'eraser' && drag.erased) {
      if (MIND_UI) MIND_UI.afterEraser(drag.prev); // 被擦掉的节点连带子树
      markDirty();
    }
    // 空白处按下但没拖动 = 单击空白，取消选中
    if (drag.mode === 'pan' && drag.fromEmpty) {
      if (!drag.moved) sel = [];
      canvas.style.cursor = cursorFor(tool);
    }
    // 公式缩放后贴图会拉伸，按新尺寸重渲染一遍保持清晰
    if (drag.mode === 'resize') {
      for (const s of selShapes()) {
        if (s.type === 'math') reRenderMath(s.id);
      }
    }
    if (drag.mode === 'move' || drag.mode === 'resize' || drag.mode === 'rotate') markDirty();
    if (drag.mode === 'mind-drag') {
      // 动过才落地（endDrag 自己 markDirty）；没动就是单击，shapes 没变
      const applied = drag.moved ? MIND_UI.endDrag(drag.id, drag.before) : MIND_UI.endDrag(drag.id, shapes);
      // 弹回原状时把撤销基线对齐到当前，别让拖动前的中途状态留在 committed 里
      if (!applied && !snapPending) committed = shapes;
      canvas.style.cursor = cursorFor(tool);
    }
    drag = null;
    updateSelInfo();
    redraw();
  }

  // ---------- 文本 ----------
  // ponytail: 复用原生 input 拿到光标和输入法，canvas 内自绘光标不值得

  function openTextInput(worldP, screenP) {
    pendingText = worldP;
    const size = width * 6 + 8;                    // 世界尺寸
    const shown = Math.max(10, size * view.scale); // 屏幕上按缩放显示
    textInput.value = '';
    textInput.style.display = 'block';
    textInput.style.left = screenP.x + 'px';
    textInput.style.top = (screenP.y - shown) + 'px';
    textInput.style.font = shown + 'px -apple-system, "Microsoft YaHei", sans-serif';
    textInput.style.color = color;
    // 等本轮事件走完再聚焦，避开同一次 mousedown 引发的焦点转移
    setTimeout(() => textInput.focus(), 0);
  }

  function commitText() {
    if (MIND_UI && MIND_UI.isEditing()) { pendingText = null; MIND_UI.commitNodeEditor(); return; }
    if (!pendingText) return;
    const text = textInput.value.trim();
    if (text) {
      addShapes([{
        type: 'text', color, width,
        x: pendingText.x, y: pendingText.y, text, size: width * 6 + 8,
      }]);
    }
    pendingText = null;
    textInput.style.display = 'none';
    textInput.value = '';
    redraw();
  }

  // 中文输入法：候选词确认的回车 / Tab 不能当成提交。
  // Chrome 给 keyCode 229，Firefox 给 isComposing，Safari 先发 compositionend 再发回车，
  // 所以标志要延一拍再清
  let imeComposing = false;
  textInput.addEventListener('compositionstart', () => { imeComposing = true; });
  textInput.addEventListener('compositionend', () => {
    setTimeout(() => {
      imeComposing = false;
      if (MIND_UI) MIND_UI.onEditorInput(); // 组合期间跳过的重排在这里补上
    }, 0);
  });
  textInput.addEventListener('keydown', (e) => {
    if (e.isComposing || e.keyCode === 229 || imeComposing) return;
    if (MIND_UI && MIND_UI.onEditorKey(e)) return; // 导图节点编辑：回车 / Tab / Esc
    if (e.key === 'Enter') { e.preventDefault(); commitText(); }
    if (e.key === 'Escape') {
      pendingText = null;
      textInput.style.display = 'none';
      redraw();
    }
  });
  // 拼音组合期间不重排，避免节点宽度随候选字母抖动
  textInput.addEventListener('input', () => { if (MIND_UI && !imeComposing) MIND_UI.onEditorInput(); });
  textInput.addEventListener('blur', commitText);

  // ---------- 公式输入 ----------
  // 单独一个输入框：公式需要 LaTeX 源码可见、可回改，跟普通文本的即时所见即所得不同

  function openMathInput(worldP) {
    pendingMath = worldP;
    mathBox.classList.add('show');
    mathError.textContent = '';
    mathField.focus();
    mathField.select();
  }

  function closeMathInput() {
    pendingMath = null;
    mathBox.classList.remove('show');
    mathError.textContent = '';
  }

  async function commitMath() {
    if (!pendingMath) return;
    const tex = mathField.value.trim();
    if (!tex) { closeMathInput(); return; }
    const at = pendingMath;
    mathError.textContent = '渲染中…';
    try {
      const { img, w, h } = await renderMath(tex, color, width / 3);
      addShapes([{
        type: 'math', tex, img, color, width,
        x: at.x, y: at.y, w, h,
      }]);
      closeMathInput();
      redraw();
    } catch (err) {
      // 渲染失败保留输入框和内容，让用户改，不要吞掉已敲的公式
      mathError.textContent = '⚠️ ' + err.message;
    }
  }

  mathField.addEventListener('keydown', (e) => {
    // Enter 提交，Shift+Enter 换行（多行公式如 cases/align 需要）
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitMath(); }
    if (e.key === 'Escape') { e.preventDefault(); closeMathInput(); }
  });
  document.getElementById('btnMathOk').addEventListener('click', commitMath);
  document.getElementById('btnMathCancel').addEventListener('click', closeMathInput);
  // 常用公式快捷插入
  document.querySelectorAll('[data-tex]').forEach((b) => {
    b.addEventListener('click', () => {
      mathField.value = b.dataset.tex;
      mathField.focus();
    });
  });

  // ---------- 函数曲线输入 ----------

  const plotBox = document.getElementById('plotBox');
  const plotExprs = document.getElementById('plotExprs');
  const plotXMin = document.getElementById('plotXMin');
  const plotXMax = document.getElementById('plotXMax');
  const plotYMin = document.getElementById('plotYMin');
  const plotYMax = document.getElementById('plotYMax');
  const plotError = document.getElementById('plotError');
  let pendingPlot = null; // 世界坐标落点

  function openPlotInput(worldP) {
    pendingPlot = worldP;
    plotBox.classList.add('show');
    plotError.textContent = '';
    plotExprs.focus();
  }

  function closePlotInput() {
    pendingPlot = null;
    plotBox.classList.remove('show');
    plotError.textContent = '';
  }

  function commitPlot() {
    if (!pendingPlot) return;
    const raw = plotExprs.value.trim();
    if (!raw) { closePlotInput(); return; }
    // 多条曲线用换行或分号分隔
    const exprs = raw.split(/[\n;]+/).map((s) => s.trim()).filter(Boolean);
    // 安全检验：尝试编译每条表达式
    for (const expr of exprs) {
      try { new Function('x', `"use strict"; return (${expr})`); }
      catch (e) { plotError.textContent = `表达式错误: ${expr}`; return; }
    }
    const xMin = parseFloat(plotXMin.value) || -5;
    const xMax = parseFloat(plotXMax.value) || 5;
    const yMin = parseFloat(plotYMin.value) || -5;
    const yMax = parseFloat(plotYMax.value) || 5;
    if (xMin >= xMax || yMin >= yMax) { plotError.textContent = '范围无效'; return; }
    const size = 300; // 默认图形大小（世界坐标）
    addShapes([{
      type: 'plot', exprs, xMin, xMax, yMin, yMax, color, width,
      x: pendingPlot.x, y: pendingPlot.y, w: size, h: size,
    }]);
    closePlotInput();
    redraw();
  }

  plotExprs.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); closePlotInput(); }
  });
  document.getElementById('btnPlotOk').addEventListener('click', commitPlot);
  document.getElementById('btnPlotCancel').addEventListener('click', closePlotInput);
  document.querySelectorAll('[data-plot]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const cur = plotExprs.value.trim();
      plotExprs.value = cur ? cur + '\n' + btn.dataset.plot : btn.dataset.plot;
      plotExprs.focus();
    });
  });

  // ---------- 事件 ----------

  let spaceDown = false;
  window.addEventListener('keydown', (e) => {
    // 输入框内不触发画布快捷键，否则 Delete/空格会被画布吞掉
    if (e.target === textInput || e.target === mathField
      || e.target === askField || e.target === quizReply
      || e.target === plotExprs || e.target.closest('.shape-props')) return;
    // 撤销 / 重做：整个白板的快照栈
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) redoBoard(); else undoBoard();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redoBoard(); return; }
    // 拖动进行中：Esc 取消拖节点（回到拖动前），其他键一律不响应，避免删掉正在拖的东西
    if (drag) {
      if (e.key === 'Escape' && drag.mode === 'mind-drag') {
        shapes = drag.before;
        MIND_UI.cancelDrag();
        drag = null;
        canvas.style.cursor = cursorFor(tool);
        redraw();
      }
      return;
    }
    // 单选导图节点时 Tab / Enter / F2 由导图接管；焦点在按钮上时不抢，否则按钮按不动
    if (tool === 'select' && (e.target === document.body || e.target === canvas) && MIND_UI && MIND_UI.onKey(e)) return;
    if (e.code === 'Space') { spaceDown = true; canvas.style.cursor = 'grab'; e.preventDefault(); }
    if ((e.key === 'Delete' || e.key === 'Backspace') && sel.length > 0) {
      e.preventDefault();
      removeSelected(); // 整组删除；导图节点连带子树
    }
    if (e.key === 'Escape') { sel = []; updateSelInfo(); redraw(); }
    // Ctrl/Cmd+A 全选
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a' && tool === 'select') {
      e.preventDefault();
      sel = visibleShapes().map((s) => s.id);
      updateSelInfo();
      redraw();
    }
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space') { spaceDown = false; canvas.style.cursor = cursorFor(tool); }
  });

  canvas.addEventListener('mousedown', onDown);
  canvas.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
  canvas.addEventListener('touchstart', onDown, { passive: false });
  canvas.addEventListener('touchmove', onMove, { passive: false });
  window.addEventListener('touchend', onUp);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('mouseleave', () => {
    if (tool === 'eraser') { eraserPos = null; redraw(); }
    if (MIND_UI && MIND_UI.clearHover()) redraw();
  });

  // 双击公式改 LaTeX：原地替换，保留位置和尺寸
  canvas.addEventListener('dblclick', (e) => {
    const p = worldPos(e);
    const vis = visibleShapes();
    const i = G.hitTest(vis, p.x, p.y, 8 / view.scale);
    if (i >= 0 && vis[i].type === 'mind-node' && MIND_UI) {
      // 双击导图节点：原地改文字
      sel = [vis[i].id];
      updateSelInfo();
      MIND_UI.openNodeEditor(vis[i].id);
      return;
    }
    if (i < 0 || vis[i].type !== 'math') return;
    const old = vis[i];
    const b = G.bbox(old);
    shapes = shapes.filter((s) => s.id !== old.id);
    sel = [];
    mathField.value = old.tex;
    openMathInput({ x: b.x1, y: b.y1 });
  });

  // 滚轮缩放：以指针为焦点
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const sp = screenPos(e);
    view = G.zoomAt(view, e.deltaY < 0 ? 1.1 : 1 / 1.1, sp.x, sp.y);
    if (MIND_UI) MIND_UI.syncNodeEditorBox(); // 编辑中的节点输入框跟着缩放
    redraw();
  }, { passive: false });

  // 小地图拖动：只认标题栏，地图本体留给点击跳转
  (function makeMinimapDraggable() {
    const box = document.getElementById('minimapBox');
    const handle = document.getElementById('minimapTitle');
    let mv = null;

    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const r = box.getBoundingClientRect();
      const wrap = canvas.parentElement.getBoundingClientRect();
      mv = { dx: e.clientX - r.left, dy: e.clientY - r.top, w: r.width, h: r.height, wrap };
      // 默认用 bottom 定位，拖动后统一切成 left/top
      box.style.bottom = 'auto';
      box.style.right = 'auto';
    });

    window.addEventListener('mousemove', (e) => {
      if (!mv) return;
      // 夹在画布范围内，避免拖出容器再也点不到
      const maxX = mv.wrap.width - mv.w;
      const maxY = mv.wrap.height - mv.h;
      const x = Math.min(maxX, Math.max(0, e.clientX - mv.wrap.left - mv.dx));
      const y = Math.min(maxY, Math.max(0, e.clientY - mv.wrap.top - mv.dy));
      box.style.left = x + 'px';
      box.style.top = y + 'px';
    });

    window.addEventListener('mouseup', () => { mv = null; });
  })();

  // 点小地图跳转视图中心
  mini.addEventListener('mousedown', (e) => {
    const t = mini._t;
    if (!t) return;
    const r = mini.getBoundingClientRect();
    const wx = (e.clientX - r.left - t.x) / t.scale;
    const wy = (e.clientY - r.top - t.y) / t.scale;
    view = G.centerOn(view, wx, wy, canvas.clientWidth, canvas.clientHeight);
    redraw();
  });

  // ---------- AI 老师 ----------
  // 把 AI 返回的块数组竖排成白板图形。公式块复用 renderMath，
  // 于是公式跟手绘图形一样能移动、缩放、导出。

  const chatPanel = document.getElementById('chatPanel');
  const chatLog = document.getElementById('chatLog');
  const chatEmpty = document.getElementById('chatEmpty');
  const askField = document.getElementById('askField');
  const btnAskOk = document.getElementById('btnAskOk');

  // ---------- 附件上传 ----------
  const attachInput = document.getElementById('attachInput');
  const attachPreview = document.getElementById('attachPreview');
  const btnAttach = document.getElementById('btnAttach');
  let attachments = []; // [{ type:'image'|'text', name, data/content, mime }]

  btnAttach.addEventListener('click', () => attachInput.click());

  attachInput.addEventListener('change', async () => {
    for (const file of attachInput.files) {
      if (attachments.length >= 5) break;
      if (file.type.startsWith('image/')) {
        const data = await readAsBase64(file);
        attachments.push({ type: 'image', name: file.name, data, mime: file.type });
      } else {
        const content = await readAsText(file);
        attachments.push({ type: 'text', name: file.name, content });
      }
    }
    attachInput.value = '';
    renderAttachPreview();
  });

  function readAsBase64(file) {
    return new Promise((ok) => {
      const r = new FileReader();
      r.onload = (e) => ok(e.target.result.split(',')[1]);
      r.readAsDataURL(file);
    });
  }

  function readAsText(file) {
    return new Promise((ok) => {
      const r = new FileReader();
      r.onload = (e) => ok(e.target.result);
      r.readAsText(file);
    });
  }

  function renderAttachPreview() {
    attachPreview.textContent = '';
    if (attachments.length === 0) { attachPreview.style.display = 'none'; return; }
    attachPreview.style.display = 'flex';
    attachments.forEach((a, i) => {
      const chip = document.createElement('div');
      chip.className = 'attach-chip';
      if (a.type === 'image') {
        const img = document.createElement('img');
        img.className = 'attach-chip-img';
        img.src = `data:${a.mime};base64,${a.data}`;
        chip.appendChild(img);
      } else {
        const icon = document.createElement('span');
        icon.textContent = '📄';
        chip.appendChild(icon);
      }
      const name = document.createElement('span');
      name.textContent = a.name;
      const del = document.createElement('button');
      del.className = 'attach-del';
      del.textContent = '✕';
      del.addEventListener('click', () => { attachments.splice(i, 1); renderAttachPreview(); });
      chip.append(name, del);
      attachPreview.appendChild(chip);
    });
  }

  function clearAttachments() {
    attachments = [];
    renderAttachPreview();
  }

  // 剪切板粘贴图片
  askField.addEventListener('paste', async (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (!item.type.startsWith('image/')) continue;
      if (attachments.length >= 5) break;
      e.preventDefault();
      const file = item.getAsFile();
      if (!file) continue;
      const data = await readAsBase64(file);
      const name = `粘贴图片_${Date.now()}.${file.type.split('/')[1] || 'png'}`;
      attachments.push({ type: 'image', name, data, mime: file.type });
      renderAttachPreview();
    }
  });

  // ---------- 聊天框公式插入 ----------
  const chatMathBox = document.getElementById('chatMathBox');
  const chatMathField = document.getElementById('chatMathField');
  const chatMathPreview = document.getElementById('chatMathPreview');

  function openChatMath() {
    chatMathField.value = '';
    chatMathPreview.textContent = '';
    chatMathBox.style.display = '';
    chatMathField.focus();
  }

  function closeChatMath() {
    chatMathBox.style.display = 'none';
  }

  function insertChatMath() {
    const tex = chatMathField.value.trim();
    if (!tex) { closeChatMath(); return; }
    // 插入到 askField 光标位置
    const start = askField.selectionStart;
    const end = askField.selectionEnd;
    const val = askField.value;
    const insert = `$${tex}$`;
    askField.value = val.slice(0, start) + insert + val.slice(end);
    askField.selectionStart = askField.selectionEnd = start + insert.length;
    askField.focus();
    closeChatMath();
  }

  // 实时预览（用 MathJax 渲染成 SVG 文本）
  let _previewTimer = null;
  chatMathField.addEventListener('input', () => {
    clearTimeout(_previewTimer);
    _previewTimer = setTimeout(async () => {
      const tex = chatMathField.value.trim();
      if (!tex || !mathReady()) { chatMathPreview.textContent = tex ? '（公式引擎加载中…）' : ''; return; }
      try {
        const node = await window.MathJax.tex2svgPromise(tex, { display: false });
        const svg = node.querySelector('svg');
        if (svg) {
          chatMathPreview.textContent = '';
          svg.style.maxWidth = '100%';
          svg.style.maxHeight = '40px';
          chatMathPreview.appendChild(svg.cloneNode(true));
        }
      } catch { chatMathPreview.textContent = '⚠️ 公式有误'; }
    }, 300);
  });

  chatMathField.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); insertChatMath(); }
    if (e.key === 'Escape') { e.preventDefault(); closeChatMath(); }
  });

  document.getElementById('btnChatMath').addEventListener('click', (e) => {
    e.stopPropagation();
    chatMathBox.style.display === 'none' ? openChatMath() : closeChatMath();
  });
  document.getElementById('btnChatMathOk').addEventListener('click', insertChatMath);
  document.getElementById('btnChatMathCancel').addEventListener('click', closeChatMath);

  // 点击弹窗外关闭
  document.addEventListener('click', (e) => {
    if (chatMathBox.style.display !== 'none' &&
        !chatMathBox.contains(e.target) &&
        e.target.id !== 'btnChatMath') {
      closeChatMath();
    }
  });

  // 常用公式快捷键
  document.querySelectorAll('[data-chat-tex]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const cur = chatMathField.value;
      const pos = chatMathField.selectionStart;
      const tex = btn.dataset.chatTex;
      chatMathField.value = cur.slice(0, pos) + tex + cur.slice(pos);
      chatMathField.selectionStart = chatMathField.selectionEnd = pos + tex.length;
      chatMathField.dispatchEvent(new Event('input'));
      chatMathField.focus();
    });
  });

  // ---------- TTS ----------
  const synth = window.speechSynthesis;
  const btnTtsMute = document.getElementById('btnTtsMute');
  const btnTtsStop = document.getElementById('btnTtsStop');
  const btnTtsReplay = document.getElementById('btnTtsReplay');
  let ttsMuted = false;
  let ttsLastText = '';

  function ttsSpeak(text) {
    if (!synth) return;
    ttsLastText = text;
    synth.cancel();
    // 静音按钮 或 设置里关闭了自动播放 → 不播放
    if (ttsMuted || localStorage.getItem('ttsAutoPlay') === 'false') return;
    const utt = new SpeechSynthesisUtterance(text);
    utt.lang = 'zh-CN';
    utt.rate = 1.0;
    utt.onstart = () => { btnTtsStop.style.display = ''; btnTtsReplay.style.display = 'none'; };
    utt.onend = utt.onerror = () => { btnTtsStop.style.display = 'none'; btnTtsReplay.style.display = ttsLastText ? '' : 'none'; };
    synth.speak(utt);
  }

  if (btnTtsMute) {
    btnTtsMute.addEventListener('click', () => {
      ttsMuted = !ttsMuted;
      btnTtsMute.textContent = ttsMuted ? '🔇' : '🔊';
      btnTtsMute.title = ttsMuted ? '取消静音' : '静音';
      if (ttsMuted) { synth && synth.cancel(); btnTtsStop.style.display = 'none'; }
    });
  }
  if (btnTtsStop) {
    btnTtsStop.addEventListener('click', () => {
      synth && synth.cancel();
      btnTtsStop.style.display = 'none';
      btnTtsReplay.style.display = ttsLastText ? '' : 'none';
    });
  }
  if (btnTtsReplay) {
    btnTtsReplay.addEventListener('click', () => { if (ttsLastText) ttsSpeak(ttsLastText); });
  }

  // 对话历史，同时用于界面展示和发给模型做上下文
  let chatHistory = [];

  // 各块型的排版参数：字号、行高倍数、块后间距、颜色
  const BLOCK_STYLE = {
    title: { size: 26, lh: 1.35, gap: 18, color: '#5b4bc4' },
    heading: { size: 19, lh: 1.4, gap: 8, color: '#667eea' },
    text: { size: 15, lh: 1.55, gap: 12, color: '#333333' },
    note: { size: 14, lh: 1.5, gap: 12, color: '#e07b39' },
    formula: { gap: 16, color: '#333333' },
  };
  const COL_W = 380;    // 栏宽（世界单位）
  const COL_GAP = 56;   // 栏间距
  const FONT = (size) => `${size}px -apple-system, "Microsoft YaHei", sans-serif`;

  // 用 ctx.measureText 真实测量折行，替代按字符数估算。
  // 中日韩可在任意字符后断行，拉丁词必须在空格处断，否则单词被劈开
  function wrapText(text, size, maxW) {
    ctx.font = FONT(size);
    const lines = [];
    let line = '';
    let lastBreak = -1; // line 内最后一个可断点（空格/CJK 边界）之后的位置
    const isCJK = G.isCJK; // 定义在 whiteboard-geom.js，有测试覆盖

    for (const ch of text) {
      const next = line + ch;
      if (ctx.measureText(next).width > maxW && line !== '') {
        if (isCJK(ch) || lastBreak < 0) {
          // CJK 或整行无空格：就地断
          lines.push(line);
          line = ch;
        } else {
          // 拉丁：回退到最后一个空格
          lines.push(line.slice(0, lastBreak).trimEnd());
          line = line.slice(lastBreak) + ch;
        }
        lastBreak = -1;
      } else {
        line = next;
      }
      if (ch === ' ' || isCJK(ch)) lastBreak = line.length;
    }
    if (line.trim()) lines.push(line);
    return lines.length ? lines : [''];
  }

  // 找落笔点：新板书摆在已有内容右侧（栏是向右生长的，摆下方会撞上）
  function nextFreeSpot() {
    const box = G.bboxAll(visibleShapes());
    const vp = G.viewportBox(view, canvas.clientWidth, canvas.clientHeight);
    if (!box) return { x: vp.x1 + 50, y: vp.y1 + 50 };
    return { x: box.x2 + COL_GAP + 20, y: box.y1 };
  }

  // ---------- 聊天界面 ----------
  // 全部用 textContent 拼节点，不用 innerHTML：
  // AI 返回和用户输入都不可信，拼 HTML 就是 XSS 入口

  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };

  function scrollChat() {
    chatLog.scrollTop = chatLog.scrollHeight;
  }

  function addMsg(node) {
    chatEmpty.style.display = 'none';
    chatLog.appendChild(node);
    scrollChat();
    return node;
  }

  // AI 回答气泡：标题 + 各块内容，公式显示 LaTeX 源码
  function aiBubble(data, drawnCount, isQuiz) {
    const box = el('div', 'msg ai');
    if (data.title) box.appendChild(el('div', 'm-title', data.title));
    for (const b of data.blocks) {
      if (b.type === 'formula') {
        box.appendChild(el('div', 'm-tex', b.tex));
      } else if (b.type === 'heading') {
        box.appendChild(el('div', 'm-line m-title', b.text));
      } else if (b.type === 'note') {
        box.appendChild(el('div', 'm-line m-note', '※ ' + b.text));
      } else {
        box.appendChild(el('div', 'm-line', b.text));
      }
    }
    // 三种情况：纯讲解 / 讲解+出题 / 纯出题
    const n = (data.quizzes || []).length;
    let note;
    if (n > 0 && drawnCount === 0) note = `📝 共 ${n} 道题，请在下方答题窗作答`;
    else if (n > 0) note = `✏️ 讲解已上白板（${drawnCount} 个元素）· 📝 共 ${n} 道题`;
    else note = `✏️ 已画到白板（${drawnCount} 个元素）`;
    box.appendChild(el('div', 'm-drawn', note));
    return box;
  }

  // 历史里只存精简文本：发给模型的上下文不需要完整块结构，省 token
  function summarize(data) {
    const parts = [];
    if (data.title) parts.push(data.title);
    for (const b of data.blocks) {
      if (b.type === 'formula') parts.push(b.tex);
      else if (b.type === 'plot') parts.push(`函数图像：${b.exprs?.join('，')}`);
      else if (b.text) parts.push(b.text);
    }
    return parts.join('；');
  }

  async function askTeacher() {
    const question = askField.value.trim();
    if (!question) return;
    if (!window.Auth || !window.Auth.isLoggedIn()) {
      addMsg(el('div', 'msg err', '请先登录（右上角），AI 老师需要你账号下的 DeepSeek Key'));
      return;
    }

    addMsg(el('div', 'msg user', question));
    askField.value = '';
    btnAskOk.disabled = true;
    if (window._wbAutoTitle) window._wbAutoTitle(question);
    const pending = addMsg(el('div', 'msg pending', '老师正在思考…'));

    try {
      const res = await fetch('/api/teach', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${window.Auth.getToken()}`,
        },
        body: JSON.stringify({ question, history: chatHistory, attachments: attachments.length ? attachments : undefined }),
      });
      clearAttachments();
      const out = await res.json().catch(() => ({}));
      if (!res.ok) {
        // 未配置 Key：直接引导到设置弹窗
        if (out.code === 'NO_API_KEY' && window.Settings) {
          pending.className = 'msg err';
          pending.textContent = out.error + '（正在打开设置）';
          setTimeout(() => window.Settings.open(), 600);
          return;
        }
        throw new Error(out.error || `请求失败 (${res.status})`);
      }

      const data = out.data;
      // 题干只进答题窗，不上白板。白板只画知识讲解部分：
      // 问"什么是勾股定理，再考我一道"时，定义和公式上板，题目进窗口
      let placed = [];
      if (data.blocks.length > 0) {
        pending.textContent = '正在板书…';
        placed = await drawLesson(data);
      }
      pending.remove();
      addMsg(aiBubble(data, placed.length, !!data.quizzes));
      // TTS：把标题 + 文字块拼成朗读文本，跳过公式和图表
      const ttsText = [
        data.title,
        ...data.blocks.filter((b) => b.type === 'text' || b.type === 'note' || b.type === 'heading').map((b) => b.text),
      ].filter(Boolean).join('。');
      if (ttsText) ttsSpeak(ttsText);
      if (data.quizzes) {
        // 记住主题用于再来一组。用标题而非原问题 —— 问题可能是"再来一组"这种没信息量的话
        if (data.title && !/^(再来|下一)/.test(question)) quizTopic = data.title;
        loadQuizSet(data.quizzes);
      }
      // 提问和回答都进历史，下一轮追问才有上下文
      chatHistory = [
        ...chatHistory,
        { role: 'user', content: question },
        { role: 'assistant', content: summarize(out.data) },
      ].slice(-12); // 前端也留一手，别让请求体无限变大
      markDirty();
    } catch (err) {
      pending.className = 'msg err';
      pending.textContent = '⚠️ ' + err.message;
    } finally {
      btnAskOk.disabled = false;
      scrollChat();
    }
  }

  // 分栏排版：先量出每块尺寸，再交给 flowColumns 决定分栏，最后落成图形。
  // 分两趟是必须的 —— 不先知道所有块的高度，就没法判断哪里该换栏
  async function drawLesson(data) {
    // 第一趟：测量。公式要先渲染才知道尺寸，异步逐个 await
    const items = [];

    const pushText = (text, style, keepWithNext) => {
      const lines = wrapText(text, style.size, COL_W);
      const lineH = style.size * style.lh;
      items.push({
        kind: 'text', lines, style, lineH,
        h: lines.length * lineH + style.gap,
        keepWithNext: !!keepWithNext,
      });
    };

    if (data.title) pushText(data.title, BLOCK_STYLE.title);

    for (let i = 0; i < data.blocks.length; i++) {
      const b = data.blocks[i];
      if (b.type === 'formula') {
        try {
          const { img, w, h } = await renderMath(b.tex, BLOCK_STYLE.formula.color, 1);
          const k = w > COL_W ? COL_W / w : 1;
          items.push({
            kind: 'math', tex: b.tex, img,
            w: w * k, mh: h * k,
            h: h * k + BLOCK_STYLE.formula.gap,
            keepWithNext: false,
          });
        } catch (err) {
          pushText('[公式] ' + b.tex, BLOCK_STYLE.text);
        }
      } else if (b.type === 'plot') {
        const size = Math.min(COL_W, 280);
        items.push({
          kind: 'plot', exprs: b.exprs,
          xMin: b.xMin, xMax: b.xMax, yMin: b.yMin, yMax: b.yMax,
          w: size, mh: size,
          h: size + (BLOCK_STYLE.formula.gap || 16),
          keepWithNext: false,
        });
      } else {
        const style = BLOCK_STYLE[b.type] || BLOCK_STYLE.text;
        // 标题必须跟住后面第一块，否则会孤零零落在栏底
        const keep = b.type === 'heading' && i < data.blocks.length - 1;
        pushText(b.type === 'note' ? '※ ' + b.text : b.text, style, keep);
      }
    }

    if (items.length === 0) throw new Error('没有可绘制的内容');

    // 第二趟：分栏。栏高取当前视口高度，一屏正好看完一栏
    const maxH = Math.max(320, canvas.clientHeight / view.scale - 100);
    const { positions } = G.flowColumns(items, {
      maxH, colW: COL_W, colGap: COL_GAP, itemGap: 0,
    });

    // 第三趟：落成图形
    const spot = nextFreeSpot();
    const added = [];
    for (const { x, y, item } of positions) {
      const px = spot.x + x;
      const py = spot.y + y;
      if (item.kind === 'math') {
        added.push({
          type: 'math', tex: item.tex, img: item.img,
          color: BLOCK_STYLE.formula.color, width: 3,
          x: px, y: py, w: item.w, h: item.mh,
        });
      } else if (item.kind === 'plot') {
        added.push({
          type: 'plot', exprs: item.exprs,
          xMin: item.xMin, xMax: item.xMax,
          yMin: item.yMin, yMax: item.yMax,
          color, width: 2,
          x: px, y: py, w: item.w, h: item.mh,
        });
      } else {
        item.lines.forEach((line, li) => {
          added.push({
            type: 'text', color: item.style.color, width: 3,
            // text 的 y 是基线，第一行要下移一个字高才不被裁掉
            x: px, y: py + item.style.size + li * item.lineH,
            text: line, size: item.style.size,
          });
        });
      }
    }

    const placed = addShapes(added);
    // 板书整体选中：想整段挪走或删掉时不用再框一次
    sel = placed.map((s) => s.id);
    updateSelInfo();
    // 视图对到第一栏，而不是整块内容的中心 ——
    // 多栏时对中心会停在两栏之间，而阅读要从第一栏开头开始
    view = G.centerOn(
      view,
      spot.x + COL_W / 2,
      spot.y + Math.min(maxH, canvas.clientHeight / view.scale) / 2,
      canvas.clientWidth, canvas.clientHeight
    );
    redraw();
    return placed;
  }

  // ---------- 答题窗口 ----------
  // 选择题本地比对（零成本、即时），简答题交给模型判。
  // 答案和解析在答完之前不落到白板上，否则题就白出了

  const Q = window.QUIZ;

  // 一次拿到整套题。批量出题让模型在同一次生成里看到全部题目，
  // 比逐题追问靠对话历史避重可靠得多
  let quizSet = [];     // 本套题目
  let quizIdx = 0;      // 当前第几题（0 基）
  let quizState = [];   // 每题结果 { done, correct, pick, reply, ms }

  let quiz = null;      // 当前题目（= quizSet[quizIdx]）
  let quizPick = [];    // 已选的选项 key
  let quizDone = false; // 已判定，防重复提交
  let quizRetry = false; // 错题重做模式：不属于当前套题，不计进度
  let quizTopic = '';   // 出题主题，再来一组时复用
  let startAt = 0;      // 本题开始时间
  let usedMs = 0;       // 本题耗时（判定时定格）
  let tick = null;      // 计时器句柄

  // 错题本存 localStorage：刷新不丢，未登录时仍可用
  const BOOK_KEY = 'whiteboardWrongBook';

  function loadBook() {
    try {
      return Q.cleanBook(JSON.parse(localStorage.getItem(BOOK_KEY) || '[]'));
    } catch (e) {
      return [];
    }
  }

  function saveBook(book) {
    try {
      localStorage.setItem(BOOK_KEY, JSON.stringify(book));
    } catch (e) {}
    markDirty(); // 错题变化也触发云端保存
  }

  let wrongBook = loadBook();

  // ---------- 计时 ----------

  function startTimer() {
    stopTimer();
    startAt = Date.now();
    usedMs = 0;
    quizTimer.textContent = '0:00';
    tick = setInterval(() => {
      quizTimer.textContent = Q.fmtDuration(Date.now() - startAt);
    }, 500);
  }

  function stopTimer() {
    if (tick) { clearInterval(tick); tick = null; }
    if (startAt) usedMs = Date.now() - startAt;
  }

  // 载入一整套题，跳到第一题
  function loadQuizSet(list) {
    quizSet = list;
    quizState = list.map(() => ({ done: false }));
    quizIdx = 0;
    showQuizAt(0);
  }

  // 切到第 i 题。已答过的题恢复成判定后的样子，不能让用户重答刷分
  function showQuizAt(i) {
    if (i < 0 || i >= quizSet.length) return;
    quizIdx = i;
    const st = quizState[i];
    openQuiz(quizSet[i], false);
    if (st.done) {
      quizPick = st.pick || [];
      if (quiz.kind === 'short') quizReply.value = st.reply || '';
      usedMs = st.ms || 0;
      stopTimer();
      quizTimer.textContent = Q.fmtDuration(usedMs);
      // 重放判定结果，包括选项标色和解析
      finishQuiz(st.correct, st.score, st.comment, true);
    }
  }

  function openQuiz(q, isRetry) {
    quiz = q;
    quizPick = [];
    quizDone = false;
    quizRetry = !!isRetry;
    updateProgress();
    startTimer();
    btnQuizNext.style.display = 'none';
    const multi = q.kind === 'choice' && q.answer.length > 1;
    quizKind.textContent = q.kind === 'short' ? '✍️ 简答题' : (multi ? '📝 多选题' : '📝 选择题');
    quizQuestion.textContent = q.question;
    quizResult.textContent = '';
    quizResult.className = 'quiz-result';
    // 上一题的解析必须清掉，否则新题会带着旧解析
    quizExplain.textContent = '';
    quizExplain.classList.remove('show');
    btnQuizSubmit.disabled = false;
    btnQuizSubmit.style.display = '';
    btnQuizSkip.style.display = '';

    // 选择题渲染选项按钮，简答题显示文本框
    quizOptions.textContent = '';
    if (q.kind === 'choice') {
      quizReply.classList.remove('show');
      for (const o of q.options) {
        const btn = el('button', 'quiz-opt');
        btn.appendChild(el('span', 'k', o.key));
        btn.appendChild(el('span', 't', o.text));
        btn.addEventListener('click', () => pickOption(o.key, multi));
        quizOptions.appendChild(btn);
      }
      quizTip.textContent = multi ? '可多选' : '选一项后提交';
    } else {
      quizReply.classList.add('show');
      quizReply.value = '';
      quizTip.textContent = quiz.answer ? '提交后对照参考答案' : '提交后由 AI 老师评判';
    }

    updateNav();
    quizBox.classList.add('show');
    if (q.kind === 'short') quizReply.focus();
  }

  // 用户这次的答案（选择题是字母，简答题是原文）
  // 必须在 finishQuiz 之前声明：const 不提升，晚声明会触发 TDZ 报错
  const quizMine = () => (quiz.kind === 'choice' ? quizPick.join('') : quizReply.value.trim());

  // 隐藏窗口但保留本轮计数（续题时用）
  function hideQuiz() {
    stopTimer();
    quizBox.classList.remove('show');
    quiz = null;
  }

  // 用户主动关窗 = 放弃整套
  function closeQuiz() {
    hideQuiz();
    quizSet = [];
    quizState = [];
    quizIdx = 0;
    quizTopic = '';
  }

  function updateProgress() {
    if (quizRetry) { quizProgress.textContent = '错题重做'; return; }
    const total = quizSet.length;
    if (total === 0) { quizProgress.textContent = ''; return; }
    const done = quizState.filter((s) => s.done).length;
    const right = quizState.filter((s) => s.correct === true).length;
    quizProgress.textContent = done > 0
      ? `第 ${quizIdx + 1}/${total} 题 · 答对 ${right}/${done}`
      : `第 ${quizIdx + 1}/${total} 题`;
  }

  function pickOption(key, multi) {
    if (quizDone) return;
    if (multi) {
      quizPick = quizPick.includes(key) ? quizPick.filter((k) => k !== key) : [...quizPick, key];
    } else {
      quizPick = [key];
    }
    // 重绘选中态
    [...quizOptions.children].forEach((btn, i) => {
      btn.classList.toggle('picked', quizPick.includes(quiz.options[i].key));
    });
  }

  // 解析显示在答题窗口内，不画到白板 —— 白板留给题干和用户自己的推演
  async function showExplain() {
    quizExplain.textContent = '';
    if (quiz.answer) {
      quizExplain.appendChild(el('div', 'e-answer', '正确答案：' + quiz.answer));
    }
    if (quiz.explain.length > 0) {
      quizExplain.appendChild(el('div', 'e-head', '解析'));
    }
    for (const b of quiz.explain) {
      if (b.type === 'formula') {
        const wrap = el('div', 'e-tex');
        try {
          // 复用白板的公式渲染，拿到的是 Image 元素，直接插进 DOM
          const { img } = await renderMath(b.tex, '#333333', 1);
          wrap.appendChild(img);
        } catch (err) {
          // 渲染失败退化成源码，别留空白
          wrap.appendChild(el('span', 'e-tex-raw', b.tex));
        }
        quizExplain.appendChild(wrap);
      } else {
        quizExplain.appendChild(el('div', b.type === 'note' ? 'e-note' : 'e-line',
          b.type === 'note' ? '※ ' + b.text : b.text));
      }
    }
    quizExplain.classList.add('show');
    // 解析在窗口下方，滚过去才看得见
    quizExplain.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  // 判定后标出正误并显示解析。
  // replay=true 表示切回已答过的题，只重绘界面，不再改错题本和历史
  async function finishQuiz(correct, score, comment, replay) {
    quizDone = true;
    stopTimer();
    btnQuizSubmit.disabled = true;
    btnQuizSkip.style.display = 'none';
    btnQuizSubmit.style.display = 'none';
    updateNav();

    if (!replay) {
      // 记住本题结果，切题回来要能还原
      if (!quizRetry && quizState[quizIdx]) {
        quizState[quizIdx] = {
          done: true, correct, score, comment,
          pick: [...quizPick], reply: quizReply.value, ms: usedMs,
        };
      }
      if (correct === true) {
        // 答对就从错题本移出（重做错题的主要出口）
        const before = wrongBook.length;
        wrongBook = Q.removeWrong(wrongBook, quiz.question);
        if (wrongBook.length !== before) saveBook(wrongBook);
      } else if (correct === false) {
        // 只记真错的；correct 为 null（无答案/跳过）不算错题
        wrongBook = Q.addWrong(wrongBook, {
          question: quiz.question, kind: quiz.kind,
          answer: quiz.answer, mine: quizMine(),
          options: quiz.options || [], explain: quiz.explain,
          ms: usedMs, at: Date.now(),
        });
        saveBook(wrongBook);
      }
      renderBook();
    }
    updateProgress();

    if (quiz.kind === 'choice' && quiz.answer) {
      const right = [...quiz.answer];
      [...quizOptions.children].forEach((btn, i) => {
        const k = quiz.options[i].key;
        btn.disabled = true;
        if (right.includes(k)) btn.classList.add('right');
        else if (quizPick.includes(k)) btn.classList.add('wrong');
        btn.classList.remove('picked');
      });
    }

    const label = correct === null ? '⚠️ ' : (correct ? '✅ 回答正确' : (score === 'partial' ? '◐ 部分正确' : '❌ 回答错误'));
    quizResult.className = 'quiz-result ' + (correct === null ? 'wait' : correct ? 'ok' : (score === 'partial' ? 'part' : 'no'));
    const used = `　⏱ ${Q.fmtDuration(usedMs)}`;
    quizResult.textContent = (comment ? `${label}　${comment}` : label) + used;

    await showExplain();
    if (replay) return;
    // 判定结果进对话历史，追问"为什么错"时模型有上下文
    chatHistory = [
      ...chatHistory,
      { role: 'user', content: `我的回答：${quizMine()}` },
      { role: 'assistant', content: `${label}。${comment || ''}` },
    ].slice(-12);
    markDirty();
  }

  async function submitQuiz() {
    if (!quiz || quizDone) return;

    if (quiz.kind === 'choice') {
      if (quizPick.length === 0) { quizResult.className = 'quiz-result no'; quizResult.textContent = '请先选择'; return; }
      if (!quiz.answer) {
        // 模型没给答案：不猜，直接显示解析
        await finishQuiz(null, 'unknown', '本题未提供标准答案，请对照解析自行判断。');
        return;
      }
      // 本地比对（gradeChoice 有测试覆盖：多选顺序无关、重复去重）
      const { mine, correct } = Q.gradeChoice(quizPick, quiz.answer);
      await finishQuiz(correct, correct ? 'full' : 'none',
        correct ? '' : `你选了 ${mine}，正确答案是 ${quiz.answer}。`);
      return;
    }

    // 简答题：交给模型判
    const reply = quizReply.value.trim();
    if (!reply) { quizResult.className = 'quiz-result no'; quizResult.textContent = '请先作答'; return; }
    if (!window.Auth || !window.Auth.isLoggedIn()) {
      quizResult.className = 'quiz-result no';
      quizResult.textContent = '请先登录后再提交';
      return;
    }

    btnQuizSubmit.disabled = true;
    quizResult.className = 'quiz-result wait';
    quizResult.textContent = '老师正在批改…';
    try {
      const res = await fetch('/api/judge', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${window.Auth.getToken()}`,
        },
        body: JSON.stringify({ question: quiz.question, answer: quiz.answer, reply }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(out.error || `请求失败 (${res.status})`);
      await finishQuiz(out.data.correct, out.data.score, out.data.comment);
    } catch (err) {
      // 判定失败不锁死，让用户能改答案重试
      btnQuizSubmit.disabled = false;
      quizResult.className = 'quiz-result no';
      quizResult.textContent = '⚠️ ' + err.message;
    }
  }

  // ---------- 整套题内导航 ----------

  // 按当前位置和作答状态决定显示哪些按钮
  function updateNav() {
    const last = quizIdx >= quizSet.length - 1;
    btnQuizPrev.style.display = (!quizRetry && quizIdx > 0) ? '' : 'none';
    if (quizRetry) { btnQuizNext.style.display = 'none'; return; }
    // 未答完不给跳过 —— 答完才出现"下一题"
    btnQuizNext.style.display = quizDone ? '' : 'none';
    btnQuizNext.textContent = last ? '再来一组 →' : '下一题 →';
  }

  async function nextQuestion() {
    if (quizIdx < quizSet.length - 1) { showQuizAt(quizIdx + 1); return; }
    // 整套答完 → 向模型再要一组
    btnQuizNext.disabled = true;
    try {
      askField.value = quizTopic ? `再来一组「${quizTopic}」的题` : '再出一组同类型的题';
      hideQuiz();
      await askTeacher();
    } finally {
      btnQuizNext.disabled = false;
    }
  }

  // ---------- 错题本 ----------

  function renderBook() {
    wrongCount.textContent = wrongBook.length > 0 ? `（${wrongBook.length}）` : '';
    wrongList.textContent = '';
    if (wrongBook.length === 0) {
      wrongList.appendChild(el('div', 'wrong-empty', '还没有错题。答错的题会自动收进来。'));
      return;
    }
    for (const e of wrongBook) {
      const item = el('div', 'wrong-item');
      item.appendChild(el('div', 'wrong-q', e.question));
      const meta = el('div', 'wrong-meta');
      if (e.mine) meta.appendChild(el('span', 'wrong-mine', '你答：' + e.mine));
      if (e.answer) meta.appendChild(el('span', 'wrong-right', '正确：' + e.answer));
      meta.appendChild(el('span', null, '⏱ ' + Q.fmtDuration(e.ms)));
      if (e.times > 1) meta.appendChild(el('span', 'wrong-times', `错 ${e.times} 次`));
      // 只有选择题能原地重做：简答题要调模型判，重做等于再花一次钱，
      // 想重做直接问老师即可
      if (e.kind === 'choice' && e.options.length >= 2) {
        const retry = el('button', 'wrong-retry', '重做');
        retry.addEventListener('click', () => {
          wrongBox.classList.remove('show');
          openQuiz({
            kind: 'choice', question: e.question, options: e.options,
            answer: e.answer, explain: e.explain,
          }, true);
        });
        meta.appendChild(retry);
      }
      item.appendChild(meta);
      wrongList.appendChild(item);
    }
  }

  btnQuizSubmit.addEventListener('click', submitQuiz);
  btnQuizNext.addEventListener('click', nextQuestion);
  btnQuizPrev.addEventListener('click', () => showQuizAt(quizIdx - 1));
  btnQuizSkip.addEventListener('click', () => {
    if (quiz) finishQuiz(null, 'unknown', '已跳过作答，下面是解析。');
  });
  document.getElementById('btnQuizClose').addEventListener('click', closeQuiz);
  document.getElementById('btnWrongBook').addEventListener('click', () => {
    renderBook();
    wrongBox.classList.add('show');
  });
  document.getElementById('btnWrongClose').addEventListener('click', () => {
    wrongBox.classList.remove('show');
  });
  document.getElementById('btnWrongClear').addEventListener('click', () => {
    if (wrongBook.length === 0) return;
    if (!confirm(`清空 ${wrongBook.length} 道错题？此操作无法撤回。`)) return;
    wrongBook = [];
    saveBook(wrongBook);
    renderBook();
  });
  quizReply.addEventListener('keydown', (e) => {
    // Ctrl/Cmd+Enter 提交：简答题需要换行，单 Enter 不能占用
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submitQuiz(); }
  });

  // 面板显隐会改变画布宽度，必须 resize 重设位图尺寸
  function toggleChat(show) {
    chatPanel.classList.toggle('hidden', !show);
    resize();
    if (show) askField.focus();
  }

  document.getElementById('btnAsk').addEventListener('click', () => {
    toggleChat(chatPanel.classList.contains('hidden'));
  });
  document.getElementById('btnChatClose').addEventListener('click', () => toggleChat(false));
  document.getElementById('btnChatClear').addEventListener('click', () => {
    chatHistory = [];
    markDirty();
    synth && synth.cancel();
    ttsLastText = '';
    btnTtsStop.style.display = 'none';
    btnTtsReplay.style.display = 'none';
    // 清空气泡但保留占位提示节点
    for (const n of [...chatLog.children]) {
      if (n !== chatEmpty) n.remove();
    }
    chatEmpty.style.display = '';
  });
  btnAskOk.addEventListener('click', askTeacher);
  askField.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); askTeacher(); }
  });
  // 快捷问题：填入后直接发送，少一步点击
  document.querySelectorAll('[data-ask]').forEach((b) => {
    b.addEventListener('click', () => { askField.value = b.dataset.ask; askTeacher(); });
  });

  // ---------- 工具栏 ----------

  const HINTS = {
    select: '空白处拖动平移画布 · Shift+拖动框选 · Shift 点击加选 · Ctrl+A 全选 · 拖手柄整组缩放 · Delete 删除',
    pen: '按住拖动即可自由画线',
    rect: '拖拽画矩形',
    ellipse: '拖拽画椭圆',
    triangle: '拖拽画三角形',
    'wide-ellipse': '拖拽画扁椭圆',
    diamond: '拖拽画菱形',
    parallelogram: '拖拽画平行四边形',
    'round-rect': '拖拽画圆角矩形',
    line: '拖拽画直线',
    arrow: '拖拽画单向箭头',
    arrow2: '拖拽画双向箭头',
    'curve-arrow': '拖拽画曲线箭头',
    text: '点击画布位置后输入文字，回车确认，Esc 取消',
    math: '点击画布位置后输入 LaTeX 公式；已有公式双击可改',
    erase: '点击某个图形即可单独删除它',
    eraser: '拖动擦除：画笔路径按点切割，其他图形整体删除',
    mindmap: '点击画布放置中心主题；之后悬停节点点 ＋ 加下一级、－ 折叠，Tab 加子，Enter 加同级，双击改文字，拖节点换位置',
  };

  // select 下默认抓手：空白处按住就能拖画布
  const cursorFor = (t) => (t === 'select' ? 'grab' : t === 'erase' ? 'pointer' : t === 'eraser' ? 'none' : 'crosshair');

  const SHAPE_TOOLS = new Set(['rect','ellipse','triangle','wide-ellipse','diamond','parallelogram','round-rect']);
  const shapePickerBtn = document.getElementById('shapePickerBtn');
  const shapePickerLabel = document.getElementById('shapePickerLabel');
  const shapeDropdown = document.getElementById('shapeDropdown');

  // Toggle shape dropdown
  shapePickerBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    shapeDropdown.classList.toggle('show');
  });
  document.addEventListener('click', () => shapeDropdown.classList.remove('show'));

  function setTool(t, triggerBtn) {
    tool = t;
    if (tool !== 'select') { sel = []; updateSelInfo(); }
    if (tool !== 'eraser') { eraserPos = null; }
    if (MIND_UI) MIND_UI.clearHover();
    // Mark active on all plain data-tool buttons
    document.querySelectorAll('[data-tool]').forEach((b) => b.classList.remove('active'));
    if (triggerBtn) triggerBtn.classList.add('active');
    // Shape picker button stays active when any shape tool is selected
    if (SHAPE_TOOLS.has(tool)) {
      shapePickerBtn.classList.add('active');
      if (triggerBtn) shapePickerLabel.textContent = triggerBtn.getAttribute('title');
    } else {
      shapePickerBtn.classList.remove('active');
    }
    hint.textContent = HINTS[tool] || '';
    canvas.style.cursor = cursorFor(tool);
    redraw();
  }

  document.querySelectorAll('[data-tool]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      setTool(btn.dataset.tool, btn);
      if (SHAPE_TOOLS.has(btn.dataset.tool)) shapeDropdown.classList.remove('show');
    });
  });

  const arrowPickerBtn = document.getElementById('arrowPickerBtn');
  const arrowPickerLabel = document.getElementById('arrowPickerLabel');
  const arrowDropdown = document.getElementById('arrowDropdown');
  const ARROW_TOOLS = new Set(['line', 'arrow', 'arrow2', 'curve-arrow']);

  arrowPickerBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    arrowDropdown.classList.toggle('show');
  });
  document.addEventListener('click', () => arrowDropdown.classList.remove('show'));

  document.querySelectorAll('#arrowDropdown [data-tool]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      setTool(btn.dataset.tool, null);
      arrowPickerLabel.textContent = btn.getAttribute('title');
      arrowPickerBtn.classList.add('active');
      // mark active opt
      document.querySelectorAll('#arrowDropdown .shape-opt').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      arrowDropdown.classList.remove('show');
    });
  });

  // patch setTool to also handle arrow picker active state
  const _origSetTool = setTool;
  setTool = function(t, triggerBtn) {
    _origSetTool(t, triggerBtn);
    if (ARROW_TOOLS.has(t)) {
      arrowPickerBtn.classList.add('active');
    } else {
      arrowPickerBtn.classList.remove('active');
    }
  };

  document.getElementById('colorPick').addEventListener('input', (e) => {
    color = e.target.value;
    // 有选中就整组改色，比逐个重画省事
    if (sel.length > 0) {
      const ids = selShapes().filter((s) => s.type === 'math').map((s) => s.id);
      // 导图节点的颜色是分支色，不跟全局色板走（在属性面板里按支线改）
      shapes = shapes.map((s) => (isSel(s) && s.type !== 'mind-node' ? { ...s, color } : s));
      // 公式颜色烧在 SVG 里，改属性不够，得重新渲染贴图
      for (const id of ids) reRenderMath(id);
      markDirty();
      redraw();
    }
  });
  document.getElementById('widthPick').addEventListener('input', (e) => {
    width = Number(e.target.value);
    if (sel.length > 0) {
      shapes = shapes.map((s) => (isSel(s) && s.type !== 'mind-node' ? { ...s, width } : s));
      markDirty();
      redraw();
    }
  });

  // ---------- shape properties panel ----------

  const shapeProps = document.getElementById('shapeProps');
  const spLabel = document.getElementById('spLabel');
  const spStrokeColor = document.getElementById('spStrokeColor');
  const spStrokeWidth = document.getElementById('spStrokeWidth');
  const spFillColor = document.getElementById('spFillColor');
  const spFillIcon = document.getElementById('spFillIcon');
  const spNoFill = document.getElementById('spNoFill');

  // shape types that show the props panel
  const PROPS_TYPES = new Set(['rect','ellipse','triangle','wide-ellipse','diamond','parallelogram','round-rect','line','mind-node']);

  function syncPropsPanel() {
    const picked = selShapes().filter((s) => PROPS_TYPES.has(s.type));
    if (picked.length !== 1) { shapeProps.classList.remove('show'); return; }
    const s = picked[0];

    // position panel below the selection box, clamped inside canvas
    const box = G.bbox(s);
    if (!box) { shapeProps.classList.remove('show'); return; }
    const wrap = canvas.getBoundingClientRect();
    const pw = 240, ph = 76;
    let left, top;
    if (s.type === 'mind-node') {
      // 导图节点：面板固定在画布右上角，放节点下方会盖住相邻的兄弟节点；编辑文字时先收起
      if (MIND_UI && MIND_UI.isEditing()) { shapeProps.classList.remove('show'); return; }
      left = wrap.width - pw - 8;
      top = 8;
    } else {
      const sc = G.toScreen(view, (box.x1 + box.x2) / 2, box.y2);
      left = sc.x - pw / 2;
      top = sc.y + 12;
    }
    left = Math.max(4, Math.min(left, wrap.width - pw - 4));
    top = Math.max(4, Math.min(top, wrap.height - ph - 4));
    shapeProps.style.left = left + 'px';
    shapeProps.style.top = top + 'px';
    shapeProps.classList.add('show');

    // sync control values
    spLabel.value = s.label || '';
    spStrokeColor.value = s.color || '#333333';
    spStrokeWidth.value = s.width || 3;
    const hasFill = !!s.fillColor;
    spFillColor.value = hasFill ? s.fillColor : '#ffffff';
    spFillIcon.style.color = hasFill ? s.fillColor : '#aaa';
    spNoFill.classList.toggle('active', !hasFill);
  }

  // 面板上连续拖滑块 / 逐字改文字合并成一条撤销记录；标签带上选中 id，换了目标就不合并
  const spTag = (k) => `${k}:${sel.join(',')}`;

  // 描边色 / 粗细对导图节点作用于整条支线（节点及其全部后代）
  const branchTargets = () => {
    const ids = new Set(sel);
    if (MIND_UI) for (const id of MIND_UI.branchIds(sel)) ids.add(id);
    return ids;
  };

  spLabel.addEventListener('input', () => {
    shapes = shapes.map((s) => (isSel(s) && PROPS_TYPES.has(s.type) ? { ...s, label: spLabel.value } : s));
    // 导图节点文字变了要按新宽度重排（面板只在单选时显示，这里最多一个）
    if (MIND_UI) for (const s of selShapes()) if (s.type === 'mind-node') MIND_UI.resizeToLabel(s.id);
    markDirty(spTag('sp-label')); redraw();
  });

  spStrokeColor.addEventListener('input', () => {
    const ids = branchTargets();
    shapes = shapes.map((s) => (ids.has(s.id) && PROPS_TYPES.has(s.type) ? { ...s, color: spStrokeColor.value } : s));
    spFillIcon.style.color = spFillColor.value;
    markDirty(spTag('sp-color')); redraw();
  });

  spStrokeWidth.addEventListener('input', () => {
    const ids = branchTargets();
    shapes = shapes.map((s) => (ids.has(s.id) && PROPS_TYPES.has(s.type) ? { ...s, width: Number(spStrokeWidth.value) } : s));
    markDirty(spTag('sp-width')); redraw();
  });

  spFillColor.addEventListener('input', () => {
    const fc = spFillColor.value;
    shapes = shapes.map((s) => (isSel(s) && PROPS_TYPES.has(s.type) ? { ...s, fillColor: fc } : s));
    spFillIcon.style.color = fc;
    spNoFill.classList.remove('active');
    markDirty(spTag('sp-fill')); redraw();
  });

  spNoFill.addEventListener('click', () => {
    shapes = shapes.map((s) => (isSel(s) && PROPS_TYPES.has(s.type) ? { ...s, fillColor: null } : s));
    spFillIcon.style.color = '#aaa';
    spNoFill.classList.add('active');
    markDirty(); redraw();
  });

  document.getElementById('btnUndo').addEventListener('click', undoBoard);
  document.getElementById('btnRedo').addEventListener('click', redoBoard);

  btnDelSel.addEventListener('click', removeSelected);

  document.getElementById('btnClear').addEventListener('click', () => {
    if (shapes.length === 0) return;
    if (!confirm('清空整个白板？可用 Ctrl+Z 撤销。')) return;
    shapes = [];
    sel = [];
    updateSelInfo();
    markDirty();
    redraw();
  });

  document.getElementById('btnFit').addEventListener('click', () => {
    const box = G.bboxAll(visibleShapes());
    if (!box) { view = { scale: 1, x: 0, y: 0 }; redraw(); return; }
    const t = G.fitTransform(box, canvas.clientWidth, canvas.clientHeight, 40);
    view = { scale: Math.min(G.MAX_SCALE, Math.max(G.MIN_SCALE, t.scale)), x: t.x, y: t.y };
    // scale 被夹取时 fit 的偏移不再对齐，重新按中心摆
    view = G.centerOn(view, (box.x1 + box.x2) / 2, (box.y1 + box.y2) / 2,
      canvas.clientWidth, canvas.clientHeight);
    redraw();
  });

  document.getElementById('btnReset').addEventListener('click', () => {
    view = { scale: 1, x: 0, y: 0 };
    redraw();
  });

  document.getElementById('btnSave').addEventListener('click', () => {
    // 导出只含内容，不带视口空白（折叠起来的节点不算）
    const box = G.bboxAll(visibleShapes());
    if (!box) return;
    const pad = 20;
    const out = document.createElement('canvas');
    out.width = Math.ceil(box.x2 - box.x1) + pad * 2;
    out.height = Math.ceil(box.y2 - box.y1) + pad * 2;
    const octx = out.getContext('2d');
    octx.fillStyle = '#fff';
    octx.fillRect(0, 0, out.width, out.height);
    octx.translate(pad - box.x1, pad - box.y1);
    for (const s of shapes) drawShape(octx, s);
    const a = document.createElement('a');
    a.download = 'whiteboard.png';
    a.href = out.toDataURL('image/png');
    a.click();
  });

  // ---------- 思维导图 ----------
  // 交互层放在 whiteboard-mind-ui.js；这里只注入闭包变量的访问器。
  // 任一脚本没加载到就降级：白板其余功能照常，只是没有导图和撤销
  if (!window.MindmapUI || !window.MIND || !window.WBHistory) {
    hint.textContent = '⚠️ 思维导图模块未加载，请刷新页面';
    throw new Error('whiteboard-mind / whiteboard-history 未加载');
  }
  MIND_UI = window.MindmapUI.create({
    getShapes: () => shapes,
    setShapes: (v) => { shapes = v; },
    getSel: () => sel,
    setSel: (v) => { sel = v; updateSelInfo(); },
    getView: () => view,
    setView: (v) => { view = v; },
    canvas, ctx, textInput, hint, FONT,
    addShapes, markDirty, redraw, updateConnectedArrows,
    // 新建空节点又取消：把「创建」那条撤销记录一并撤回，不留痕
    undoCreate: () => { const r = H.undo(history, shapes); if (r) { history = r.hist; committed = r.state; shapes = r.state; } },
  });

  window.addEventListener('resize', resize);
  hint.textContent = HINTS.select;
  updateSelInfo();
  resize();

  // ---------- 云端保存 / 对话管理 ----------

  const SESSION_KEY = 'wbSessionId'; // localStorage 记住上次用的对话 id
  let currentSessionId = null;
  let currentSessionTitle = '新对话';

  // math shape 的 img 无法 JSON 序列化，存前剥离，加载后按 tex 重建
  function stripImg(shape) {
    if (shape.type === 'math') { const { img, ...rest } = shape; return rest; }
    return shape;
  }

  function authHeaders() {
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${window.Auth.getToken()}` };
  }

  // ---- 撤销 / 重做 ----
  // 快照 = 整份 shapes 的引用（全程不可变更新，存引用零成本）。
  // 每次 markDirty 把「变更前」的 committed 入栈；同一同步 tick 内多次 markDirty 只记一条，
  // 天然对应一次用户手势。tag 相同且间隔 <1s 的连续变更（拖滑块、逐字改文字）合并成一条
  const H = window.WBHistory;
  let history = H.create(100);
  let committed = shapes;
  let snapPending = false;
  let lastSnapTag = null;
  let lastSnapAt = 0;

  function snapshot(tag) {
    if (shapes === committed || snapPending) return;
    const now = Date.now();
    const merge = tag && tag === lastSnapTag && now - lastSnapAt < 1000;
    if (!merge) history = H.push(history, committed);
    lastSnapTag = tag || null;
    lastSnapAt = now;
    snapPending = true;
    setTimeout(() => {
      snapPending = false;
      // 这一拍若已经在拖动中，shapes 是子树悬在指针上的中途状态，不能当基线；
      // 用拖动开始时的快照（有的话），否则保持原基线
      committed = drag ? (drag.before || committed) : shapes;
    }, 0);
  }

  // 撤销 / 重做前先把未落栈的改动记下来，避免丢状态
  function flushSnapshot() {
    if (shapes !== committed) { history = H.push(history, committed); committed = shapes; }
    lastSnapTag = null;
  }

  function restoreBoard(state) {
    shapes = state;
    committed = state;
    sel = [];
    updateSelInfo();
    // 快照里公式贴图丢了就按 tex 重建（直接赋值，不算一次编辑）
    for (const s of shapes) {
      if (s.type === 'math' && !s.img && s.tex) {
        renderMath(s.tex, s.color, s.width / 3)
          .then(({ img }) => {
            const same = shapes === committed;
            shapes = shapes.map((x) => (x.id === s.id ? { ...x, img } : x));
            if (same) committed = shapes;
            redraw();
          })
          .catch(() => {});
      }
    }
    scheduleSave();
    redraw();
  }

  function undoBoard() {
    if (drag) return; // 手势进行中不撤销，否则下一帧 drag.orig 会把旧状态盖回去
    if (MIND_UI && MIND_UI.isEditing()) MIND_UI.commitNodeEditor();
    flushSnapshot();
    const r = H.undo(history, shapes);
    if (!r) return;
    history = r.hist;
    restoreBoard(r.state);
  }

  function redoBoard() {
    if (drag) return;
    if (MIND_UI && MIND_UI.isEditing()) MIND_UI.commitNodeEditor();
    flushSnapshot();
    const r = H.redo(history, shapes);
    if (!r) return;
    history = r.hist;
    restoreBoard(r.state);
  }

  // 1.5s 防抖后把当前白板内容写入 session
  let _saveTimer = null;
  function scheduleSave() {
    if (!window.Auth || !window.Auth.isLoggedIn() || !currentSessionId) return;
    clearTimeout(_saveTimer);
    _saveTimer = setTimeout(pushSession, 1500);
  }

  // 一次编辑落地：记撤销快照 + 排队保存。tag 用于合并连续的同类变更，见 snapshot
  function markDirty(tag) {
    snapshot(tag);
    scheduleSave();
  }

  async function pushSession() {
    if (!window.Auth || !window.Auth.isLoggedIn() || !currentSessionId) return;
    // 手势进行中的画面是中途状态（子树悬在指针上），等松手再存
    if (drag) { scheduleSave(); return; }
    try {
      await fetch(`/api/wb/sessions/${currentSessionId}`, {
        method: 'PUT', headers: authHeaders(), keepalive: true,
        body: JSON.stringify({
          title: currentSessionTitle,
          shapes: shapes.map(stripImg), view, chatHistory, wrongBook,
        }),
      });
    } catch (e) {}
  }

  // 把一个对话的数据加载进白板（不触发 markDirty）
  function applySessionData(data) {
    if (MIND_UI) MIND_UI.abortNodeEditor(); // 换会话时不能把输入框里的字提交到别的图上
    const raw = Array.isArray(data.shapes) ? data.shapes : [];
    shapes = window.MIND.repair(raw); // 旧数据 / 悬空 parentId 兜底
    nextId = shapes.reduce((m, s) => Math.max(m, s.id || 0), 0) + 1;
    view = (data.view && typeof data.view.scale === 'number') ? data.view : { scale: 1, x: 0, y: 0 };
    // 结构被修过：挂回根的孤儿还停在旧坐标上，重排一遍再当基线
    if (shapes !== raw && MIND_UI) {
      for (const id of new Set(shapes.filter(window.MIND.isNode).map((s) => s.mapId))) MIND_UI.relayout(id);
    }
    history = H.create(100);
    committed = shapes;

    // 重建 math 图像（直接赋值，不经 patch，避免触发 markDirty）
    for (const s of shapes) {
      if (s.type === 'math' && s.tex) {
        renderMath(s.tex, s.color, s.width / 3)
          .then(({ img }) => {
            // 期间没有别的改动就把撤销基线一起更新，否则撤销回去公式会变成虚线框
            const same = shapes === committed;
            shapes = shapes.map((x) => (x.id === s.id ? { ...x, img } : x));
            if (same) committed = shapes;
            redraw();
          })
          .catch(() => {});
      }
    }

    // 重建聊天气泡
    for (const n of [...chatLog.children]) { if (n !== chatEmpty) n.remove(); }
    chatHistory = Array.isArray(data.chatHistory) ? data.chatHistory : [];
    if (chatHistory.length > 0) {
      chatEmpty.style.display = 'none';
      for (const msg of chatHistory) {
        addMsg(el('div', msg.role === 'user' ? 'msg user' : 'msg ai', msg.content));
      }
    } else {
      chatEmpty.style.display = '';
    }

    // 重建错题本
    wrongBook = Q.cleanBook(Array.isArray(data.wrongBook) ? data.wrongBook : []);
    localStorage.setItem(BOOK_KEY, JSON.stringify(wrongBook));
    renderBook();

    sel = [];
    updateSelInfo();
    redraw();
  }

  // ---- 对话列表 UI ----
  const sessionBtn = document.getElementById('sessionBtn');
  const sessionTitle = document.getElementById('sessionTitle');
  const sessionDropdown = document.getElementById('sessionDropdown');
  const sessionList = document.getElementById('sessionList');
  const btnNewSession = document.getElementById('btnNewSession');
  btnNewSession.addEventListener('click', newSession);

  let _sessions = []; // [{id, title, updated_at}]

  function fmtDate(s) {
    if (!s) return '';
    const d = new Date(s + 'Z'); // SQLite datetime('now') 是 UTC
    const now = new Date();
    const diff = now - d;
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return Math.floor(diff / 60000) + ' 分钟前';
    if (diff < 86400000) return Math.floor(diff / 3600000) + ' 小时前';
    return d.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
  }

  function renderSessionList() {
    sessionList.textContent = '';
    if (_sessions.length === 0) {
      sessionList.appendChild(el('div', 'session-item', '暂无对话'));
      return;
    }
    for (const s of _sessions) {
      const item = el('div', 'session-item' + (s.id === currentSessionId ? ' active' : ''));
      const titleEl = el('span', 's-title', s.title);
      const dateEl = el('span', 's-date', fmtDate(s.updated_at));
      const delBtn = el('button', 's-del', '✕');
      delBtn.title = '删除';
      delBtn.addEventListener('click', (e) => { e.stopPropagation(); deleteSession(s.id); });
      item.append(titleEl, dateEl, delBtn);
      item.addEventListener('click', () => switchSession(s.id));
      sessionList.appendChild(item);
    }
  }

  function setSessionTitle(title) {
    currentSessionTitle = title;
    sessionTitle.textContent = '🧑‍🏫 ' + (title.length > 14 ? title.slice(0, 14) + '…' : title);
  }

  // 切换下拉显示
  sessionBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = sessionDropdown.classList.toggle('show');
    sessionBtn.classList.toggle('open', open);
    if (open) renderSessionList();
  });
  document.addEventListener('click', () => {
    sessionDropdown.classList.remove('show');
    sessionBtn.classList.remove('open');
  });
  sessionDropdown.addEventListener('click', (e) => e.stopPropagation());

  // ---- 对话操作 ----
  async function loadSessionList() {
    if (!window.Auth || !window.Auth.isLoggedIn()) return;
    try {
      const res = await fetch('/api/wb/sessions', { headers: authHeaders() });
      if (!res.ok) return;
      const { data } = await res.json();
      _sessions = data || [];
    } catch (e) {}
  }

  async function switchSession(id) {
    if (id === currentSessionId) { sessionDropdown.classList.remove('show'); sessionBtn.classList.remove('open'); return; }
    // 先把当前对话存好
    clearTimeout(_saveTimer);
    await pushSession();
    // 加载新对话
    try {
      const res = await fetch(`/api/wb/sessions/${id}`, { headers: authHeaders() });
      if (!res.ok) return;
      const { data } = await res.json();
      currentSessionId = id;
      localStorage.setItem(SESSION_KEY, id);
      setSessionTitle(data.title);
      applySessionData(data);
      await loadSessionList();
      renderSessionList();
    } catch (e) {}
    sessionDropdown.classList.remove('show');
    sessionBtn.classList.remove('open');
  }

  async function newSession() {
    if (!window.Auth || !window.Auth.isLoggedIn()) return;
    clearTimeout(_saveTimer);
    await pushSession();
    try {
      const res = await fetch('/api/wb/sessions', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ title: '新对话' }),
      });
      const { data } = await res.json();
      currentSessionId = data.id;
      localStorage.setItem(SESSION_KEY, data.id);
      setSessionTitle(data.title);
      applySessionData({ shapes: [], view: { scale: 1, x: 0, y: 0 }, chatHistory: [], wrongBook: [] });
      await loadSessionList();
      renderSessionList();
    } catch (e) {}
    sessionDropdown.classList.remove('show');
    sessionBtn.classList.remove('open');
  }

  async function deleteSession(id) {
    if (_sessions.length <= 1) { alert('至少保留一个对话'); return; }
    if (!confirm('删除该对话？白板内容将一并删除，无法恢复。')) return;
    try {
      await fetch(`/api/wb/sessions/${id}`, { method: 'DELETE', headers: authHeaders() });
      await loadSessionList();
      if (id === currentSessionId) {
        // 被删的是当前对话：切到列表第一个
        const first = _sessions[0];
        if (first) await switchSession(first.id);
      } else {
        renderSessionList();
      }
    } catch (e) {}
  }

  // 对话标题自动取第一条用户提问内容
  function autoTitle(question) {
    if (currentSessionTitle !== '新对话') return;
    const t = question.trim().slice(0, 20);
    currentSessionTitle = t;
    setSessionTitle(t);
    // 立即更新列表里的 title
    _sessions = _sessions.map((s) => s.id === currentSessionId ? { ...s, title: t } : s);
  }
  // 暴露给 askTeacher 调用
  window._wbAutoTitle = autoTitle;

  // 页面关闭前保存
  window.addEventListener('beforeunload', pushSession);

  // 启动：拉取对话列表，恢复上次的对话
  async function initSessions() {
    if (!window.Auth || !window.Auth.isLoggedIn()) return;
    await loadSessionList();
    let targetId = parseInt(localStorage.getItem(SESSION_KEY), 10) || 0;
    // 上次 id 不在列表里（已删除）则取最新一条
    if (!_sessions.find((s) => s.id === targetId)) {
      targetId = _sessions.length > 0 ? _sessions[0].id : 0;
    }
    if (targetId) {
      try {
        const res = await fetch(`/api/wb/sessions/${targetId}`, { headers: authHeaders() });
        if (res.ok) {
          const { data } = await res.json();
          currentSessionId = targetId;
          localStorage.setItem(SESSION_KEY, targetId);
          setSessionTitle(data.title);
          applySessionData(data);
        }
      } catch (e) {}
    } else {
      // 新用户，没有任何对话，自动建一个
      await newSession();
    }
  }

  initSessions();
}
