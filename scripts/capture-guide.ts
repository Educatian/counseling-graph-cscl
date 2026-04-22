import { chromium } from "playwright";
import path from "node:path";
import fs from "node:fs";

const OUT = path.resolve("public/guide/img");
fs.mkdirSync(OUT, { recursive: true });

const BASE = "http://localhost:5173";

async function shot(page: any, name: string, clip?: any) {
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file, clip, type: "png" });
  console.log("✓", name);
}

async function setStorage(page: any, entries: Record<string, string>) {
  await page.evaluate((e: any) => {
    for (const [k, v] of Object.entries(e)) localStorage.setItem(k, v as string);
  }, entries);
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();

  // Landing ko
  await page.goto(BASE);
  await setStorage(page, { lang: "ko" });
  await page.evaluate(() => localStorage.removeItem("entered"));
  await page.reload();
  await page.waitForTimeout(2000);
  await shot(page, "landing-ko");

  // Landing en
  await page.evaluate(() => localStorage.setItem("lang", "en"));
  await page.reload();
  await page.waitForTimeout(2000);
  await shot(page, "landing-en");

  // Enter to main graph (ko)
  await page.evaluate(() => { localStorage.setItem("lang","ko"); localStorage.setItem("entered","1"); });
  await page.reload();
  await page.waitForTimeout(2500);
  await shot(page, "graph-overview");

  // Bridges overlay toggle
  await page.getByText("⟷ Bridges", { exact: false }).first().click().catch(()=>{});
  await page.waitForTimeout(800);
  await shot(page, "graph-bridges");

  // Turn off bridges
  await page.getByText("⟷ Bridges", { exact: false }).first().click().catch(()=>{});
  await page.waitForTimeout(400);

  // Click a domain filter - Counseling
  await page.getByText("Counseling", { exact: true }).first().click().catch(()=>{});
  await page.waitForTimeout(800);
  await shot(page, "graph-filter-counseling");
  await page.getByText("All", { exact: true }).first().click().catch(()=>{});
  await page.waitForTimeout(500);

  // Click a node — find the first concept node in SVG and click
  await page.evaluate(() => {
    const nodes = document.querySelectorAll("g.node, circle");
    // find a hub-ish node by picking one with a label text nearby
    const pick = Array.from(document.querySelectorAll<SVGTextElement>("svg text")).find(
      (t) => t.textContent && t.textContent.length > 2 && t.textContent.length < 12
    );
    if (pick) {
      const evt = new MouseEvent("click", { bubbles: true });
      pick.dispatchEvent(evt);
    }
  });
  await page.waitForTimeout(1200);
  await shot(page, "node-detail-description");

  // Discussion tab
  await page.getByText("Discussion", { exact: false }).first().click().catch(()=>{});
  await page.waitForTimeout(500);
  await shot(page, "node-detail-discussion");

  // Case tab
  await page.getByText("Case", { exact: false }).first().click().catch(()=>{});
  await page.waitForTimeout(500);
  await shot(page, "node-detail-case");

  // Notes tab
  await page.getByText(/Notes|메모/).first().click().catch(()=>{});
  await page.waitForTimeout(500);
  await shot(page, "node-detail-notes");

  // Close panel, show seed path expanded
  await page.keyboard.press("Escape").catch(()=>{});
  await page.waitForTimeout(300);
  // Click a seed path title
  const seedPath = page.locator("text=학업문제").first();
  if (await seedPath.count()) {
    await seedPath.click();
    await page.waitForTimeout(1200);
    await shot(page, "seed-path-step");
  }

  // Switch to EN
  await page.evaluate(() => localStorage.setItem("lang", "en"));
  await page.reload();
  await page.waitForTimeout(2500);
  await shot(page, "graph-english");

  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
