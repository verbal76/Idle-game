// Measures run-start latency in headless Chromium: time from tapping a
// mode on the main menu to the first HUD score update (the first tick
// that rendered). Repeats several runs per mode so warm-start reuse
// shows up. Prints JSON; used as before/after evidence for perf work.
//
//   npm run web:build && node scripts/perf-runstart.mjs
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const server = createServer(async (req, res) => {
  try { res.writeHead(200, { 'content-type': 'text/html' }); res.end(await readFile('dist/index.html')); }
  catch { res.writeHead(404); res.end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 412, height: 915 } });
page.setDefaultTimeout(120_000);
await page.goto(`http://127.0.0.1:${server.address().port}/?e2e`);
await page.click('#new-profile');
await page.click('#confirm');
await page.waitForSelector('#downhill');

const results = [];
for (const mode of ['downhill', 'half-pipe', 'downhill', 'half-pipe', 'downhill', 'half-pipe']) {
  await page.setViewportSize({ width: 640, height: 300 });
  const ms = await page.evaluate(async (m) => {
    // Click -> the new run's first simulated frame (when the HUD first
    // updates). __wtb.game is replaced by each new run (?e2e hook).
    const prev = window.__wtb?.game;
    const t0 = performance.now();
    document.getElementById(m).click();
    await new Promise((resolve) => {
      const poll = () => {
        const g = window.__wtb?.game;
        // The first half-pipe run waits behind its intro card (#8):
        // the run is ready once that card is up.
        const intro = document.getElementById('halfpipe-intro');
        const introUp = intro && getComputedStyle(intro).display !== 'none';
        if (g && g !== prev && (g.clock > 0 || introUp)) resolve(null);
        else requestAnimationFrame(poll);
      };
      poll();
    });
    return performance.now() - t0;
  }, mode);
  results.push({ mode, ms: Math.round(ms) });
  const intro = page.locator('#halfpipe-intro');
  if (await intro.isVisible().catch(() => false)) await intro.click();
  await page.click('#pause');
  await page.click('#quit');
  await page.click('#fell-ok');                         // dismiss the run summary
  await page.setViewportSize({ width: 412, height: 915 });
  await page.waitForSelector('#downhill');
}
console.log(JSON.stringify(results));
await browser.close();
server.close();
