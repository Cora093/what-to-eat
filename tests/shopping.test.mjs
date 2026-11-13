// 运行:node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildShoppingList, parseIngredientLine, ingredientToLine } from '../js/shopping.js';

const order = {
  items: [
    { id: 'a', name: '西红柿炒鸡蛋', count: 2, ingredients: [{ n: '鸡蛋', q: '1.5 个' }, { n: '盐', q: '2g' }] },
    { id: 'b', name: '紫菜蛋花汤', count: 1, ingredients: [{ n: '鸡蛋', q: '1 个' }, { n: '盐', q: '' }, { n: ' ', q: 'x' }] },
  ],
};

test('同名食材合并,并保留每道菜的份数和用量原文', () => {
  const list = buildShoppingList(order);
  assert.deepEqual(list.map((i) => i.name), ['鸡蛋', '盐']);
  assert.deepEqual(list[0].uses, [
    { dish: '西红柿炒鸡蛋', count: 2, qty: '1.5 个' },
    { dish: '紫菜蛋花汤', count: 1, qty: '1 个' },
  ]);
});

test('空食材名被忽略,缺用量时保留空串', () => {
  const list = buildShoppingList(order);
  assert.equal(list.find((i) => i.name === '盐').uses[1].qty, '');
  assert.ok(!list.some((i) => i.name.trim() === ''));
});

test('没有食材的订单得到空清单', () => {
  assert.deepEqual(buildShoppingList({ items: [{ id: 'x', name: 'x', count: 1 }] }), []);
});

test('配料文本行解析', () => {
  assert.deepEqual(parseIngredientLine('鸡蛋 2 个'), { n: '鸡蛋', q: '2 个' });
  assert.deepEqual(parseIngredientLine('盐 = 适量'), { n: '盐', q: '适量' });
  assert.deepEqual(parseIngredientLine('葱'), { n: '葱', q: '' });
  assert.equal(parseIngredientLine('   '), null);
});

test('配料编辑往返不丢信息', () => {
  const ing = { n: '鸡蛋', q: '1.5 个' };
  assert.deepEqual(parseIngredientLine(ingredientToLine(ing)), ing);
});
