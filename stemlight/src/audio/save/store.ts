// Saving (biyon-28): SaveState on the device in IndexedDB. SaveApi.load() is synchronous, so the
// state is read once before the app starts; patch() updates memory at once and writes shortly after.
import type { SaveApi, SaveState } from '../../contracts';

export interface Storage { get(): Promise<unknown>; set(s: SaveState): Promise<void> }

export const emptySave = (): SaveState => ({ version: 1, tutorialDone: false, perPiece: {}, palette: 'default' });

/** Anything unreadable (cleared storage, an old shape, a corrupt row) gives a clean start. */
export function sanitize(raw: unknown): SaveState {
  const s = raw as Partial<SaveState> | null;
  if (!s || typeof s !== 'object' || s.version !== 1) return emptySave();
  return {
    version: 1,
    tutorialDone: s.tutorialDone === true,
    perPiece: s.perPiece && typeof s.perPiece === 'object' ? s.perPiece : {},
    palette: s.palette === 'cb' ? 'cb' : 'default',
  };
}

export function idbStorage(dbName = 'stemlight', key = 'save'): Storage {
  const open = () => new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(dbName, 1);
    req.onupgradeneeded = () => req.result.createObjectStore('kv');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  const tx = async <T>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>) => {
    const db = await open();
    try {
      return await new Promise<T>((resolve, reject) => {
        const r = f(db.transaction('kv', mode).objectStore('kv'));
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
    } finally {
      db.close();
    }
  };
  return {
    get: () => tx('readonly', (s) => s.get(key)),
    set: async (state) => { await tx('readwrite', (s) => s.put(state, key)); },
  };
}

export interface Save extends SaveApi {
  /** Writes any pending change now (pause, session end, page hide). */
  flush(): Promise<void>;
}

export async function createSave(storage: Storage = idbStorage(), delayMs = 300): Promise<Save> {
  let state: SaveState;
  try {
    state = sanitize(await storage.get());
  } catch {
    state = emptySave(); // private mode or blocked storage: run without saving
  }
  let timer: ReturnType<typeof setTimeout> | null = null;
  let writing: Promise<void> = Promise.resolve();
  const write = () => {
    timer = null;
    const snapshot = structuredClone(state);
    writing = writing.then(() => storage.set(snapshot)).catch(() => { /* storage can disappear */ });
    return writing;
  };
  return {
    load: () => state,
    patch(p) {
      state = { ...state, ...p };
      if (timer) clearTimeout(timer);
      timer = setTimeout(write, delayMs);
    },
    flush() {
      if (timer) { clearTimeout(timer); return write(); }
      return writing;
    },
  };
}
