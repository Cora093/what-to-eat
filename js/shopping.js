// 由订单生成买菜清单:按食材名合并,每个食材记下"哪道菜、点了几份、用量原文"。
// 用量不做换算(原文格式不统一),只原样列出。
export function buildShoppingList(order) {
  const map = new Map();
  for (const item of order.items) {
    for (const ing of item.ingredients || []) {
      const name = (ing.n || '').trim();
      if (!name) continue;
      if (!map.has(name)) map.set(name, { name, uses: [] });
      map.get(name).uses.push({ dish: item.name, count: item.count, qty: (ing.q || '').trim() });
    }
  }
  return [...map.values()];
}

// 把"食材 用量"文本行解析成 {n, q}。格式:"名称 = 用量" 或 "名称 用量"。
export function parseIngredientLine(line) {
  const s = line.trim();
  if (!s) return null;
  const m = s.match(/^(.+?)\s*=\s*(.+)$/) || s.match(/^(\S+)\s+(.+)$/);
  return m ? { n: m[1].trim(), q: m[2].trim() } : { n: s, q: '' };
}

export const ingredientToLine = (i) => (i.q ? `${i.n} ${i.q}` : i.n);
