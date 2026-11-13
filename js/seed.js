// 把内置菜谱写入本地数据库。
//   seed()            首次打开,或内置菜谱新增了菜时:只补"从没写入过"的菜,
//                     用户删除过的内置菜不会复活,改过的菜不会被覆盖。
//   seed({restore})   "恢复内置菜单":补回当前不存在的所有内置菜,已有的不动。
import * as db from './db.js';

export function toRecord(d) {
  return {
    id: d.id, name: d.name, cat: d.cat, diff: d.diff, intro: d.intro,
    ingredients: d.ingredients, steps: d.steps,
    cover: d.cover ? 'builtin' : '', builtin: true,
  };
}

export async function seed({ restore = false } = {}) {
  const res = await fetch('data/dishes.json');
  if (!res.ok) throw new Error('内置菜谱加载失败');
  const data = await res.json();

  const [existing, knownList, savedCats] = await Promise.all([
    db.getAll('dishes'), db.getMeta('knownIds'), db.getMeta('categories'),
  ]);
  const have = new Set(existing.map((d) => d.id));
  const known = new Set(knownList || []);
  const cats = savedCats ? [...savedCats] : [...data.categories];

  const add = data.dishes.filter((d) => !have.has(d.id) && (restore || !known.has(d.id)));
  for (const d of add) if (!cats.includes(d.cat)) cats.push(d.cat);

  await db.putMany('dishes', add.map(toRecord));
  await db.setMeta('categories', cats);
  await db.setMeta('knownIds', data.dishes.map((d) => d.id));
  return add.length;
}
