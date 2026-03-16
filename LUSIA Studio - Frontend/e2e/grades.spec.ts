import { test, expect } from "@playwright/test";
import {
  startNetworkTrace,
  filterRequests,
  dumpQueryCache,
  formatReport,
  type RouteTraceReport,
} from "./helpers/trace";

test.describe("Calendar Route — Reference Implementation Trace", () => {
  test("full route trace report", async ({ page }) => {
    const trace = startNetworkTrace(page);
    const navStart = Date.now();

    await page.goto("/dashboard/calendar");

    // ── Shell timing ──
    let shellTime: number | undefined;
    try {
      await page.waitForSelector("main, nav", { timeout: 5_000 });
      shellTime = Date.now() - navStart;
    } catch {
      // no shell
    }

    // ── Data timing (calendar grid/events) ──
    let dataTime: number | undefined;
    try {
      await page.waitForSelector(
        "table, .fc, [data-testid='event-calendar'], .rounded-xl",
        { timeout: 15_000 },
      );
      dataTime = Date.now() - navStart;
    } catch {
      // no data
    }

    let idleTime: number | undefined;
    try {
      await page.waitForLoadState("networkidle", { timeout: 15_000 });
      idleTime = Date.now() - navStart;
    } catch {
      // didn't settle
    }

    await page.waitForTimeout(2000);

    const cache = await dumpQueryCache(page);

    const report: RouteTraceReport = {
      route: "/dashboard/calendar",
      timing: {
        shellVisible: shellTime,
        firstDataVisible: dataTime,
        networkIdle: idleTime,
      },
      network: {
        total: trace.requests.length,
        apiRequests: trace.requests,
        beforeShell: shellTime
          ? trace.requests.filter((r) => r.startTime < shellTime!)
          : [],
        afterShell: shellTime
          ? trace.requests.filter((r) => r.startTime >= shellTime!)
          : trace.requests,
      },
      cache,
      payloads: trace.requests
        .filter((r) => r.size !== undefined)
        .map((r) => ({ url: r.url, sizeBytes: r.size! })),
    };

    const formatted = formatReport(report);
    console.log(formatted);

    const fs = await import("fs");
    fs.mkdirSync("./e2e/reports", { recursive: true });
    fs.writeFileSync("./e2e/reports/calendar-trace.txt", formatted, "utf-8");

    // Calendar sessions must be in cache
    const calendarCache = cache.filter(
      (e) => e.key.includes("calendar:sessions:") && e.hasData,
    );
    expect(calendarCache.length).toBeGreaterThan(0);
    console.log(`\n  Calendar session cache entries: ${calendarCache.length}`);
  });

  test("calendar prefetches adjacent ranges after paint", async ({ page }) => {
    await page.goto("/dashboard/calendar");
    await page.waitForLoadState("networkidle", { timeout: 15_000 });

    // Wait for deferred prefetch to fire
    await page.waitForTimeout(3000);

    const cache = await dumpQueryCache(page);
    const sessionEntries = cache.filter(
      (e) => e.key.includes("calendar:sessions:") && e.hasData,
    );

    console.log(
      `\n  Calendar session cache entries after prefetch: ${sessionEntries.length}`,
    );
    for (const entry of sessionEntries) {
      console.log(`    ${entry.key}`);
    }

    // Reference implementation should have current range + possibly prefetched adjacent
    expect(sessionEntries.length).toBeGreaterThanOrEqual(1);
  });

  test("calendar detail loads on demand", async ({ page }) => {
    await page.goto("/dashboard/calendar");
    await page.waitForLoadState("networkidle", { timeout: 15_000 });

    // Check cache for detail entries before interaction
    const preCache = await dumpQueryCache(page);
    const detailEntries = preCache.filter(
      (e) => e.key.includes("calendar:session:") && e.hasData,
    );
    console.log(`\n  Detail cache entries before click: ${detailEntries.length}`);

    // Try to click a calendar event if any exist
    const event = page
      .locator(
        "[data-testid='calendar-event'], .fc-event, [role='button']:has-text(':'),.rounded-lg.cursor-pointer",
      )
      .first();

    if (await event.isVisible({ timeout: 3000 }).catch(() => false)) {
      const trace = startNetworkTrace(page);
      await event.click();
      await page.waitForTimeout(2000);

      const postCache = await dumpQueryCache(page);
      const postDetailEntries = postCache.filter(
        (e) => e.key.includes("calendar:session:") && e.hasData,
      );
      console.log(
        `  Detail cache entries after click: ${postDetailEntries.length}`,
      );

      const detailRequests = trace.requests.filter(
        (r) => r.url.includes("/sessions/") && r.method === "GET",
      );
      console.log(`  Detail fetch requests: ${detailRequests.length}`);
    } else {
      console.log("  No calendar events visible — skipping detail test");
    }
  });
});

test.describe("Assignments Route — Trace", () => {
  test("full route trace", async ({ page }) => {
    const trace = startNetworkTrace(page);
    const navStart = Date.now();

    await page.goto("/dashboard/assignments");

    let shellTime: number | undefined;
    try {
      await page.waitForSelector("main", { timeout: 5_000 });
      shellTime = Date.now() - navStart;
    } catch {}

    let dataTime: number | undefined;
    try {
      await page.waitForSelector(".rounded-xl, table", { timeout: 15_000 });
      dataTime = Date.now() - navStart;
    } catch {}

    let idleTime: number | undefined;
    try {
      await page.waitForLoadState("networkidle", { timeout: 15_000 });
      idleTime = Date.now() - navStart;
    } catch {}

    await page.waitForTimeout(2000);
    const cache = await dumpQueryCache(page);

    const report: RouteTraceReport = {
      route: "/dashboard/assignments",
      timing: { shellVisible: shellTime, firstDataVisible: dataTime, networkIdle: idleTime },
      network: {
        total: trace.requests.length,
        apiRequests: trace.requests,
        beforeShell: shellTime ? trace.requests.filter((r) => r.startTime < shellTime!) : [],
        afterShell: shellTime ? trace.requests.filter((r) => r.startTime >= shellTime!) : trace.requests,
      },
      cache,
      payloads: trace.requests.filter((r) => r.size !== undefined).map((r) => ({ url: r.url, sizeBytes: r.size! })),
    };

    const formatted = formatReport(report);
    console.log(formatted);

    const fs = await import("fs");
    fs.mkdirSync("./e2e/reports", { recursive: true });
    fs.writeFileSync("./e2e/reports/assignments-trace.txt", formatted, "utf-8");
  });
});

test.describe("Documents Route — Trace", () => {
  test("full route trace", async ({ page }) => {
    const trace = startNetworkTrace(page);
    const navStart = Date.now();

    await page.goto("/dashboard/docs");

    let shellTime: number | undefined;
    try {
      await page.waitForSelector("main", { timeout: 5_000 });
      shellTime = Date.now() - navStart;
    } catch {}

    let dataTime: number | undefined;
    try {
      await page.waitForSelector("table, .rounded-xl", { timeout: 15_000 });
      dataTime = Date.now() - navStart;
    } catch {}

    let idleTime: number | undefined;
    try {
      await page.waitForLoadState("networkidle", { timeout: 15_000 });
      idleTime = Date.now() - navStart;
    } catch {}

    await page.waitForTimeout(2000);
    const cache = await dumpQueryCache(page);

    const report: RouteTraceReport = {
      route: "/dashboard/docs",
      timing: { shellVisible: shellTime, firstDataVisible: dataTime, networkIdle: idleTime },
      network: {
        total: trace.requests.length,
        apiRequests: trace.requests,
        beforeShell: shellTime ? trace.requests.filter((r) => r.startTime < shellTime!) : [],
        afterShell: shellTime ? trace.requests.filter((r) => r.startTime >= shellTime!) : trace.requests,
      },
      cache,
      payloads: trace.requests.filter((r) => r.size !== undefined).map((r) => ({ url: r.url, sizeBytes: r.size! })),
    };

    const formatted = formatReport(report);
    console.log(formatted);

    const fs = await import("fs");
    fs.mkdirSync("./e2e/reports", { recursive: true });
    fs.writeFileSync("./e2e/reports/docs-trace.txt", formatted, "utf-8");
  });
});
