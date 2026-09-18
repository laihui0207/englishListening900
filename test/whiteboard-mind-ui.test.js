// 思维导图交互层自检：用桩对象替代 DOM / canvas，在 node 下驱动 MindmapUI
const assert = require('assert');

// -------- 桩：模拟浏览器全局 --------
const MIND = require('../public/whiteboard-mind');
const M = MIND;
const G = require('../public/whiteboard-geom');
global.window = { MIND, GEOM: G };
require('../public/whiteboard-mind-ui');
const { create } = global.window.MindmapUI;

function makeHarness() {
  let shapes = [];
  let sel = [];
  let view = { scale: 1, x: 0, y: 0 };
  let nextId = 1;
  const calls = { markDirty: 0, redraw: 0, undoCreate: 0, arrows: 0 };
  const textInput = {
    value: '', style: {}, _classes: new Set(),
    classList: {
      add(c) { textInput._classes.add(c); },
      remove(c) { textInput._classes.delete(c); },
      contains(c) { return textInput._classes.has(c); },
    },
    focus() { textInput.focused = true; }, blur() { textInput.focused = false; },
    select() { textInput.selected = true; }, setSelectionRange() {},
  };
  const ctx = { save() {}, restore() {}, font: '', measureText: (t) => ({ width: t.length * 10 }) };
  const ui = create({
    getShapes: () => shapes, setShapes: (v) => { shapes = v; },
    getSel: () => sel, setSel: (v) => { sel = v; },
    getView: () => view, setView: (v) => { view = v; },
    canvas: { clientWidth: 1000, clientHeight: 600 },
    ctx, textInput, hint: { textContent: '' }, FONT: (s) => `${s}px x`,
    addShapes: (list, link) => {
      let withIds = list.map((s) => ({ ...s, id: nextId++ }));
      if (link) withIds = link(withIds);
      shapes = [...shapes, ...withIds];
      calls.markDirty++;
      return withIds;
    },
    markDirty: () => { calls.markDirty++; },
    redraw: () => { calls.redraw++; },
    updateConnectedArrows: () => { calls.arrows++; },
    undoCreate: () => { calls.undoCreate++; },
  });
  return {
    ui, textInput, calls,
    get shapes() { return shapes; }, get sel() { return sel; }, get view() { return view; },
    setView(v) { view = v; },
    setShapes(v) { shapes = v; },
    setSel(v) { sel = v; },
    byId: (id) => shapes.find((s) => s.id === id),
  };
}
const key = (k, extra) => ({ key: k, preventDefault() { this.prevented = true; }, ...(extra || {}) });

// -------- placeRoot：根的 mapId = 自己的 id，进入编辑并全选 --------
{
  const h = makeHarness();
  const root = h.ui.placeRoot({ x: 300, y: 200 });
  assert.strictEqual(root.mapId, root.id);
  assert.strictEqual(root.parentId, null);
  assert.deepStrictEqual(h.sel, [root.id]);
  assert.ok(h.ui.isEditing(), '放根后进入编辑');
  assert.strictEqual(h.textInput.value, '中心主题');
  assert.ok(h.textInput.selected, '默认文字全选');
  assert.ok(h.textInput.classList.contains('mm-node'));
  assert.strictEqual(h.textInput.style.width, '120px');
  assert.strictEqual(h.textInput.style.height, '46px');
  assert.ok(/bold/.test(h.textInput.style.font), '根节点编辑框粗体');
}

// -------- 编辑提交：只写一次 label、清理内联样式、不重复 markDirty --------
{
  const h = makeHarness();
  const root = h.ui.placeRoot({ x: 300, y: 200 });
  const before = h.calls.markDirty;
  h.textInput.value = '数学';
  h.ui.onEditorInput(); // 输入过程不落撤销
  assert.strictEqual(h.calls.markDirty, before, '输入过程不 markDirty');
  h.ui.commitNodeEditor();
  assert.strictEqual(h.byId(root.id).label, '数学');
  assert.strictEqual(h.calls.markDirty, before + 1, '提交记一条');
  assert.ok(!h.ui.isEditing());
  assert.ok(!h.textInput.classList.contains('mm-node'), '节点模式 class 已清');
  assert.strictEqual(h.textInput.style.display, 'none');
  assert.strictEqual(h.textInput.style.width, '', '内联宽度已清');
  assert.strictEqual(h.textInput.style.borderColor, '', '边框色已清');
  // 再提交一次是空操作
  h.ui.commitNodeEditor();
  assert.strictEqual(h.calls.markDirty, before + 1, '无编辑态时提交不动状态');
  // 文字没变时提交不记撤销
  h.ui.openNodeEditor(root.id);
  h.ui.commitNodeEditor();
  assert.strictEqual(h.calls.markDirty, before + 1, '文字未变不 markDirty');
}

// -------- addChild / addSibling：左右侧、颜色、布局、进入编辑 --------
{
  const h = makeHarness();
  const root = h.ui.placeRoot({ x: 300, y: 200 });
  h.ui.commitNodeEditor();
  const a = h.ui.addChild(root.id, 'right');
  assert.ok(h.ui.isEditing() && h.textInput.value === '', '新子节点进入空编辑');
  h.textInput.value = 'A'; h.ui.commitNodeEditor();
  const b = h.ui.addChild(root.id, 'left');
  h.textInput.value = 'B'; h.ui.commitNodeEditor();
  const A = h.byId(a.id), B = h.byId(b.id), R = h.byId(root.id);
  assert.strictEqual(A.side, 'right'); assert.strictEqual(B.side, 'left');
  assert.ok(A.x > R.x + R.w, '右子在根右侧');
  assert.ok(B.x + B.w < R.x, '左子在根左侧');
  assert.notStrictEqual(A.color, B.color, '一级分支颜色不同');
  assert.strictEqual(R.x, 300 - R.w / 2, '根不动');
  // 多选时 Tab 不接管
  h.setSel([A.id, B.id]);
  assert.strictEqual(h.ui.onKey(key('Tab')), false, '多选时不加子');
  assert.strictEqual(h.shapes.length, 3);
  // 选中 A 后 Tab：加 A 的子，继承 A 的颜色和 side
  h.setSel([A.id]);
  assert.strictEqual(h.ui.onKey(key('Tab')), true);
  const c2 = h.shapes[h.shapes.length - 1];
  assert.strictEqual(c2.parentId, A.id);
  h.textInput.value = 'C'; h.ui.commitNodeEditor();
  const C = h.byId(c2.id);
  assert.strictEqual(C.side, 'right'); assert.strictEqual(C.color, A.color, '二级继承父色');
  assert.ok(C.x > A.x + A.w, '二级在一级右侧');
  // A 应垂直居中于其唯一子节点 C
  const A2 = h.byId(a.id);
  assert.ok(Math.abs((A2.y + A2.h / 2) - (C.y + C.h / 2)) < 1e-6, '单子时父子同高');
  // addSibling：C 的兄弟同侧同色，且 A 重新居中于两子
  const d = h.ui.addSibling(C.id);
  h.textInput.value = 'D'; h.ui.commitNodeEditor();
  const D = h.byId(d.id), C3 = h.byId(c2.id), A3 = h.byId(a.id);
  assert.strictEqual(D.parentId, A.id); assert.strictEqual(D.color, A.color);
  assert.ok(D.y > C3.y, '兄弟在下方');
  assert.ok(Math.abs((A3.y + A3.h / 2) - (C3.y + D.y + D.h) / 2) < 1e-6, '父居中于首尾子');
  assert.ok(h.calls.arrows > 0, '重排后通知外部箭头跟随');
}

// -------- removeShapes：级联、sel 落到父、silent 不记撤销 --------
{
  const h = makeHarness();
  const root = h.ui.placeRoot({ x: 300, y: 200 }); h.ui.commitNodeEditor();
  const a = h.ui.addChild(root.id, 'right'); h.textInput.value = 'A'; h.ui.commitNodeEditor();
  const c = h.ui.addChild(a.id); h.textInput.value = 'C'; h.ui.commitNodeEditor();
  const d = h.ui.addChild(c.id); h.textInput.value = 'D'; h.ui.commitNodeEditor();
  const e = h.ui.addChild(root.id, 'right'); h.textInput.value = 'E'; h.ui.commitNodeEditor();
  assert.strictEqual(h.shapes.length, 5);
  const before = h.calls.markDirty;
  const gone = h.ui.removeShapes([a.id]);
  assert.strictEqual(gone, 3, '删 A 连带 C、D');
  assert.deepStrictEqual(h.shapes.map((s) => s.id).sort(), [root.id, e.id].sort());
  assert.deepStrictEqual(h.sel, [root.id], '删后选中父');
  assert.strictEqual(h.calls.markDirty, before + 1);
  // E 重排到根中心
  const E = h.byId(e.id), R = h.byId(root.id);
  assert.ok(Math.abs((E.y + E.h / 2) - (R.y + R.h / 2)) < 1e-6, '剩余独子与根同高');
  // selectParent:false 保留其余选中
  h.ui.removeShapes([e.id], { selectParent: false });
  assert.deepStrictEqual(h.sel, [root.id].filter((id) => id !== e.id));
  // silent
  const b2 = h.calls.markDirty;
  h.ui.removeShapes([root.id], { silent: true });
  assert.strictEqual(h.shapes.length, 0);
  assert.strictEqual(h.calls.markDirty, b2, 'silent 不记撤销');
  // 删不存在的 id 不抛
  assert.strictEqual(h.ui.removeShapes([999]), 1);
}

// -------- cancelNodeEditor：新节点 Esc 删除并撤回创建；旧节点恢复尺寸 --------
{
  const h = makeHarness();
  const root = h.ui.placeRoot({ x: 300, y: 200 }); h.ui.commitNodeEditor();
  const a = h.ui.addChild(root.id, 'right');
  assert.ok(h.ui.isEditing());
  h.ui.onEditorKey(key('Escape'));
  assert.ok(!h.byId(a.id), '新建空节点 Esc 后删除');
  assert.strictEqual(h.calls.undoCreate, 1, '同时撤回创建记录');
  assert.deepStrictEqual(h.sel, [root.id]);
  // 已有节点：打字撑宽后 Esc 恢复
  const b = h.ui.addChild(root.id, 'right'); h.textInput.value = 'B'; h.ui.commitNodeEditor();
  const w0 = h.byId(b.id).w;
  h.ui.openNodeEditor(b.id);
  h.textInput.value = 'B'.repeat(20); h.ui.onEditorInput();
  assert.ok(h.byId(b.id).w > w0, '输入中节点变宽');
  h.ui.onEditorKey(key('Escape'));
  assert.strictEqual(h.byId(b.id).w, w0, 'Esc 恢复原宽');
  assert.strictEqual(h.byId(b.id).label, 'B');
  assert.strictEqual(h.calls.undoCreate, 1, '旧节点取消不撤回创建');
}

// -------- 编辑态 Tab：提交后给当前节点加子（不是父） --------
{
  const h = makeHarness();
  const root = h.ui.placeRoot({ x: 300, y: 200 }); h.ui.commitNodeEditor();
  const a = h.ui.addChild(root.id, 'left');
  h.textInput.value = 'A';
  const ev = key('Tab');
  assert.strictEqual(h.ui.onEditorKey(ev), true);
  assert.ok(ev.prevented, 'Tab 必须 preventDefault');
  assert.strictEqual(h.byId(a.id).label, 'A', 'Tab 先提交');
  const kid = h.shapes[h.shapes.length - 1];
  assert.strictEqual(kid.parentId, a.id, 'Tab 给当前节点加子');
  assert.strictEqual(kid.side, 'left', '继承左侧');
  assert.ok(h.ui.isEditing() && h.textInput.value === '');
  // Shift+Tab 不接管
  assert.strictEqual(h.ui.onEditorKey(key('Tab', { shiftKey: true })), false);
  // Enter 只提交
  h.textInput.value = 'K';
  assert.strictEqual(h.ui.onEditorKey(key('Enter')), true);
  assert.ok(!h.ui.isEditing());
  assert.strictEqual(h.shapes.length, 3, 'Enter 不建同级');
}

// -------- onKey：修饰键放行；单选才接管 --------
{
  const h = makeHarness();
  const root = h.ui.placeRoot({ x: 300, y: 200 }); h.ui.commitNodeEditor();
  assert.strictEqual(h.ui.onKey(key('Tab', { ctrlKey: true })), false, 'Ctrl+Tab 放行');
  assert.strictEqual(h.ui.onKey(key('Enter', { metaKey: true })), false);
  assert.strictEqual(h.ui.onKey(key('x')), false, '其他键放行');
  assert.strictEqual(h.ui.onKey(key('Tab')), true, '单选根时 Tab 接管');
  h.ui.commitNodeEditor();
  assert.strictEqual(h.shapes.length, 2);
  assert.strictEqual(h.ui.onKey(key('Enter')), true, '选中新子节点后 Enter 加同级');
  h.ui.commitNodeEditor();
  assert.strictEqual(h.shapes.length, 3);
  assert.strictEqual(h.ui.onKey(key('F2')), true);
  assert.ok(h.ui.isEditing());
  h.ui.commitNodeEditor();
}

// -------- selGroup / hasMindSel / branchIds --------
{
  const h = makeHarness();
  const root = h.ui.placeRoot({ x: 300, y: 200 }); h.ui.commitNodeEditor();
  const a = h.ui.addChild(root.id, 'right'); h.ui.commitNodeEditor();
  const c = h.ui.addChild(a.id); h.ui.commitNodeEditor();
  assert.deepStrictEqual(h.sel, [c.id], '新建后选中新节点');
  assert.strictEqual(h.ui.selGroup().length, 3, '选一个节点带出整图');
  assert.ok(h.ui.hasMindSel());
  assert.deepStrictEqual([...h.ui.branchIds([a.id])].sort(), [a.id, c.id].sort(), '支线 = 节点 + 后代');
  assert.deepStrictEqual([...h.ui.branchIds([999])], [], '不存在的 id 忽略');
}

// -------- afterEraser：被擦父节点带走子树，其余重排，sel 清理 --------
{
  const h = makeHarness();
  const root = h.ui.placeRoot({ x: 300, y: 200 }); h.ui.commitNodeEditor();
  const a = h.ui.addChild(root.id, 'right'); h.ui.commitNodeEditor();
  const c = h.ui.addChild(a.id); h.ui.commitNodeEditor();
  const e = h.ui.addChild(root.id, 'right'); h.ui.commitNodeEditor();
  const prev = h.shapes;
  // 模拟橡皮擦只碰到了 A（applyEraser 按单个包围盒删，C 会暂时成为孤儿）
  h.setShapes(prev.filter((s) => s.id !== a.id));
  h.setSel([c.id, e.id]);
  h.ui.afterEraser(prev);
  assert.ok(!h.byId(c.id), 'C 随 A 一起删除');
  assert.ok(h.byId(e.id) && h.byId(root.id), '其余保留');
  assert.deepStrictEqual(h.sel, [e.id], 'sel 里的孤儿被清掉');
  const E = h.byId(e.id), R = h.byId(root.id);
  assert.ok(Math.abs((E.y + E.h / 2) - (R.y + R.h / 2)) < 1e-6, '剩余节点已重排到根中心');
  // 什么都没擦到：无变化
  const snap = h.shapes;
  h.ui.afterEraser(snap);
  assert.strictEqual(h.shapes, snap, '无导图节点被擦时 shapes 引用不变');
}

// -------- ensureVisible：节点在视口外时平移视口 --------
{
  const h = makeHarness();
  const root = h.ui.placeRoot({ x: 950, y: 300 }); h.ui.commitNodeEditor();
  const a = h.ui.addChild(root.id, 'right'); // x ≈ 950+60+64 = 1074 > 1000
  h.ui.commitNodeEditor();
  const A = h.byId(a.id);
  const vp = G.viewportBox(h.view, 1000, 600);
  assert.ok(A.x + A.w <= vp.x2, `新子节点在视口内：${A.x + A.w} <= ${vp.x2}`);
  assert.ok(h.view.x < 0, '视口向左平移了');
}

// -------- handleAt / clickHandle / updateHover --------
{
  const h = makeHarness();
  const root = h.ui.placeRoot({ x: 300, y: 200 }); h.ui.commitNodeEditor();
  const R = h.byId(root.id);
  // 单选根：右按钮圆心 = 右缘 + 14
  const right = h.ui.handleAt({ x: R.x + R.w + 14, y: R.y + R.h / 2 });
  assert.deepStrictEqual([right.id, right.kind, right.side], [root.id, 'plus', 'right']);
  const left = h.ui.handleAt({ x: R.x - 14, y: R.y + R.h / 2 });
  assert.deepStrictEqual([left.id, left.kind, left.side], [root.id, 'plus', 'left']);
  assert.strictEqual(h.ui.handleAt({ x: R.x + R.w / 2, y: R.y + R.h / 2 }), null, '节点内部不是按钮');
  // 点 ＋ 加子
  h.ui.clickHandle(right);
  assert.ok(h.ui.isEditing());
  h.textInput.value = 'A'; h.ui.commitNodeEditor();
  assert.strictEqual(h.shapes.length, 2);
  // 悬停：移到节点上返回 true（变化），再移一次返回 false
  h.setSel([]);
  assert.strictEqual(h.ui.updateHover({ x: R.x + 5, y: R.y + 5 }, 8), true, '进入节点');
  assert.strictEqual(h.ui.updateHover({ x: R.x + 6, y: R.y + 6 }, 8), false, '同一目标不重绘');
  // 停在悬停节点的把手上：保持悬停不变
  assert.strictEqual(h.ui.updateHover({ x: R.x + R.w + 14, y: R.y + R.h / 2 }, 8), false, '把手上保持');
  assert.strictEqual(h.ui.updateHover({ x: -999, y: -999 }, 8), true, '离开节点');
  assert.strictEqual(h.ui.clearHover(), false, '已无悬停');
  // 缩小到极限时按钮半径受层间距约束
  h.setView({ scale: 0.1, x: 0, y: 0 });
  h.setSel([root.id]);
  const far = h.ui.handleAt({ x: R.x + R.w + 100, y: R.y + R.h / 2 });
  assert.strictEqual(far, null, '缩放很小时按钮不会大到 100px 外还命中');
}

// -------- 折叠：toggleCollapse / 徽标 / 可见集合 / addChild 自动展开 --------
{
  const h = makeHarness();
  const root = h.ui.placeRoot({ x: 300, y: 200 }); h.ui.commitNodeEditor();
  const a = h.ui.addChild(root.id, 'right'); h.textInput.value = 'A'; h.ui.commitNodeEditor();
  const c = h.ui.addChild(a.id); h.textInput.value = 'C'; h.ui.commitNodeEditor();
  const d = h.ui.addChild(c.id); h.textInput.value = 'D'; h.ui.commitNodeEditor();
  const b = h.ui.addChild(root.id, 'right'); h.textInput.value = 'B'; h.ui.commitNodeEditor();
  const A = h.byId(a.id);
  // 有子节点的 A：悬停时显示 － 和 ＋
  h.setSel([a.id]);
  const minus = h.ui.handleAt({ x: A.x + A.w + 14, y: A.y + A.h / 2 });
  assert.strictEqual(minus && minus.kind, 'minus', '有子节点的节点第一个按钮是 －');
  const plus = h.ui.handleAt({ x: A.x + A.w + 14 + 26, y: A.y + A.h / 2 });
  assert.strictEqual(plus && plus.kind, 'plus');
  // 选中 D 时点 A 的 －：折叠，选中收到 A
  h.setSel([d.id]);
  const before = h.calls.markDirty;
  h.ui.toggleCollapse(a.id);
  assert.strictEqual(h.byId(a.id).collapsed, true);
  assert.ok(h.ui.isHidden(c.id) && h.ui.isHidden(d.id), 'C、D 隐藏');
  assert.ok(!h.ui.isHidden(a.id) && !h.ui.isHidden(b.id));
  assert.deepStrictEqual(h.sel, [a.id], '选中收到折叠节点');
  assert.strictEqual(h.calls.markDirty, before + 1, '折叠记一条撤销');
  assert.strictEqual(h.ui.visibleShapes().length, 3, '可见 3 个');
  // 徽标常显，不用悬停 / 选中
  h.setSel([]);
  const A2 = h.byId(a.id);
  const badge = h.ui.handleAt({ x: A2.x + A2.w + 14, y: A2.y + A2.h / 2 });
  assert.strictEqual(badge && badge.kind, 'badge');
  assert.strictEqual(badge.count, 2, '徽标数 = 被折叠的后代数');
  // 折叠后 A、B 围绕根居中
  const R = h.byId(root.id), B = h.byId(b.id);
  assert.ok(Math.abs((A2.y + B.y + B.h) / 2 - (R.y + R.h / 2)) < 1e-6, '折叠后一级节点重排');
  // 隐藏节点收在 A 的位置
  assert.deepStrictEqual([h.byId(c.id).x, h.byId(c.id).y], [A2.x, A2.y]);
  // 悬停不会落到隐藏节点上
  assert.strictEqual(h.ui.updateHover({ x: A2.x + 5, y: A2.y + 5 }, 8), true);
  // 点徽标展开
  h.ui.clickHandle(badge);
  assert.strictEqual(h.byId(a.id).collapsed, false);
  assert.strictEqual(h.ui.visibleShapes().length, 5);
  // 折叠后 Tab 加子：先自动展开
  h.ui.toggleCollapse(a.id);
  h.setSel([a.id]);
  h.ui.onKey(key('Tab'));
  assert.strictEqual(h.byId(a.id).collapsed, false, '给折叠节点加子会先展开');
  assert.ok(h.ui.isEditing());
  h.ui.onEditorKey(key('Escape'));
  // 根 / 叶子不能折叠
  h.ui.toggleCollapse(root.id);
  assert.ok(!h.byId(root.id).collapsed, '根不折叠');
  h.ui.toggleCollapse(b.id);
  assert.ok(!h.byId(b.id).collapsed, '叶子不折叠');
  // 编辑折叠子树里的节点时折叠：先提交
  h.ui.openNodeEditor(d.id);
  h.textInput.value = 'D2';
  h.ui.toggleCollapse(a.id);
  assert.ok(!h.ui.isEditing());
  assert.strictEqual(h.byId(d.id).label, 'D2', '折叠前提交了编辑');
  // 删除折叠节点连带隐藏后代
  h.ui.removeShapes([a.id]);
  assert.strictEqual(h.shapes.length, 2);
}

// -------- 拖动节点：beginDrag / dragUpdate / endDrag --------
{
  const h = makeHarness();
  const root = h.ui.placeRoot({ x: 300, y: 200 }); h.ui.commitNodeEditor();
  const a = h.ui.addChild(root.id, 'right'); h.textInput.value = 'A'; h.ui.commitNodeEditor();
  const b = h.ui.addChild(root.id, 'right'); h.textInput.value = 'B'; h.ui.commitNodeEditor();
  const c = h.ui.addChild(a.id); h.textInput.value = 'C'; h.ui.commitNodeEditor();
  const l = h.ui.addChild(root.id, 'left'); h.textInput.value = 'L'; h.ui.commitNodeEditor();
  const center = (s) => ({ x: s.x + s.w / 2, y: s.y + s.h / 2 });

  assert.ok(h.ui.canDragNode(h.byId(a.id)));
  assert.ok(!h.ui.canDragNode(h.byId(root.id)), '根不能拖');
  assert.ok(!h.ui.canDragNode({ type: 'rect' }));

  // 拖 A（带 C）到 B 里：A 成为 B 的子，C 跟着，颜色跟 B，字号按新深度
  const orig = h.ui.beginDrag(a.id);
  assert.deepStrictEqual(orig.map((s) => s.id).sort(), [a.id, c.id].sort(), '整棵子树一起动');
  const before = h.shapes;
  h.ui.dragUpdate(a.id, center(h.byId(b.id)));
  const md = h.calls.markDirty;
  const applied = h.ui.endDrag(a.id, before);
  assert.strictEqual(applied, true);
  const A = h.byId(a.id), C = h.byId(c.id), B = h.byId(b.id);
  assert.strictEqual(A.parentId, b.id);
  assert.strictEqual(A.color, B.color); assert.strictEqual(C.color, B.color);
  assert.strictEqual(A.labelSize, 14, '一级变二级字号 15 → 14');
  assert.ok(A.x > B.x + B.w && C.x > A.x + A.w, '重排到 B 右侧');
  assert.deepStrictEqual(h.sel, [a.id]);
  assert.strictEqual(h.calls.markDirty, md + 1, '落地记一条撤销');

  // 拖到空处：恢复拖动前状态，不记撤销
  const before2 = h.shapes;
  h.ui.beginDrag(c.id);
  h.ui.dragUpdate(c.id, { x: 9000, y: 9000 });
  assert.strictEqual(h.ui.endDrag(c.id, before2), false);
  assert.strictEqual(h.shapes, before2, '恢复到 before 引用');
  assert.strictEqual(h.calls.markDirty, md + 1);

  // 指针没离开节点原来的框（手抖）：不给落点，恢复原状
  const before3 = h.shapes;
  const An = h.byId(a.id);
  h.ui.beginDrag(a.id);
  h.ui.dragUpdate(a.id, { x: An.x + An.w - 2, y: An.y + An.h - 2 });
  assert.strictEqual(h.ui.endDrag(a.id, before3), false, '仍在原框内 → 不换位');
  assert.strictEqual(h.shapes, before3);

  // 真实路径：子树先被平移（onMove 会写回 shapes），再松手落地 → 位置必须被 relayout 收回
  const before3b = h.shapes;
  const sub = h.ui.beginDrag(a.id);
  const target = h.byId(root.id); // 拖进根的右半边 → 成为根右侧末尾子节点
  const dx = 500, dy = 300;
  const moved = new Map(sub.map((s) => [s.id, { ...s, x: s.x + dx, y: s.y + dy }]));
  h.setShapes(h.shapes.map((s) => moved.get(s.id) || s));
  h.ui.dragUpdate(a.id, { x: target.x + target.w - 5, y: target.y + 5 });
  assert.strictEqual(h.ui.endDrag(a.id, before3b), true);
  const expect = M.layout(M.mapNodes(h.shapes, root.id));
  for (const [id, p] of expect) {
    const s = h.byId(id);
    assert.ok(Math.abs(s.x - p.x) < 1e-6 && Math.abs(s.y - p.y) < 1e-6, `落地后节点 ${id} 回到布局位置`);
  }
  assert.strictEqual(h.byId(a.id).parentId, root.id);
  assert.strictEqual(h.byId(a.id).labelSize, 15, '二级升回一级字号 14 → 15');
  assert.strictEqual(h.byId(c.id).labelSize, 14);
  assert.notStrictEqual(h.byId(a.id).color, h.byId(b.id).color, '升到根下领了新色');

  // 拖到折叠节点上 → 目标自动展开，hidden 集合正确
  h.ui.toggleCollapse(b.id === undefined ? a.id : b.id); // B 没有子节点时不会折叠；确保 B 有子：把 L 挂到 B 下
  const before3c = h.shapes;
  h.ui.beginDrag(l.id);
  const Bt = h.byId(b.id);
  h.ui.dragUpdate(l.id, { x: Bt.x + 5, y: Bt.y + 5 });
  assert.strictEqual(h.ui.endDrag(l.id, before3c), true);
  assert.strictEqual(h.byId(l.id).parentId, b.id);
  h.ui.toggleCollapse(b.id);
  assert.ok(h.ui.isHidden(l.id), 'B 折叠后 L 隐藏');
  const before3d = h.shapes;
  h.ui.beginDrag(c.id);
  const Bt2 = h.byId(b.id);
  h.ui.dragUpdate(c.id, { x: Bt2.x + 5, y: Bt2.y + 5 });
  assert.strictEqual(h.ui.endDrag(c.id, before3d), true);
  assert.strictEqual(h.byId(b.id).collapsed, false, '拖到折叠节点上自动展开');
  assert.ok(!h.ui.isHidden(l.id) && !h.ui.isHidden(c.id));
  assert.strictEqual(h.byId(c.id).parentId, b.id);
  // 把 L 拖回根左侧，后续用例依赖它在左侧
  const before3e = h.shapes;
  h.ui.beginDrag(l.id);
  const Rt = h.byId(root.id);
  h.ui.dragUpdate(l.id, { x: Rt.x + 5, y: Rt.y + 5 });
  assert.strictEqual(h.ui.endDrag(l.id, before3e), true);
  assert.strictEqual(h.byId(l.id).side, 'left');

  // 把 L（左）拖到 B 上方 → 变成根右侧、排在 B 前面，side 改 right，同父换侧颜色保留
  const Lc = h.byId(l.id).color;
  const before4 = h.shapes;
  h.ui.beginDrag(l.id);
  const B4 = h.byId(b.id);
  h.ui.dragUpdate(l.id, { x: B4.x + 5, y: B4.y - 6 });
  assert.strictEqual(h.ui.endDrag(l.id, before4), true);
  const L = h.byId(l.id);
  assert.strictEqual(L.side, 'right'); assert.strictEqual(L.parentId, root.id);
  assert.strictEqual(L.color, Lc, '同父换侧保留颜色');
  assert.ok(L.x > h.byId(root.id).x, '在根右侧');
  assert.ok(L.y < h.byId(b.id).y, 'L 排在 B 上方');
  assert.strictEqual(L.labelSize, 15, '仍是一级');

  // cancelDrag 只清指示
  h.ui.beginDrag(l.id);
  h.ui.dragUpdate(l.id, { x: B4.x + 5, y: B4.y + 5 });
  h.ui.cancelDrag();
  assert.strictEqual(h.ui.endDrag(l.id, h.shapes), false, '取消后 endDrag 无落点');
}

// -------- abortNodeEditor：只关框不写数据 --------
{
  const h = makeHarness();
  const root = h.ui.placeRoot({ x: 300, y: 200 });
  h.textInput.value = '改了';
  const before = h.calls.markDirty;
  h.ui.abortNodeEditor();
  assert.ok(!h.ui.isEditing());
  assert.strictEqual(h.byId(root.id).label, '中心主题', '未提交');
  assert.strictEqual(h.calls.markDirty, before);
  assert.strictEqual(h.textInput.style.display, 'none');
}

console.log('whiteboard-mind-ui: all assertions passed');
