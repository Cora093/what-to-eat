// 视图:全部是"状态 → HTML 字符串"的纯函数,没有副作用。事件在 app.js 里统一委托。
import { buildShoppingList, ingredientToLine } from './shopping.js';

export const MEALS = ['早餐', '午餐', '晚餐', '其它'];
const EMOJI = { 荤菜: '🍗', 素菜: '🥬', 汤: '🍲', 主食: '🍚', 水产: '🐟', 早餐: '🍳' };

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const orderNo = (o) => 'No.' + String(o.no ?? 0).padStart(4, '0');
export const fmtTime = (t) => new Date(t).toLocaleString('zh-CN',
  { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
export const cartCount = (S) => Object.values(S.cart).reduce((a, b) => a + b, 0);
const isGroup = (s) => s.startsWith('## ');

export function visibleDishes(S) {
  const q = S.q.trim();
  return S.dishes.filter((d) =>
    (S.cat === '全部' || d.cat === S.cat) &&
    (!q || d.name.includes(q) || d.ingredients.some((i) => i.n.includes(q))));
}

function cover(S, d) {
  const src = d.cover === 'builtin' ? `covers/${d.id}.webp` : d.cover === 'user' ? S.coverUrls.get(d.id) : null;
  return `<div class="cover">${src ? `<img src="${esc(src)}" alt="" loading="lazy">` : `<span>${EMOJI[d.cat] || '🍽'}</span>`}</div>`;
}

const stepper = (S, id) => {
  const n = S.cart[id] || 0;
  return `<div class="step">${n ? `<button class="m" data-a="dec" data-v="${id}" aria-label="减一份">−</button><span>${n}</span>` : ''}<button data-a="inc" data-v="${id}" aria-label="加一份">+</button></div>`;
};

export function listHtml(S) {
  const ds = visibleDishes(S);
  if (!ds.length) return '<div class="empty">没有匹配的菜</div>';
  return ds.map((d) => `<div class="dish">${cover(S, d)}
    <div class="info" data-a="detail" data-v="${d.id}"><div class="nm">${esc(d.name)}</div>
      <div class="sub"><span class="stars">${'★'.repeat(d.diff || 1)}</span> · 已点${S.counts[d.id] || 0}次 · ${esc(d.cat)}</div></div>
    ${stepper(S, d.id)}</div>`).join('');
}

function home(S) {
  const cats = ['全部', ...S.cats];
  return `<div class="search"><input id="q" type="search" placeholder="搜索菜名或食材" value="${esc(S.q)}" enterkeyhint="search">
      <button class="btn" data-a="new">+ 新增菜</button></div>
    <div class="home"><div class="side" data-k="side">${cats.map((c) =>
      `<div class="${c === S.cat ? 'on' : ''}" data-a="cat" data-v="${esc(c)}">${esc(c)}</div>`).join('')}
      <div class="manage" data-a="cats">⚙ 类别管理</div></div>
      <div class="list" data-k="list:${esc(S.cat)}">${listHtml(S)}</div></div>
    <div class="float"><div class="dice" data-a="rand"><i>🎲</i>随机选菜</div>
      <div class="cnt" data-a="cart">已选 ${cartCount(S)} 道 <span class="up">▴</span></div><button class="btn dark" data-a="order">下单</button></div>`;
}

function ordersList(S) {
  if (!S.orders.length) return '<div class="empty">还没有订单,去首页点几道菜吧</div>';
  return `<div class="page" data-k="orders">${S.orders.map((o) => {
    const list = buildShoppingList(o);
    const ticked = list.filter((i) => o.checks?.['b:' + i.name]).length;
    return `<div class="card" data-a="open-order" data-v="${o.id}"><span class="no">${orderNo(o)}</span>
      <b class="meal">${esc(o.meal)}</b>${o.done ? '<span class="badge">已完成</span>' : ''}
      <div>${o.items.map((i) => `<span class="tag">${esc(i.name)} ×${i.count}</span>`).join('')}</div>
      <div class="meta">${fmtTime(o.time)} · 买菜 ${ticked}/${list.length}${o.note ? ' · 备注:' + esc(o.note) : ''}</div></div>`;
  }).join('')}</div>`;
}

function orderDetail(S) {
  const o = S.orders.find((x) => x.id === S.orderOpen);
  if (!o) return '<div class="empty">订单不存在</div>';
  const ck = o.checks || {};
  const list = buildShoppingList(o);
  const ticked = list.filter((i) => ck['b:' + i.name]).length;
  const head = `<div class="ohead"><span class="no">${orderNo(o)}</span> <b>${esc(o.meal)}</b>
    <span class="meta">${fmtTime(o.time)}</span>${o.note ? `<div class="onote">备注:${esc(o.note)}</div>` : ''}</div>
    <div class="seg"><div class="${S.view === 'buy' ? 'on' : ''}" data-a="view" data-v="buy">买菜清单 ${ticked}/${list.length}</div>
    <div class="${S.view === 'cook' ? 'on' : ''}" data-a="view" data-v="cook">做法</div></div>`;
  let body;
  if (S.view === 'buy') {
    body = list.map((i) => `<div class="chk ${ck['b:' + i.name] ? 'done' : ''}" data-a="tick" data-v="${esc('b:' + i.name)}">
      <div class="box">${ck['b:' + i.name] ? '✓' : ''}</div>
      <div class="txt"><div>${esc(i.name)}</div><div class="q">${i.uses.map((u) =>
        `${esc(u.dish)}${u.count > 1 ? '×' + u.count : ''}:${esc(u.qty || '适量')}`).join('<br>')}</div></div></div>`).join('')
      + '<div class="hint">用量是原菜谱每份的写法,点多份请自行乘以份数</div>';
  } else {
    body = o.items.map((it) => {
      const real = it.steps.filter((s) => !isGroup(s)).length;
      let idx = 0, n = 0;
      const done = it.steps.filter((s, i) => !isGroup(s) && ck[`s:${it.id}:${i}`]).length;
      const rows = it.steps.map((s, i) => {
        if (isGroup(s)) { n = 0; return `<div class="grp">${esc(s.slice(3))}</div>`; }
        n++; idx = i;
        const on = ck[`s:${it.id}:${idx}`];
        return `<div class="chk ${on ? 'done' : ''}" data-a="tick" data-v="s:${it.id}:${idx}"><div class="box">${on ? '✓' : n}</div><div class="txt pre">${esc(s)}</div></div>`;
      }).join('');
      return `<div class="dn">${esc(it.name)}${it.count > 1 ? ' ×' + it.count : ''}<span class="prog">${done}/${real}</span></div>${rows || '<div class="hint">这道菜没有做法</div>'}`;
    }).join('');
  }
  return `<div class="page" data-k="od:${o.id}:${S.view}">${head}${body}
    <div class="actions"><button class="btn ghost" data-a="finish" data-v="${o.id}">${o.done ? '取消完成' : '完成订单'}</button>
    <button class="btn danger" data-a="del-order" data-v="${o.id}">删除订单</button></div></div>`;
}

function me(S) {
  return `<div class="page me" data-k="me">
    <div class="item" data-a="cats">类别管理<span>›</span></div>
    <div class="item" data-a="export">导出数据(JSON)<span>›</span></div>
    <div class="item" data-a="import">导入数据(JSON)<span>›</span></div>
    <div class="item" data-a="restore">恢复内置菜单<span>›</span></div>
    <div class="item" data-a="about">数据来源与说明<span>›</span></div>
    <div class="hint left">共 ${S.dishes.length} 道菜 · ${S.orders.length} 个订单。数据只保存在这部手机里,换手机或清理网站数据前请先导出。</div></div>`;
}

export function sheetHtml(S) {
  if (S.sheet !== 'order') return '';
  const rows = Object.entries(S.cart).map(([id, c]) => {
    const d = S.dishes.find((x) => x.id === id);
    return d ? `<div class="row"><span>${esc(d.name)}</span>${stepper(S, id)}</div>` : '';
  }).join('');
  return `<div class="mask" data-a="mask"><div class="sheet" data-stop>
    <div class="shead"><h3>已选菜品</h3><span class="clear" data-a="clear-cart">清空</span></div>${rows}
    <div class="chips">${MEALS.map((m) => `<div class="chip ${m === S.meal ? 'on' : ''}" data-a="meal" data-v="${m}">${m}</div>`).join('')}</div>
    <input class="note" id="note" placeholder="备注(可不填)" value="${esc(S.note)}">
    <button class="btn block" data-a="confirm">确认下单(${cartCount(S)} 道)</button></div></div>`;
}

const tabbar = (S) => `<nav class="tabbar">${[['home', '🍳', '首页'], ['orders', '🧾', '订单'], ['me', '👤', '我的']].map(([k, i, t]) =>
  `<div class="${S.tab === k ? 'on' : ''}" data-a="tab" data-v="${k}"><b>${i}</b>${t}</div>`).join('')}</nav>`;

const bar = (title, { back, right } = {}) => `<header class="bar">${back ? `<span class="back" data-a="${back}">‹</span>` : '<span class="back"></span>'}
  <div class="t">${esc(title)}</div>${right || '<span class="back"></span>'}</header>`;

// ---------- 全屏页面 ----------
function detailPage(S) {
  const d = S.dishes.find((x) => x.id === S.page.id);
  if (!d) return bar('菜品详情', { back: 'back' }) + '<main><div class="empty">菜品不存在</div></main>';
  let n = 0;
  const steps = d.steps.map((s) => {
    if (isGroup(s)) { n = 0; return `<div class="grp">${esc(s.slice(3))}</div>`; }
    n++;
    return `<div class="chk static"><div class="box">${n}</div><div class="txt pre">${esc(s)}</div></div>`;
  }).join('');
  return `${bar('菜品详情', { back: 'back', right: `<span class="hbtn" data-a="edit" data-v="${d.id}">编辑</span>` })}
  <main><div class="page" data-k="detail:${d.id}">
    <div class="hero">${cover(S, d)}<div><div class="hname">${esc(d.name)}</div>
      <div class="sub"><span class="stars">${'★'.repeat(d.diff || 1)}</span> · ${esc(d.cat)} · 已点${S.counts[d.id] || 0}次</div></div></div>
    ${d.intro ? `<p class="intro">${esc(d.intro)}</p>` : ''}
    <div class="dn">配料</div>${d.ingredients.length ? d.ingredients.map((i) =>
      `<div class="ing"><span>${esc(i.n)}</span><span class="q">${esc(i.q)}</span></div>`).join('') : '<div class="hint left">还没有配料</div>'}
    <div class="dn">做法</div>${steps || '<div class="hint left">还没有做法</div>'}
  </div></main>
  <div class="bottom"><button class="btn danger" data-a="del-dish" data-v="${d.id}">删除</button>
    <button class="btn grow" data-a="inc" data-v="${d.id}">加入点菜${S.cart[d.id] ? `(已选 ${S.cart[d.id]})` : ''}</button></div>`;
}

function editPage(S) {
  const dr = S.page.draft;
  const coverSrc = dr.cover === 'builtin' ? `covers/${dr.id}.webp` : dr.coverUrl;
  return `${bar(dr.id ? '编辑菜品' : '新增菜品', { back: 'back' })}
  <main><div class="page form" data-k="edit:${dr.id || 'new'}">
    <div class="coverpick" data-a="cover-pick">${coverSrc ? `<img src="${esc(coverSrc)}" alt="">` : '<span>📷<br>上传封面</span>'}</div>
    ${coverSrc ? '<div class="center"><button class="btn ghost small" data-a="cover-clear">移除封面</button></div>' : ''}
    <label>菜名<input data-f="name" value="${esc(dr.name)}" placeholder="请输入菜名"></label>
    <div class="lab">类别</div><div class="chips">${S.cats.map((c) => `<div class="chip ${c === dr.cat ? 'on' : ''}" data-a="pick-cat" data-v="${esc(c)}">${esc(c)}</div>`).join('')}
      <div class="chip" data-a="add-cat-in-edit">+ 新增</div></div>
    <div class="lab">难度</div><div class="chips">${[1, 2, 3, 4, 5].map((n) => `<div class="chip ${n === dr.diff ? 'on' : ''}" data-a="pick-diff" data-v="${n}">${'★'.repeat(n)}</div>`).join('')}</div>
    <label>备注<textarea data-f="intro" rows="2" placeholder="可不填">${esc(dr.intro)}</textarea></label>
    <label>配料<small>每行一种:名称 用量</small><textarea data-f="ing" rows="6" placeholder="鸡蛋 2 个&#10;盐 2g">${esc(dr.ing)}</textarea></label>
    <label>做法<small>每一步之间空一行;以 ## 开头的一行是分组标题</small><textarea data-f="steps" rows="9" placeholder="第一步&#10;&#10;第二步">${esc(dr.steps)}</textarea></label>
  </div></main>
  <div class="bottom"><button class="btn block" data-a="save">保存</button></div>`;
}

function catsPage(S) {
  return `${bar('类别管理', { back: 'back' })}<main><div class="page" data-k="cats">
    ${S.cats.map((c) => `<div class="item"><span>${esc(c)} <small>${S.dishes.filter((d) => d.cat === c).length} 道</small></span>
      <span><button class="btn ghost small" data-a="cat-rename" data-v="${esc(c)}">改名</button>
      <button class="btn danger small" data-a="cat-del" data-v="${esc(c)}">删除</button></span></div>`).join('')}
    <div class="actions"><button class="btn block" data-a="cat-add">+ 新增类别</button></div>
    <div class="hint left">只有没有菜的类别才能删除。</div></div></main>`;
}

function aboutPage() {
  return `${bar('数据来源与说明', { back: 'back' })}<main><div class="page about" data-k="about">
    <p>内置菜谱的文字来自开源项目 <b>HowToCook</b>(Unlicense 协议),只收录难度不超过三星的家常菜。</p>
    <p>多数封面图来自 <b>king-jingxiang/HowToCook</b>(MIT 协议)的菜谱图,少数来自 HowToCook 原仓库的成品图;没有封面的菜用类别图标代替,你可以自己上传。</p>
    <p>配料用量保持原文,格式不统一(有范围、有公式),买菜清单只按食材名合并,不做数量相加。</p>
    <p>所有数据只保存在这部手机的浏览器存储里,没有账号,也不会上传。清理 Safari 网站数据或卸载主屏幕图标可能丢失数据,请定期在"我的"里导出备份。</p></div></main>`;
}

export function render(S) {
  if (S.fatal) return `<div class="fatal"><h3>无法启动</h3><p>${esc(S.fatal)}</p></div>`;
  if (S.page) {
    const p = S.page.type;
    return p === 'detail' ? detailPage(S) : p === 'edit' ? editPage(S) : p === 'cats' ? catsPage(S) : aboutPage();
  }
  const inOrder = S.tab === 'orders' && S.orderOpen;
  const title = S.tab === 'home' ? '今天吃啥' : S.tab === 'orders' ? (inOrder ? '订单详情' : '订单') : '我的';
  const body = S.tab === 'home' ? home(S) : S.tab === 'orders' ? (inOrder ? orderDetail(S) : ordersList(S)) : me(S);
  return `${bar(title, { back: inOrder ? 'order-back' : '' })}<main>${body}${sheetHtml(S)}</main>${tabbar(S)}`;
}

export { ingredientToLine };
