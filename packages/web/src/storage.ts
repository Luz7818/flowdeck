/**
 * localStorage guarded for restrictive webviews where any Storage access
 * throws on first touch (FD-06) — feature code reads/writes through here and
 * never needs its own try/catch.
 */
export const safeStorage = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* storage unavailable — the caller's in-memory state still works */
    }
  },
};
