import type { Bus, Events } from './contracts';

export function createBus(): Bus {
  const handlers = new Map<keyof Events, Set<(e: never) => void>>();
  return {
    on(k, f) {
      if (!handlers.has(k)) handlers.set(k, new Set());
      handlers.get(k)!.add(f as (e: never) => void);
      return () => handlers.get(k)!.delete(f as (e: never) => void);
    },
    emit(k, e) {
      // Copied so a handler can unsubscribe while the event is being delivered.
      for (const f of [...(handlers.get(k) ?? [])]) f(e as never);
    },
  };
}
