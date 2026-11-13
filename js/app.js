import * as db from './db.js';
import { seed } from './seed.js';
import { render, listHtml, visibleDishes, cartCount, MEALS } from './views.js';
import { parseIngredientLine, ingredientToLine } from './shopping.js';
import { compressCover } from './image.js';
import { buildExport, importBackup } from './backup.js';

const $ = (s) => document.querySelector(s);
const root = $('#app');

const S = {
  tab: 'home', cat: '全部', q: '', cart: {}, dishes: [], orders: [], cats: [], counts: {},
  coverUrls: new Map(), page: null, orderOpen: null, view: 'buy', sheet: null,
  meal: defaultMeal(), note: '', fatal: '',
};

function defaultMeal() {
  const h = new Date().getHours();
  return h < 10 ? '早餐' : h < 15 ? '午餐' : '晚餐';
}

// ---------- 渲染 ----------
const scrollMem = {};
function paint() {
  root.querySelectorAll('[data-k]').forEach((e) => { scrollMem[e.dataset.k] = e.scrollTop; });
  root.innerHTML = render(S);
  root.querySelectorAll('[data-k]').forEach((e) => { e.scrollTop = scrollMem[e.dataset.k] || 0; });
  if (toastMsg) showToast();
}

// 提示消息:重绘会清空页面,所以消息单独记着,每次重绘后补上。
let toastMsg = '';
let toastTimer;
function showToast() {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = toastMsg;
  root.appendChild(el);
}
function toast(msg) {
  toastMsg = msg;
  root.querySelector('.toast')?.remove();
  showToast();
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastMsg = ''; root.querySelector('.toast')?.remove(); }, 1600);
}

// ---------- 数据 ----------
function recount() {
  S.counts = {};
  for (const o of S.orders) for (const i of o.items) S.counts[i.id] = (S.counts[i.id] || 0) + i.count;
}

function saveCart() {
  localStorage.setItem('wte-cart', JSON.stringify(S.cart));
}

function setCoverUrl(id, blob) {
  const old = S.coverUrls.get(id);
  if (old) URL.revokeObjectURL(old);
  if (blob) S.coverUrls.set(id, URL.createObjectURL(blob)); else S.coverUrls.delete(id);
}

async function loadAll() {
  const [dishes, orders, cats, covers] = await Promise.all([
    db.getAll('dishes'), db.getAll('orders'), db.getMeta('categories'), db.getAllCovers(),
  ]);
  S.dishes = dishes;
  S.orders = orders.sort((a, b) => b.time - a.time);
  S.cats = cats || [];
  S.coverUrls.forEach((u) => URL.revokeObjectURL(u));
  S.coverUrls = new Map();
  for (const [id, blob] of covers) setCoverUrl(id, blob);
  // 清掉已不存在的菜
  const ids = new Set(dishes.map((d) => d.id));
  for (const id of Object.keys(S.cart)) if (!ids.has(id)) delete S.cart[id];
  recount();
}

async function init() {
  try {
    S.cart = JSON.parse(localStorage.getItem('wte-cart') || '{}');
  } catch { S.cart = {}; }
  try {
    if (!(await db.getMeta('knownIds'))) {
      await seed();
      navigator.storage?.persist?.();
    }
    await loadAll();
  } catch (e) {
    S.fatal = '读取本地数据失败:' + (e.message || e) + '。如果在"无痕浏览"里打开,请换成普通模式。';
  }
  paint();
}

// ---------- 编辑草稿 ----------
function newDraft(d) {
  return {
    id: d?.id || null, name: d?.name || '', cat: d?.cat || S.cats[0] || '', diff: d?.diff || 2,
    intro: d?.intro || '', ing: (d?.ingredients || []).map(ingredientToLine).join('\n'),
    steps: (d?.steps || []).join('\n\n'),
    cover: d?.cover || '', coverUrl: d?.cover === 'user' ? S.coverUrls.get(d.id) : null,
    coverBlob: undefined, // undefined 不变;null 移除;Blob 替换
    builtin: !!d?.builtin,
  };
}

async function saveDish() {
  const dr = S.page.draft;
  if (!dr.name.trim()) return toast('请输入菜名');
  if (!dr.cat) return toast('请选择类别');
  const id = dr.id || 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  let cover = dr.cover;
  if (dr.coverBlob) cover = 'user'; else if (dr.coverBlob === null) cover = '';
  const rec = {
    id, name: dr.name.trim(), cat: dr.cat, diff: dr.diff, intro: dr.intro.trim(),
    ingredients: dr.ing.split('\n').map(parseIngredientLine).filter(Boolean),
    steps: dr.steps.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean),
    cover, builtin: dr.builtin,
  };
  await db.put('dishes', rec);
  if (dr.coverBlob) { await db.put('covers', dr.coverBlob, id); setCoverUrl(id, dr.coverBlob); }
  if (dr.coverBlob === null) { await db.remove('covers', id); setCoverUrl(id, null); }
  await loadAll();
  S.page = { type: 'detail', id };
  paint();
  toast('已保存');
}

// ---------- 类别 ----------
async function saveCats(cats) {
  S.cats = cats;
  await db.setMeta('categories', cats);
}

async function addCategory() {
  const name = (prompt('新类别名称') || '').trim();
  if (!name) return null;
  if (name === '全部' || S.cats.includes(name)) { toast('类别已存在'); return null; }
  await saveCats([...S.cats, name]);
  return name;
}

// ---------- 订单 ----------
async function confirmOrder() {
  const items = Object.entries(S.cart).map(([id, count]) => {
    const d = S.dishes.find((x) => x.id === id);
    return d && { id, name: d.name, cat: d.cat, count, ingredients: d.ingredients, steps: d.steps };
  }).filter(Boolean);
  if (!items.length) return;
  const no = (await db.getMeta('nextOrderNo')) || 1;
  const order = {
    id: 'o' + Date.now(), no, time: Date.now(), meal: S.meal,
    note: ($('#note')?.value ?? S.note).trim(), items, done: false, checks: {},
  };
  await db.put('orders', order);
  await db.setMeta('nextOrderNo', no + 1);
  S.orders.unshift(order);
  recount();
  S.cart = {}; saveCart();
  S.note = ''; S.sheet = null; S.tab = 'orders'; S.orderOpen = order.id; S.view = 'buy';
  paint();
}

// ---------- 导出 / 导入 ----------
async function doExport() {
  const data = await buildExport();
  const name = `今天吃啥-备份-${new Date().toISOString().slice(0, 10)}.json`;
  const file = new File([JSON.stringify(data)], name, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file] }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

async function doImport(file) {
  if (!confirm('导入会用备份里的内容替换这部手机上的全部菜品和订单,确定吗?')) return;
  try {
    const r = await importBackup(file);
    S.cart = {}; saveCart();
    await loadAll();
    S.orderOpen = null; paint();
    toast(`已导入 ${r.dishes} 道菜、${r.orders} 个订单`);
  } catch (e) {
    toast(e.message || '导入失败');
  }
}

// ---------- 点击 ----------
const actions = {
  tab: (v) => { S.tab = v; S.orderOpen = null; },
  cat: (v) => { S.cat = v; },
  inc: (v) => { S.cart[v] = (S.cart[v] || 0) + 1; saveCart(); },
  dec: (v) => {
    S.cart[v] = (S.cart[v] || 0) - 1;
    if (S.cart[v] <= 0) delete S.cart[v];
    if (S.sheet && !cartCount(S)) S.sheet = null;
    saveCart();
  },
  rand: () => {
    const ds = visibleDishes(S);
    if (!ds.length) return toast('这个类别里没有菜');
    const d = ds[Math.floor(Math.random() * ds.length)];
    S.cart[d.id] = (S.cart[d.id] || 0) + 1; saveCart();
    toast('随机选中:' + d.name);
  },
  // "已选 N 道"和"下单"都打开已选菜品列表:在里面可以加减、清空,再确认下单。
  order: () => { if (!cartCount(S)) return toast('还没选菜'); S.sheet = 'order'; },
  cart: () => actions.order(),
  'clear-cart': () => { S.cart = {}; saveCart(); S.sheet = null; },
  meal: (v) => { S.meal = MEALS.includes(v) ? v : S.meal; },
  mask: () => { S.sheet = null; },
  confirm: () => confirmOrder().then(() => 'skip'),
  detail: (v) => { S.page = { type: 'detail', id: v }; },
  back: () => { S.page = null; },
  new: () => { S.page = { type: 'edit', draft: newDraft(null) }; },
  edit: (v) => { S.page = { type: 'edit', draft: newDraft(S.dishes.find((d) => d.id === v)) }; },
  save: () => saveDish().then(() => 'skip'),
  'del-dish': async (v) => {
    const d = S.dishes.find((x) => x.id === v);
    if (!d || !confirm(`删除「${d.name}」?已下的订单不受影响。`)) return 'skip';
    await db.remove('dishes', v); await db.remove('covers', v);
    delete S.cart[v]; saveCart();
    await loadAll();
    S.page = null; paint(); toast('已删除');
    return 'skip';
  },
  'pick-cat': (v) => { S.page.draft.cat = v; },
  'pick-diff': (v) => { S.page.draft.diff = Number(v); },
  'add-cat-in-edit': async () => { const n = await addCategory(); if (n) S.page.draft.cat = n; },
  'cover-pick': () => { $('#coverFile').click(); return 'skip'; },
  'cover-clear': () => { Object.assign(S.page.draft, { coverBlob: null, cover: '', coverUrl: null }); },
  'open-order': (v) => { S.orderOpen = v; S.view = 'buy'; },
  'order-back': () => { S.orderOpen = null; },
  view: (v) => { S.view = v === 'cook' ? 'cook' : 'buy'; },
  // 勾选和完成:先改内存并立即重绘,保存在后台进行,失败再提示。
  tick: (v) => {
    const o = S.orders.find((x) => x.id === S.orderOpen);
    if (!o) return;
    o.checks = o.checks || {};
    o.checks[v] = !o.checks[v];
    db.put('orders', o).catch(() => toast('保存失败'));
  },
  finish: (v) => {
    const o = S.orders.find((x) => x.id === v);
    o.done = !o.done;
    db.put('orders', o).catch(() => toast('保存失败'));
  },
  'del-order': async (v) => {
    if (!confirm('删除这个订单?')) return 'skip';
    await db.remove('orders', v);
    S.orders = S.orders.filter((x) => x.id !== v);
    recount(); S.orderOpen = null;
  },
  cats: () => { S.page = { type: 'cats' }; },
  'cat-add': async () => { await addCategory(); },
  'cat-rename': async (v) => {
    const name = (prompt('新的类别名称', v) || '').trim();
    if (!name || name === v) return 'skip';
    if (name === '全部' || S.cats.includes(name)) { toast('类别已存在'); return 'skip'; }
    const changed = S.dishes.filter((d) => d.cat === v).map((d) => ({ ...d, cat: name }));
    await db.putMany('dishes', changed);
    await saveCats(S.cats.map((c) => (c === v ? name : c)));
    if (S.cat === v) S.cat = name;
    await loadAll();
  },
  'cat-del': async (v) => {
    if (S.dishes.some((d) => d.cat === v)) { toast('该类别下还有菜,不能删除'); return 'skip'; }
    if (!confirm(`删除类别「${v}」?`)) return 'skip';
    await saveCats(S.cats.filter((c) => c !== v));
    if (S.cat === v) S.cat = '全部';
  },
  export: () => { doExport().catch((e) => toast('导出失败:' + e.message)); return 'skip'; },
  import: () => { $('#importFile').click(); return 'skip'; },
  restore: async () => {
    if (!confirm('把被删除的内置菜补回来?已有的菜不会被改动。')) return 'skip';
    const n = await seed({ restore: true });
    await loadAll();
    toast(n ? `已补回 ${n} 道菜` : '没有需要补回的菜');
  },
  about: () => { S.page = { type: 'about' }; },
};

root.addEventListener('click', async (e) => {
  const stop = e.target.closest('[data-stop]');
  const el = e.target.closest('[data-a]');
  if (!el || (stop && !stop.contains(el))) return;
  if (el.dataset.a === 'mask' && e.target !== el) return;
  const fn = actions[el.dataset.a];
  if (!fn) return;
  try {
    if ((await fn(el.dataset.v)) !== 'skip') paint();
  } catch (err) {
    toast('出错了:' + (err.message || err));
  }
});

root.addEventListener('input', (e) => {
  const t = e.target;
  if (t.id === 'q') {
    S.q = t.value;
    const list = root.querySelector('.list');
    if (list) list.innerHTML = listHtml(S);
  } else if (t.id === 'note') S.note = t.value;
  else if (t.dataset.f && S.page?.draft) S.page.draft[t.dataset.f] = t.value;
});

// 文件选择器放在页面外层,不会被重绘掉
$('#coverFile').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f || S.page?.type !== 'edit') return;
  try {
    const blob = await compressCover(f);
    const dr = S.page.draft;
    if (dr.coverUrl && dr.coverBlob) URL.revokeObjectURL(dr.coverUrl);
    Object.assign(dr, { coverBlob: blob, cover: 'user', coverUrl: URL.createObjectURL(blob) });
    paint();
  } catch (err) { toast(err.message); }
});
$('#importFile').addEventListener('change', (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  if (f) doImport(f);
});

init();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
