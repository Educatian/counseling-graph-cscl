/**
 * End-to-end smoke test for the spotlight tutorial overlay.
 *
 * What it verifies (each as a discrete pass/fail check):
 *   1. Landing renders, Enter button transitions into the graph view.
 *   2. After ~900ms inside the graph (first-visit), tutorial auto-opens.
 *   3. Step 1 spotlight targets a `[data-tutorial="entry-hub"]` SVG circle.
 *   4. Step labels are correct in Korean.
 *   5. Next/Prev navigation moves through all 5 steps.
 *   6. Steps that target NodeDetailPanel (not yet open) show the no-target hint.
 *   7. Final Done sets `localStorage.tutorial_seen=1`; auto-launch does NOT fire on reload.
 *   8. Manual 🎯 button re-opens the tutorial after dismissal.
 *   9. After clicking a real node, Step 3 (Discussion) finds its spotlight target.
 *
 * Each step also dumps a screenshot under scripts/test-out/ for visual inspection.
 *
 * Usage: scripts/dev-and-test.sh starts dev servers, then runs this via tsx.
 */
import { chromium, type Page } from "playwright";
import path from "node:path";
import fs from "node:fs";

const BASE = process.env.TEST_BASE ?? "http://localhost:5173";
const OUT = path.resolve("scripts/test-out");
fs.mkdirSync(OUT, { recursive: true });

const results: Array<{ name: string; ok: boolean; detail?: string }> = [];
function check(name: string, ok: boolean, detail?: string) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? "  — " + detail : ""}`);
}

async function shot(page: Page, name: string) {
  await page.screenshot({ path: path.join(OUT, `${name}.png`), type: "png" });
}

async function waitForApiReady(page: Page) {
  // Poll /api/health until it responds. dev:api boots a few seconds after dev:web.
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try {
      const ok = await page.evaluate(async () => {
        try {
          const r = await fetch("/api/health");
          return r.ok;
        } catch { return false; }
      });
      if (ok) return true;
    } catch {}
    await page.waitForTimeout(500);
  }
  return false;
}

async function clearLocal(page: Page) {
  await page.evaluate(() => {
    localStorage.clear();
  });
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();

  // Surface page errors so failures aren't silent
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") pageErrors.push("[console.error] " + msg.text());
  });

  // -------- bootstrap --------
  await page.goto(BASE);
  const apiReady = await waitForApiReady(page);
  check("dev API reachable (/api/health)", apiReady);
  if (!apiReady) {
    console.error("API never came up; aborting tutorial tests.");
    await browser.close();
    process.exit(1);
  }
  await clearLocal(page);
  await page.reload();
  await page.waitForTimeout(800);
  await shot(page, "01-landing");

  // -------- 1. Landing → Enter --------
  const enterBtn = page.locator("button", { hasText: /그래프 열기|Enter the graph/ });
  await enterBtn.waitFor({ state: "visible", timeout: 8000 });
  check("landing Enter button visible", await enterBtn.isVisible());
  await enterBtn.click();
  // Wait for graph to mount (svg.graph appears)
  await page.locator("svg.graph").waitFor({ state: "visible", timeout: 8000 });
  check("graph view mounted (svg.graph visible)", true);
  await shot(page, "02-graph-mounted");

  // -------- 2. Auto-tutorial opens within ~2s of first visit --------
  // The auto-launch effect waits 900ms after entered+data are ready.
  const overlayDialog = page.locator('[role="dialog"][aria-label="튜토리얼"], [role="dialog"][aria-label="Tutorial"]');
  await overlayDialog.waitFor({ state: "visible", timeout: 5000 }).catch(() => {});
  check("tutorial auto-opened on first visit", await overlayDialog.isVisible());
  await shot(page, "03-tutorial-auto-step1");

  // -------- 3. Step 1 — entry hub spotlight (multi: both hubs) --------
  const entryAnchorCount = await page.locator('[data-tutorial="entry-hub"]').count();
  check("entry-hub anchors present in DOM (expect 2)", entryAnchorCount === 2,
    `found ${entryAnchorCount}`);
  // Step title in KO
  const step1Title = await overlayDialog.locator("text=여기서 시작하세요").count();
  check("Step 1 KO title rendered", step1Title > 0);
  // Progress label "1 / 5단계"
  const progress1 = await overlayDialog.locator("text=/1\\s*\\/\\s*5단계/").count();
  check("Step 1 progress label '1 / 5단계'", progress1 > 0);
  // Multi-spotlight: SVG mask should contain 2 cutout circles (one per entry hub)
  const cutoutCircles = await page.locator("mask#tutorial-mask circle").count();
  check("multi-spotlight renders 2 mask circles for entry hubs", cutoutCircles === 2,
    `found ${cutoutCircles}`);
  // And 2 stroke rings overlaid
  const strokeRings = await page.locator('svg circle[stroke="rgba(91,141,239,0.95)"]').count();
  check("multi-spotlight renders 2 stroke rings", strokeRings === 2,
    `found ${strokeRings}`);

  // -------- 4. Next → Step 2 (Bridges) --------
  await overlayDialog.locator("button", { hasText: /다음|Next/ }).click();
  await page.waitForTimeout(400);
  check("Step 2 title 'Bridges'", await overlayDialog.locator("text=두 영역을 잇는 다리 보기").count() > 0);
  check("bridges-toggle anchor present",
    await page.locator('[data-tutorial="bridges-toggle"]').count() > 0);
  await shot(page, "04-tutorial-step2-bridges");

  // -------- 5. Next → Step 3 (Discussion, NDP not open → no-target hint) --------
  await overlayDialog.locator("button", { hasText: /다음|Next/ }).click();
  await page.waitForTimeout(400);
  const noTargetHint = await overlayDialog
    .locator("text=이 단계의 UI가 아직 화면에 없습니다").count();
  check("Step 3 shows 'UI not yet on screen' hint (NDP closed)", noTargetHint > 0);
  await shot(page, "05-tutorial-step3-notarget");

  // -------- 6. Next → Step 4 (Cases, also NDP-dependent) --------
  await overlayDialog.locator("button", { hasText: /다음|Next/ }).click();
  await page.waitForTimeout(400);
  check("Step 4 title 'Anchor a case'",
    await overlayDialog.locator("text=사례를 노드에 붙이기").count() > 0);

  // -------- 7. Next → Step 5 (REC button) --------
  await overlayDialog.locator("button", { hasText: /다음|Next/ }).click();
  await page.waitForTimeout(400);
  check("Step 5 title 'Record path & alignment'",
    await overlayDialog.locator("text=내 경로 기록").count() > 0);
  check("rec-button anchor present",
    await page.locator('[data-tutorial="rec-button"]').count() > 0);
  // The Done button should appear instead of Next
  const doneBtn = overlayDialog.locator("button", { hasText: /끝내기|Done/ });
  check("Done button replaces Next on last step", await doneBtn.count() > 0);
  await shot(page, "06-tutorial-step5-rec");

  // -------- 8. Done → tutorial_seen flag set, overlay closes --------
  await doneBtn.click();
  await page.waitForTimeout(400);
  check("overlay hidden after Done", !(await overlayDialog.isVisible().catch(() => false)));
  const seenFlag = await page.evaluate(() => localStorage.getItem("tutorial_seen"));
  check("localStorage.tutorial_seen === '1'", seenFlag === "1");

  // -------- 9. Reload — auto-launch must NOT fire again --------
  await page.reload();
  await page.locator("svg.graph").waitFor({ state: "visible", timeout: 8000 });
  await page.waitForTimeout(2000);  // longer than the 900ms auto-trigger
  const reopened = await overlayDialog.isVisible().catch(() => false);
  check("tutorial does NOT auto-reopen with seen flag set", !reopened);
  await shot(page, "07-after-reload-no-autotutorial");

  // -------- 10. Manual 🎯 button re-opens tutorial --------
  const tutorialBtn = page.locator("button", { hasText: /튜토리얼|Tutorial/ });
  check("🎯 Tutorial button visible in titlebar", await tutorialBtn.count() > 0);
  await tutorialBtn.click();
  await overlayDialog.waitFor({ state: "visible", timeout: 3000 });
  check("manual trigger reopens overlay at step 1",
    await overlayDialog.locator("text=여기서 시작하세요").count() > 0);
  await shot(page, "08-tutorial-manual-trigger");
  // close it
  await overlayDialog.locator("button", { hasText: /건너뛰기|Skip/ }).click();
  await page.waitForTimeout(300);

  // -------- 11. Open a real node, then Step 3 should find its spotlight --------
  // Click an entry-hub circle directly so NodeDetailPanel renders.
  const entryHubCircle = page.locator('circle[data-tutorial="entry-hub"]').first();
  if (await entryHubCircle.count() > 0) {
    await entryHubCircle.click({ force: true });
    await page.waitForTimeout(800);
    const panelVisible = await page.locator(".detail-panel").isVisible().catch(() => false);
    check("NodeDetailPanel opens on entry-hub click", panelVisible);

    // Re-trigger tutorial and skip to step 3
    await tutorialBtn.click();
    await overlayDialog.waitFor({ state: "visible" });
    await overlayDialog.locator("button", { hasText: /다음|Next/ }).click();
    await page.waitForTimeout(200);
    await overlayDialog.locator("button", { hasText: /다음|Next/ }).click();
    await page.waitForTimeout(400);

    const noTargetStillThere = await overlayDialog
      .locator("text=이 단계의 UI가 아직 화면에 없습니다").count();
    const ndpDiscussionAnchor = await page.locator('[data-tutorial="ndp-discussion"]').count();
    check("ndp-discussion anchor present after node opened", ndpDiscussionAnchor > 0);
    check("Step 3 no-target hint hidden when NDP visible", noTargetStillThere === 0);
    await shot(page, "09-tutorial-step3-with-panel");

    await overlayDialog.locator("button", { hasText: /건너뛰기|Skip/ }).click();
  } else {
    check("entry-hub SVG circle clickable", false, "no entry-hub circle in DOM");
  }

  // -------- page-error sanity --------
  check("no uncaught page errors during run",
    pageErrors.length === 0,
    pageErrors.length ? pageErrors.slice(0, 3).join(" | ") : undefined);

  // -------- summary --------
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
  if (failed.length) {
    console.log("\nFailures:");
    for (const f of failed) console.log(`  - ${f.name}${f.detail ? ": " + f.detail : ""}`);
  }
  console.log(`\nScreenshots in ${OUT}`);

  await browser.close();
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
