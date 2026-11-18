// Several saved maps ("Meine Karten") in IndexedDB: store 'meta' (small list entries) + 'data' (full save JSON).
// Everything is wrapped in try/catch: some browsers / private modes have no IndexedDB.
let dbP = null;
function db() {
  if (dbP) return dbP;
  dbP = new Promise((res, rej) => {
    try {
      const r = indexedDB.open('bergbahn-bauer', 1);
      r.onupgradeneeded = () => { const d = r.result; if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta', { keyPath: 'id' }); if (!d.objectStoreNames.contains('data')) d.createObjectStore('data'); };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    } catch (e) { rej(e); }
  });
  dbP.catch(() => { dbP = null; });
  return dbP;
}
const tx = async (stores, mode, fn) => {
  const d = await db();
  return new Promise((res, rej) => {
    const t = d.transaction(stores, mode);
    let out;
    t.oncomplete = () => res(out);
    t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
    out = fn(t);
  });
};
export const newSlotId = () => 's' + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);
export async function putSlot(meta, json) {
  return tx(['meta', 'data'], 'readwrite', (t) => { t.objectStore('meta').put(meta); t.objectStore('data').put(json, meta.id); });
}
export async function putMeta(meta) { return tx(['meta'], 'readwrite', (t) => { t.objectStore('meta').put(meta); }); }
export async function listSlots() {
  const req = await tx(['meta'], 'readonly', (t) => t.objectStore('meta').getAll());
  return (req.result || []).sort((a, b) => b.date - a.date);
}
export async function getSlot(id) {
  const req = await tx(['data'], 'readonly', (t) => t.objectStore('data').get(id));
  return req.result ? JSON.parse(req.result) : null;
}
export async function deleteSlot(id) { return tx(['meta', 'data'], 'readwrite', (t) => { t.objectStore('meta').delete(id); t.objectStore('data').delete(id); }); }
