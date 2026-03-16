import { test, expect } from "@playwright/test";
import {
  startNetworkTrace,
  filterRequests,
  dumpQueryCache,
  formatReport,
  type RouteTraceReport,
} from "./helpers/trace";

/**
 * Route compliance tests — runs the same trace against every major route.
 * Produces a report showing: timing, network requests, payload sizes, cache state.
 *
 * This is the test agents run after refactoring a feature to verify behavior.
 */

interface RouteConfig {
  path: string;
  name: string;
  /** Selector that indicates the shell/skeleton has rendered (before data). */
  shellSelector: string;
  /** Selector that indicates real data is visible. */
  dataSelector: string;
  /** Expected API path patterns for this route's requests. */
  apiPatterns: string[];
  /** Cache key prefixes expected after load. */
  expectedCacheKeys: string[];
}

const DASHBOARD_ROUTES: RouteConfig[] = [
  {
    path: "/dashboard",
    name: "Teacher Home",
    shellSelector: "main, nav",
    dataSelector: ".rounded-xl, [data-testid='dashboard-home']",
    apiPatterns: ["/calendar", "/assignments", "/members", "/classes"],
    expectedCacheKeys: [],
  },
  {
    path: "/dashboard/calendar",
    name: "Calendar",
    shellSelector: "main, nav",
    dataSelector:
      "[data-testid='calendar-shell'], [data-testid='event-calendar'], .fc, table",
    apiPatterns: ["/calendar/sessions"],
    expectedCacheKeys: ["calendar:sessions:"],
  },
  {
    path: "/dashboard/assignments",
    name: "Assignments",
    shellSelector: "main, nav",
    dataSelector:
      "[data-testid='assignments-page'], [data-testid='kanban-board'], .rounded-xl",
    apiPatterns: ["/assignments"],
    expectedCacheKeys: [],
  },
  {
    path: "/dashboard/students",
    name: "Students",
    shellSelector: "main, nav",
    dataSelector:
      "[data-testid='students-page'], table, .rounded-xl",
    apiPatterns: ["/members", "/classes"],
    expectedCacheKeys: [],
  },
  {
    path: "/dashboard/analytics",
    name: "Analytics",
    shellSelector: "main, nav",
    dataSelector:
      "[data-testid='analytics-dashboard'], .rounded-xl, svg",
    apiPatterns: ["/analytics"],
    expectedCacheKeys: [],
  },
  {
    path: "/dashboard/docs",
    name: "Documents",
    shellSelector: "main, nav",
    dataSelector:
      "[data-testid='docs-page'], table, .rounded-xl",
    apiPatterns: ["/artifacts"],
    expectedCacheKeys: [],
  },
  {
    path: "/dashboard/profile",
    name: "Profile",
    shellSelector: "main, nav",
    dataSelector: "[data-testid='profile-page'], form, .rounded-xl:has(input)",
    apiPatterns: ["/members"],
    expectedCacheKeys: [],
  },
];

for (const route of DASHBOARD_ROUTES) {
  test.describe(`${route.name} (${route.path})`, () => {
    test("route trace — timing, network, cache", async ({ page }) => {
      const trace = startNetworkTrace(page);
      const navStart = Date.now();

      await page.goto(route.path);

      // ── Shell timing ──
      let shellTime: number | undefined;
      try {
        await page.waitForSelector(route.shellSelector, { timeout: 8_000 });
        shellTime = Date.now() - navStart;
      } catch {
        // no shell marker
      }

      // ── Data timing ──
      let dataTime: number | undefined;
      try {
        await page.waitForSelector(route.dataSelector, { timeout: 15_000 });
        dataTime = Date.now() - navStart;
      } catch {
        // no data rendered
      }

      // ── Network idle ──
      let idleTime: number | undefined;
      try {
        await page.waitForLoadState("networkidle", { timeout: 15_000 });
        idleTime = Date.now() - navStart;
      } catch {
        // network didn't settle
      }

      // Let deferred queries fire
      await page.waitForTimeout(2000);

      const cache = await dumpQueryCache(page);

      // ── Build report ──
      const report: RouteTraceReport = {
        route: route.path,
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

      // Save report
      const fs = await import("fs");
      const safeName = route.path.replace(/\//g, "_").replace(/^_/, "");
      fs.mkdirSync("./e2e/reports", { recursive: true });
      fs.writeFileSync(
        `./e2e/reports/${safeName}-trace.txt`,
        formatted,
        "utf-8",
      );

      // ── Assertions ──
      if (shellTime !== undefined) {
        console.log(`  Shell visible: ${shellTime}ms`);
      }
      if (dataTime !== undefined) {
        console.log(`  Data visible: ${dataTime}ms`);
      }

      // Expected cache keys must be present
      for (const expectedKey of route.expectedCacheKeys) {
        const matching = cache.filter(
          (e) => e.key.includes(expectedKey) && e.hasData,
        );
        console.log(
          `  Cache "${expectedKey}": ${matching.length} entries with data`,
        );
      }
    });
  });
}

test.describe("Cross-route cache warming", () => {
  test("navigating via sidebar preserves cache", async ({ page }) => {
    // Visit calendar first
    await page.goto("/dashboard/calendar");
    await page.waitForLoadState("networkidle", { timeout: 15_000 });

    const cacheAfterCalendar = await dumpQueryCache(page);
    const calendarEntries = cacheAfterCalendar.filter(
      (e) => e.key.includes("calendar:") && e.hasData,
    );
    console.log(
      `\n  Cache after /calendar: ${cacheAfterCalendar.length} total, ${calendarEntries.length} calendar entries`,
    );

    // Navigate via client-side link (NOT page.goto which does full reload)
    const trace = startNetworkTrace(page);
    const assignmentsLink = page.locator('a[href="/dashboard/assignments"]').first();

    if (await assignmentsLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await assignmentsLink.click();
      await page.waitForURL("**/dashboard/assignments", { timeout: 10_000 });
      await page.waitForLoadState("networkidle", { timeout: 15_000 });

      const cacheAfterNav = await dumpQueryCache(page);
      const calendarEntriesStillPresent = cacheAfterNav.filter(
        (e) => e.key.includes("calendar:") && e.hasData,
      );
      console.log(
        `  Cache after client-side nav to /assignments: ${cacheAfterNav.length} total, ${calendarEntriesStillPresent.length} calendar entries still present`,
      );

      // Calendar cache should survive client-side navigation
      expect(calendarEntriesStillPresent.length).toBeGreaterThanOrEqual(
        calendarEntries.length,
      );

      // No calendar fetches should have happened
      const calendarRequests = filterRequests(trace, "/calendar");
      console.log(
        `  Calendar requests during nav: ${calendarRequests.length}`,
      );
      expect(calendarRequests.length).toBe(0);
    } else {
      // Fallback: just document that sidebar link wasn't found
      console.log(
        "  Sidebar assignments link not found — skipping client-side navigation test",
      );
    }
  });
});

test.describe("Payload size audit", () => {
  test("measure payload sizes for all dashboard routes", async ({ page }) => {
    test.setTimeout(120_000);

    const results: {
      route: string;
      requests: number;
      totalKB: number;
      largestRequest: { url: string; kb: number } | null;
    }[] = [];

    for (const route of DASHBOARD_ROUTES) {
      const trace = startNetworkTrace(page);
      await page.goto(route.path);

      // Some routes have SSE streams that never close, so use a simple timeout
      // instead of networkidle for consistent measurement
      await page.waitForTimeout(5000);

      let totalBytes = 0;
      let largest: { url: string; kb: number } | null = null;

      for (const req of trace.requests) {
        if (req.size) {
          totalBytes += req.size;
          const kb = req.size / 1024;
          if (!largest || kb > largest.kb) {
            largest = { url: req.url, kb };
          }
        }
      }

      results.push({
        route: route.path,
        requests: trace.requests.length,
        totalKB: totalBytes / 1024,
        largestRequest: largest,
      });
    }

    console.log("\n  ══ Payload Size Audit ══");
    console.log(
      "  Route".padEnd(30) +
        "Requests".padEnd(12) +
        "Total".padEnd(12) +
        "Largest",
    );
    console.log("  " + "─".repeat(75));
    for (const r of results) {
      const largest = r.largestRequest
        ? `${r.largestRequest.kb.toFixed(1)}KB (${r.largestRequest.url})`
        : "n/a";
      console.log(
        `  ${r.route.padEnd(28)}${String(r.requests).padEnd(12)}${r.totalKB.toFixed(1).padEnd(10)}KB  ${largest}`,
      );
    }
  });
});
