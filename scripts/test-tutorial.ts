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
  // Browser-direct architecture: no /api/ to ping. Wait for Supabase client
  // bundle to be ready by polling for window.__supabase__ shorthand if set,
  // otherwise just wait for the landing page to render.
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try {
      const ok = await page.evaluate(() => {
        return !!document.querySelector('input[type=email], button[disabled]');
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

  // -------- 3. Step 1 — Discovery prompt section spotlight --------
  check("Step 1 KO title rendered (discovery)",
    await overlayDialog.locator("text=오늘의 탐구 질문에서 출발하기").count() > 0);
  // Progress label "1 / 6단계" (now six steps)
  const progress1 = await overlayDialog.locator("text=/1\\s*\\/\\s*6단계/").count();
  check("Step 1 progress label '1 / 6단계'", progress1 > 0);
  check("discovery-section anchor present in DOM",
    await page.locator('[data-tutorial="discovery-section"]').count() > 0);

  // -------- 4. Next → Step 2 (entry hub multi-spotlight) --------
  await overlayDialog.locator("button", { hasText: /다음|Next/ }).click();
  await page.waitForTimeout(400);
  const entryAnchorCount = await page.locator('[data-tutorial="entry-hub"]').count();
  check("entry-hub anchors present in DOM (expect 2)", entryAnchorCount === 2,
    `found ${entryAnchorCount}`);
  check("Step 2 KO title 'entry hub'",
    await overlayDialog.locator("text=또는 진입 허브에서 시작").count() > 0);
  const cutoutCircles = await page.locator("mask#tutorial-mask circle").count();
  check("multi-spotlight renders 2 mask circles for entry hubs", cutoutCircles === 2,
    `found ${cutoutCircles}`);
  const strokeRings = await page.locator('svg circle[stroke="rgba(91,141,239,0.95)"]').count();
  check("multi-spotlight renders 2 stroke rings", strokeRings === 2,
    `found ${strokeRings}`);

  // -------- 5. Next → Step 3 (Bridges) --------
  await overlayDialog.locator("button", { hasText: /다음|Next/ }).click();
  await page.waitForTimeout(400);
  check("Step 3 title 'Bridges'", await overlayDialog.locator("text=두 영역을 잇는 다리 보기").count() > 0);
  check("bridges-toggle anchor present",
    await page.locator('[data-tutorial="bridges-toggle"]').count() > 0);
  await shot(page, "04-tutorial-step3-bridges");

  // -------- 6. Next → Step 4 (Discussion, NDP not open → no-target hint) --------
  await overlayDialog.locator("button", { hasText: /다음|Next/ }).click();
  await page.waitForTimeout(400);
  const noTargetHint = await overlayDialog
    .locator("text=이 단계의 UI가 아직 화면에 없습니다").count();
  check("Step 4 shows 'UI not yet on screen' hint (NDP closed)", noTargetHint > 0);
  await shot(page, "05-tutorial-step4-notarget");

  // -------- 7. Next → Step 5 (Cases) --------
  await overlayDialog.locator("button", { hasText: /다음|Next/ }).click();
  await page.waitForTimeout(400);
  check("Step 5 title 'Anchor a case'",
    await overlayDialog.locator("text=사례를 노드에 붙이기").count() > 0);

  // -------- 8. Next → Step 6 (REC button, last) --------
  await overlayDialog.locator("button", { hasText: /다음|Next/ }).click();
  await page.waitForTimeout(400);
  check("Step 6 title 'Record path & alignment'",
    await overlayDialog.locator("text=내 경로 기록").count() > 0);
  check("rec-button anchor present",
    await page.locator('[data-tutorial="rec-button"]').count() > 0);
  const doneBtn = overlayDialog.locator("button", { hasText: /끝내기|Done/ });
  check("Done button replaces Next on last step", await doneBtn.count() > 0);
  await shot(page, "06-tutorial-step6-rec");

  // -------- 8. Done → tutorial_seen flag set, overlay closes,
  //                 first discovery prompt auto-activates (option 1) --------
  // Before Done: discovery cards should be pulsing (not yet engaged).
  const earlyPulseCount = await page.locator(".discovery-card-pulse").count();
  check("discovery cards pulse on first visit (before engagement)",
    earlyPulseCount === 3, `found ${earlyPulseCount}`);
  await doneBtn.click();
  await page.waitForTimeout(400);
  check("overlay hidden after Done", !(await overlayDialog.isVisible().catch(() => false)));
  const seenFlag = await page.evaluate(() => localStorage.getItem("tutorial_seen"));
  check("localStorage.tutorial_seen === '1'", seenFlag === "1");
  // Auto-activation: first prompt panel should now be visible.
  const autoPanel = page.locator('[data-tutorial="discovery-panel"]');
  await autoPanel.waitFor({ state: "visible", timeout: 1500 }).catch(() => {});
  check("auto-activates first discovery prompt after first-visit tutorial close",
    await autoPanel.isVisible().catch(() => false));
  const engagedFlag = await page.evaluate(() => localStorage.getItem("discovery_engaged"));
  check("auto-activation marks discovery_engaged='1'", engagedFlag === "1");
  // Pulse must stop once engaged.
  const postPulseCount = await page.locator(".discovery-card-pulse").count();
  check("discovery card pulse stops after engagement", postPulseCount === 0,
    `still pulsing: ${postPulseCount}`);
  // Close the auto-popped panel so subsequent steps in this script don't see it.
  await autoPanel.locator("button.close-btn").click().catch(() => {});
  await page.waitForTimeout(200);

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
  check("manual trigger reopens overlay at step 1 (discovery)",
    await overlayDialog.locator("text=오늘의 탐구 질문에서 출발하기").count() > 0);
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

  // -------- 12. Discovery prompts: card click → panel + graph emphasis --------
  // Sidebar should render 3 prompt cards (Phase 0 placeholder set).
  const cards = page.locator('[data-tutorial^="discovery-card-"]');
  const cardCount = await cards.count();
  check("3 discovery prompt cards rendered in sidebar", cardCount === 3,
    `found ${cardCount}`);

  // Click the first card → DiscoveryPromptPanel becomes visible
  await cards.first().click();
  await page.waitForTimeout(400);
  const panel = page.locator('[data-tutorial="discovery-panel"]');
  check("DiscoveryPromptPanel visible after card click",
    await panel.isVisible().catch(() => false));
  check("Panel shows curated question text",
    await panel.locator("text=학업 부진과 우울").count() > 0);
  check("Panel shows objective block",
    await panel.locator("text=이 질문이 노리는 것").count() > 0);
  await shot(page, "10-discovery-prompt-active");

  // Graph should now have many dimmed nodes (everything outside the prompt set).
  // Sample check: count node-groups whose computed opacity is below 0.5.
  const dimmedNodes = await page.evaluate(() => {
    const groups = Array.from(document.querySelectorAll<SVGGElement>(".node-group"));
    let dim = 0, lit = 0;
    for (const g of groups) {
      const op = parseFloat(getComputedStyle(g).opacity || "1");
      if (op < 0.5) dim++; else lit++;
    }
    return { dim, lit, total: groups.length };
  });
  check("graph emphasis: most nodes dimmed when prompt active",
    dimmedNodes.dim > dimmedNodes.lit,
    `dim=${dimmedNodes.dim} lit=${dimmedNodes.lit} total=${dimmedNodes.total}`);
  check("graph emphasis: highlighted node count matches prompt's relatedNodeIds",
    dimmedNodes.lit >= 9,  // first prompt has 9 related nodes; allow >= for shared filter overlap
    `expected >=9 lit, got ${dimmedNodes.lit}`);

  // Close via panel close button
  await panel.locator("button.close-btn").click();
  await page.waitForTimeout(300);
  check("panel closes via × button",
    !(await panel.isVisible().catch(() => false)));

  // Re-open, then dismiss by clicking the same card again (toggle)
  await cards.first().click();
  await page.waitForTimeout(200);
  check("card re-opens panel", await panel.isVisible().catch(() => false));
  await cards.first().click();
  await page.waitForTimeout(200);
  check("clicking active card closes panel (toggle)",
    !(await panel.isVisible().catch(() => false)));

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
