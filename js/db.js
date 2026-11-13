// IndexedDB 封装。四个存储:
//   dishes  菜品(keyPath: id)
//   orders  订单(keyPath: id)
//   covers  用户上传的封面 Blob(key: 菜品 id)
//   meta    杂项键值(categories、knownIds、nextOrderNo)
const NAME = 'what-to-eat';
let dbPromise;

export function openDb() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore('dishes', { keyPath: 'id' });
      db.createObjectStore('orders', { keyPath: 'id' });
      db.createObjectStore('covers');
      db.createObjectStore('meta');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

const wrap = (req) => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

// 在一个事务里同步发出所有请求,事务完成后返回 fn 的结果。
async function run(stores, mode, fn) {
  const db = await openDb();
  const tx = db.transaction(stores, mode);
  const done = new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
  const results = fn(...[].concat(stores).map((s) => tx.objectStore(s)));
  await done;
  return results;
}

export const getAll = (store) =>
  run(store, 'readonly', (s) => wrap(s.getAll())).then((r) => r);

export async function get(store, key) {
  const db = await openDb();
  return wrap(db.transaction(store).objectStore(store).get(key));
}

export const put = (store, value, key) =>
  run(store, 'readwrite', (s) => (key === undefined ? s.put(value) : s.put(value, key)));

export const remove = (store, key) => run(store, 'readwrite', (s) => s.delete(key));

export const putMany = (store, values) =>
  run(store, 'readwrite', (s) => values.forEach((v) => s.put(v)));

export const getMeta = (key) => get('meta', key);
export const setMeta = (key, value) => put('meta', value, key);

// 读出所有用户封面:[[菜品 id, Blob], ...]
export async function getAllCovers() {
  const db = await openDb();
  const s = db.transaction('covers').objectStore('covers');
  const [keys, values] = await Promise.all([wrap(s.getAllKeys()), wrap(s.getAll())]);
  return keys.map((k, i) => [k, values[i]]);
}

// 一次事务整体替换(用于导入备份,要么全成功要么全不变)
export function replaceAll({ dishes, orders, covers, meta }) {
  return run(['dishes', 'orders', 'covers', 'meta'], 'readwrite', (d, o, c, m) => {
    d.clear(); o.clear(); c.clear(); m.clear();
    dishes.forEach((x) => d.put(x));
    orders.forEach((x) => o.put(x));
    covers.forEach(([k, blob]) => c.put(blob, k));
    Object.entries(meta).forEach(([k, v]) => m.put(v, k));
  });
}
