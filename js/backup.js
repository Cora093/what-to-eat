// 导出 / 导入 JSON 备份。用户上传的封面以 dataURL 内嵌在文件里。
import * as db from './db.js';

const blobToDataUrl = (blob) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  r.onerror = () => reject(r.error);
  r.readAsDataURL(blob);
});

export async function buildExport() {
  const [dishes, orders, covers, categories, knownIds, nextOrderNo] = await Promise.all([
    db.getAll('dishes'), db.getAll('orders'), db.getAllCovers(),
    db.getMeta('categories'), db.getMeta('knownIds'), db.getMeta('nextOrderNo'),
  ]);
  const coverData = {};
  for (const [id, blob] of covers) coverData[id] = await blobToDataUrl(blob);
  return {
    app: 'what-to-eat', version: 1, exportedAt: new Date().toISOString(),
    categories, knownIds, nextOrderNo, dishes, orders, coverData,
  };
}

// 校验备份文件,通过后整体替换本地数据。失败时抛出带原因的 Error,本地数据不变。
export async function importBackup(file) {
  let obj;
  try {
    obj = JSON.parse(await file.text());
  } catch {
    throw new Error('文件不是有效的 JSON');
  }
  if (obj?.app !== 'what-to-eat' || !Array.isArray(obj.dishes) || !Array.isArray(obj.orders)) {
    throw new Error('这不是「今天吃啥」的备份文件');
  }
  if (obj.dishes.some((d) => !d?.id || !d?.name)) throw new Error('备份里有损坏的菜品数据');
  const covers = [];
  for (const [id, url] of Object.entries(obj.coverData || {})) {
    covers.push([id, await (await fetch(url)).blob()]);
  }
  await db.replaceAll({
    dishes: obj.dishes, orders: obj.orders, covers,
    meta: {
      categories: obj.categories || [...new Set(obj.dishes.map((d) => d.cat))],
      knownIds: obj.knownIds || [],
      nextOrderNo: obj.nextOrderNo || obj.orders.length + 1,
    },
  });
  return { dishes: obj.dishes.length, orders: obj.orders.length };
}
