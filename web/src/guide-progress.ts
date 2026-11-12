import { collection, doc, onSnapshot, serverTimestamp, setDoc, type Firestore } from 'firebase/firestore';
export type SavedGuides = { favorites: string[]; steps: Record<string, number[]> };
type Patch = { favorite?: boolean; steps?: number[] };
export function createGuideProgress(db: Firestore, uid: string, changed: () => void) {
  const key = 'club-guide-pending-v2:' + uid;
  const legacyKey = 'club-guide-library-v1:' + uid;
  let remote: Record<string, Patch> = {};
  let pending: Record<string, Patch> = {};
  let running = false, disposed = false, ready = false;
  let message = 'Conectando tu avance…';
  try { pending = JSON.parse(localStorage.getItem(key) || '{}'); } catch { /* Caché opcional. */ }
  if (!pending || typeof pending !== 'object' || Array.isArray(pending)) pending = {};
  let legacy: SavedGuides = { favorites: [], steps: {} };
  try { const value = JSON.parse(localStorage.getItem(legacyKey) || '{}'); legacy = { favorites: Array.isArray(value.favorites) ? value.favorites : [], steps: value.steps || {} }; } catch { /* Sin avance anterior. */ }
  function persist() { try { localStorage.setItem(key, JSON.stringify(pending)); localStorage.setItem(legacyKey, JSON.stringify(get())); } catch { message = 'El dispositivo no permite guardar cambios pendientes; mantén esta ventana abierta hasta sincronizar.'; } }
  function get(): SavedGuides {
    const result: SavedGuides = { favorites: [], steps: {} };
    const ids = new Set([...Object.keys(remote), ...Object.keys(pending), ...(!ready ? [...legacy.favorites, ...Object.keys(legacy.steps)] : [])]);
    for (const id of ids) {
      const data = { ...(!ready ? { favorite: legacy.favorites.includes(id), steps: legacy.steps[id] || [] } : {}), ...remote[id], ...pending[id] };
      if (data.favorite) result.favorites.push(id);
      result.steps[id] = Array.isArray(data.steps) ? data.steps.filter(n => Number.isInteger(n) && n >= 0 && n < 100) : [];
    }
    return result;
  }
  async function flush() {
    if (!ready || running || disposed || !navigator.onLine) return;
    running = true;
    let failed = false;
    try {
      for (const [id, patch] of Object.entries(pending)) {
        if (disposed) break;
        await setDoc(doc(db, 'usuarios', uid, 'guiaProgreso', id), { ...patch, updatedAt: serverTimestamp() }, { merge: true });
        if (JSON.stringify(pending[id]) === JSON.stringify(patch)) delete pending[id];
        persist();
      }
      message = Object.keys(pending).length ? 'Guardando cambios…' : 'Avance y favoritas sincronizados con tu cuenta.';
    } catch { failed = true; message = 'Cambios pendientes de sincronizar. Se reintentará al recuperar la conexión o volver a la biblioteca.'; }
    finally { running = false; if (!disposed) { changed(); if (!failed && Object.keys(pending).length) queueMicrotask(() => void flush()); } }
  }
  const unsubscribe = onSnapshot(collection(db, 'usuarios', uid, 'guiaProgreso'), { includeMetadataChanges: true }, snapshot => {
    remote = Object.fromEntries(snapshot.docs.map(item => [item.id, item.data()]));
    if (!ready && !snapshot.metadata.fromCache) {
      ready = true;
      for (const id of new Set([...legacy.favorites, ...Object.keys(legacy.steps)])) {
        if (!remote[id] && !pending[id]) pending[id] = { favorite: legacy.favorites.includes(id), steps: legacy.steps[id] || [] };
      }
      persist();
    }
    message = Object.keys(pending).length ? 'Cambios pendientes de sincronizar.' : !snapshot.metadata.fromCache ? 'Avance y favoritas sincronizados con tu cuenta.' : 'Mostrando el avance guardado; esperando conexión.';
    persist();
    changed(); void flush();
  }, () => { message = 'No se pudo conectar el avance. Los cambios quedan pendientes en este dispositivo.'; changed(); });
  const online = () => { void flush(); };
  const offline = () => { message = 'Sin conexión. Tu avance se conserva en este dispositivo.'; changed(); };
  window.addEventListener('online', online);
  window.addEventListener('offline', offline);
  return {
    uid, get, status: () => message,
    change(next: SavedGuides) {
      const previous = get();
      for (const id of new Set([...previous.favorites, ...next.favorites, ...Object.keys(previous.steps), ...Object.keys(next.steps)])) {
        const patch: Patch = {};
        if (previous.favorites.includes(id) !== next.favorites.includes(id)) patch.favorite = next.favorites.includes(id);
        if (JSON.stringify(previous.steps[id] || []) !== JSON.stringify(next.steps[id] || [])) patch.steps = next.steps[id] || [];
        if (Object.keys(patch).length) pending[id] = { ...pending[id], ...patch };
      }
      message = navigator.onLine ? 'Guardando cambios…' : 'Sin conexión. Cambios guardados en este dispositivo, pendientes de sincronizar.'; persist(); changed(); void flush();
      return true;
    },
    retry: flush,
    dispose() { disposed = true; unsubscribe(); window.removeEventListener('online', online); window.removeEventListener('offline', offline); },
  };
}
