/**
 * Lightweight in-memory client-side cache with TTL and in-flight deduplication.
 * Prevents duplicate fetches when navigating between views.
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

const store = new Map<string, CacheEntry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

const DEFAULT_TTL_MS = 30_000; // 30 seconds

/**
 * Get a cached value, or `undefined` if expired/missing.
 */
export function cacheGet<T>(key: string): T | undefined {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.timestamp > entry.ttl) {
    store.delete(key);
    return undefined;
  }
  return entry.data as T;
}

/**
 * Set a value in the cache with optional custom TTL.
 */
export function cacheSet<T>(key: string, data: T, ttlMs?: number): void {
  store.set(key, { data, timestamp: Date.now(), ttl: ttlMs ?? DEFAULT_TTL_MS });
}

/**
 * Invalidate a specific key or all keys matching a prefix.
 */
export function cacheInvalidate(keyOrPrefix: string): void {
  if (store.has(keyOrPrefix)) {
    store.delete(keyOrPrefix);
    return;
  }
  // Prefix match
  for (const key of store.keys()) {
    if (key.startsWith(keyOrPrefix)) {
      store.delete(key);
    }
  }
}

/**
 * Wrap an async fetch function with caching and in-flight deduplication.
 * - Returns cached data if fresh.
 * - If a fetch for the same key is already in-flight, awaits that same promise
 *   instead of firing a duplicate request (thundering herd prevention).
 * - Otherwise, calls the fetcher, caches the result, and returns it.
 *
 * @param ttlMs Custom TTL in milliseconds (default: 30s)
 */
export async function cachedFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMs?: number,
): Promise<T> {
  // 1. Return from cache if fresh
  const cached = cacheGet<T>(key);
  if (cached !== undefined) return cached;

  // 2. If a request for this key is already in-flight, share it
  if (inflight.has(key)) {
    return inflight.get(key) as Promise<T>;
  }

  // 3. Start a new fetch and track it
  const promise = fetcher().then((data) => {
    cacheSet(key, data, ttlMs);
    inflight.delete(key);
    return data;
  }).catch((err) => {
    inflight.delete(key);
    throw err;
  });

  inflight.set(key, promise);
  return promise as Promise<T>;
}
