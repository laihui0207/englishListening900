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

  // 所有图形都经此落盘，id 只在这一处分配
  function addShapes(list) {
    const withIds = list.map((s) => ({ ...s, id: nextId++ }));
    shapes = [...shapes, ...withIds];
    markDirty();
    return withIds;
  }

  // 橡皮擦：pen 路径按点切割成多段，其他图形整体删除
  // 返回替换后的 shapes 数组（不直接赋值，方便调用方判断是否有变化）
  function applyEraser(p, radius) {
    let changed = false;
    const next = [];

    for (const s of shapes) {
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
        } else {
          next.push(s);
        }
      }
    }

    return changed ? next : null;
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

  // 选中数量提示 + 删除按钮的可用状态
  function updateSelInfo() {
    const n = sel.length;
    selInfo.textContent = n > 0 ? `已选中 ${n} 个` : '';
    btnDelSel.disabled = n === 0;
  }
  // 按 id 改写图形，找不到就原样返回
  const patch = (id, fn) => { shapes = shapes.map((s) => (s.id === id ? fn(s) : s)); markDirty(); };

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
        // 保持用户已调整过的尺寸，只换贴图
        patch(id, (x) => ({ ...x, img }));
        redraw();
      })
      .catch((err) => { hint.textContent = '⚠️ ' + err.message; });
  }

  function resize() {
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
    c.fillStyle = s.color;
    c.lineWidth = s.width;
    c.lineCap = 'round';
    c.lineJoin = 'round';

    if (s.type === 'pen') {
      if (!s.points || s.points.length === 0) return;
      c.beginPath();
      c.moveTo(s.points[0][0], s.points[0][1]);
      for (let i = 1; i < s.points.length; i++) c.lineTo(s.points[i][0], s.points[i][1]);
      if (s.points.length === 1) c.lineTo(s.points[0][0] + 0.1, s.points[0][1]);
      c.stroke();
    } else if (s.type === 'rect') {
      c.strokeRect(s.x, s.y, s.w, s.h);
    } else if (s.type === 'ellipse') {
      const b = G.bbox(s);
      const rx = (b.x2 - b.x1) / 2;
      const ry = (b.y2 - b.y1) / 2;
      if (rx < 0.5 || ry < 0.5) return;
      c.beginPath();
      c.ellipse(b.x1 + rx, b.y1 + ry, rx, ry, 0, 0, Math.PI * 2);
      c.stroke();
    } else if (s.type === 'line') {
      c.beginPath();
      c.moveTo(s.x, s.y);
      c.lineTo(s.x + s.w, s.y + s.h);
      c.stroke();
    } else if (s.type === 'text') {
      c.font = s.size + 'px -apple-system, "Microsoft YaHei", sans-serif';
      c.textBaseline = 'alphabetic';
      c.fillText(s.text, s.x, s.y);
    } else if (s.type === 'math') {
      const b = G.bbox(s);
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
    drawMinimap();
    zoomLabel.textContent = Math.round(view.scale * 100) + '%';
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
    const box = G.unionBox(G.bboxAll(shapes), vp);
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

  function onDown(e) {
    // 输入中再次点击画布：先提交当前文本，再按这次点击继续处理
    if (pendingText) commitText();
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
      const i = G.hitTest(shapes, p.x, p.y, tol);
      if (i >= 0) {
        const gone = shapes[i].id;
        shapes = shapes.filter((_, idx) => idx !== i);
        sel = sel.filter((id) => id !== gone);
        markDirty();
        redraw();
      }
      return;
    }

    if (tool === 'eraser') {
      drag = { mode: 'eraser', erased: false };
      eraseAt(p);
      return;
    }

    if (tool === 'text') { openTextInput(p, sp); return; }
    if (tool === 'math') { openMathInput(p, sp); return; }
    if (tool === 'plot') { openPlotInput(p); return; }

    if (tool === 'select') {
      // 手柄优先于图形本体：整组外框的角
      const box = selBox();
      const h = box && G.handleAt(box, p.x, p.y, tol);
      if (h) {
        drag = {
          mode: 'resize', handle: h, startBox: box,
          orig: selShapes(), // 快照，每次 move 都从原始状态重算，避免误差累积
        };
        return;
      }

      const i = G.hitTest(shapes, p.x, p.y, tol);
      if (i < 0) {
        // 多选时外框内部（图形之间的行距/段距/栏距）也算拖动热区。
        // 否则点在空隙上会被当成"点空白"去平移画布，整组就拖不动了
        if (!e.shiftKey && sel.length > 1 && box && G.pointInBox(box, p.x, p.y, tol)) {
          drag = { mode: 'move', px: p.x, py: p.y, orig: selShapes() };
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

      const hitId = shapes[i].id;
      if (e.shiftKey) {
        // Shift 点击：加入/移出选中集
        sel = sel.includes(hitId) ? sel.filter((id) => id !== hitId) : [...sel, hitId];
      } else if (!sel.includes(hitId)) {
        sel = [hitId]; // 点未选中的图形：换成它
      }
      // 点已选中的图形不改选中集，直接整组拖走
      if (sel.length > 0) drag = { mode: 'move', px: p.x, py: p.y, orig: selShapes() };
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
        const box = selBox();
        const h = box && G.handleAt(box, p.x, p.y, tol);
        // 光标要跟拖动热区一致：外框内部也是 move，否则看着是抓手却在移动图形
        const inGroup = sel.length > 1 && box && G.pointInBox(box, p.x, p.y, tol);
        canvas.style.cursor = h
          ? (h === 'nw' || h === 'se' ? 'nwse-resize' : 'nesw-resize')
          : (inGroup || G.hitTest(shapes, p.x, p.y, tol) >= 0 ? 'move' : 'grab');
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
      draft = draft.type === 'pen'
        ? { ...draft, points: [...draft.points, [p.x, p.y]] }
        : { ...draft, w: p.x - draft.x, h: p.y - draft.y };
    } else if (drag.mode === 'eraser') {
      eraseAt(p);
    } else if (drag.mode === 'marquee') {
      marquee = G.normBox(drag.sx, drag.sy, p.x, p.y);
      // 实时反馈选中结果，松手前就能看到会选中什么
      const inBox = G.shapesInBox(shapes, marquee).map((s) => s.id);
      sel = drag.add ? [...new Set([...drag.base, ...inBox])] : inBox;
    } else if (drag.mode === 'move') {
      // 整组平移：每个图形都从快照重算，不累积误差
      const dx = p.x - drag.px;
      const dy = p.y - drag.py;
      const moved = new Map(drag.orig.map((s) => [s.id, G.translateShape(s, dx, dy)]));
      shapes = shapes.map((s) => moved.get(s.id) || s);
    } else if (drag.mode === 'resize') {
      // 整组缩放：所有图形按同一对包围盒映射，组内相对位置保持不变
      const nb = G.applyHandle(drag.startBox, drag.handle, p.x, p.y, 4 / view.scale);
      const sized = new Map(drag.orig.map((s) => [s.id, G.resizeShape(s, drag.startBox, nb)]));
      shapes = shapes.map((s) => sized.get(s.id) || s);
    }
    redraw();
  }

  function onUp() {
    if (!drag) return;
    if (drag.mode === 'draw' && draft) {
      const b = G.bbox(draft);
      const tiny = b && (b.x2 - b.x1) < 2 && (b.y2 - b.y1) < 2;
      if (!(tiny && draft.type !== 'pen')) addShapes([draft]);
      draft = null;
    }
    if (drag.mode === 'marquee') {
      // 没拖出框（单击空白）就是清空选中集
      if (!marquee || (marquee.x2 - marquee.x1 < 2 && marquee.y2 - marquee.y1 < 2)) {
        sel = drag.add ? drag.base : [];
      }
      marquee = null;
    }
    if (drag.mode === 'eraser' && drag.erased) {
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
    if (drag.mode === 'move' || drag.mode === 'resize') markDirty();
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

  textInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); commitText(); }
    if (e.key === 'Escape') {
      pendingText = null;
      textInput.style.display = 'none';
      redraw();
    }
  });
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
      type: 'plot', exprs, xMin, xMax, yMin, yMax, color, width: 2,
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
      || e.target === plotExprs) return;
    if (e.code === 'Space') { spaceDown = true; canvas.style.cursor = 'grab'; e.preventDefault(); }
    if ((e.key === 'Delete' || e.key === 'Backspace') && sel.length > 0) {
      e.preventDefault();
      shapes = shapes.filter((s) => !isSel(s)); // 整组删除
      sel = [];
      updateSelInfo();
      markDirty();
      redraw();
    }
    if (e.key === 'Escape') { sel = []; updateSelInfo(); redraw(); }
    // Ctrl/Cmd+A 全选
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a' && tool === 'select') {
      e.preventDefault();
      sel = shapes.map((s) => s.id);
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
  });

  // 双击公式改 LaTeX：原地替换，保留位置和尺寸
  canvas.addEventListener('dblclick', (e) => {
    const p = worldPos(e);
    const i = G.hitTest(shapes, p.x, p.y, 8 / view.scale);
    if (i < 0 || shapes[i].type !== 'math') return;
    const old = shapes[i];
    const b = G.bbox(old);
    shapes = shapes.filter((_, idx) => idx !== i);
    sel = [];
    mathField.value = old.tex;
    openMathInput({ x: b.x1, y: b.y1 });
  });

  // 滚轮缩放：以指针为焦点
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const sp = screenPos(e);
    view = G.zoomAt(view, e.deltaY < 0 ? 1.1 : 1 / 1.1, sp.x, sp.y);
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
    if (ttsMuted) return;
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
    const box = G.bboxAll(shapes);
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
      parts.push(b.type === 'formula' ? b.tex : b.text);
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
        body: JSON.stringify({ question, history: chatHistory }),
      });
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
    line: '拖拽画直线',
    text: '点击画布位置后输入文字，回车确认，Esc 取消',
    math: '点击画布位置后输入 LaTeX 公式；已有公式双击可改',
    erase: '点击某个图形即可单独删除它',
    eraser: '拖动擦除：画笔路径按点切割，其他图形整体删除',
  };

  // select 下默认抓手：空白处按住就能拖画布
  const cursorFor = (t) => (t === 'select' ? 'grab' : t === 'erase' ? 'pointer' : t === 'eraser' ? 'none' : 'crosshair');

  document.querySelectorAll('[data-tool]').forEach((btn) => {
    btn.addEventListener('click', () => {
      tool = btn.dataset.tool;
      if (tool !== 'select') { sel = []; updateSelInfo(); }
      // 切换离橡皮工具时清除预览圆
      if (tool !== 'eraser') { eraserPos = null; }
      document.querySelectorAll('[data-tool]').forEach((b) => b.classList.toggle('active', b === btn));
      hint.textContent = HINTS[tool] || '';
      canvas.style.cursor = cursorFor(tool);
      redraw();
    });
  });

  document.getElementById('colorPick').addEventListener('input', (e) => {
    color = e.target.value;
    // 有选中就整组改色，比逐个重画省事
    if (sel.length > 0) {
      const ids = selShapes().filter((s) => s.type === 'math').map((s) => s.id);
      shapes = shapes.map((s) => (isSel(s) ? { ...s, color } : s));
      // 公式颜色烧在 SVG 里，改属性不够，得重新渲染贴图
      for (const id of ids) reRenderMath(id);
      markDirty();
      redraw();
    }
  });
  document.getElementById('widthPick').addEventListener('input', (e) => {
    width = Number(e.target.value);
    if (sel.length > 0) {
      shapes = shapes.map((s) => (isSel(s) ? { ...s, width } : s));
      markDirty();
      redraw();
    }
  });

  document.getElementById('btnUndo').addEventListener('click', () => {
    shapes = shapes.slice(0, -1);
    sel = [];
    updateSelInfo();
    redraw();
  });

  btnDelSel.addEventListener('click', () => {
    if (sel.length === 0) return;
    shapes = shapes.filter((s) => !isSel(s));
    sel = [];
    updateSelInfo();
    markDirty();
    redraw();
  });

  document.getElementById('btnClear').addEventListener('click', () => {
    if (shapes.length === 0) return;
    if (!confirm('清空整个白板？此操作无法撤回。')) return;
    shapes = [];
    sel = [];
    updateSelInfo();
    markDirty();
    redraw();
  });

  document.getElementById('btnFit').addEventListener('click', () => {
    const box = G.bboxAll(shapes);
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
    // 导出只含内容，不带视口空白
    const box = G.bboxAll(shapes);
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

  // 把当前白板内容写入 session
  let _saveTimer = null;
  function markDirty() {
    if (!window.Auth || !window.Auth.isLoggedIn() || !currentSessionId) return;
    clearTimeout(_saveTimer);
    _saveTimer = setTimeout(pushSession, 1500);
  }

  async function pushSession() {
    if (!window.Auth || !window.Auth.isLoggedIn() || !currentSessionId) return;
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
    shapes = Array.isArray(data.shapes) ? data.shapes : [];
    nextId = shapes.reduce((m, s) => Math.max(m, s.id || 0), 0) + 1;
    view = (data.view && typeof data.view.scale === 'number') ? data.view : { scale: 1, x: 0, y: 0 };

    // 重建 math 图像（直接赋值，不经 patch，避免触发 markDirty）
    for (const s of shapes) {
      if (s.type === 'math' && s.tex) {
        renderMath(s.tex, s.color, s.width / 3)
          .then(({ img }) => { shapes = shapes.map((x) => (x.id === s.id ? { ...x, img } : x)); redraw(); })
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
