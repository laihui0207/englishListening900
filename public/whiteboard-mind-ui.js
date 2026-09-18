// 思维导图交互层：把 whiteboard-mind.js 的纯函数接到白板的状态、画布和输入框上
// 通过 create(deps) 注入访问器，不挂全局、不直接持有 shapes；
// 所有写入都经 addShapes / setShapes / setSel 回到 whiteboard.js 的闭包变量
(function () {
  const MIND = window.MIND;
  const G = window.GEOM;

  const PLUS_PX = 10; // 节点旁小按钮的屏幕半径
  const DRAG_START_PX = 6; // 超过这个距离才算拖动，避免手抖把单击吃掉
  const HINT_EDIT = '输入文字后回车 · 悬停节点点 ＋ 加下一级、－ 折叠 · Tab 加子 · Enter 加同级 · 双击改文字 · Delete 删分支 · 拖节点换位置/层级 · 拖中心主题移动整图';

  function create(deps) {
    const {
      getShapes, setShapes, getSel, setSel, getView, setView,
      canvas, ctx, textInput, hint, FONT,
      addShapes, markDirty, redraw, updateConnectedArrows, undoCreate,
    } = deps;

    // ---------- 测量 ----------
    // canvas.measureText 有开销，按 字重|字号|文本 缓存
    const measureCache = new Map();
    function measureW(text, size, bold) {
      const key = `${bold ? 'b' : 'n'}|${size}|${text}`;
      const hit = measureCache.get(key);
      if (hit != null) return hit;
      ctx.save();
      ctx.font = (bold ? 'bold ' : '') + FONT(size);
      const w = ctx.measureText(text).width;
      ctx.restore();
      if (measureCache.size > 2000) measureCache.clear(); // 粗暴上限，够几百个节点反复编辑
      measureCache.set(key, w);
      return w;
    }

    // 索引按 shapes 引用缓存：不可变更新保证引用变即失效，一帧内多次查询只建一次
    let memo = { ref: null, idx: null };
    function index() {
      const shapes = getShapes();
      if (memo.ref !== shapes) memo = { ref: shapes, idx: MIND.index(shapes) };
      return memo.idx;
    }
    const nodeById = (id) => index().byId.get(id) || null;
    const depthOf = (id) => index().depth.get(id) || 0;
    const sizeFor = (s, label) => MIND.nodeSize(label, depthOf(s.id), measureW);
    // 按钮世界半径：屏幕恒定，但缩到很小时两个按钮加起来不能碰到子节点（hGap）
    const handleR = () => Math.min(PLUS_PX / getView().scale, MIND.STYLE.hGap / 6);
    const patchOne = (id, fn) => setShapes(getShapes().map((s) => (s.id === id ? fn(s) : s)));
    const patchMany = (list) => {
      const m = new Map(list.map((p) => [p.id, p]));
      setShapes(getShapes().map((s) => (m.has(s.id) ? { ...s, ...m.get(s.id), id: s.id } : s)));
    };

    // 折叠起来的节点不画、不点选、不算包围盒
    const isHidden = (id) => index().hidden.has(id);
    let visMemo = { ref: null, list: null };
    function visibleShapes() {
      const shapes = getShapes();
      if (visMemo.ref !== shapes) {
        const hidden = index().hidden;
        visMemo = { ref: shapes, list: hidden.size ? shapes.filter((s) => !hidden.has(s.id)) : shapes };
      }
      return visMemo.list;
    }

    // ---------- 重排 ----------
    // 只重算位置，不入撤销栏；调用方决定是否 markDirty
    function relayout(mapId) {
      const shapes = getShapes();
      const nodes = MIND.mapNodes(shapes, mapId);
      if (nodes.length < 2) return;
      const pos = MIND.layout(nodes);
      let changed = false;
      const next = shapes.map((s) => {
        const p = pos.get(s.id);
        if (!p || (p.x === s.x && p.y === s.y)) return s;
        changed = true;
        return { ...s, x: p.x, y: p.y };
      });
      if (!changed) return;
      setShapes(next);
      updateConnectedArrows(nodes.map((s) => s.id));
    }

    // 新节点长到视口外时最小平移视口把它露出来（深层节点一路向右生长）
    function ensureVisible(id) {
      const s = nodeById(id);
      if (!s) return;
      const view = getView();
      const vp = G.viewportBox(view, canvas.clientWidth, canvas.clientHeight);
      const pad = 24 / view.scale;
      let dx = 0, dy = 0;
      if (s.x - pad < vp.x1) dx = vp.x1 - (s.x - pad);
      else if (s.x + s.w + pad > vp.x2) dx = vp.x2 - (s.x + s.w + pad);
      if (s.y - pad < vp.y1) dy = vp.y1 - (s.y - pad);
      else if (s.y + s.h + pad > vp.y2) dy = vp.y2 - (s.y + s.h + pad);
      if (!dx && !dy) return;
      setView({ ...view, x: view.x + dx * view.scale, y: view.y + dy * view.scale });
    }

    // 节点文字变了：按新尺寸改 w/h 再重排
    function resizeToLabel(id) {
      const s = nodeById(id);
      if (!s) return;
      const { w, h } = sizeFor(s, s.label);
      if (w !== s.w || h !== s.h) patchOne(id, (x) => ({ ...x, w, h }));
      relayout(s.mapId);
    }

    // ---------- 选中组 ----------
    // 选中任一节点就把同一棵图的全部节点带上：拖动整图、整组删除都用它
    function selGroup() {
      const shapes = getShapes();
      const sel = new Set(getSel());
      const maps = new Set();
      for (const s of shapes) if (sel.has(s.id) && MIND.isNode(s)) maps.add(s.mapId);
      return shapes.filter((s) => sel.has(s.id) || (MIND.isNode(s) && maps.has(s.mapId)));
    }
    const hasMindSel = () => {
      const sel = new Set(getSel());
      return getShapes().some((s) => MIND.isNode(s) && sel.has(s.id));
    };
    // 选中节点及其整条支线（属性面板改色 / 改粗细用）
    function branchIds(ids) {
      const idx = index();
      return MIND.descendants(idx, ids.filter((id) => idx.byId.has(id)));
    }

    // ---------- 创建 ----------

    function placeRoot(at) {
      const spec = MIND.rootSpec(at, measureW);
      // 根的 mapId 就是自己的 id，拿到真实 id 后在同一次落盘里补上
      const [root] = addShapes([spec], (list) => list.map((s) => ({ ...s, mapId: s.id })));
      setSel([root.id]);
      hint.textContent = HINT_EDIT;
      redraw();
      openNodeEditor(root.id, { selectAll: true });
      return root;
    }

    function addChild(parentId, side) {
      const parent = nodeById(parentId);
      if (!parent) return null;
      // 折叠着的节点加子：先展开，不然新节点一出生就看不见
      if (parent.collapsed) patchOne(parentId, (x) => ({ ...x, collapsed: false }));
      const spec = MIND.childSpec(index(), parentId, side, measureW);
      if (!spec) return null;
      const [node] = addShapes([spec]);
      relayout(node.mapId);
      setSel([node.id]);
      ensureVisible(node.id);
      redraw();
      openNodeEditor(node.id, { isNew: true });
      return node;
    }

    function addSibling(id) {
      const plan = MIND.siblingSpec(index(), id, measureW);
      if (!plan || !plan.node) return null;
      const renum = new Map(plan.renumber.map((r) => [r.id, r.order]));
      if (renum.size) setShapes(getShapes().map((s) => (renum.has(s.id) ? { ...s, order: renum.get(s.id) } : s)));
      const [node] = addShapes([plan.node]);
      relayout(node.mapId);
      setSel([node.id]);
      ensureVisible(node.id);
      redraw();
      openNodeEditor(node.id, { isNew: true });
      return node;
    }

    // 节点朝外的一侧：根默认向右
    const outward = (s) => (s.parentId == null ? 'right' : s.side);

    // ---------- 折叠 ----------

    function toggleCollapse(id) {
      const s = nodeById(id);
      if (!s || s.parentId == null) return;
      if (!MIND.children(index(), id).length) return;
      const collapsing = !s.collapsed;
      if (collapsing) {
        // 正在编辑 / 选中的是子树里的节点：收到折叠节点上
        if (editing && MIND.descendants(index(), [id]).has(editing.id) && editing.id !== id) commitNodeEditor();
        const sub = MIND.descendants(index(), [id]);
        if (getSel().some((x) => sub.has(x) && x !== id)) setSel([id]);
      }
      patchOne(id, (x) => ({ ...x, collapsed: collapsing }));
      relayout(s.mapId);
      markDirty();
      redraw();
    }

    // ---------- 删除 ----------
    // 通用删除入口：导图节点连带整棵子树；其他图形照常。
    // 默认删完选中父节点（键盘连续操作顺手）；点选删除工具传 selectParent:false；
    // silent 表示这次删除不单独记撤销（撤回刚新建的空节点时用）
    function removeShapes(ids, opts) {
      const o = opts || {};
      const shapes = getShapes();
      const idx = MIND.index(shapes);
      const mind = ids.filter((id) => idx.byId.has(id));
      const gone = new Set([...ids, ...MIND.descendants(idx, mind)]);
      const affected = new Set(mind.map((id) => idx.byId.get(id).mapId));
      const parentId = mind.length ? idx.byId.get(mind[0]).parentId : null;
      setShapes(shapes.filter((s) => !gone.has(s.id)));
      const keep = getSel().filter((id) => !gone.has(id));
      setSel(o.selectParent !== false && parentId != null && !gone.has(parentId) ? [parentId] : keep);
      for (const mapId of affected) relayout(mapId);
      if (!o.silent) markDirty(); // 删除是离散操作，不参与合并
      if (mind.length && gone.size > 1) hint.textContent = `已删除 ${gone.size} 个节点，Ctrl+Z 可撤销`;
      redraw();
      return gone.size;
    }

    // 橡皮擦松手后：被擦掉的节点连带子树一起删，并重排受影响的图
    function afterEraser(prev) {
      const cur = new Set(getShapes().map((s) => s.id));
      const idx = MIND.index(prev);
      const erased = [...idx.byId.keys()].filter((id) => !cur.has(id));
      if (!erased.length) return;
      const gone = MIND.descendants(idx, erased);
      const affected = new Set(erased.map((id) => idx.byId.get(id).mapId));
      setShapes(getShapes().filter((s) => !gone.has(s.id)));
      setSel(getSel().filter((id) => !gone.has(id)));
      for (const mapId of affected) relayout(mapId);
    }

    // ---------- 悬停与节点旁的小按钮 ----------

    let hoverId = null;
    // 显示 ＋ / － 的节点：悬停的 + 单选的（折叠徽标则对所有折叠节点常显）
    function focusIds() {
      const ids = new Set();
      if (hoverId != null) ids.add(hoverId);
      const sel = getSel();
      if (sel.length === 1) ids.add(sel[0]);
      return ids;
    }
    // 当前可点的按钮列表，附带所属节点信息。
    // 一次 mousemove 里会被问 2~3 次（悬停判定、光标、绘制），按输入缓存
    let hMemo = { ref: null, hover: null, sel: null, scale: 0, list: null };
    function allHandles() {
      const shapes = getShapes(), sel = getSel(), scale = getView().scale;
      const m = hMemo;
      if (m.ref === shapes && m.hover === hoverId && m.sel === sel && m.scale === scale) return m.list;
      const idx = index();
      const r = handleR();
      const focus = focusIds();
      const out = [];
      for (const s of idx.byId.values()) {
        if (idx.hidden.has(s.id)) continue;
        const wantAll = focus.has(s.id);
        if (!wantAll && !s.collapsed) continue;
        for (const h of MIND.nodeHandles(s, idx, r)) {
          if (wantAll || h.kind === 'badge') out.push({ ...h, id: s.id, color: s.color, isRoot: s.parentId == null });
        }
      }
      hMemo = { ref: shapes, hover: hoverId, sel, scale, list: out };
      return out;
    }
    const handleAt = (p) => MIND.handleAt(allHandles(), p.x, p.y, handleR());

    // 点了某个按钮：＋ 加子，－ / 徽标 切换折叠
    function clickHandle(h) {
      if (h.kind === 'plus') addChild(h.id, h.side);
      else toggleCollapse(h.id);
    }

    // 返回悬停目标是否变化（变化才需要重绘）
    function updateHover(p, tol) {
      const vis = visibleShapes();
      let next = null;
      if (handleAt(p)) {
        next = hoverId; // 停在按钮上时保持
      } else {
        const i = G.hitTest(vis, p.x, p.y, tol);
        if (i >= 0 && MIND.isNode(vis[i])) next = vis[i].id;
      }
      if (next === hoverId) return false;
      hoverId = next;
      return true;
    }
    function clearHover() {
      const had = hoverId != null;
      hoverId = null;
      return had;
    }

    // ---------- 绘制 ----------

    // ---------- 拖动节点：换位置 / 换层级 ----------
    // whiteboard.js 负责鼠标事件和位移（跟整组移动同一套代码），这里只管落点与落地

    let dropState = null; // { id, target, home } 拖动中的落点，供 drawOverlay 画指示
    const canDragNode = (s) => MIND.isNode(s) && s.parentId != null;

    // 开始拖：返回要一起动的图形（整棵子树，含折叠起来的）。home 记住原框，指针还没离开原框就不算换位
    function beginDrag(id) {
      const sub = MIND.descendants(index(), [id]);
      const s = nodeById(id);
      dropState = { id, target: null, home: s ? { x: s.x, y: s.y, w: s.w, h: s.h } : null };
      return getShapes().filter((s) => sub.has(s.id));
    }

    function dragUpdate(id, p) {
      const home = dropState && dropState.home;
      // 指针仍在节点原来的框里：只是手抖，不给落点
      const target = home && MIND.distToBox(p, home) === 0 ? null : MIND.dropTarget(index(), id, p);
      dropState = { ...(dropState || { id }), target };
    }

    // 中途取消（Esc / 换会话）：只清指示，shapes 由调用方恢复
    function cancelDrag() { dropState = null; }

    // 松手：有落点且不是原位就换过去；否则恢复到拖动前的 shapes
    function endDrag(id, before) {
      const st = dropState;
      dropState = null;
      const idx = index();
      const target = st && st.target;
      if (!target || MIND.samePlace(idx, id, target)) { setShapes(before); redraw(); return false; }
      const plan = MIND.reparentPlan(idx, id, target);
      if (!plan) { setShapes(before); redraw(); return false; }
      const s = idx.byId.get(id);
      patchMany(plan);
      refitDepth(MIND.descendants(index(), [id]));
      relayout(s.mapId);
      setSel([id]);
      markDirty();
      redraw();
      return true;
    }

    // 换了层级的节点字号要跟新深度走（一级 15，更深 14），尺寸随之重算
    function refitDepth(ids) {
      const idx = index();
      const list = [];
      for (const id of ids) {
        const s = idx.byId.get(id);
        if (!s) continue;
        const d = idx.depth.get(id) || 0;
        const st = MIND.depthStyle(d);
        if (s.labelSize === st.labelSize) continue;
        list.push({ id, labelSize: st.labelSize, ...MIND.nodeSize(s.label, d, measureW) });
      }
      if (list.length) patchMany(list);
    }

    // 入边：在子节点自己的 drawShape 分支里画，主画布 / 小地图 / 导出三处循环同时生效。
    // 父节点查表走 index() 的引用缓存，一次 redraw 只建一次
    function drawEdge(c, s) {
      if (s.parentId == null) return;
      const p = index().byId.get(s.parentId);
      if (!p) return; // 孤儿不画边、不抛错
      const { a, b } = MIND.edgePoints(p, s);
      const k = MIND.edgeCtrl(a, b);
      c.beginPath();
      c.moveTo(a.x, a.y);
      c.bezierCurveTo(k.c1.x, k.c1.y, k.c2.x, k.c2.y, b.x, b.y);
      c.stroke();
    }

    const cornerR = (s) => (s.parentId == null ? s.h / 2 : Math.min(10, s.h / 2));

    // 选中态 / 悬停态覆盖层：只画在主画布，不进导出和小地图
    function drawOverlay(c) {
      const k = 1 / getView().scale;
      const shapes = getShapes();
      const sel = new Set(getSel());
      const selNodes = shapes.filter((s) => MIND.isNode(s) && sel.has(s.id));
      c.save();

      // 单选根节点：整图淡虚线外框，明示「拖动会带走整图」（拖其他节点是换位置）
      if (selNodes.length === 1 && selNodes[0].parentId == null) {
        const nodes = MIND.mapNodes(visibleShapes(), selNodes[0].mapId);
        const box = MIND.mapBox(nodes);
        if (box && nodes.length > 1) {
          c.strokeStyle = 'rgba(102,126,234,0.35)';
          c.lineWidth = 1 * k;
          c.setLineDash([4 * k, 4 * k]);
          const pad = 8 * k;
          c.strokeRect(box.x1 - pad, box.y1 - pad, box.x2 - box.x1 + pad * 2, box.y2 - box.y1 + pad * 2);
          c.setLineDash([]);
        }
      }

      for (const s of selNodes) {
        if (isHidden(s.id)) continue;
        // 选中高亮
        c.strokeStyle = '#667eea';
        c.lineWidth = 2 * k;
        const pad = 3 * k;
        c.beginPath();
        c.roundRect(s.x - pad, s.y - pad, s.w + pad * 2, s.h + pad * 2, cornerR(s) + pad);
        c.stroke();
        // 空标签占位（编辑中由输入框自己的 placeholder 显示）
        if (!s.label && !(editing && editing.id === s.id)) {
          c.fillStyle = '#8a8a9c'; // 对白底 ≥3:1，占位符也要能看清
          c.font = FONT(s.labelSize);
          c.textAlign = 'center';
          c.textBaseline = 'middle';
          c.fillText('输入…', s.x + s.w / 2, s.y + s.h / 2);
        }
      }

      for (const h of allHandles()) drawHandle(c, h, handleR(), k);
      if (dropState && dropState.target) drawDropIndicator(c, dropState.target.indicator, k);
      c.restore();
    }

    // 圆形小按钮：＋ 实心分支色白字；－ 白底分支色描边；徽标浅色底 + 后代数
    function drawHandle(c, h, r, k) {
      const color = h.isRoot ? '#667eea' : h.color;
      c.lineCap = 'round';
      c.beginPath();
      c.arc(h.x, h.y, r, 0, Math.PI * 2);
      if (h.kind === 'badge') {
        c.fillStyle = withAlpha(color, 0.18); // 浅色底：分支色 18% 透明度
        c.fill();
        c.fillStyle = color;
        // 字号跟圆半径同口径（世界单位），缩放时一起变，不会溢出圆圈
        c.font = `bold ${r * 1.1}px -apple-system, "Microsoft YaHei", sans-serif`;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(String(h.count), h.x, h.y + r * 0.05); // 数字视觉重心略高，往下挪一点
        return;
      }
      c.fillStyle = h.kind === 'plus' ? color : '#fff';
      c.fill();
      // 符号线宽约为半径的 1/5、臂长为半径的一半，在各缩放级别下比例一致
      c.strokeStyle = h.kind === 'plus' ? '#fff' : color;
      c.lineWidth = Math.max(1.5 * k, r * 0.18);
      if (h.kind === 'minus') c.stroke(); // 描边圆
      const arm = r * 0.5;
      c.beginPath();
      c.moveTo(h.x - arm, h.y); c.lineTo(h.x + arm, h.y);
      if (h.kind === 'plus') { c.moveTo(h.x, h.y - arm); c.lineTo(h.x, h.y + arm); }
      c.stroke();
    }

    // 拖动落点指示：进节点 → 目标节点粗描边；插兄弟 → 目标列上一条短横线
    function drawDropIndicator(c, ind, k) {
      c.strokeStyle = '#667eea';
      c.lineWidth = 3 * k;
      c.setLineDash([]);
      if (ind.kind === 'node') {
        const t = nodeById(ind.id);
        if (!t) return;
        const pad = 4 * k;
        c.beginPath();
        c.roundRect(t.x - pad, t.y - pad, t.w + pad * 2, t.h + pad * 2, cornerR(t) + pad);
        c.stroke();
      } else {
        c.lineCap = 'round';
        c.beginPath();
        c.moveTo(ind.x1, ind.y); c.lineTo(ind.x2, ind.y);
        c.stroke();
        c.fillStyle = '#667eea';
        c.beginPath(); c.arc(ind.x1, ind.y, 4 * k, 0, Math.PI * 2); c.fill();
        c.beginPath(); c.arc(ind.x2, ind.y, 4 * k, 0, Math.PI * 2); c.fill();
      }
    }

    // #rrggbb → rgba(...)；解析不了就退回主色
    function withAlpha(hex, a) {
      const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '');
      if (!m) return `rgba(102,126,234,${a})`;
      return `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${a})`;
    }

    // ---------- 原地编辑 ----------
    // 复用 #textInput：拿到光标和中文输入法。节点模式下加 .mm-node 覆写尺寸样式

    let editing = null; // { id, mapId, old, isNew }
    const isEditing = () => !!editing;

    function openNodeEditor(id, opts) {
      const o = opts || {};
      if (editing) commitNodeEditor();
      const s = nodeById(id);
      if (!s) return;
      editing = { id, mapId: s.mapId, old: s.label, isNew: !!o.isNew };
      textInput.classList.add('mm-node');
      textInput.value = s.label;
      textInput.style.display = 'block';
      syncNodeEditorBox();
      const focus = () => {
        if (!editing || editing.id !== id) return;
        textInput.focus();
        if (o.selectAll) textInput.select();
        else textInput.setSelectionRange(textInput.value.length, textInput.value.length);
      };
      focus();
      // 同一次 mousedown 的默认焦点转移会抢走焦点，下一轮再聚一次
      setTimeout(focus, 0);
      redraw();
    }

    // 输入框贴合节点：位置、尺寸、字号都按当前视口换算
    function syncNodeEditorBox() {
      if (!editing) return;
      const s = nodeById(editing.id);
      if (!s) { cancelNodeEditor(); return; }
      const view = getView();
      const sp = G.toScreen(view, s.x, s.y);
      const st = textInput.style;
      st.left = sp.x + 'px';
      st.top = sp.y + 'px';
      st.width = s.w * view.scale + 'px';
      st.height = s.h * view.scale + 'px';
      st.font = (s.parentId == null ? 'bold ' : '') + FONT(Math.max(12, s.labelSize * view.scale));
      st.color = s.labelColor || MIND.STYLE.textColor;
      st.borderColor = s.parentId == null ? '#667eea' : s.color;
      st.borderRadius = cornerR(s) * view.scale + 'px';
    }

    // 边打字边变宽、兄弟让位；文字本身到提交时才写回
    function onEditorInput() {
      if (!editing) return;
      const s = nodeById(editing.id);
      if (!s) return;
      const { w, h } = sizeFor(s, textInput.value);
      if (w === s.w && h === s.h) return;
      patchOne(s.id, (x) => ({ ...x, w, h }));
      relayout(s.mapId);
      ensureVisible(s.id); // 长文本把节点撑出视口时跟过去
      redraw();
      syncNodeEditorBox();
    }

    // 关输入框并清掉节点模式的内联样式，避免残留到普通文本工具
    function closeEditor() {
      const st = editing;
      editing = null;
      textInput.blur();
      textInput.classList.remove('mm-node');
      const s = textInput.style;
      s.display = 'none';
      s.width = ''; s.height = ''; s.borderColor = ''; s.borderRadius = '';
      textInput.value = '';
      return st;
    }

    function commitNodeEditor() {
      if (!editing) return;
      const text = textInput.value.trim();
      const st = closeEditor();
      const s = nodeById(st.id);
      if (!s) { redraw(); return; }
      const { w, h } = sizeFor(s, text);
      if (text !== s.label || w !== s.w || h !== s.h) {
        patchOne(s.id, (x) => ({ ...x, label: text, w, h }));
        relayout(s.mapId);
        if (text !== s.label) markDirty(); // 一次提交 = 一条撤销记录，不同节点不合并
      }
      redraw();
    }

    // 只关输入框、不碰 shapes：切换会话时用。悬停 / 落点指示一并清掉，id 在别的会话里会重号
    function abortNodeEditor() {
      if (editing) closeEditor();
      hoverId = null;
      dropState = null;
    }

    // Esc：新建的空节点直接删掉；已有节点恢复原尺寸
    function cancelNodeEditor() {
      if (!editing) return;
      const st = closeEditor();
      const s = nodeById(st.id);
      if (!s) { redraw(); return; }
      // 刚建的空节点：删掉并撤回创建那条记录，用户视角「什么都没发生」
      if (st.isNew) { removeShapes([s.id], { silent: true }); undoCreate(); return; }
      const { w, h } = sizeFor(s, s.label);
      if (w !== s.w || h !== s.h) {
        patchOne(s.id, (x) => ({ ...x, w, h }));
        relayout(s.mapId);
      }
      redraw();
    }

    // 编辑态按键（由 textInput 的 keydown 转来，输入法组合期间调用方已拦掉）
    function onEditorKey(e) {
      if (!editing) return false;
      if (e.key === 'Enter') { e.preventDefault(); commitNodeEditor(); return true; }
      if (e.key === 'Escape') { e.preventDefault(); cancelNodeEditor(); return true; }
      if (e.key === 'Tab' && !e.shiftKey) {
        e.preventDefault();
        const s = nodeById(editing.id);
        commitNodeEditor();
        if (s) addChild(s.id, outward(s));
        return true;
      }
      return false;
    }

    // 非编辑态快捷键：只在单选一个导图节点、且没按修饰键时接管
    function onKey(e) {
      if (e.ctrlKey || e.metaKey || e.altKey) return false;
      const sel = getSel();
      if (sel.length !== 1) return false;
      const s = nodeById(sel[0]);
      if (!s) return false;
      if (e.key === 'Tab' && !e.shiftKey) { e.preventDefault(); addChild(s.id, outward(s)); return true; }
      if (e.key === 'Enter') { e.preventDefault(); addSibling(s.id); return true; }
      if (e.key === 'F2') { e.preventDefault(); openNodeEditor(s.id); return true; }
      return false;
    }

    return {
      HINT_EDIT, DRAG_START_PX, measureW, relayout, resizeToLabel, ensureVisible,
      selGroup, hasMindSel, branchIds, isHidden, visibleShapes,
      placeRoot, addChild, addSibling, removeShapes, afterEraser, toggleCollapse,
      updateHover, clearHover, handleAt, clickHandle,
      canDragNode, beginDrag, dragUpdate, endDrag, cancelDrag,
      drawEdge, drawOverlay,
      isEditing, openNodeEditor, commitNodeEditor, cancelNodeEditor, abortNodeEditor,
      syncNodeEditorBox, onEditorInput, onEditorKey, onKey,
    };
  }

  window.MindmapUI = { create };
})();
