import type { Page } from "@playwright/test";

// ─── Network Request Logger ────────────────────────────────

export interface RequestLog {
  url: string;
  method: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  status?: number;
  size?: number;
}

export interface NetworkTrace {
  requests: RequestLog[];
  start: number;
}

/**
 * Starts recording all network requests made by the page.
 * Returns a trace object that accumulates request data.
 */
export function startNetworkTrace(page: Page): NetworkTrace {
  const trace: NetworkTrace = { requests: [], start: Date.now() };
  const pending = new Map<string, RequestLog>();

  page.on("request", (req) => {
    const url = req.url();
    // Only track API requests, skip static assets
    if (!url.includes("/api/") && !url.includes("/api/v1/")) return;

    const entry: RequestLog = {
      url: url.replace(/https?:\/\/[^/]+/, ""),
      method: req.method(),
      startTime: Date.now() - trace.start,
    };
    pending.set(req.url() + req.method(), entry);
    trace.requests.push(entry);
  });

  page.on("response", async (res) => {
    const key = res.url() + res.request().method();
    const entry = pending.get(key);
    if (!entry) return;

    entry.endTime = Date.now() - trace.start;
    entry.duration = entry.endTime - entry.startTime;
    entry.status = res.status();
    try {
      const body = await res.body();
      entry.size = body.length;
    } catch {
      // response body may not be available
    }
    pending.delete(key);
  });

  return trace;
}

/**
 * Filter requests to a specific path pattern.
 */
export function filterRequests(
  trace: NetworkTrace,
  pattern: string,
): RequestLog[] {
  return trace.requests.filter((r) => r.url.includes(pattern));
}

/**
 * Get only requests that started before a given timestamp (ms from trace start).
 */
export function requestsBefore(
  trace: NetworkTrace,
  ms: number,
): RequestLog[] {
  return trace.requests.filter((r) => r.startTime < ms);
}

/**
 * Get only requests that started after a given timestamp (ms from trace start).
 */
export function requestsAfter(
  trace: NetworkTrace,
  ms: number,
): RequestLog[] {
  return trace.requests.filter((r) => r.startTime >= ms);
}

// ─── Cache Inspector ────────────────────────────────────────

export interface CacheEntry {
  key: string;
  status: string;
  updatedAt: number;
  hasData: boolean;
}

/**
 * Reads the current query cache state from the browser.
 * Requires __LUSIA_QUERY_CLIENT__ to be exposed on window (dev mode).
 */
export async function dumpQueryCache(page: Page): Promise<CacheEntry[]> {
  return page.evaluate(() => {
    const client = (window as unknown as Record<string, unknown>)
      .__LUSIA_QUERY_CLIENT__ as
      | { dumpCache: () => CacheEntry[] }
      | undefined;

    if (!client) return [];
    return client.dumpCache();
  });
}

/**
 * Check if a specific cache key exists and has data.
 */
export async function cacheHas(
  page: Page,
  keyPattern: string,
): Promise<boolean> {
  const entries = await dumpQueryCache(page);
  return entries.some((e) => e.key.includes(keyPattern) && e.hasData);
}

/**
 * Get all cache keys matching a pattern.
 */
export async function cacheKeysMatching(
  page: Page,
  pattern: string,
): Promise<CacheEntry[]> {
  const entries = await dumpQueryCache(page);
  return entries.filter((e) => e.key.includes(pattern));
}

// ─── Timing Helpers ─────────────────────────────────────────

/**
 * Measures time from now until a selector appears on the page.
 */
export async function measureTimeToSelector(
  page: Page,
  selector: string,
  timeout = 10_000,
): Promise<number> {
  const start = Date.now();
  await page.waitForSelector(selector, { timeout });
  return Date.now() - start;
}

/**
 * Measures time from now until network is idle (no requests for 500ms).
 */
export async function measureTimeToNetworkIdle(
  page: Page,
  timeout = 10_000,
): Promise<number> {
  const start = Date.now();
  await page.waitForLoadState("networkidle", { timeout });
  return Date.now() - start;
}

// ─── Report Generator ───────────────────────────────────────

export interface RouteTraceReport {
  route: string;
  timing: {
    shellVisible?: number;
    firstDataVisible?: number;
    networkIdle?: number;
  };
  network: {
    total: number;
    apiRequests: RequestLog[];
    beforeShell: RequestLog[];
    afterShell: RequestLog[];
  };
  cache: CacheEntry[];
  payloads: {
    url: string;
    sizeBytes: number;
  }[];
}

/**
 * Generates a human-readable report from trace data.
 */
export function formatReport(report: RouteTraceReport): string {
  const lines: string[] = [];
  const divider = "═".repeat(60);

  lines.push("");
  lines.push(divider);
  lines.push(`ROUTE TRACE: ${report.route}`);
  lines.push(divider);

  lines.push("");
  lines.push("TIMING");
  lines.push("──────");
  if (report.timing.shellVisible !== undefined)
    lines.push(`  Shell visible:      ${report.timing.shellVisible}ms`);
  if (report.timing.firstDataVisible !== undefined)
    lines.push(`  First data visible: ${report.timing.firstDataVisible}ms`);
  if (report.timing.networkIdle !== undefined)
    lines.push(`  Network idle:       ${report.timing.networkIdle}ms`);

  lines.push("");
  lines.push(`NETWORK (${report.network.total} API requests)`);
  lines.push("───────");
  for (const req of report.network.apiRequests) {
    const dur = req.duration !== undefined ? `${req.duration}ms` : "pending";
    const size =
      req.size !== undefined ? `${(req.size / 1024).toFixed(1)}KB` : "?";
    lines.push(
      `  [${req.startTime}ms] ${req.method} ${req.url}  →  ${req.status ?? "?"} ${dur} ${size}`,
    );
  }

  if (report.network.beforeShell.length > 0) {
    lines.push("");
    lines.push(
      `  Before shell: ${report.network.beforeShell.length} request(s)`,
    );
  }
  if (report.network.afterShell.length > 0) {
    lines.push(
      `  After shell:  ${report.network.afterShell.length} request(s)`,
    );
  }

  lines.push("");
  lines.push(`CACHE (${report.cache.length} entries)`);
  lines.push("─────");
  for (const entry of report.cache) {
    const freshness = entry.hasData ? "HAS DATA" : "EMPTY";
    lines.push(`  ${entry.key}  [${entry.status}] ${freshness}`);
  }

  if (report.payloads.length > 0) {
    lines.push("");
    lines.push("PAYLOAD SIZES");
    lines.push("─────────────");
    for (const p of report.payloads) {
      lines.push(`  ${p.url}: ${(p.sizeBytes / 1024).toFixed(1)}KB`);
    }
  }

  lines.push("");
  lines.push(divider);
  return lines.join("\n");
}
